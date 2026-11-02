// Phase 07b pass 1, round 1 (black box): the theme surfaces (docs/redteam-plan.md, L1/A9/L4/L6/A5). The tip endpoint,
// the way-back validator and the pay-page headers already have tests; these push harder with hostile forms and deeper
// redirect vectors. An attack that lands is committed as it.fails with its RT id.
import { describe, expect, it } from "vitest";

import { safeReturn } from "../src/back";
import { CLIENT_SCRIPT } from "../src/client";
import { payPageHeaders } from "../src/headers";
import { checkoutErrorMessage } from "../src/messages";
import { tipEndpoint } from "../src/tip";

type B = Record<string, any>;
const ORIGIN = "https://shop.example";

interface Call { body: B; headers: Record<string, string> }
function locals(reply: unknown, calls: Call[] = []) {
	return {
		emdash: {
			handlePublicPluginApiRoute: async (_p: string, _m: string, _path: string, request: Request) => {
				calls.push({ body: JSON.parse(await request.text()), headers: Object.fromEntries(request.headers) });
				return reply;
			},
		},
	};
}
const ok = { success: true, data: { token: "AbCdEfGhIjKlMnOpQrStUv", address: "x", amountAtomic: null, amountXmr: null, uri: "monero:x", expiresAt: "", status: "new" } };
async function post(handler: ReturnType<typeof tipEndpoint>, fields: Record<string, string>, loc: unknown, headers: Record<string, string> = {}) {
	const form = new FormData();
	for (const [k, v] of Object.entries(fields)) form.set(k, v);
	const request = new Request(`${ORIGIN}/pay/coffer/tip`, { method: "POST", body: form, headers });
	const res = (await handler({ request, url: new URL(request.url), locals: loc } as never)) as Response;
	return { res, html: res.status === 303 ? "" : await res.text(), location: res.headers.get("location") };
}
const back = (v: string) => safeReturn(v, ORIGIN);

describe("A9/L4: the way back, deep vectors", () => {
	it("[T22] A9: no vector escapes the origin, reaches the admin or pay pages, or is over-long or control-laden", async () => {
		const dangerous = [
			// off-site
			"//evil.test/x", "/\\evil.test", "\\\\evil.test", "https://evil.test/", "http:/evil", "https:/evil", "/\t//evil", "/ /evil", "javascript:alert(1)", "data:text/html,x",
			"\u0001//evil", "/%0d%0aLocation:evil", "/%09/evil",
			// dot-segment and encoded ways into _emdash and pay/coffer
			"/x/../_emdash/admin", "/x/..%2f_emdash", "/..%2f..%2f_emdash/admin", "/good/../../../_emdash", "/_emdash%2Fadmin", "/pay%2Fcoffer", "/pay/coffer%2Fx", "/%5f%65mdash/admin", "/%70ay/coffer/x",
			// length and control
			`/${"a".repeat(600)}`, "/x\u0000y", "/x\u007fy", "/x\u001fy",
		];
		const got = dangerous.map((v) => [v, back(v)] as const);
		const escaped = got.filter(([, r]) => r !== null && (/^\/\//.test(r) || /^[a-z]+:/i.test(r) || /\\/.test(r) || /[\u0000-\u001f\u007f]/.test(r) || /_emdash/i.test(r) || /\/pay\/coffer/i.test(r) || r.length > 512));
		expect(escaped).toEqual([]);
	});

	it("[T22] A9: an encoded slash stays one path segment on this origin (no open redirect), as spec change 39 intends", () => {
		for (const v of ["/%2F%2Fevil.com", "/%2f%2fevil", "/⁄evil", "/／evil", "/⧸evil"]) {
			const r = back(v);
			expect(r, v).not.toBeNull();
			// Resolved against the origin, it's still a path on shop.example, never evil.com.
			expect(new URL(r as string, ORIGIN).origin).toBe(ORIGIN);
			expect(new URL(r as string, ORIGIN).hostname).toBe("shop.example");
		}
	});

	it.fails("[T22] [RT-10] A9: the refused prefixes are matched case-insensitively, so no casing reaches the admin or loops the pay page", () => {
		const slipped = ["/PAY/coffer/tok", "/Pay/Coffer/x", "/_EMDASH/admin", "/_Emdash/admin", "/PAY%2Fcoffer"].filter((v) => {
			const r = back(v);
			return r !== null && (/\/pay\/coffer/i.test(r) || /_emdash/i.test(r));
		});
		expect(slipped).toEqual([]);
	});
});

describe("L1: forged tip forms", () => {
	const endpoint = tipEndpoint();

	it("[F07][T06] L1: a forged form can't send an amount that isn't a whole minor or atomic value", async () => {
		const malformed: Array<Record<string, string>> = [
			{ amount: "custom", custom: "1e3", unit: "fiat", currency: "USD" }, { amount: "custom", custom: "0x10", unit: "fiat", currency: "USD" }, { amount: "custom", custom: "-1", unit: "xmr" },
			{ amount: "custom", custom: "+5", unit: "fiat", currency: "USD" }, { amount: "custom", custom: "1.234", unit: "fiat", currency: "USD" }, { amount: "custom", custom: "Infinity", unit: "xmr" }, { amount: "custom", custom: "NaN", unit: "xmr" },
			{ amount: "custom", custom: "0.0000000000001", unit: "xmr" }, { amount: "custom", custom: "9".repeat(40), unit: "xmr" }, { amount: "custom", custom: "", unit: "xmr" }, { amount: "custom", custom: "5", unit: "btc" },
			{ amount: "5", currency: "GBP" }, { amount: "5", currency: "usd" }, { amount: "five" }, { amount: "0", currency: "USD" }, { amount: "custom", custom: "5", unit: "fiat", currency: "XMR" },
		];
		for (const fields of malformed) {
			const calls: Call[] = [];
			const { res, html } = await post(endpoint, fields, locals(ok, calls), { origin: ORIGIN });
			expect(res.status, JSON.stringify(fields)).toBe(400);
			expect(html).toContain(checkoutErrorMessage("INVALID_REQUEST"));
			expect(calls, JSON.stringify(fields)).toEqual([]);
		}
	});

	it("[F07] L1: repeated and unknown form fields don't smuggle a second amount, note or entry past the form reader", async () => {
		const build = (pairs: Array<[string, string]>) => {
			const form = new FormData();
			for (const [k, v] of pairs) form.append(k, v);
			return new Request(`${ORIGIN}/pay/coffer/tip`, { method: "POST", body: form, headers: { origin: ORIGIN } });
		};
		const calls: Call[] = [];
		const request = build([["amount", "5"], ["currency", "USD"], ["amount", "custom"], ["custom", "999"], ["unit", "xmr"], ["note", "a"], ["note", "b"], ["kind", "order"], ["productRef", "x"], ["orderRef", "o"], ["amountAtomic", "1"]]);
		const res = (await endpoint({ request, url: new URL(request.url), locals: locals(ok, calls) } as never)) as Response;
		expect(res.status).toBe(303);
		expect(calls).toHaveLength(1);
		// Whatever the duplicates resolve to, the body stays a tip with no smuggled order or raw-amount fields.
		expect(calls[0].body.kind).toBe("tip");
		for (const k of ["productRef", "orderRef", "amountAtomic"]) expect(calls[0].body[k], k).toBeUndefined();
	});

	it("[T08] L1: a hostile note reaches checkout as a plain form field, never interpreted by the endpoint", async () => {
		const calls: Call[] = [];
		const note = "<script>alert(1)</script>‮\u0000${7*7}";
		await post(endpoint, { amount: "any", note }, locals(ok, calls), { origin: ORIGIN });
		expect(calls[0].body.note).toBe(note); // the plugin (not the theme) schema-checks and strips it; see A3
	});

	it("[T17] L1: every Sec-Fetch-Site a cross-site post can carry is refused before checkout", async () => {
		const crossSite: Array<Record<string, string>> = [{ origin: "https://evil.test" }, { origin: "null" }, { "sec-fetch-site": "cross-site", origin: ORIGIN }, { "sec-fetch-site": "same-site", origin: "https://other.example" }];
		for (const headers of crossSite) {
			const calls: Call[] = [];
			const { res } = await post(endpoint, { amount: "3", currency: "USD" }, locals(ok, calls), headers);
			expect(res.status, JSON.stringify(headers)).toBe(403);
			expect(calls).toEqual([]);
		}
	});
});

describe("L6/A5: coexistence and pay-page headers", () => {
	it("[T23] L6: the tip endpoint's own error and fallback pages carry Coffer's locked-down CSP and no-store", async () => {
		const { res, html } = await post(tipEndpoint(), { amount: "any" }, locals({ success: true, data: { error: { code: "ENTRY_NOT_FOUND" } } }), { origin: ORIGIN });
		expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
		expect(res.headers.get("cache-control")).toBe("private, no-store");
		// The only script is Coffer's own client script, allowed by the CSP's hash; no other script and no inline style
		// but Coffer's own, so the page runs nothing of its own outside its locked-down policy.
		const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts).toEqual([CLIENT_SCRIPT]);
		expect(res.headers.get("content-security-policy")).toContain(`script-src 'sha256-`);
	});

	it("[T09] A5: the pay-page headers fail closed: no third-party origin, never cacheable, never framed or indexed", async () => {
		const h = await payPageHeaders();
		expect(h["Content-Security-Policy"]).toContain("default-src 'none'");
		expect(h["Content-Security-Policy"]).toContain("connect-src 'self'");
		expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
		expect(h["Content-Security-Policy"]).not.toMatch(/https?:\/\//); // no external origin allow-listed
		expect(h["Cache-Control"]).toBe("private, no-store");
		expect(h["Referrer-Policy"]).toBe("no-referrer");
		expect(h["X-Robots-Tag"]).toMatch(/noindex/);
	});
});

describe("Round 2 (07b pass 1): the tip endpoint behind an https proxy", () => {
	// Found live on 2026-10-30 (RT-20): behind a proxy that ends https (here a Cloudflare tunnel) the site serves plain
	// http, so the endpoint's url is http:// while the visitor's browser sends its https:// Origin. EmDash's own CSRF
	// check also accepts the configured public origin (siteUrl, getPublicOrigin); the endpoint now does the same
	// (Wyatt's fix). Every other refusal stays.
	const proxied = (origin: string | null, siteUrl?: string) => {
		const calls: Call[] = [];
		const form = new FormData();
		form.set("amount", "any");
		const headers: Record<string, string> = { "sec-fetch-site": "same-origin", "x-forwarded-proto": "https" };
		if (origin !== null) headers.origin = origin;
		const request = new Request("http://shop.example/pay/coffer/tip", { method: "POST", body: form, headers });
		const loc = locals(ok, calls) as { emdash: Record<string, unknown> };
		if (siteUrl) loc.emdash.config = { siteUrl };
		return { calls, run: async () => (await tipEndpoint()({ request, url: new URL(request.url), locals: loc } as never)) as Response };
	};
	it("[T17] [RT-20] a post from the site's own https page reaches checkout when the site itself sees plain http (siteUrl configured)", async () => {
		const { calls, run } = proxied("https://shop.example", "https://shop.example");
		expect((await run()).status).toBe(303);
		expect(calls).toHaveLength(1);
	});
	it("[T17] [RT-20] with no siteUrl configured the same post is still refused", async () => {
		const { calls, run } = proxied("https://shop.example");
		expect((await run()).status).toBe(403);
		expect(calls).toHaveLength(0);
	});
	it("[T17] [RT-20] siteUrl doesn't widen anything else: another https host, and Origin null, are refused", async () => {
		for (const origin of ["https://evil.example", "null"]) {
			const { calls, run } = proxied(origin, "https://shop.example");
			expect((await run()).status, origin).toBe(403);
			expect(calls, origin).toHaveLength(0);
		}
	});
});
