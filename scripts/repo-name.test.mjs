// The repository is dwightsabeast/coffer (renamed from EmDash-MoneroPay on 2026-10-20, spec change 41 item 10).
// The old name may stay only in the history files. Run: node --test scripts/*.test.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { test } from "node:test";

const HISTORY = new Set(["docs/progress.md", "docs/spec-changes.md", "docs/decisions.md"]);

test("no tracked file outside the history names the old repository", () => {
	let out = "";
	try {
		out = execFileSync("git", ["grep", "-I", "-i", "-l", "EmDash-MoneroPay"], { cwd: join(import.meta.dirname, ".."), encoding: "utf8" });
	} catch (e) {
		if (e.status !== 1) throw e; // git grep exits 1 when nothing matches
	}
	const files = out.split("\n").filter((f) => f && !HISTORY.has(f) && f !== "scripts/repo-name.test.mjs");
	assert.deepEqual(files, []);
});
