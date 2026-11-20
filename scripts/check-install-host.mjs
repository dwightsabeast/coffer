#!/usr/bin/env node
// Checks the install host against Wyatt's upload folder (phase 09, spec change 58; docs/install-host.md).
//
//   node scripts/check-install-host.mjs --base https://get.coffer.party --folder <upload folder> [--out <file>] [--repo <dir>]
//   [--http <http://address>]   (tests only: where the http side is; by default http://<the base's host>)
//
// Read-only: GET requests to --base, nothing else. One PASS, FAIL or WARN line per check; exit 1 on any FAIL, 2 on bad
// arguments. Lines also go to --out (default ~/xmr-pay-dev-data/install-host-check-output.txt).
//
// 1. The upload folder: versions.json lists every file of every version with its SHA-256, and the local copies still
//    match (it is the only copy of every published version, so a changed one is caught before it's uploaded).
//    latest/, install.sh and the key are the newest version's files; each install.sh points at its own version folder;
//    no _redirects or _headers; a top-level 404.html; no suffixed versions (the bridge's Newer ignores a suffix).
// 2. The host: every file in the folder is served with HTTP 200, no Location, and the same bytes; a missing file is a
//    404 with 404.html (not Pages' single-page-app fallback; 404.html itself isn't fetched by name, since Pages redirects
//    .html paths, and no other .html file may be uploaded); install.sh and the newest binaries also download with
//    `wget --max-redirect=0` (install.sh's wget path) and `curl -fsSL --proto =<scheme> --max-redirs 0`.
//    Plain http (Cloudflare's Always Use HTTPS, Wyatt 2026-11-20): every path answers exactly 301 to the same path at
//    the https base, and nothing else (no file served, no other status, no other target).
// 3. The repo: a WARN for every tracked file that mentions a *.pages.dev address (the install URL is get.coffer.party).
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const SELF = ["scripts/check-install-host.mjs", "scripts/check-install-host.test.mjs"];

function usage(msg) {
	process.stderr.write(`check-install-host: ${msg}\nusage: node scripts/check-install-host.mjs --base https://<host> --folder <upload folder> [--out <file>] [--repo <dir>] [--http <http://address>]\n`);
	process.exit(2);
}

const args = { out: join(homedir(), "xmr-pay-dev-data", "install-host-check-output.txt"), repo: resolve(import.meta.dirname, "..") };
for (let i = 2; i < process.argv.length; i += 2) {
	const k = process.argv[i];
	const v = process.argv[i + 1];
	if (!["--base", "--folder", "--out", "--repo", "--http"].includes(k) || v === undefined) usage(`unknown or incomplete argument ${k}`);
	args[k.slice(2)] = v;
}
if (!args.base || !args.folder) usage("--base and --folder are required");
if (!/^https:\/\/[A-Za-z0-9.-]+(:\d{1,5})?$/.test(args.base) && !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d{1,5})?$/.test(args.base)) {
	usage("--base must be https://<host> (http only on loopback, for tests), with no path or trailing slash");
}
const base = args.base;
if (args.http !== undefined && !/^http:\/\/([A-Za-z0-9.-]+|\[::1\])(:\d{1,5})?$/.test(args.http)) {
	usage("--http must be http://<host>[:<port>], with no path or trailing slash");
}
// The http side: by default the base's own host on port 80. A loopback base (tests) has none unless --http names one.
const httpBase = args.http ?? (base.startsWith("https://") ? `http://${new URL(base).hostname}` : undefined);
const scheme = base.slice(0, base.indexOf(":"));
const folder = resolve(args.folder);
if (!existsSync(folder) || !statSync(folder).isDirectory()) usage(`no folder ${folder}`);

const lines = [];
const counts = { PASS: 0, FAIL: 0, WARN: 0 };
function say(kind, text) {
	const line = `${kind} ${text}`;
	counts[kind]++;
	lines.push(line);
	process.stdout.write(line + "\n");
}

function walk(dir) {
	return readdirSync(dir)
		.flatMap((n) => {
			const p = join(dir, n);
			return statSync(p).isDirectory() ? walk(p) : [relative(folder, p).split("\\").join("/")];
		})
		.sort();
}
const local = (p) => readFileSync(join(folder, p));
const has = (p) => existsSync(join(folder, p)) && statSync(join(folder, p)).isFile();
const cmp = (a, b) => {
	const x = a.match(VERSION).slice(1).map(Number);
	const y = b.match(VERSION).slice(1).map(Number);
	return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
};

// 1. The upload folder.
const all = walk(folder);
let versions = {};
try {
	const m = JSON.parse(local("versions.json"));
	if (m.format !== 1 || typeof m.versions !== "object" || m.versions === null) throw new Error("not format 1");
	versions = m.versions;
	say("PASS", "versions.json: readable, format 1");
} catch (e) {
	say("FAIL", `versions.json: missing or unreadable in the upload folder (${e.message})`);
}
const good = [];
for (const [v, files] of Object.entries(versions)) {
	if (!VERSION.test(v)) {
		say("FAIL", `versions.json: ${JSON.stringify(v)} isn't a plain x.y.z version (the bridge never updates from a suffixed one)`);
		continue;
	}
	let ok = true;
	const listed = Object.keys(files ?? {});
	if (listed.length === 0) {
		say("FAIL", `versions.json: ${v} lists no files`);
		continue;
	}
	for (const [p, h] of Object.entries(files)) {
		if (!p.startsWith(`${v}/`) || p.split("/").includes("..") || !/^[0-9a-f]{64}$/.test(String(h))) {
			say("FAIL", `versions.json: ${v} lists ${JSON.stringify(p)} badly (a path in ${v}/ and a lowercase SHA-256)`);
			ok = false;
		} else if (!has(p)) {
			say("FAIL", `versions.json: ${p} is missing from the upload folder`);
			ok = false;
		} else if (sha(local(p)) !== h) {
			say("FAIL", `versions.json: ${p} in the upload folder doesn't match its listed SHA-256 (a published file changed)`);
			ok = false;
		}
	}
	for (const p of all.filter((p) => p.startsWith(`${v}/`) && !listed.includes(p))) {
		say("FAIL", `versions.json: ${p} isn't listed (version folders are written once, with every file listed)`);
		ok = false;
	}
	if (ok) say("PASS", `versions.json: ${v} (${listed.length} files) matches the upload folder`);
	good.push(v);
}
good.sort(cmp);
const newest = good.at(-1);

for (const n of ["_redirects", "_headers", "_worker.js", "_routes.json", "functions"]) {
	if (existsSync(join(folder, n))) say("FAIL", `layout: ${n} is in the upload folder (no rules or code on the install host)`);
}
for (const p of all.filter((p) => p.toLowerCase().endsWith(".html") && p !== "404.html")) {
	say("FAIL", `layout: ${p} is an .html file (Pages redirects .html paths; only 404.html may be one)`);
}
if (has("404.html")) say("PASS", "layout: 404.html at the top");
else say("FAIL", "layout: no 404.html at the top (Pages would serve the root for a missing file)");
for (const d of readdirSync(folder).filter((n) => statSync(join(folder, n)).isDirectory() && n !== "functions")) {
	if (d !== "latest" && !Object.hasOwn(versions, d)) say("FAIL", `layout: ${d}/ is neither latest/ nor a version in versions.json`);
}
for (const v of good) {
	if (!has(`${v}/install.sh`)) continue;
	const want = `${base}/${v}`;
	const got = local(`${v}/install.sh`).toString("utf8").match(/^RELEASE_BASE="([^"]*)"$/m)?.[1];
	if (got === want) say("PASS", `layout: ${v}/install.sh downloads from ${want}`);
	else say("FAIL", `layout: ${v}/install.sh's RELEASE_BASE isn't "${want}" (it's ${got === undefined ? "missing" : JSON.stringify(got)})`);
}
if (newest) {
	const same = (a, b) => has(a) && has(b) && local(a).equals(local(b));
	const latestWant = ["release.json", "release.json.sig", `xmr-bridge-${newest}-linux-amd64`, `xmr-bridge-${newest}-linux-arm64`];
	for (const n of latestWant) {
		if (!has(`${newest}/${n}`)) say("FAIL", `layout: ${newest}/${n} is missing`);
		else if (same(`latest/${n}`, `${newest}/${n}`)) say("PASS", `layout: latest/${n} is ${newest}/${n}`);
		else say("FAIL", `layout: latest/${n} isn't ${newest}/${n}`);
	}
	for (const p of all.filter((p) => p.startsWith("latest/") && !latestWant.includes(p.slice(7)))) {
		say("FAIL", `layout: ${p} isn't one of the newest version's files`);
	}
	if (same("install.sh", `${newest}/install.sh`)) say("PASS", `layout: install.sh is ${newest}/install.sh`);
	else say("FAIL", `layout: install.sh isn't ${newest}/install.sh`);
	if (has(`${newest}/coffer-release.pub.pem`)) {
		if (same("coffer-release.pub.pem", `${newest}/coffer-release.pub.pem`)) say("PASS", `layout: coffer-release.pub.pem is ${newest}'s`);
		else say("FAIL", `layout: coffer-release.pub.pem isn't ${newest}/coffer-release.pub.pem`);
	}
} else {
	say("FAIL", "layout: versions.json has no usable version");
}

// 2. The host.
async function get(path) {
	try {
		const r = await fetch(`${base}/${path}`, { redirect: "manual", signal: AbortSignal.timeout(180_000) });
		return { status: r.status, location: r.headers.get("location"), body: Buffer.from(await r.arrayBuffer()) };
	} catch (e) {
		return { status: 0, error: e.cause?.code ?? e.message, body: Buffer.alloc(0) };
	}
}
// A listed version's file is compared with versions.json's SHA-256 (the record of what was published), any other file
// with the upload folder's copy.
const listedHash = new Map(good.flatMap((v) => Object.entries(versions[v])));
// Pages redirects .html paths (live, 2026-11-20: /404.html -> 307 /404), so 404.html is checked as the body of a
// missing file instead, below.
for (const p of [...new Set([...all, ...listedHash.keys()])].sort()) {
	if (p === "404.html") {
		say("PASS", "/404.html isn't fetched by name (Pages redirects .html paths); the missing-file checks cover it");
		continue;
	}
	const r = await get(p);
	const want = listedHash.get(p) ?? sha(local(p));
	const against = listedHash.has(p) ? "versions.json's SHA-256" : "the upload folder";
	if (r.status === 200 && !r.location && sha(r.body) === want) say("PASS", `served without a redirect, bytes match: /${p}`);
	else if (r.status === 0) say("FAIL", `/${p}: no answer (${r.error})`);
	else if (r.status !== 200 || r.location) say("FAIL", `/${p}: HTTP ${r.status}${r.location ? `, Location: ${r.location}` : ""} (want 200, no redirect)`);
	else say("FAIL", `/${p}: the served bytes don't match ${against} (got ${sha(r.body)}, want ${want})`);
}
const notFound = has("404.html") ? local("404.html") : null;
for (const p of [`${randomBytes(6).toString("hex")}-not-here`, ...(newest ? [`${newest}/${randomBytes(6).toString("hex")}-not-here`] : [])]) {
	const r = await get(p);
	if (r.status === 404 && (!notFound || r.body.equals(notFound))) say("PASS", `a missing file is a 404 with 404.html: /${p}`);
	else say("FAIL", `a missing file is a 404 with 404.html: got HTTP ${r.status}${r.status === 404 ? " with another body" : ""} for /${p}`);
}
{
	const r = await get("");
	if (r.status === 404) say("PASS", "the root / is a 404 (no index page)");
	else say("WARN", `the root / answers HTTP ${r.status}${r.location ? `, Location: ${r.location}` : ""}`);
}
if (httpBase) {
	for (const p of ["", `${randomBytes(6).toString("hex")}-not-here`, ...new Set([...all, ...listedHash.keys()])]) {
		const want = `${base}/${p}`;
		let r;
		try {
			const res = await fetch(`${httpBase}/${p}`, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
			await res.arrayBuffer();
			r = { status: res.status, location: res.headers.get("location") };
		} catch (e) {
			r = { status: 0, error: e.cause?.code ?? e.message };
		}
		if (r.status === 301 && r.location === want) say("PASS", `http:// /${p} -> 301 ${want}`);
		else if (r.status === 0) say("FAIL", `http:// /${p}: no answer (${r.error})`);
		else say("FAIL", `http:// /${p}: HTTP ${r.status}${r.location ? `, Location: ${r.location}` : ""} (want 301 to ${want})`);
	}
}
const tools = ["install.sh", ...(newest ? [`${newest}/xmr-bridge-${newest}-linux-amd64`, `${newest}/xmr-bridge-${newest}-linux-arm64`] : [])].filter(has);
const tmp = mkdtempSync(join(tmpdir(), "check-install-host-"));
try {
	for (const p of tools) {
		for (const [name, cmd, argv] of [
			["wget --max-redirect=0", "wget", ["-q", "--max-redirect=0", "-O", join(tmp, "dl"), `${base}/${p}`]],
			["curl --max-redirs 0", "curl", ["-fsSL", "--proto", `=${scheme}`, "--max-redirs", "0", "-o", join(tmp, "dl"), `${base}/${p}`]],
		]) {
			rmSync(join(tmp, "dl"), { force: true });
			try {
				await run(cmd, argv, { timeout: 180_000 });
				if (readFileSync(join(tmp, "dl")).equals(local(p))) say("PASS", `${name}: /${p}`);
				else say("FAIL", `${name}: /${p} downloaded, but the bytes don't match`);
			} catch (e) {
				say("FAIL", `${name}: /${p} failed (${e.code === "ENOENT" ? `${cmd} isn't installed` : `exit ${e.code}`})`);
			}
		}
	}
} finally {
	rmSync(tmp, { recursive: true, force: true });
}

// 3. The repo.
try {
	const { stdout } = await run("git", ["-C", args.repo, "ls-files", "-z"], { maxBuffer: 64 << 20 });
	let found = 0;
	for (const f of stdout.split("\0").filter((f) => f && !SELF.includes(f))) {
		const p = join(args.repo, f);
		if (!existsSync(p) || !statSync(p).isFile() || statSync(p).size > 8 << 20) continue;
		const b = readFileSync(p);
		if (b.includes(0)) continue;
		b.toString("utf8")
			.split("\n")
			.forEach((l, i) => {
				if (/[a-z0-9-]\.pages\.dev\b/i.test(l)) {
					say("WARN", `${f}:${i + 1} mentions a *.pages.dev address (the install URL is get.coffer.party)`);
					found++;
				}
			});
	}
	if (found === 0) say("PASS", "repo: no tracked file mentions a *.pages.dev address");
} catch (e) {
	say("WARN", `repo: couldn't list ${args.repo}'s files (${e.message.split("\n")[0]})`);
}

const summary = `SUMMARY ${counts.PASS} PASS, ${counts.FAIL} FAIL, ${counts.WARN} WARN (${base}, ${new Date().toISOString()})`;
lines.push(summary);
process.stdout.write(summary + "\n");
writeFileSync(args.out, lines.join("\n") + "\n");
process.exit(counts.FAIL ? 1 : 0);
