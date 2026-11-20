// Tests for scripts/check-install-host.mjs (phase 09, spec change 58), against a local server that plays the install
// host, with an upload folder in a temp folder. Run: node --test scripts/check-install-host.test.mjs
// The wget and curl lines run the real tools against the loopback server. Tests of a change the check must catch carry
// [T32] (docs/security-matrix.md, a compromised or misconfigured install host).
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const SCRIPT = join(import.meta.dirname, "check-install-host.mjs");
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const sha = (b) => createHash("sha256").update(b).digest("hex");

function walk(dir, base = dir) {
	return readdirSync(dir).flatMap((n) => {
		const p = join(dir, n);
		return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p)];
	});
}

/** An upload folder with two versions, 1.0.0 and 1.0.1, laid out as spec change 58 says. */
function fixture(base) {
	const dir = mkdtempSync(join(tmpdir(), "install-host-"));
	dirs.push(dir);
	const folder = join(dir, "upload");
	const files = {};
	const put = (path, body) => {
		mkdirSync(join(folder, path, ".."), { recursive: true });
		writeFileSync(join(folder, path), body);
		files[path] = Buffer.from(body);
	};
	const versions = {};
	for (const v of ["1.0.0", "1.0.1"]) {
		versions[v] = {};
		const vfiles = {
			"install.sh": `#!/bin/sh\nRELEASE_BASE="${base}/${v}"\nVERSION="${v}"\n`,
			"release.json": `{"product":"xmr-bridge","version":"${v}"}\n`,
			"release.json.sig": `sig-${v}\n`,
			"SHA256SUMS": `sums-${v}\n`,
			"coffer-release.pub.pem": "-----BEGIN PUBLIC KEY-----\nfake\n-----END PUBLIC KEY-----\n",
			[`xmr-bridge-${v}-linux-amd64`]: `amd64 binary ${v} `.repeat(500),
			[`xmr-bridge-${v}-linux-arm64`]: `arm64 binary ${v} `.repeat(400),
		};
		for (const [n, b] of Object.entries(vfiles)) {
			put(`${v}/${n}`, b);
			versions[v][`${v}/${n}`] = sha(Buffer.from(b));
		}
	}
	for (const n of ["release.json", "release.json.sig", "xmr-bridge-1.0.1-linux-amd64", "xmr-bridge-1.0.1-linux-arm64"]) {
		put(`latest/${n}`, files[`1.0.1/${n}`]);
	}
	put("install.sh", files["1.0.1/install.sh"]);
	put("coffer-release.pub.pem", files["1.0.1/coffer-release.pub.pem"]);
	put("404.html", "<!doctype html><title>Not found</title><p>Not found.</p>\n");
	put("versions.json", JSON.stringify({ format: 1, versions }, null, "\t") + "\n");
	const repo = join(dir, "repo");
	mkdirSync(repo);
	writeFileSync(join(repo, "README.md"), "Nothing to see.\n");
	execFileSync("git", ["init", "-q", repo]);
	execFileSync("git", ["-C", repo, "add", "."]);
	return { dir, folder, repo, out: join(dir, "out.txt"), files };
}

/**
 * The install host: serves `files` by path. `tweak` can change any response: return
 * { status, headers, body } to replace it, or undefined to serve normally.
 */
async function host(t, files, tweak = () => undefined) {
	const server = createServer((req, res) => {
		const path = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\//, "");
		const changed = tweak(path);
		if (changed) {
			res.writeHead(changed.status, changed.headers ?? {});
			res.end(changed.body ?? "");
			return;
		}
		if (Object.hasOwn(files, path)) {
			res.writeHead(200, { "content-type": "application/octet-stream" });
			res.end(files[path]);
		} else {
			res.writeHead(404, { "content-type": "text/html" });
			res.end(files["404.html"]);
		}
	});
	await new Promise((r) => server.listen(0, "127.0.0.1", r));
	t.after(() => server.close());
	return `http://127.0.0.1:${server.address().port}`;
}

/** Builds the fixture for a server whose address is known only once it listens. */
async function setup(t, tweak) {
	const files = {};
	const base = await host(t, files, (p) => tweak?.(p, files));
	const f = fixture(base);
	Object.assign(files, f.files);
	return { ...f, base };
}

async function check({ base, folder, repo, out }, ...extra) {
	try {
		const { stdout } = await run(process.execPath, [SCRIPT, "--base", base, "--folder", folder, "--repo", repo, "--out", out, ...extra]);
		return { code: 0, stdout };
	} catch (e) {
		return { code: e.code, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
	}
}

const fails = (stdout) => stdout.split("\n").filter((l) => l.startsWith("FAIL"));

test("a correct upload passes every check, and the output file holds the same lines", async (t) => {
	const s = await setup(t);
	const r = await check(s);
	assert.equal(r.code, 0, r.stdout + r.stderr);
	assert.deepEqual(fails(r.stdout), []);
	for (const path of walk(s.folder).filter((p) => p !== "404.html")) {
		assert.match(r.stdout, new RegExp(`PASS served without a redirect, bytes match: /${path.replaceAll(".", "\\.")}\\n`));
	}
	assert.match(r.stdout, /PASS a missing file is a 404 with 404\.html/);
	assert.match(r.stdout, /PASS wget --max-redirect=0: \/install\.sh/);
	assert.match(r.stdout, /PASS curl --max-redirs 0: \/1\.0\.1\/xmr-bridge-1\.0\.1-linux-arm64/);
	assert.match(r.stdout, /PASS versions\.json: 1\.0\.0 \(7 files\)/);
	assert.match(r.stdout, /PASS versions\.json: 1\.0\.1 \(7 files\)/);
	assert.equal(readFileSync(s.out, "utf8"), r.stdout);
});

test("Pages' redirect of /404.html to /404 is expected: 404.html is checked through the missing-file checks", async (t) => {
	// Live, 2026-11-20: get.coffer.party answered /404.html with HTTP 307, Location: /404 (Pages strips .html).
	const s = await setup(t, (p) => (p === "404.html" ? { status: 307, headers: { location: "/404" } } : undefined));
	const r = await check(s);
	assert.equal(r.code, 0, r.stdout);
	assert.match(r.stdout, /PASS \/404\.html isn't fetched by name \(Pages redirects \.html paths\); the missing-file checks cover it/);
	assert.match(r.stdout, /PASS a missing file is a 404 with 404\.html/);
});

test("an .html file other than 404.html fails: Pages would redirect it", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.folder, "index.html"), "<p>hi</p>\n");
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL layout: index\.html is an \.html file \(Pages redirects \.html paths; only 404\.html may be one\)/);
});

test("[T32] a redirect on a binary fails, through fetch, wget and curl alike", async (t) => {
	const s = await setup(t, (p, files) =>
		p === "1.0.1/xmr-bridge-1.0.1-linux-amd64" ? { status: 301, headers: { location: "/latest/xmr-bridge-1.0.1-linux-amd64" } } : undefined,
	);
	const r = await check(s);
	assert.equal(r.code, 1);
	const f = fails(r.stdout).join("\n");
	assert.match(f, /FAIL .*\/1\.0\.1\/xmr-bridge-1\.0\.1-linux-amd64.*HTTP 301.*Location/);
	assert.match(f, /FAIL wget --max-redirect=0: \/1\.0\.1\/xmr-bridge-1\.0\.1-linux-amd64/);
	assert.match(f, /FAIL curl --max-redirs 0: \/1\.0\.1\/xmr-bridge-1\.0\.1-linux-amd64/);
});

test("[T32] the single-page-app fallback (a 200 for a missing file) fails", async (t) => {
	const s = await setup(t, (p, files) => (Object.hasOwn(files, p) ? undefined : { status: 200, body: "<!doctype html><p>home</p>" }));
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL a missing file is a 404 with 404\.html: got HTTP 200/);
});

test("[T32] wrong bytes for an older version's file fail (every listed version is re-hashed)", async (t) => {
	const s = await setup(t, (p) => (p === "1.0.0/release.json" ? { status: 200, body: "changed" } : undefined));
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL \/1\.0\.0\/release\.json: the served bytes don't match versions\.json's SHA-256/);
});

test("[T32] an older version's file missing from the host fails", async (t) => {
	const s = await setup(t, (p, files) => (p === "1.0.0/xmr-bridge-1.0.0-linux-arm64" ? { status: 404, body: files["404.html"] } : undefined));
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL .*\/1\.0\.0\/xmr-bridge-1\.0\.0-linux-arm64.*HTTP 404/);
});

test("[T32] a local copy that no longer matches versions.json fails before anything is fetched", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.folder, "1.0.0/SHA256SUMS"), "edited later\n");
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL versions\.json: 1\.0\.0\/SHA256SUMS in the upload folder doesn't match/);
});

test("[T32] a file in a version folder that versions.json doesn't list fails", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.folder, "1.0.0/extra.txt"), "x\n");
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL versions\.json: 1\.0\.0\/extra\.txt isn't listed/);
});

test("[T32] latest/, install.sh and the key must be the newest version's files", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.folder, "latest/release.json"), readFileSync(join(s.folder, "1.0.0/release.json")));
	writeFileSync(join(s.folder, "install.sh"), readFileSync(join(s.folder, "1.0.0/install.sh")));
	const r = await check(s);
	assert.equal(r.code, 1);
	const f = fails(r.stdout).join("\n");
	assert.match(f, /FAIL layout: latest\/release\.json isn't 1\.0\.1\/release\.json/);
	assert.match(f, /FAIL layout: install\.sh isn't 1\.0\.1\/install\.sh/);
});

test("[T32] an install.sh whose RELEASE_BASE isn't this host's version folder fails", async (t) => {
	const s = await setup(t);
	for (const p of ["1.0.1/install.sh", "install.sh"]) {
		writeFileSync(join(s.folder, p), '#!/bin/sh\nRELEASE_BASE="https://elsewhere.example/1.0.1"\n');
	}
	const v = JSON.parse(readFileSync(join(s.folder, "versions.json"), "utf8"));
	v.versions["1.0.1"]["1.0.1/install.sh"] = sha(readFileSync(join(s.folder, "1.0.1/install.sh")));
	writeFileSync(join(s.folder, "versions.json"), JSON.stringify(v));
	const r = await check(s);
	assert.equal(r.code, 1);
	assert.match(fails(r.stdout).join("\n"), /FAIL layout: 1\.0\.1\/install\.sh's RELEASE_BASE isn't "http:\/\/127\.0\.0\.1:\d+\/1\.0\.1"/);
});

test("[T32] _redirects, _headers, a missing 404.html and a suffixed version all fail", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.folder, "_redirects"), "/a /b 301\n");
	writeFileSync(join(s.folder, "_headers"), "/*\n  X: y\n");
	rmSync(join(s.folder, "404.html"));
	const v = JSON.parse(readFileSync(join(s.folder, "versions.json"), "utf8"));
	v.versions["1.0.2-rc1"] = {};
	writeFileSync(join(s.folder, "versions.json"), JSON.stringify(v));
	const r = await check(s);
	assert.equal(r.code, 1);
	const f = fails(r.stdout).join("\n");
	assert.match(f, /FAIL layout: _redirects is in the upload folder/);
	assert.match(f, /FAIL layout: _headers is in the upload folder/);
	assert.match(f, /FAIL layout: no 404\.html at the top/);
	assert.match(f, /FAIL versions\.json: "1\.0\.2-rc1" isn't a plain x\.y\.z version/);
});

test("a repo file that mentions a pages.dev address is a warning, not a failure", async (t) => {
	const s = await setup(t);
	writeFileSync(join(s.repo, "notes.md"), "line one\nsee https://coffer-get.pages.dev/install.sh\n");
	await run("git", ["-C", s.repo, "add", "."]);
	const r = await check(s);
	assert.equal(r.code, 0, r.stdout);
	assert.match(r.stdout, /WARN notes\.md:2 mentions a \*\.pages\.dev address/);
	assert.doesNotMatch(r.stdout, /README\.md:\d+ mentions/);
});

test("a base that isn't https (or loopback http) is refused", async (t) => {
	const s = await setup(t);
	const r = await check({ ...s, base: "http://get.coffer.party" });
	assert.equal(r.code, 2);
	assert.match(r.stderr, /--base must be https:\/\/<host>/);
});
