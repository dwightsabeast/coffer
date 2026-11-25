// Tests for scripts/security-report-results.mjs: results grouped by matrix ID for the security report's appendix.
// Fixtures stand in for the three reporters' outputs (scripts/report/vitest-reporter.mjs, scripts/report/node-reporter.mjs,
// and `go test -json`).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./security-report-results.mjs", import.meta.url));

function fixtures() {
	const dir = mkdtempSync(join(tmpdir(), "srr-"));
	const vitest = [
		{ file: "tests/a.test.ts", name: "sync > [T03] a forged report is refused", state: "passed", fails: false },
		{ file: "tests/a.test.ts", name: "sync > [T03] [T04] an old report is refused", state: "passed", fails: false },
		{ file: "tests/b.test.ts", name: "[F01] [RT-06] unknown fields are refused", state: "passed", fails: true },
		{ file: "tests/b.test.ts", name: "[T05] a skipped one", state: "skipped", fails: false },
		{ file: "tests/c.test.ts", name: "layout, no ID", state: "passed", fails: false },
	];
	writeFileSync(join(dir, "plugin.json"), JSON.stringify({ format: 1, tests: vitest }));
	const go = [
		{ Action: "run", Package: "p/a", Test: "TestX" },
		{ Action: "run", Package: "p/a", Test: "TestX/[T16]_a_bad_signature_is_refused" },
		{ Action: "pass", Package: "p/a", Test: "TestX/[T16]_a_bad_signature_is_refused" },
		{ Action: "run", Package: "p/a", Test: "TestX/[T16][T32]_the_pins" },
		{ Action: "pass", Package: "p/a", Test: "TestX/[T16][T32]_the_pins" },
		{ Action: "pass", Package: "p/a", Test: "TestX" },
		{ Action: "run", Package: "p/b", Test: "TestLive" },
		{ Action: "skip", Package: "p/b", Test: "TestLive" },
		{ Action: "run", Package: "p/b", Test: "TestPlain" },
		{ Action: "pass", Package: "p/b", Test: "TestPlain" },
		{ Action: "run", Package: "p/c", Test: "TestTampered" },
		{ Action: "run", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary" },
		{ Action: "run", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary/a_byte_appended" },
		{ Action: "pass", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary/a_byte_appended" },
		{ Action: "run", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary/one_changed_byte" },
		{ Action: "pass", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary/one_changed_byte" },
		{ Action: "pass", Package: "p/c", Test: "TestTampered/[T33]_tampered_binary" },
		{ Action: "pass", Package: "p/c", Test: "TestTampered" },
		{ Action: "pass", Package: "p/b" },
	];
	writeFileSync(join(dir, "go.json"), go.map((e) => JSON.stringify(e)).join("\n") + "\n");
	const node = [{ file: "scripts/x.test.mjs", name: "[T32] a redirect fails", state: "passed", fails: false }];
	writeFileSync(join(dir, "node.json"), JSON.stringify({ format: 1, tests: node }));
	writeFileSync(join(dir, "matrix.md"), ["| ID | x |", "| --- | --- |", "| T03 | a |", "| T04 | a |", "| T05 | a |", "| T16 | a |", "| T32 | a |", "| T33 | a |", "| F01 | a |", "| P01 | a |", ""].join("\n"));
	return dir;
}

function run(dir, extra = []) {
	const args = [
		script,
		"--suite", `plugin=vitest:${join(dir, "plugin.json")}`,
		"--suite", `bridge=go:${join(dir, "go.json")}`,
		"--suite", `scripts=node:${join(dir, "node.json")}`,
		"--matrix", join(dir, "matrix.md"),
		"--commit", "2e3c410aa9280ab346941bf6a909a23f435976fb",
		"--ci-run", "45501345050",
		"--where", "dev box, a fresh clone",
		"--out", join(dir, "results.md"),
		"--summary-out", join(dir, "summary.md"),
		...extra,
	];
	return spawnSync(process.execPath, args, { encoding: "utf8" });
}

const row = (md, id) => md.split("\n").find((l) => l.startsWith(`| ${id} |`));

test("totals per suite keep passed, expected failures, skipped and failed apart; Go counts leaf tests only", () => {
	const dir = fixtures();
	const r = run(dir);
	assert.equal(r.status, 0, r.stderr);
	const s = readFileSync(join(dir, "summary.md"), "utf8");
	assert.equal(row(s, "plugin"), "| plugin | 3 | 1 | 1 | 0 |");
	assert.equal(row(s, "bridge"), "| bridge | 5 | 0 | 1 | 0 |");
	assert.equal(row(s, "scripts"), "| scripts | 1 | 0 | 0 | 0 |");
	assert.equal(row(s, "**All**"), "| **All** | 9 | 1 | 2 | 0 |");
});

test("each matrix ID gets a row; a test with two IDs counts under both; [RT-xx] isn't an ID", () => {
	const dir = fixtures();
	assert.equal(run(dir).status, 0);
	const s = readFileSync(join(dir, "summary.md"), "utf8");
	assert.equal(row(s, "T03"), "| T03 | 2 | 0 | 0 | 0 | |");
	assert.equal(row(s, "T04"), "| T04 | 1 | 0 | 0 | 0 | |");
	assert.equal(row(s, "T16"), "| T16 | 2 | 0 | 0 | 0 | |");
	assert.equal(row(s, "T32"), "| T32 | 2 | 0 | 0 | 0 | |");
	// A Go leaf inherits the IDs of the levels above it, as vitest's and node's full names do.
	assert.equal(row(s, "T33"), "| T33 | 2 | 0 | 0 | 0 | |");
	assert.equal(row(s, "F01"), "| F01 | 0 | 1 | 0 | 0 | Known limit: an expected failure is open |");
	assert.equal(row(s, "T05"), "| T05 | 0 | 0 | 1 | 0 | No automated test ran |");
	assert.equal(row(s, "P01"), "| P01 | 0 | 0 | 0 | 0 | No automated test ran |");
	assert.ok(!/RT-06 \|/.test(s));
});

test("the full list names every tagged test with its result and suite, and the header carries the commit, CI run and where", () => {
	const dir = fixtures();
	assert.equal(run(dir).status, 0);
	const out = readFileSync(join(dir, "results.md"), "utf8");
	assert.match(out, /2e3c410aa9280ab346941bf6a909a23f435976fb/);
	assert.match(out, /45501345050/);
	assert.match(out, /dev box, a fresh clone/);
	assert.match(out, /- PASS · plugin · `sync > \[T03\] \[T04\] an old report is refused`/);
	assert.match(out, /- EXPECTED FAILURE \(known limit\) · plugin · `\[F01\] \[RT-06\] unknown fields are refused`/);
	assert.match(out, /- SKIPPED · plugin · `\[T05\] a skipped one`/);
	assert.ok(!out.includes("TestLive"), "an untagged skipped test counts in the totals only");
	assert.match(out, /- PASS · bridge · `TestX\/\[T16\]\[T32\]_the_pins`/);
	assert.ok(!out.includes("layout, no ID"), "untagged tests count in the totals only");
	// A skipped Go test with no ID still appears in the totals (above) but not in the list.
	assert.ok(!out.includes("TestPlain"));
});

test("a failed test makes it exit 1 and is marked FAILED", () => {
	const dir = fixtures();
	const p = join(dir, "plugin.json");
	const d = JSON.parse(readFileSync(p, "utf8"));
	d.tests[0].state = "failed";
	writeFileSync(p, JSON.stringify(d));
	const r = run(dir);
	assert.equal(r.status, 1);
	assert.match(readFileSync(join(dir, "results.md"), "utf8"), /- FAILED · plugin · `sync > \[T03\] a forged report is refused`/);
	assert.equal(row(readFileSync(join(dir, "summary.md"), "utf8"), "T03"), "| T03 | 1 | 0 | 0 | 1 | Failed |");
});

test("an ID tagged in a test but missing from the matrix is refused, so the report can't name an ID it doesn't explain", () => {
	const dir = fixtures();
	const p = join(dir, "node.json");
	writeFileSync(p, JSON.stringify({ format: 1, tests: [{ file: "x", name: "[T99] unknown", state: "passed", fails: false }] }));
	const r = run(dir);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /T99/);
});

test("bad arguments and unreadable inputs exit 2 without writing", () => {
	const dir = fixtures();
	for (const bad of [["--suite", "x=other:/nope"], ["--suite", "nolabel"], ["--suite", `p=vitest:${join(dir, "missing.json")}`]]) {
		const r = spawnSync(process.execPath, [script, ...bad, "--matrix", join(dir, "matrix.md"), "--commit", "a".repeat(40), "--ci-run", "1", "--where", "w", "--out", join(dir, "o.md"), "--summary-out", join(dir, "s.md")], { encoding: "utf8" });
		assert.equal(r.status, 2, bad.join(" "));
	}
	const r = spawnSync(process.execPath, [script], { encoding: "utf8" });
	assert.equal(r.status, 2);
	assert.throws(() => execFileSync("test", ["-e", join(dir, "o.md")]));
});
