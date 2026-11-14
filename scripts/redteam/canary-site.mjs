// Phase 07b: load the sandbox canary (spikes/sandbox-canary/) on the dev site, and take it off again. Dev only.
//
//   node scripts/redteam/canary-site.mjs on       build the canary, back up astro.config.mjs, add the canary to it, and
//                                                 link it into the site's node_modules
//   node scripts/redteam/canary-site.mjs off      put astro.config.mjs back byte for byte (checked by hash) and remove
//                                                 the link
//   node scripts/redteam/canary-site.mjs status
//
// The dev site must be stopped (nothing on port 4321): astro reads its config at start. The site's package.json and
// lockfile are never touched; the canary is a symlink in node_modules, like the site's link to Coffer. The canary builds
// with Coffer's own toolchain through a node_modules symlink to plugin/node_modules, so nothing new is installed.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVIDENCE_DIR, evidencePath } from "./lib.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const DEFAULTS = {
	siteDir: `${homedir()}/sites/xmr-dev-site`,
	canaryDir: join(REPO, "spikes/sandbox-canary"),
	evidenceDir: EVIDENCE_DIR,
};
const IMPORT = 'import coffer from "coffer";';
const SANDBOXED = "sandboxed: [coffer],";
const MARK = "// redteam canary: scripts/redteam/canary-site.mjs off removes this";

const sha = (text) => createHash("sha256").update(text).digest("hex");

/** astro.config.mjs's text with the canary added to the sandboxed plugins. */
export function addCanary(text) {
	if (text.includes("coffer-canary")) throw new Error("astro.config.mjs already names coffer-canary");
	for (const anchor of [IMPORT, SANDBOXED]) {
		if (text.split(anchor).length !== 2) throw new Error(`astro.config.mjs must contain "${anchor}" exactly once`);
	}
	return text.replace(IMPORT, `${IMPORT}\nimport cofferCanary from "coffer-canary"; ${MARK}`).replace(SANDBOXED, `sandboxed: [coffer, cofferCanary], ${MARK}`);
}

/** True when something answers on the port, over IPv4 or IPv6. */
export async function portBusy(port = 4321) {
	const tryHost = (host) =>
		new Promise((done) => {
			const s = connect({ host, port });
			s.once("connect", () => (s.destroy(), done(true)));
			s.once("error", () => done(false));
		});
	return (await tryHost("127.0.0.1")) || (await tryHost("::1"));
}

function paths({ siteDir, canaryDir, evidenceDir }) {
	return {
		config: join(siteDir, "astro.config.mjs"),
		link: join(siteDir, "node_modules", "coffer-canary"),
		toolchain: join(canaryDir, "node_modules"),
		state: evidencePath("canary-state.json", evidenceDir),
		backup: evidencePath("astro.config.mjs.before-canary", evidenceDir),
	};
}

export async function canaryOn(opts = {}) {
	const o = { ...DEFAULTS, build: true, busy: portBusy, ...opts };
	const p = paths(o);
	if (await o.busy()) throw new Error("the dev site is running (port 4321); stop it first");
	if (existsSync(p.state)) throw new Error(`the canary is already on (${p.state}); run off first`);
	if (existsSync(p.link) || isLink(p.link)) throw new Error(`${p.link} already exists`);
	if (!isLink(p.toolchain)) symlinkSync(join(REPO, "plugin/node_modules"), p.toolchain, "dir");
	if (o.build) {
		const r = spawnSync(join(p.toolchain, ".bin/emdash-plugin"), ["build"], { cwd: o.canaryDir, encoding: "utf8" });
		if (r.status !== 0) throw new Error(`the canary didn't build:\n${r.stdout}${r.stderr}`);
	}
	const original = readFileSync(p.config, "utf8");
	const edited = addCanary(original);
	writeFileSync(p.backup, original, { mode: 0o600 });
	writeFileSync(p.config, edited);
	symlinkSync(o.canaryDir, p.link, "dir");
	writeFileSync(p.state, JSON.stringify({ config: p.config, link: p.link, originalSha: sha(original), editedSha: sha(edited), at: new Date().toISOString() }, null, 2), { mode: 0o600 });
	return p;
}

export async function canaryOff(opts = {}) {
	const o = { ...DEFAULTS, busy: portBusy, ...opts };
	const p = paths(o);
	if (await o.busy()) throw new Error("the dev site is running (port 4321); stop it first");
	if (!existsSync(p.state)) throw new Error("the canary isn't on (no state file)");
	const state = JSON.parse(readFileSync(p.state, "utf8"));
	if (sha(readFileSync(p.config, "utf8")) !== state.editedSha) throw new Error(`astro.config.mjs changed since the canary went on; put it back by hand from ${p.backup}`);
	const original = readFileSync(p.backup, "utf8");
	if (sha(original) !== state.originalSha) throw new Error(`the backup ${p.backup} doesn't match the hash taken at on`);
	writeFileSync(p.config, original);
	if (sha(readFileSync(p.config, "utf8")) !== state.originalSha) throw new Error("astro.config.mjs didn't come back byte for byte");
	if (isLink(p.link) && resolve(dirname(p.link), readlinkSync(p.link)) === resolve(o.canaryDir)) rmSync(p.link);
	rmSync(p.state);
	rmSync(p.backup);
	return p;
}

export function canaryStatus(opts = {}) {
	const o = { ...DEFAULTS, ...opts };
	const p = paths(o);
	return { on: existsSync(p.state), link: isLink(p.link), configNamesCanary: readFileSync(p.config, "utf8").includes("coffer-canary") };
}

function isLink(path) {
	try {
		return lstatSync(path).isSymbolicLink();
	} catch {
		return false;
	}
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const cmd = process.argv[2];
	try {
		if (cmd === "on") {
			const p = await canaryOn();
			console.log(`canary on: ${p.config} edited (backup ${p.backup}), ${p.link} linked. Start the dev site, then node scripts/redteam/canary.mjs`);
		} else if (cmd === "off") {
			const p = await canaryOff();
			console.log(`canary off: ${p.config} restored and checked by hash; ${p.link} removed`);
		} else if (cmd === "status") {
			console.log(JSON.stringify(canaryStatus()));
		} else {
			console.error("usage: node scripts/redteam/canary-site.mjs on|off|status");
			process.exitCode = 2;
		}
	} catch (err) {
		console.error(`canary-site: ${err.message}`);
		process.exitCode = 1;
	}
}
