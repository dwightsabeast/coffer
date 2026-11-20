// Release 1 is tips only (spec change 22): the theme package ships nothing that sells or gates. RT-37 (spec change 55):
// `isPaid` said yes to any settled invoice, and a tip settles at 0.0001 XMR, so a page gated with it opened for a dust
// tip. It comes back in release 2, tied to what the page sells.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = new URL("..", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("release 1's theme package", () => {
	it("[T21] [RT-37] exports no gate and no pay button, and its README shows none", () => {
		const pkg = JSON.parse(read("package.json")) as { exports: Record<string, string>; description: string };
		expect(Object.keys(pkg.exports).sort()).toEqual(["./PayPage.astro", "./TipButton.astro", "./messages", "./page", "./qr", "./tip"]);
		for (const target of Object.values(pkg.exports)) expect(existsSync(new URL(target, root)), target).toBe(true);
		const files = readdirSync(new URL("src", root));
		expect(files.filter((f) => /ispaid|paybutton/i.test(f))).toEqual([]);
		for (const text of [pkg.description, read("README.md"), ...files.filter((f) => /\.(ts|astro)$/.test(f)).map((f) => read(`src/${f}`))]) {
			expect(text).not.toMatch(/isPaid|PayButton|[Gg]ated content/);
		}
	});
});
