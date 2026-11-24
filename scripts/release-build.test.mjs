// scripts/release-build.sh (phase 09, Part C): the one place the release build's Go command, flags and environment
// are written, run by bridge-release.yml, ci.yml's reproducibility check and rebuild-release.sh. Run here in a
// throwaway git repository with a stand-in `go` that logs every call, so the exact command is checked without a
// build. No network.
//   node --test scripts/release-build.test.mjs
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const real = join(dirname(fileURLToPath(import.meta.url)), "release-build.sh");

// The stand-in go: `go env GOVERSION` prints $FAKE_GOVERSION; `go build` logs its directory, arguments and the build
// environment, then writes the -o file; `go version -m <file>` prints one line.
const fakeGo = `#!/bin/sh
case "$1" in
env) [ "$2" = GOVERSION ] && { echo "$FAKE_GOVERSION"; exit 0; }; exit 1 ;;
build)
	{
		printf 'dir=%s\\n' "$(pwd)"
		for v in GOTOOLCHAIN CGO_ENABLED GOFLAGS GOOS GOARCH GOAMD64 GOARM64 GOENV GOWORK GOEXPERIMENT GOFIPS140; do
			eval "val=\\\${$v-UNSET}"; printf '%s=%s\\n' "$v" "$val"
		done
		for a in "$@"; do printf 'arg=%s\\n' "$a"; done
		echo ---
	} >>"$FAKE_GO_LOG"
	o=""; prev=""
	for a in "$@"; do [ "$prev" = -o ] && o=$a; prev=$a; done
	printf 'binary %s\\n' "$GOARCH" >"$o" ;;
version) echo "$3: go1.27.4" ;;
*) exit 1 ;;
esac
`;

function setup() {
	const root = mkdtempSync(join(tmpdir(), "release-build-"));
	const repo = join(root, "repo");
	mkdirSync(join(repo, "scripts"), { recursive: true });
	mkdirSync(join(repo, "bridge/cmd/xmr-bridge"), { recursive: true });
	copyFileSync(real, join(repo, "scripts/release-build.sh"));
	writeFileSync(join(repo, "bridge/go.mod"), "module example.invalid/bridge\n\ngo 1.27.4\n");
	writeFileSync(join(repo, "bridge/cmd/xmr-bridge/main.go"), "package main\n\nfunc main() {}\n");
	const git = (...a) => execFileSync("git", ["-C", repo, ...a], { stdio: "pipe" });
	git("init", "-q");
	git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "add", ".");
	git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-qm", "fixture");
	const bin = join(root, "bin");
	mkdirSync(bin);
	writeFileSync(join(bin, "go"), fakeGo);
	chmodSync(join(bin, "go"), 0o755);
	const log = join(root, "go.log");
	return { root, repo, bin, log };
}

function run(t, args, env = {}) {
	return spawnSync("sh", [join(t.repo, "scripts/release-build.sh"), ...args], {
		encoding: "utf8",
		env: { PATH: `${t.bin}:/usr/bin:/bin`, HOME: t.root, FAKE_GOVERSION: "go1.27.4", FAKE_GO_LOG: t.log, ...env },
	});
}

const builds = (log) =>
	existsSync(log)
		? readFileSync(log, "utf8")
				.split("---\n")
				.filter((b) => b.trim() !== "")
				.map((b) => b.trim().split("\n"))
		: [];

test("builds amd64 then arm64 with exactly the release flags, whatever the caller's environment says", () => {
	const t = setup();
	try {
		const out = join(t.root, "out");
		// A hostile environment: each of these would change the binary if it got through.
		const r = run(t, ["1.0.0", out], { CGO_ENABLED: "1", GOFLAGS: "-tags=devrelease", GOAMD64: "v3", GOARM64: "v9.0", GOTOOLCHAIN: "auto", GOEXPERIMENT: "loopvar", GOFIPS140: "latest", GOWORK: join(t.root, "go.work") });
		assert.equal(r.status, 0, r.stderr);
		const got = builds(t.log);
		assert.equal(got.length, 2);
		for (const [i, arch] of ["amd64", "arm64"].entries()) {
			assert.deepEqual(got[i], [
				`dir=${join(t.repo, "bridge")}`,
				"GOTOOLCHAIN=local",
				"CGO_ENABLED=0",
				"GOFLAGS=-mod=readonly",
				"GOOS=linux",
				`GOARCH=${arch}`,
				"GOAMD64=v1",
				"GOARM64=v8.0",
				"GOENV=off",
				"GOWORK=off",
				"GOEXPERIMENT=UNSET",
				"GOFIPS140=UNSET",
				"arg=build",
				"arg=-trimpath",
				"arg=-buildvcs=true",
				"arg=-ldflags",
				"arg=-X main.version=1.0.0",
				"arg=-o",
				`arg=${join(out, `xmr-bridge-1.0.0-linux-${arch}`)}`,
				"arg=./cmd/xmr-bridge",
			]);
		}
		assert.deepEqual(readdirSync(out).sort(), ["xmr-bridge-1.0.0-linux-amd64", "xmr-bridge-1.0.0-linux-arm64"]);
	} finally {
		rmSync(t.root, { recursive: true, force: true });
	}
});

test("a reproducibility build takes 0.0.0-repro", () => {
	const t = setup();
	try {
		const r = run(t, ["0.0.0-repro", join(t.root, "out")]);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(builds(t.log).length, 2);
	} finally {
		rmSync(t.root, { recursive: true, force: true });
	}
});

for (const [why, prep, args, reason] of [
	["no arguments", () => {}, () => [], /^usage: /],
	["a version that isn't x.y.z or 0.0.0-repro", () => {}, (t) => ["1.0.0-dev.abc", join(t.root, "out")], /^version /],
	["a Go that isn't go.mod's exact version", () => ({ FAKE_GOVERSION: "go1.27.3" }), (t) => ["1.0.0", join(t.root, "out")], /go1\.27\.3.*go1\.27\.4/],
	["a changed tracked file", (t) => void writeFileSync(join(t.repo, "bridge/cmd/xmr-bridge/main.go"), "package main\n// x\nfunc main() {}\n"), (t) => ["1.0.0", join(t.root, "out")], /isn't clean/],
	["an untracked file", (t) => void writeFileSync(join(t.repo, "stray.txt"), "x\n"), (t) => ["1.0.0", join(t.root, "out")], /isn't clean/],
	["an output folder inside the repository", () => {}, (t) => ["1.0.0", join(t.repo, "out")], /inside the repository/],
	["an output folder that isn't empty", (t) => void (mkdirSync(join(t.root, "out")), writeFileSync(join(t.root, "out/old"), "x")), (t) => ["1.0.0", join(t.root, "out")], /isn't empty/],
	["a relative output folder", () => {}, () => ["1.0.0", "out"], /absolute/],
]) {
	test(`refuses ${why}, and builds nothing`, () => {
		const t = setup();
		try {
			const env = prep(t) ?? {};
			const r = run(t, args(t), env);
			assert.notEqual(r.status, 0, r.stdout);
			assert.match(r.stderr, reason);
			assert.equal(builds(t.log).length, 0);
		} finally {
			rmSync(t.root, { recursive: true, force: true });
		}
	});
}
