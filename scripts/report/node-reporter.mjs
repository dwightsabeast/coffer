// A node:test reporter for the security report's results (scripts/security-report-results.mjs). Node built-ins only.
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=<absolute path of this file> --test-reporter-destination=<file> <test files>
// Writes { format: 1, tests: [{ file, name, state, fails }] } with leaf tests only: a test with subtests is its
// subtests. Names are joined with " > ". `todo` and `skip` count as skipped.
export default async function* cofferResults(source) {
	const tests = [];
	const path = [];
	const childSeen = [];
	for await (const e of source) {
		const d = e.data;
		if (e.type === "test:start") {
			path[d.nesting] = d.name;
			path.length = d.nesting + 1;
			continue;
		}
		if (e.type !== "test:pass" && e.type !== "test:fail") continue;
		const parent = childSeen[d.nesting + 1] === true;
		childSeen[d.nesting + 1] = false;
		childSeen[d.nesting] = true;
		if (parent || d.details?.type === "suite") continue;
		const name = [...path.slice(0, d.nesting), d.name].join(" > ");
		const state = d.skip !== undefined || d.todo !== undefined ? "skipped" : e.type === "test:pass" ? "passed" : "failed";
		tests.push({ file: d.file ?? "", name, state, fails: false });
	}
	yield JSON.stringify({ format: 1, tests });
}
