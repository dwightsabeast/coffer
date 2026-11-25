// A vitest reporter for the security report's results (scripts/security-report-results.mjs). Dev tooling only; it uses
// vitest's own reporter API (vitest 4) and Node built-ins. vitest's JSON reporter shows an it.fails test that failed as
// "passed", so known limits would read as protections; this one records `fails` beside each result.
//   COFFER_RESULTS_FILE=<file> vitest run --reporter=default --reporter=<absolute path of this file>
// Writes { format: 1, tests: [{ file, name, state, fails }] }; name is the full name, suites joined with " > ".
import { writeFileSync } from "node:fs";
import { relative } from "node:path";

export default class CofferResultsReporter {
	onInit(vitest) {
		this.root = vitest.config.root;
		this.out = process.env.COFFER_RESULTS_FILE;
		if (!this.out) throw new Error("COFFER_RESULTS_FILE isn't set");
	}

	onTestRunEnd(testModules) {
		const tests = [];
		for (const m of testModules) {
			for (const t of m.children.allTests()) {
				tests.push({ file: relative(this.root, m.moduleId), name: t.fullName, state: t.result().state, fails: Boolean(t.options.fails) });
			}
		}
		writeFileSync(this.out, JSON.stringify({ format: 1, tests }));
	}
}
