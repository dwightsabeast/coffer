// The tip endpoint (phase 07, 7c): the TipButton form to a checkout body, checkout called in-process with the visitor's
// own request headers (so per-client limits see the same IP), a 303 to the pay page, plain error pages, and the spec
// change 18 A fallback: a configured shop address, checked for format and network, shown when no tip invoice can be
// made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkoutErrorMessage } from "../src/messages";
import { qrSvg } from "../src/qr";
import { tipEndpoint } from "../src/tip";

type B = Record<string, any>;
const ORIGIN = "https://shop.example";
// A stagenet subaddress shape (network byte 36) from the address tests' encoder.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];
function encode(bytes: number[]): string {
	let out = "";
	for (let i = 0; i < bytes.length; i += 8) {
		const block = bytes.slice(i, i + 8);
		let n = 0n;
		for (const b of block) n = (n << 8n) | BigInt(b);
		let s = "";
		for (let k = 0; k < SIZES[block.length]; k++) {
			s = ALPHABET[Number(n % 58n)] + s;
			n /= 58n;
		}
		out += s;
	}
	return out;
}
const STAGENET_SUB = encode([36, ...Array.from({ length: 68 }, (_, i) => (i * 13 + 5) & 0xff)]);
const MAINNET = encode([18, ...Array.from({ length: 68 }, (_, i) => (i * 7 + 1) & 0xff)]);

interface Call { pluginId: string; method: string; path: string; body: B; headers: Record<string, string> }

function locals(reply: unknown, calls: Call[] = [], opts: { throws?: boolean } = {}) {
	return {
		emdash: {
			handlePublicPluginApiRoute: async (pluginId: string, method: string, path: string, request: Request) => {
				calls.push({ pluginId, method, path, body: JSON.parse(await request.text()), headers: Object.fromEntries(request.headers) });
				if (opts.throws) throw new Error("boom");
				return reply;
			},
		},
	};
}
const ok = (token = "AbCdEfGhIjKlMnOpQrStUv") => ({ success: true, data: { token, address: "x", amountAtomic: null, amountXmr: null, uri: "monero:x", expiresAt: "", status: "new" } });
const fail = (code: string) => ({ success: true, data: { error: { code } } });

async function post(handler: ReturnType<typeof tipEndpoint>, fields: Record<string, string>, loc: unknown, headers: Record<string, string> = {}) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	const request = new Request(`${ORIGIN}/pay/tip`, { method: "POST", body: form, headers });
	const res = (await handler({ request, url: new URL(request.url), locals: loc } as never)) as Response;
	return { res, html: res.status === 303 ? "" : await res.text() };
}

describe("tip endpoint: to checkout", () => {
	const endpoint = tipEndpoint();

	it("a suggested amount in the site currency, an entry and a note: one checkout, then 303 to the pay page", async () => {
		const calls: Call[] = [];
		const { res } = await post(endpoint, { amount: "5", currency: "EUR", collection: "posts", id: "01HELLO", note: "thanks!", returnTo: "/posts/hello" }, locals(ok(), calls));
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("/pay/AbCdEfGhIjKlMnOpQrStUv");
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ pluginId: "coffer", method: "POST", path: "checkout" });
		expect(calls[0].body).toEqual({ kind: "tip", amount: { fiatMinor: "500", currency: "EUR" }, contentRef: { collection: "posts", id: "01HELLO" }, note: "thanks!" });
	});

	it("custom amounts: fiat to minor units, XMR to atomic units, never floats; any amount sends none", async () => {
		const cases: Array<[Record<string, string>, unknown]> = [
			[{ amount: "custom", custom: "12.5", unit: "fiat", currency: "USD" }, { fiatMinor: "1250", currency: "USD" }],
			[{ amount: "custom", custom: "7", unit: "fiat", currency: "USD" }, { fiatMinor: "700", currency: "USD" }],
			[{ amount: "custom", custom: "0.002", unit: "xmr" }, { xmrAtomic: "2000000000" }],
			[{ amount: "custom", custom: "1.000000000001", unit: "xmr" }, { xmrAtomic: "1000000000001" }],
			[{ amount: "any" }, undefined],
		];
		for (const [fields, amount] of cases) {
			const calls: Call[] = [];
			await post(endpoint, fields, locals(ok(), calls));
			expect(calls[0]?.body.amount, JSON.stringify(fields)).toEqual(amount);
		}
	});

	it("a malformed form: an error page, and checkout is never called", async () => {
		const malformed: Array<Record<string, string>> = [{ amount: "custom", custom: "1e3", unit: "fiat" }, { amount: "custom", custom: "-1", unit: "xmr" }, { amount: "custom", custom: "0.0000000000001", unit: "xmr" }, { amount: "custom", custom: "1.234", unit: "fiat" }, { amount: "custom", custom: "", unit: "xmr" }, { amount: "5", currency: "GBP" }, { amount: "five" }, { amount: "custom", custom: "1", unit: "btc" }];
		for (const fields of malformed) {
			const calls: Call[] = [];
			const { res, html } = await post(endpoint, fields, locals(ok(), calls));
			expect(res.status, JSON.stringify(fields)).toBe(400);
			expect(html).toContain(checkoutErrorMessage("INVALID_REQUEST"));
			expect(calls).toEqual([]);
		}
	});

	it("passes the visitor's own request headers on, except cookies, credentials and Origin", async () => {
		const calls: Call[] = [];
		await post(endpoint, { amount: "any" }, locals(ok(), calls), { "x-forwarded-for": "198.51.100.7", "cf-connecting-ip": "198.51.100.7", "user-agent": "Tor Browser", cookie: "session=secret", authorization: "Bearer x", origin: ORIGIN });
		const h = calls[0].headers;
		expect(h["x-forwarded-for"]).toBe("198.51.100.7");
		expect(h["cf-connecting-ip"]).toBe("198.51.100.7");
		expect(h["user-agent"]).toBe("Tor Browser");
		expect(h["content-type"]).toBe("application/json");
		expect(h.cookie).toBeUndefined();
		expect(h.authorization).toBeUndefined();
		expect(h.origin).toBeUndefined();
	});

	it("a post from another site is refused before checkout (as EmDash refuses a cross-site Origin on the route itself)", async () => {
		const crossSite: Array<Record<string, string>> = [{ origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site", origin: ORIGIN }, { origin: "http://shop.example" }];
		for (const headers of crossSite) {
			const calls: Call[] = [];
			const { res, html } = await post(endpoint, { amount: "3", currency: "USD" }, locals(ok(), calls), headers);
			expect(res.status, JSON.stringify(headers)).toBe(403);
			expect(html).toContain("This tip didn't come from this site's own page.");
			expect(calls).toEqual([]);
		}
		// The site's own page (or no Origin at all, as from curl) goes through.
		const sameSite: Array<Record<string, string>> = [{ origin: ORIGIN, "sec-fetch-site": "same-origin" }, {}];
		for (const headers of sameSite) {
			const calls: Call[] = [];
			const { res } = await post(endpoint, { amount: "3", currency: "USD" }, locals(ok(), calls), headers);
			expect(res.status, JSON.stringify(headers)).toBe(303);
			expect(calls).toHaveLength(1);
		}
	});

	it("a refusal: its message, a link back to the page the tip came from (same site only), the privacy headers", async () => {
		const { res, html } = await post(endpoint, { amount: "any", returnTo: "/posts/hello" }, locals(fail("ENTRY_NOT_FOUND")));
		expect(res.status).toBe(400);
		expect(html).toContain(checkoutErrorMessage("ENTRY_NOT_FOUND"));
		expect(html).toContain('href="/posts/hello"');
		expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
		for (const unsafe of ["//evil.test/x", "https://evil.test/", "/\\evil.test", "javascript:alert(1)", "posts"]) {
			const r = await post(endpoint, { amount: "any", returnTo: unsafe }, locals(fail("ENTRY_NOT_FOUND")));
			expect(r.html, unsafe).toContain('href="/"');
			expect(r.html).not.toContain("evil.test");
		}
	});

	it("no free address, and no fallback address configured: Wyatt's wording", async () => {
		const { res, html } = await post(endpoint, { amount: "any" }, locals(fail("NO_ADDRESS_AVAILABLE")));
		expect(res.status).toBe(503);
		expect(html).toContain("Tips can't be taken right now. Please try again in a few minutes.");
	});
});

describe("tip endpoint: the spec change 18 A fallback address", () => {
	let errors: unknown[][];
	beforeEach(() => {
		errors = [];
		vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void errors.push(a));
	});
	afterEach(() => vi.restoreAllMocks());

	it("no tip invoice possible (no address, the open cap, the plugin unavailable or unsupported): the shop address, its QR, and that the site doesn't confirm it", async () => {
		const endpoint = tipEndpoint({ address: STAGENET_SUB, network: "stagenet" });
		for (const loc of [locals(fail("NO_ADDRESS_AVAILABLE")), locals(fail("TOO_MANY_OPEN")), locals(fail("UNSUPPORTED_PLATFORM")), locals(null, [], { throws: true }), {}]) {
			const { res, html } = await post(endpoint, { amount: "5", currency: "USD" }, loc);
			expect(res.status).toBe(200);
			expect(html).toContain(qrSvg(`monero:${STAGENET_SUB}`));
			expect(html).toContain(`data-field="address">${STAGENET_SUB}</p>`);
			expect(html).toContain("This site doesn't confirm these tips.");
			expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
			expect(res.headers.get("cache-control")).toBe("private, no-store");
		}
		expect(errors).toEqual([]);
	});

	it("other refusals still get their message, not the fallback", async () => {
		const endpoint = tipEndpoint({ address: STAGENET_SUB, network: "stagenet" });
		const { res, html } = await post(endpoint, { amount: "any" }, locals(fail("ENTRY_NOT_FOUND")));
		expect(res.status).toBe(400);
		expect(html).not.toContain(STAGENET_SUB);
	});

	it("an address for another network: logged once at start, and an error for the admin instead of a QR", async () => {
		const endpoint = tipEndpoint({ address: MAINNET, network: "stagenet" });
		expect(errors).toHaveLength(1);
		expect(String(errors[0][0])).toContain("The tip address isn't a valid stagenet Monero address (it's for mainnet)");
		const { res, html } = await post(endpoint, { amount: "any" }, locals(fail("NO_ADDRESS_AVAILABLE")));
		expect(res.status).toBe(503);
		expect(html).toContain("Tips can't be taken right now. Please try again in a few minutes.");
		expect(html).toContain("For the site's admin: The tip address isn't a valid stagenet Monero address (it's for mainnet).");
		expect(html).not.toContain("<svg");
		expect(html).not.toContain(MAINNET);
	});
});
