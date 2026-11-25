#!/usr/bin/env node
// The security report's results, grouped by matrix ID (docs/security-matrix.md, "From matrix to public report").
// Node built-ins only. Inputs, one --suite each:
//   <label>=vitest:<file>   written by scripts/report/vitest-reporter.mjs ({ format: 1, tests: [...] })
//   <label>=node:<file>     written by scripts/report/node-reporter.mjs (the same shape)
//   <label>=go:<file>       `go test -json` output
// Each test is one of: passed; an expected failure (vitest's it.fails, a known limit still open); skipped (didn't
// run); failed. Go counts leaf tests only (a parent with subtests is its subtests). IDs are [T01], [P01], [R01] and
// [F01] style tags anywhere in a test's full name ([RT-06] is a finding, not an ID), so a test inherits the IDs of
// the suites or parent tests above it.
// Writes --out (the full list of tagged tests) and --summary-out (the tables for the report's appendix).
// Exit 0 when every test passed or was an expected failure or skip; 1 if any failed; 2 on bad arguments or input,
// or an ID that the matrix doesn't have (nothing is written then).
//
//   node scripts/security-report-results.mjs --suite plugin=vitest:<f> … --matrix docs/security-matrix.md \
//     --commit <sha> --ci-run <id> --where "<where the tests ran>" --out <file> --summary-out <file>
import { readFileSync, writeFileSync } from "node:fs";

function usage(msg) {
	process.stderr.write(`security-report-results: ${msg}\n`);
	process.exit(2);
}

const args = { suite: [] };
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
	const k = argv[i];
	const v = argv[i + 1];
	if (!k.startsWith("--") || v === undefined) usage(`bad argument ${k}`);
	const name = k.slice(2);
	if (name === "suite") args.suite.push(v);
	else if (["matrix", "commit", "ci-run", "where", "out", "summary-out"].includes(name)) args[name] = v;
	else usage(`unknown option ${k}`);
	i++;
}
for (const need of ["matrix", "commit", "ci-run", "where", "out", "summary-out"]) if (!args[need]) usage(`--${need} is required`);
if (args.suite.length === 0) usage("at least one --suite is required");
if (!/^[0-9a-f]{40}$/.test(args.commit)) usage("--commit must be a full 40-character SHA");

const ID = /\[([TPRF][0-9]{2})\]/g;
const idsOf = (s) => [...new Set([...s.matchAll(ID)].map((m) => m[1]))];

function read(file) {
	try {
		return readFileSync(file, "utf8");
	} catch (e) {
		usage(`can't read ${file}: ${e.code ?? e.message}`);
	}
}

// One record per test: { suite, name, result, ids }.
const tests = [];
const suites = [];
for (const spec of args.suite) {
	const m = /^([a-z0-9][a-z0-9 ()._-]*)=(vitest|node|go):(.+)$/i.exec(spec);
	if (!m) usage(`--suite ${spec}: want <label>=<vitest|node|go>:<file>`);
	const [, label, kind, file] = m;
	if (suites.includes(label)) usage(`--suite ${label} given twice`);
	suites.push(label);
	const text = read(file);
	if (kind === "go") {
		const final = new Map();
		for (const line of text.split("\n")) {
			if (!line.trim().startsWith("{")) continue;
			let e;
			try {
				e = JSON.parse(line);
			} catch {
				usage(`${file}: a line isn't JSON`);
			}
			if (!e.Test || !["pass", "fail", "skip"].includes(e.Action)) continue;
			final.set(`${e.Package}\u0000${e.Test}`, { pkg: e.Package, name: e.Test, action: e.Action });
		}
		const names = [...final.values()];
		for (const t of names) {
			const parent = names.some((o) => o.pkg === t.pkg && o.name.startsWith(`${t.name}/`));
			if (parent) continue;
			const result = { pass: "passed", fail: "failed", skip: "skipped" }[t.action];
			tests.push({ suite: label, name: t.name, result, ids: idsOf(t.name) });
		}
	} else {
		let d;
		try {
			d = JSON.parse(text);
		} catch {
			usage(`${file}: not JSON`);
		}
		if (d?.format !== 1 || !Array.isArray(d.tests)) usage(`${file}: not a reporter file (format 1)`);
		for (const t of d.tests) {
			let result;
			if (t.state === "failed") result = "failed";
			else if (t.state === "skipped" || t.state === "pending") result = "skipped";
			else if (t.state === "passed") result = t.fails ? "expected" : "passed";
			else usage(`${file}: unknown state ${t.state}`);
			tests.push({ suite: label, name: t.name, result, ids: idsOf(t.name) });
		}
	}
}

// The matrix's IDs, in its order.
const matrixIds = [];
for (const line of read(args.matrix).split("\n")) {
	const m = /^\| ([TPRF][0-9]{2}) \|/.exec(line);
	if (m && !matrixIds.includes(m[1])) matrixIds.push(m[1]);
}
const unknown = [...new Set(tests.flatMap((t) => t.ids))].filter((id) => !matrixIds.includes(id));
if (unknown.length) usage(`tests are tagged with IDs the matrix doesn't have: ${unknown.sort().join(", ")}`);

const KINDS = ["passed", "expected", "skipped", "failed"];
const count = (list) => Object.fromEntries(KINDS.map((k) => [k, list.filter((t) => t.result === k).length]));
const cells = (c) => KINDS.map((k) => c[k]).join(" | ");

const totals = ["| Suite | Passed | Expected failure (known limit) | Skipped (didn't run) | Failed |", "| --- | ---: | ---: | ---: | ---: |"];
for (const s of suites) totals.push(`| ${s} | ${cells(count(tests.filter((t) => t.suite === s)))} |`);
totals.push(`| **All** | ${cells(count(tests))} |`);

const byId = ["| ID | Passed | Expected failure (known limit) | Skipped (didn't run) | Failed | Note |", "| --- | ---: | ---: | ---: | ---: | --- |"];
for (const id of matrixIds) {
	const c = count(tests.filter((t) => t.ids.includes(id)));
	const note = c.failed ? "Failed" : c.passed + c.expected === 0 ? "No automated test ran" : c.expected ? "Known limit: an expected failure is open" : "";
	byId.push(`| ${id} | ${cells(c)} |${note ? ` ${note} ` : " "}|`);
}

const LABEL = { passed: "PASS", expected: "EXPECTED FAILURE (known limit)", skipped: "SKIPPED", failed: "FAILED" };
const header = [
	`| | |`,
	`| --- | --- |`,
	`| Commit | \`${args.commit}\` |`,
	`| CI run on that commit | ${args["ci-run"]} |`,
	`| Where these results come from | ${args.where} |`,
];
const full = ["# Coffer test results by ID", "", "Generated by `scripts/security-report-results.mjs`. Each test whose name carries a matrix ID, with its result. Tests without an ID count in the totals only.", "", ...header, "", "## Totals", "", ...totals, "", "## By ID", "", ...byId, "", "## Every tagged test", ""];
for (const id of matrixIds) {
	const list = tests.filter((t) => t.ids.includes(id));
	if (!list.length) continue;
	full.push(`### ${id}`, "");
	for (const t of list) full.push(`- ${LABEL[t.result]} · ${t.suite} · \`${t.name.replaceAll("`", "'")}\``);
	full.push("");
}
const summary = [...header, "", "**Totals**", "", ...totals, "", "**By ID**", "", ...byId, ""];

writeFileSync(args.out, full.join("\n"));
writeFileSync(args["summary-out"], summary.join("\n"));
const all = count(tests);
process.stdout.write(`${tests.length} tests: ${all.passed} passed, ${all.expected} expected failures, ${all.skipped} skipped, ${all.failed} failed\n`);
process.exit(all.failed ? 1 : 0);
