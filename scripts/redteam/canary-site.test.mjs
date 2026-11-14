// Tests for scripts/redteam/canary-site.mjs on a temporary copy of a site: node --test scripts/redteam/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { addCanary, canaryOff, canaryOn, canaryStatus } from "./canary-site.mjs";

const scratch = mkdtempSync(join(tmpdir(), "redteam-canary-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const CONFIG = `import coffer from "coffer";

export default defineConfig({
	integrations: [
		emdash({
			sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",
			sandboxed: [coffer],
		}),
	],
});
`;

function site(name) {
	const siteDir = join(scratch, name);
	mkdirSync(join(siteDir, "node_modules"), { recursive: true });
	writeFileSync(join(siteDir, "astro.config.mjs"), CONFIG);
	const canaryDir = join(scratch, `${name}-canary`);
	mkdirSync(canaryDir);
	return { siteDir, canaryDir, evidenceDir: join(scratch, `${name}-evidence`), build: false, busy: async () => false };
}

describe("canary-site", () => {
	it("adds the canary next to Coffer, and refuses a config it doesn't recognize", () => {
		const out = addCanary(CONFIG);
		assert.match(out, /^import coffer from "coffer";\nimport cofferCanary from "coffer-canary"; \/\/ redteam canary/m);
		assert.match(out, /sandboxed: \[coffer, cofferCanary\],/);
		assert.throws(() => addCanary(out), /already names coffer-canary/);
		assert.throws(() => addCanary(CONFIG.replace("sandboxed: [coffer],", "sandboxed: [],")), /exactly once/);
		assert.throws(() => addCanary(CONFIG + CONFIG), /exactly once/);
	});

	it("on then off leaves astro.config.mjs byte for byte as it was, and no link", async () => {
		const o = site("roundtrip");
		await canaryOn(o);
		assert.deepEqual(canaryStatus(o), { on: true, link: true, configNamesCanary: true });
		assert.equal(lstatSync(join(o.siteDir, "node_modules/coffer-canary")).isSymbolicLink(), true);
		await assert.rejects(canaryOn(o), /already on/);
		await canaryOff(o);
		assert.equal(readFileSync(join(o.siteDir, "astro.config.mjs"), "utf8"), CONFIG);
		assert.deepEqual(canaryStatus(o), { on: false, link: false, configNamesCanary: false });
		await assert.rejects(canaryOff(o), /isn't on/);
	});

	it("refuses while the site runs, and won't restore over someone else's edit", async () => {
		const o = site("guarded");
		await assert.rejects(canaryOn({ ...o, busy: async () => true }), /running/);
		await canaryOn(o);
		await assert.rejects(canaryOff({ ...o, busy: async () => true }), /running/);
		const config = join(o.siteDir, "astro.config.mjs");
		writeFileSync(config, readFileSync(config, "utf8") + "// someone else's line\n");
		await assert.rejects(canaryOff(o), /changed since the canary went on/);
		assert.equal(existsSync(join(o.evidenceDir, "astro.config.mjs.before-canary")), true, "the backup stays for a hand restore");
	});
});
