// scripts/rebuild-release.sh (phase 09, Part C step 5; T37): Wyatt's check of CI's release artifact before he signs.
// Run against a throwaway "GitHub" (a local bare repository, through the test-only REBUILD_REPO_URL) and a stand-in
// `go` whose binaries depend on the commit, so a different commit gives different bytes. The CI artifact is made the
// way bridge-release.yml makes it: release-build.sh, assemble-release.sh, the public key. No network.
//   node --test scripts/rebuild-release.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, chmodSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repo, "scripts/rebuild-release.sh");

// The stand-in go: `go version` is $FAKE_GOVERSION on $FAKE_GOHOST; `go env GOVERSION` likewise; `go build` writes a
// file naming the CPU and the commit it was built from; `go version -m <file>` prints the file's first line.
const fakeGo = `#!/bin/sh
case "$1" in
env) [ "$2" = GOVERSION ] && { echo "$FAKE_GOVERSION"; exit 0; }; exit 1 ;;
build)
	o=""; prev=""
	for a in "$@"; do [ "$prev" = -o ] && o=$a; prev=$a; done
	printf 'binary %s %s %s\\n' "$GOARCH" "$(git rev-parse HEAD)" "$GOFLAGS" >"$o" ;;
version)
	if [ $# -eq 1 ]; then echo "go version $FAKE_GOVERSION \${FAKE_GOHOST:-linux/amd64}"; else printf '%s: %s\\n' "$3" "$(head -n 1 "$3")"; fi ;;
*) exit 1 ;;
esac
`;

const V = "1.0.0";
const git = (dir, ...a) => execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", ...a], { stdio: "pipe", encoding: "utf8" }).trim();

function setup({ tagAnother = false, mainAhead = false, otherKey = false } = {}) {
	const root = mkdtempSync(join(tmpdir(), "rebuild-release-"));
	const src = join(root, "src");
	for (const f of ["scripts/release-build.sh", "scripts/assemble-release.sh", "installer/install.sh", "installer/coffer-release.pub.pem"]) {
		mkdirSync(dirname(join(src, f)), { recursive: true });
		copyFileSync(join(repo, f), join(src, f));
	}
	// A commit whose own key file isn't release key 1 (CI's key-pin test would also stop it).
	if (otherKey) copyFileSync(join(repo, "installer/coffer-release-next.pub.pem"), join(src, "installer/coffer-release.pub.pem"));
	mkdirSync(join(src, "bridge/cmd/xmr-bridge"), { recursive: true });
	writeFileSync(join(src, "bridge/go.mod"), "module example.invalid/bridge\n\ngo 1.27.4\n");
	writeFileSync(join(src, "bridge/cmd/xmr-bridge/main.go"), "package main\n\nfunc main() {}\n");
	execFileSync("git", ["init", "-q", "-b", "main", src]);
	git(src, "add", ".");
	git(src, "commit", "-qm", "ship");
	const ship = git(src, "rev-parse", "HEAD");
	writeFileSync(join(src, "later.txt"), "later\n");
	git(src, "add", ".");
	git(src, "commit", "-qm", "later");
	const later = git(src, "rev-parse", "HEAD");
	if (!mainAhead) git(src, "reset", "-q", "--hard", ship);
	git(src, "tag", "-a", `xmr-bridge@${V}`, "-m", "release", tagAnother ? later : ship);
	const origin = join(root, "origin.git");
	execFileSync("git", ["clone", "-q", "--bare", src, origin]);

	const bin = join(root, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "go"), fakeGo);
	chmodSync(join(bin, "go"), 0o755);
	const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: join(root, "home"), FAKE_GOVERSION: "go1.27.4", REBUILD_REPO_URL: `file://${origin}` };
	mkdirSync(env.HOME);

	// CI's artifact, as bridge-release.yml makes it, from a clean clone at the ship commit.
	const ci = join(root, "ci");
	execFileSync("git", ["clone", "-q", origin, ci]);
	git(ci, "checkout", "-q", "--detach", ship);
	const art = join(root, "artifact");
	execFileSync("sh", [join(ci, "scripts/release-build.sh"), V, art], { env, stdio: "pipe" });
	execFileSync("sh", [join(ci, "scripts/assemble-release.sh"), art, V, `https://get.coffer.party/${V}`, "=https", "2026-11-24T12:00:00Z"], { env, stdio: "pipe" });
	copyFileSync(join(ci, "installer/coffer-release.pub.pem"), join(art, "coffer-release.pub.pem"));
	return { root, ship, later, art, env };
}

function run(t, args, env = {}) {
	const r = spawnSync("sh", [script, ...args], { encoding: "utf8", env: { ...t.env, ...env } });
	let out = "";
	try {
		out = readFileSync(join(t.env.HOME, `xmr-pay-dev-data/release-${V}/rebuild-output.txt`), "utf8");
	} catch {}
	return { ...r, out };
}
const lines = (out, word) => out.split("\n").filter((l) => new RegExp(`^\\[[A-Z0-9-]+\\] ${word} `).test(l));

// Every run against the local stand-in says, once, that it isn't GitHub: that FAIL is expected here and nowhere else.
const notGitHub = /^\[CLONE\] FAIL not the GitHub repository: file:\/\//;

test("a matching artifact: every check passes, apart from the one test-only 'not GitHub' line", () => {
	const t = setup();
	try {
		const r = run(t, [V, t.ship, t.art]);
		assert.equal(r.status, 1, r.stderr);
		const fails = lines(r.out, "FAIL");
		assert.equal(fails.length, 1, r.out);
		assert.match(fails[0], notGitHub);
		for (const want of [
			/^\[GO\] PASS go1\.27\.4 linux\/amd64, as bridge\/go\.mod says$/m,
			/^\[TAG\] PASS xmr-bridge@1\.0\.0 is [0-9a-f]{40}$/m,
			/^\[MAIN\] PASS main is the tagged commit$/m,
			/^\[BUILD\] PASS /m,
			/^\[FILES\] PASS the artifact holds exactly the six release files$/m,
			/^\[BINARY\] PASS xmr-bridge-1\.0\.0-linux-amd64 identical, sha256 [0-9a-f]{64}$/m,
			/^\[BINARY\] PASS xmr-bridge-1\.0\.0-linux-arm64 identical, sha256 [0-9a-f]{64}$/m,
			/^\[SUMS\] PASS SHA256SUMS lists xmr-bridge-1\.0\.0-linux-amd64 with the rebuilt sha256$/m,
			/^\[RELEASE\] PASS release\.json lists xmr-bridge-1\.0\.0-linux-arm64 with the rebuilt sha256 and size$/m,
			/^\[ASSEMBLE\] PASS install\.sh identical$/m,
			/^\[ASSEMBLE\] PASS release\.json identical$/m,
			/^\[ASSEMBLE\] PASS SHA256SUMS identical$/m,
			/^\[KEY\] PASS coffer-release\.pub\.pem is the tagged commit's, fingerprint 531183cd4dea6af723656e2196aa6826a7d2c3dc0d9877bfb92b7887e16c3192$/m,
			/^done: 1 FAIL$/m,
		])
			assert.match(r.out, want);
		assert.equal(lines(r.out, "PASS").length, 15, r.out);
	} finally {
		rmSync(t.root, { recursive: true, force: true });
	}
});

for (const [why, change, want] of [
	["a binary with one byte changed", (t) => appendFileSync(join(t.art, `xmr-bridge-${V}-linux-arm64`), "x"), [/^\[BINARY\] FAIL xmr-bridge-1\.0\.0-linux-arm64 differs/m]],
	["an edited install.sh", (t) => appendFileSync(join(t.art, "install.sh"), "# x\n"), [/^\[ASSEMBLE\] FAIL install\.sh differs/m]],
	["an edited release.json (base, files and checksums the same)", (t) => writeFileSync(join(t.art, "release.json"), readFileSync(join(t.art, "release.json"), "utf8").replace('"product":"xmr-bridge"', '"product":"xmr-bridgE"')), [/^\[ASSEMBLE\] FAIL release\.json differs/m]],
	["another public key", (t) => writeFileSync(join(t.art, "coffer-release.pub.pem"), readFileSync(join(repo, "installer/coffer-release-next.pub.pem"))), [/^\[KEY\] FAIL /m]],
	["an extra file in the artifact", (t) => writeFileSync(join(t.art, "release.json.sig"), "x\n"), [/^\[FILES\] FAIL unexpected: release\.json\.sig$/m]],
	["a missing file in the artifact", (t) => rmSync(join(t.art, "SHA256SUMS")), [/^\[FILES\] FAIL missing: SHA256SUMS$/m]],
]) {
	test(`refuses ${why}`, () => {
		const t = setup();
		try {
			change(t);
			const r = run(t, [V, t.ship, t.art]);
			assert.equal(r.status, 1);
			for (const w of want) assert.match(r.out, w);
			assert.ok(lines(r.out, "FAIL").length >= 2, r.out);
			assert.doesNotMatch(r.out, /^done: [01] FAIL$/m);
		} finally {
			rmSync(t.root, { recursive: true, force: true });
		}
	});
}

for (const [why, opts, args, env, want] of [
	["a commit that isn't the tag's", {}, (t) => [V, t.later, t.art], {}, /^\[TAG\] FAIL xmr-bridge@1\.0\.0 is [0-9a-f]{40}, not [0-9a-f]{40}$/m],
	["a tag that isn't main's head", { mainAhead: true }, (t) => [V, t.ship, t.art], {}, /^\[MAIN\] FAIL main is [0-9a-f]{40}, not the tagged commit$/m],
	["a tag on another commit than the artifact's", { tagAnother: true }, (t) => [V, t.later, t.art], {}, /^\[BINARY\] FAIL xmr-bridge-1\.0\.0-linux-amd64 differs/m],
	["a commit whose own public key isn't release key 1", { otherKey: true }, (t) => [V, t.ship, t.art], {}, /^\[KEY\] FAIL coffer-release\.pub\.pem isn't the tagged commit's release key 1 \(fingerprint 392a98064028199f53223cb8c7fe22d318ea3182661c316279778778239c27fa\)$/m],
	["another Go release", {}, (t) => [V, t.ship, t.art], { FAKE_GOVERSION: "go1.27.3" }, /^\[GO\] FAIL go version go1\.27\.3 linux\/amd64; bridge\/go\.mod wants go1\.27\.4 on linux\/amd64$/m],
	["another build host", {}, (t) => [V, t.ship, t.art], { FAKE_GOHOST: "linux/arm64" }, /^\[GO\] FAIL go version go1\.27\.4 linux\/arm64; /m],
	["a tag that doesn't exist", {}, (t) => ["1.0.1", t.ship, t.art], {}, null],
]) {
	test(`refuses ${why}`, () => {
		const t = setup(opts);
		try {
			const r = run(t, args(t), env);
			assert.equal(r.status, 1, r.stderr);
			if (want) assert.match(r.out, want);
			else assert.match(r.stdout + r.stderr, /^\[TAG\] FAIL no tag xmr-bridge@1\.0\.1$/m);
			assert.doesNotMatch(r.out, /^done: [01] FAIL$/m);
		} finally {
			rmSync(t.root, { recursive: true, force: true });
		}
	});
}

for (const [why, args] of [
	["no arguments", []],
	["a version that isn't x.y.z", ["1.0", "a".repeat(40), "/tmp"]],
	["a short commit", ["1.0.0", "abc1234", "/tmp"]],
	["an artifact folder that doesn't exist", ["1.0.0", "a".repeat(40), "/nonexistent/artifact"]],
]) {
	test(`usage: refuses ${why}`, () => {
		const r = spawnSync("sh", [script, ...args], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", HOME: tmpdir() } });
		assert.equal(r.status, 2);
		assert.match(r.stderr, /^usage: |isn't|doesn't exist/m);
	});
}
