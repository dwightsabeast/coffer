// scripts/assemble-release.sh (phase 09, Part C): the release folder's install.sh, release.json and SHA256SUMS,
// computed here independently and compared byte for byte, and every bad argument refused with nothing written.
// Fake binaries only (random bytes); no Go build, no network.
//   node --test scripts/assemble-release.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repo, "scripts/assemble-release.sh");
const template = readFileSync(join(repo, "installer/install.sh"), "utf8");
const sha = (b) => createHash("sha256").update(b).digest("hex");

function folder(version, { amd64 = randomBytes(4096), arm64 = randomBytes(3000) } = {}) {
	const out = mkdtempSync(join(tmpdir(), "assemble-release-"));
	if (amd64) writeFileSync(join(out, `xmr-bridge-${version}-linux-amd64`), amd64);
	if (arm64) writeFileSync(join(out, `xmr-bridge-${version}-linux-arm64`), arm64);
	return { out, amd64, arm64 };
}
const run = (...args) => spawnSync("sh", [script, ...args], { encoding: "utf8" });

function expected({ version, base, proto, date, amd64, arm64 }) {
	const a = `xmr-bridge-${version}-linux-amd64`;
	const r = `xmr-bridge-${version}-linux-arm64`;
	const install = template
		.replace("__RELEASE_BASE__", base)
		.replace("__VERSION__", version)
		.replace("__SHA256_AMD64__", sha(amd64))
		.replace("__SHA256_ARM64__", sha(arm64))
		.replace("__CURL_PROTO__", proto);
	const release =
		`{"product":"xmr-bridge","version":"${version}","date":"${date}","files":[` +
		`{"name":"${a}","os":"linux","arch":"amd64","sha256":"${sha(amd64)}","size":${amd64.length}},` +
		`{"name":"${r}","os":"linux","arch":"arm64","sha256":"${sha(arm64)}","size":${arm64.length}}]}\n`;
	const sums = `${sha(amd64)}  ${a}\n${sha(arm64)}  ${r}\n${sha(install)}  install.sh\n${sha(release)}  release.json\n`;
	return { install, release, sums };
}

for (const c of [
	{ name: "a real release: https only, the version folder as base", version: "1.0.0", base: "https://get.coffer.party/1.0.0", proto: "=https" },
	{ name: "a dev release: http allowed, a port, a suffixed version", version: "0.0.202611241900-dev.ce0b570.dirty", base: "http://127.0.0.1:8099", proto: "=http,https" },
]) {
	test(`writes install.sh, release.json and SHA256SUMS exactly: ${c.name}`, () => {
		const f = folder(c.version);
		try {
			const date = "2026-11-24T12:00:00Z";
			const r = run(f.out, c.version, c.base, c.proto, date);
			assert.equal(r.status, 0, r.stderr);
			const want = expected({ ...c, date, amd64: f.amd64, arm64: f.arm64 });
			assert.equal(readFileSync(join(f.out, "install.sh"), "utf8"), want.install);
			assert.equal(readFileSync(join(f.out, "release.json"), "utf8"), want.release);
			assert.equal(readFileSync(join(f.out, "SHA256SUMS"), "utf8"), want.sums);
			assert.doesNotMatch(want.install, /__[A-Z0-9_]+__/);
			JSON.parse(want.release);
		} finally {
			rmSync(f.out, { recursive: true, force: true });
		}
	});
}

test("the date defaults to now, in UTC, to the second", () => {
	const f = folder("1.0.0");
	try {
		const r = run(f.out, "1.0.0", "https://get.coffer.party/1.0.0", "=https");
		assert.equal(r.status, 0, r.stderr);
		const { date } = JSON.parse(readFileSync(join(f.out, "release.json"), "utf8"));
		assert.match(date, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
		assert.ok(Math.abs(Date.parse(date) - Date.now()) < 120_000, date);
	} finally {
		rmSync(f.out, { recursive: true, force: true });
	}
});

for (const [why, args, opts, reason] of [
	["no arguments", [], undefined, /^usage: /],
	["too many arguments", ["1.0.0", "https://get.coffer.party/1.0.0", "=https", "2026-11-24T12:00:00Z", "extra"], undefined, /^usage: /],
	["a version that isn't x.y.z", ["1.0", "https://get.coffer.party/1.0", "=https"], undefined, /^version '1\.0' isn't/],
	["a version with a quote", ['1.0.0-a"b', "https://get.coffer.party/1.0.0", "=https"], undefined, /^version .* isn't/],
	["a base with a trailing slash", ["1.0.0", "https://get.coffer.party/1.0.0/", "=https"], undefined, /^base .* isn't/],
	["a base with a '|' (it goes into sed)", ["1.0.0", "https://get.coffer.party/a|b", "=https"], undefined, /^base .* isn't/],
	["a base with a '&'", ["1.0.0", "https://get.coffer.party/a&b", "=https"], undefined, /^base .* isn't/],
	["a base that isn't http(s)", ["1.0.0", "ftp://get.coffer.party/1.0.0", "=https"], undefined, /^base .* isn't/],
	["an unknown curl-proto", ["1.0.0", "https://get.coffer.party/1.0.0", "=http"], undefined, /^curl-proto is /],
	["an http base with https-only curl", ["1.0.0", "http://127.0.0.1:8099", "=https"], undefined, /^an http base needs /],
	["a bad date", ["1.0.0", "https://get.coffer.party/1.0.0", "=https", "2026-11-24 12:00:00"], undefined, /^date .* isn't/],
	["no amd64 binary", ["1.0.0", "https://get.coffer.party/1.0.0", "=https"], { amd64: null }, /^no .*-linux-amd64$/m],
	["no arm64 binary", ["1.0.0", "https://get.coffer.party/1.0.0", "=https"], { arm64: null }, /^no .*-linux-arm64$/m],
]) {
	test(`refuses ${why}, and writes nothing`, () => {
		const f = folder("1.0.0", opts);
		try {
			const r = args.length === 0 ? run() : run(f.out, ...args);
			assert.notEqual(r.status, 0, r.stdout);
			assert.match(r.stderr, reason);
			for (const name of ["install.sh", "release.json", "SHA256SUMS"]) assert.equal(existsSync(join(f.out, name)), false, name);
		} finally {
			rmSync(f.out, { recursive: true, force: true });
		}
	});
}
