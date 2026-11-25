// The npm package as published for 1.0.0 (docs/decisions.md, 2026-11-25): its fields, and exactly what npm packs.
// npm's trusted publishing needs `repository` to match the GitHub repository, and its provenance names it.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function filesUnder(dir: string): string[] {
	return readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
		e.isDirectory() ? filesUnder(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
	);
}

describe("the npm package", () => {
	it("is publishable as @cofferhq/astro 1.0.0 from this repository", () => {
		const pkg = JSON.parse(read("package.json")) as Record<string, unknown>;
		expect(pkg.name).toBe("@cofferhq/astro");
		expect(pkg.version).toBe("1.0.0");
		expect(pkg.private).toBeUndefined();
		expect(pkg.license).toBe("MIT");
		expect(pkg.repository).toEqual({ type: "git", url: "git+https://github.com/dwightsabeast/coffer.git", directory: "theme" });
		expect(pkg.publishConfig).toEqual({ access: "public" });
		// No lifecycle script can run at pack or publish time (the workflow also passes --ignore-scripts).
		expect(Object.keys(pkg.scripts as object).filter((s) => /^(pre|post)?(pack|publish|prepare|install)/.test(s))).toEqual([]);
	});

	it("carries Coffer's own license, the same text as the repository's", () => {
		expect(read("LICENSE")).toBe(readFileSync(new URL("../LICENSE", root), "utf8"));
	});

	it("packs exactly the README, the license, package.json and src (the vendored encoder's license included)", () => {
		const out = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
			cwd: fileURLToPath(root),
			encoding: "utf8",
			env: { ...process.env, npm_config_loglevel: "silent" },
		});
		const [packed] = JSON.parse(out) as [{ name: string; version: string; files: { path: string }[] }];
		expect(`${packed.name}@${packed.version}`).toBe("@cofferhq/astro@1.0.0");
		const want = ["LICENSE", "README.md", "package.json", ...filesUnder("src")].sort();
		expect(packed.files.map((f) => f.path).sort()).toEqual(want);
		expect(want).toContain("src/vendor/qrcodegen/LICENSE");
	});
});
