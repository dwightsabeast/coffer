// TipButton (phase 07, 7c): a plain HTML form, no script, posting to the tip endpoint.
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import TipButton from "../src/TipButton.astro";
import source from "../src/TipButton.astro?raw";

let container: AstroContainer;
beforeAll(async () => {
	container = await AstroContainer.create();
});
const render = (props: Record<string, unknown> = {}, path = "/posts/hello") => container.renderToString(TipButton, { props, request: new Request(`https://shop.example${path}`) });

describe("TipButton", () => {
	it("a form posting to /pay/coffer/tip (spec change 36, R2): 3, 5, 10 in the site currency (5 chosen), another amount in it or XMR, any amount, a note", async () => {
		const html = await render();
		expect(html).toMatch(/<form class="coffer-tip[^"]*" method="post" action="\/pay\/coffer\/tip"/);
		for (const a of ["3", "5", "10"]) expect(html).toMatch(new RegExp(`<input type="radio" name="amount" value="${a}"[^>]*>\\s*\\$${a}`));
		expect(html).toMatch(/<input type="radio" name="amount" value="5"[^>]* checked/);
		expect(html).toMatch(/<input type="radio" name="amount" value="custom"/);
		expect(html).toMatch(/<input[^>]* name="custom"[^>]* inputmode="decimal"/);
		expect(html).toMatch(/<select name="unit"[^>]*>\s*<option value="fiat"[^>]*>USD<\/option>\s*<option value="xmr"[^>]*>XMR<\/option>/);
		expect(html).toMatch(/<input type="radio" name="amount" value="any"/);
		expect(html).toMatch(/<textarea name="note"[^>]* maxlength="140"/);
		expect(html).toMatch(/<input type="hidden" name="currency" value="USD"[^>]*>/);
		expect(html).toMatch(/<input type="hidden" name="returnTo" value="\/posts\/hello"[^>]*>/);
		// The way back keeps the page's query (spec change 39); the endpoint checks it.
		expect(await render({}, "/posts/hello?page=2")).toMatch(/<input type="hidden" name="returnTo" value="\/posts\/hello\?page=2"[^>]*>/);
		expect(html).toMatch(/<button type="submit"[^>]*>Tip with Monero<\/button>/);
		expect(html).not.toContain("<script");
		expect(html).not.toContain('name="collection"');
	});

	it("an entry, euros, other amounts, a label and a shorter note limit, as props", async () => {
		const html = await render({ collection: "posts", id: "01HELLO", currency: "EUR", amounts: [2, 20], noteMax: 80, label: "Tip this post" });
		expect(html).toMatch(/<input type="hidden" name="collection" value="posts"[^>]*>/);
		expect(html).toMatch(/<input type="hidden" name="id" value="01HELLO"[^>]*>/);
		expect(html).toMatch(/<input type="hidden" name="currency" value="EUR"[^>]*>/);
		expect(html).toMatch(/value="2"[^>]*>\s*€2/);
		expect(html).toMatch(/value="20"[^>]*>\s*€20/);
		expect(html).not.toMatch(/value="5"/);
		expect(html).toMatch(/maxlength="80"/);
		expect(html).toMatch(/>Tip this post<\/button>/);
	});

	it("[F07] bad props are tidied, not passed on: odd amounts dropped, an unknown currency becomes USD, the note limit capped at 140", async () => {
		const html = await render({ amounts: [0, -3, 2.5, 7, 7, 1000000], currency: "GBP", noteMax: 500 });
		expect(html).toMatch(/value="7"/);
		expect(html.match(/name="amount" value="7"/g)).toHaveLength(1);
		for (const bad of ["0", "-3", "2.5", "1000000"]) expect(html).not.toContain(`name="amount" value="${bad}"`);
		expect(html).toContain('name="currency" value="USD"');
		expect(html).toMatch(/maxlength="140"/);
	});

	it("[T23] leaves the rest of the site alone (spec change 36, R5): no script, and only its own scoped coffer-tip styles", async () => {
		expect(await render()).not.toContain("<script");
		expect(source).not.toContain("<script");
		const styles = [...source.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
		expect(styles).toHaveLength(1);
		const [, attrs, css] = styles[0];
		expect(attrs).not.toMatch(/is:global|is:inline/);
		expect(css).not.toContain(":global");
		const selectors = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(",").map((x) => x.trim()));
		expect(selectors.length).toBeGreaterThan(0);
		for (const sel of selectors) expect(sel, sel).toMatch(/^\.coffer-tip(?:-[a-z-]+)?(?:[\s:>[]|$)/);
		// It reads --coffer-tip-* custom properties and never sets one.
		expect(css).not.toMatch(/(^|[;{\s])--[\w-]+\s*:/);
	});
});
