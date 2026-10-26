// Phase 07b pass 1, round 1 (black box): the anonymous visitor's attacks on checkout and status, from the spec and the
// matrix only (docs/redteam-plan.md, group A and L3). Each test names its plan attack (A0, A1, ...) after its matrix IDs.
// An attack that lands is committed as it.fails with its RT ID (docs/redteam-findings.md), so CI stays green and honest.
import { afterEach, describe, expect, it } from "vitest";

import { type RedteamHost, type Reply, redteamHost, ROUTE_URL } from "./harness";
import { longString } from "./random";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const FLOOR = "100000000"; // 0.0001 XMR, the tip dust floor (spec, Invoice lifecycle: Tips)
const SITE_CAP = 40; // open invoices per 30-minute window (spec change 33)
const KRAKEN = (pair: string) => `https://api.kraken.com/0/public/Ticker?pair=XMR${pair}`;
const GECKO = (c: string) => `https://api.coingecko.com/api/v3/simple/price?ids=monero&vs_currencies=${c}`;
const krakenPrice = (value: unknown) => new Response(JSON.stringify({ error: [], result: { XXMRZUSD: { c: [value, "1.0"] } } }));

const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const code = (r: Reply) => data(r)?.error?.code as string | undefined;
/** No lone surrogates (String.prototype.isWellFormed, which the plugin's TypeScript lib predates). */
function wellFormed(s: string): boolean {
	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c >= 0xdc00 && c <= 0xdfff) return false;
		if (c >= 0xd800 && c <= 0xdbff) {
			const d = s.charCodeAt(i + 1);
			if (!(d >= 0xdc00 && d <= 0xdfff)) return false;
			i++;
		}
	}
	return true;
}
const tip = (body: B = {}) => (h as RedteamHost).checkout({ kind: "tip", ...body });

async function withPosts(o: Parameters<typeof redteamHost>[0] = {}) {
	h = await redteamHost(o);
	await h.host.fixtures.collection({ slug: "posts", label: "Posts", fields: [{ slug: "title", label: "Title", type: "string" }] } as never);
	await h.host.fixtures.collection({ slug: "pages", label: "Pages", fields: [{ slug: "title", label: "Title", type: "string" }] } as never);
	await h.host.fixtures.content("posts", { slug: "hello", status: "published", data: { title: "Hello" } } as never);
	return h;
}
const entryId = async (collection: string, slug: string) => ((await (h as RedteamHost).host.inspect.content.list(collection)) as B[]).find((e) => e.slug === slug)?.id as string;

/** A product invoice in review, as a database from a goods build (the dev site's, for one) would hold. */
const productInvoice = (now = Date.now()) => ({
	id: "inv_prod", token: "p".repeat(22), kind: "product", productRef: { collection: "products", id: "01P" }, fiat: { amountMinor: "500", currency: "USD" },
	rate: { minor: "15000", source: "api.kraken.com" }, expectedAtomic: "33333333334", required: 2, subaddress: "x", addrIndex: 9, status: "review", reviewReason: "underpaid",
	createdAt: now - 3_600_000, expiresAt: now - 1_800_000, createdHeight: 3_000_000, expiresHeight: 3_000_018, seq: 0, transfers: [],
});

describe("A0: no order or product path in a release-1 build", () => {
	it("[T21][T06][F02] A0: order and product kinds, and every spelling of them, answer exactly like an unknown kind and claim nothing", async () => {
		h = await redteamHost({ pool: 3 });
		const unknown = await h.checkout({ kind: "bogus" });
		expect(code(unknown)).toBe("INVALID_REQUEST");
		const kinds: unknown[] = ["order", "product", "Order", "ORDER", "Product", " order", "order ", "order\n", "prod\u00aduct", "order\u200b", "tip\u200b", "Tip", "TIP", " tip", ["tip"], { kind: "tip" }, null, 1, true];
		for (const kind of kinds) {
			const r = await h.checkout({ kind, orderRef: "ord_1", amountMinor: 100, currency: "USD", product: "hello", returnUrl: "https://evil.example/" });
			expect({ kind, status: r.status, text: r.text }).toEqual({ kind, status: unknown.status, text: unknown.text });
		}
		// The contract's order body, exactly as a store would send it.
		const order = await h.checkout({ kind: "order", orderRef: "ord_123", amountMinor: 4999, currency: "USD", description: "Order 123", returnUrl: "https://example.com/orders/123" });
		expect(order.text).toBe(unknown.text);
		expect(await h.invoices()).toEqual([]);
		expect((await h.pool()).every((p) => p.status === "free")).toBe(true);
	});

	it("[T21][T06] A0: a tip smuggling product, productRef, orderRef or returnUrl is a plain tip; none of them is stored", async () => {
		await withPosts({ pool: 3 });
		const id = await entryId("posts", "hello");
		const r = await tip({ product: "hello", productRef: { collection: "posts", id }, orderRef: "ord_1", amountMinor: 4999, currency: "USD", returnUrl: "https://evil.example/" });
		expect(data(r)?.token).toBeTruthy();
		const [inv] = await (h as RedteamHost).invoices();
		expect(inv).toMatchObject({ kind: "tip", expectedAtomic: null, fiat: null, rate: null });
		for (const k of ["productRef", "orderRef", "returnUrl", "amountMinor"]) expect(inv[k], k).toBeUndefined();
		expect(JSON.stringify(inv)).not.toContain("evil.example");
		expect(JSON.stringify(inv)).not.toContain("ord_1");
	});

	it("[T21] A0: the admin page shows no product-only part, even with a product invoice in storage", async () => {
		h = await redteamHost({ pool: 1 });
		await h.host.fixtures.plugin.kv("state:setupDone", true);
		await h.price("USD", "150.00");
		await h.host.fixtures.plugin.storage("invoices", "inv_prod", productInvoice());
		const page = JSON.stringify((await h.host.admin.loadPage("/payments")).blocks);
		expect(page).not.toContain("All invoices");
		expect(page).not.toMatch(/find it under/i);
		expect(page).not.toContain("raise:inv_prod");
	});

	it.fails("[T21] [RT-01] A0: a product invoice already in storage gets no product link or order wording in release 1", async () => {
		h = await redteamHost({ pool: 1 });
		await h.host.fixtures.plugin.kv("state:setupDone", true);
		await h.price("USD", "150.00");
		await h.host.fixtures.plugin.storage("invoices", "inv_prod", productInvoice());
		const page = JSON.stringify((await h.host.admin.loadPage("/payments")).blocks);
		expect(page).not.toContain("Open product");
		expect(page).not.toMatch(/fulfil the order/);
	});
});

describe("A1: client-sent amounts, rates and state", () => {
	it("[T06][T07][F02] A1: nothing the client sends beyond kind, amount, contentRef and note reaches the invoice", async () => {
		h = await redteamHost({ pool: 3 });
		const plain = data(await tip())!;
		const [base] = await h.invoices();
		const r = await tip({
			amountAtomic: "1", expectedAtomic: "1", minAtomic: "1", required: 0, confirmations: 99, rate: { minor: "1", source: "api.kraken.com" }, currency: "EUR",
			fiat: { amountMinor: "1", currency: "USD" }, status: "settled", settledAt: 1, transfers: [{ txid: "a".repeat(64), amountAtomic: "999" }], network: "mainnet", asset: "btc",
			chain: "bitcoin", subaddress: "4evil", addrIndex: 0, token: "chosenchosenchosen0000", id: "inv_chosen", via: "admin", buyer: { email: "a@x.invalid", note: "n" },
			email: "a@x.invalid", refundAddress: "4evil", createdHeight: 1, expiresHeight: 1, expiresAt: 0, createdAt: 0, seq: 9e15, uriDescription: "Pay me", decimals: 0,
		});
		const d = data(r)!;
		expect(d.token).not.toBe("chosenchosenchosen0000");
		expect(d.address).not.toBe("4evil");
		expect(d.status).toBe("new");
		const inv = (await h.invoices()).find((i) => i.token === d.token)!;
		const same = ["kind", "expectedAtomic", "minAtomic", "required", "fiat", "rate", "status", "transfers", "network", "asset", "chain", "via", "createdHeight", "expiresHeight", "uriDescription", "seq"];
		for (const k of same) expect(inv[k], k).toEqual(base[k]);
		expect(inv.id).not.toBe("inv_chosen");
		expect(inv.buyer).toBeUndefined();
		expect(inv.expiresAt - inv.createdAt).toBe(base.expiresAt - base.createdAt);
		expect(plain.uri).toMatch(/tx_description=Tip$/);
		expect(d.uri).toMatch(/tx_description=Tip$/);
	});

	it("[T06][F02] A1: an XMR amount with a fiat amount, or a currency beside an XMR amount, never mixes the two", async () => {
		h = await redteamHost({ pool: 3 });
		expect(code(await tip({ amount: { xmrAtomic: "200000000", fiatMinor: "500", currency: "USD" } }))).toBe("INVALID_REQUEST");
		const r = await tip({ amount: { xmrAtomic: "200000000", currency: "EUR", rate: "1" } });
		if (!code(r)) expect((await h.invoices())[0]).toMatchObject({ expectedAtomic: "200000000", fiat: null, rate: null });
		expect(h.host.http.requests()).toEqual([]);
	});
});

describe("A2: a poisoned price feed", () => {
	// Kraken answers first; CoinGecko is the fallback (spec change 8). A fiat tip with no usable price becomes an open
	// tip (spec change 33, item 5); one with a price is converted with integer math and never asks below the floor.
	const krakenBad: Array<[string, Response]> = [
		["zero", krakenPrice("0")], ["negative", krakenPrice("-150.00")], ["NaN", krakenPrice("NaN")], ["Infinity", krakenPrice("Infinity")],
		["1e308", krakenPrice("1e308")], ["exponent", krakenPrice("1.5e2")], ["hex", krakenPrice("0x96")], ["empty string", krakenPrice("")],
		["two dots", krakenPrice("150.00.00")], ["30 digits", krakenPrice("123456789012345678901234567890")], ["tiny", krakenPrice("0.0000001")],
		["padded", krakenPrice(" 150.00")], ["a number, not a string", krakenPrice(150)], ["null", krakenPrice(null)],
		["html", new Response("<html><body>Bad gateway</body></html>", { status: 200, headers: { "content-type": "text/html" } })],
		["empty body", new Response("")], ["500", new Response("oops", { status: 500 })], ["error list", new Response(JSON.stringify({ error: ["EGeneral:Internal error"], result: {} }))],
		["no result", new Response(JSON.stringify({ error: [] }))],
	];

	it("[T06][F02] A2: every malformed or extreme Kraken price, with CoinGecko down too, makes an open tip, never a strange amount", async () => {
		const seen: B[] = [];
		for (const [name, res] of krakenBad) {
			h = await redteamHost({ pool: 1 });
			await h.host.http.respond(KRAKEN("USD"), res);
			await h.host.http.respond(GECKO("usd"), new Response("down", { status: 502 }));
			const r = await tip({ amount: { fiatMinor: "500", currency: "USD" } });
			const inv = (await h.invoices())[0];
			seen.push({ name, code: code(r) ?? null, expectedAtomic: inv?.expectedAtomic ?? null, rate: inv?.rate ?? null });
			await h.host.dispose();
			h = undefined;
		}
		// The two well-formed spellings may convert; everything else must become an open tip.
		const converts = new Set(["padded", "a number, not a string", "exponent"]);
		const wrong = seen.filter((s) => s.code !== null || (s.expectedAtomic !== null && !(converts.has(s.name) && s.expectedAtomic === "33333333334")));
		expect(wrong).toEqual([]);
	});

	it.fails("[T06] [RT-02] A2: a Kraken reply for another pair than the one asked for is not taken as the price", async () => {
		h = await redteamHost({ pool: 1 });
		await h.host.http.respond(KRAKEN("USD"), new Response(JSON.stringify({ error: [], result: { XXMRZEUR: { c: ["150.00", "1"] } } })));
		await h.host.http.respond(GECKO("usd"), new Response("down", { status: 502 }));
		await tip({ amount: { fiatMinor: "500", currency: "USD" } });
		expect((await h.invoices())[0]).toMatchObject({ expectedAtomic: null, rate: null });
	});

	it("[T06] A2: a bad Kraken price falls back to CoinGecko; a bad CoinGecko price too makes an open tip", async () => {
		const gecko: Array<[string, string, string | null]> = [
			["good", '{"monero":{"usd":150.0}}', "33333333334"], ["zero", '{"monero":{"usd":0}}', null], ["negative", '{"monero":{"usd":-1}}', null],
			["1e308", '{"monero":{"usd":1e308}}', null], ["string", '{"monero":{"usd":"150"}}', null], ["missing", '{"monero":{}}', null], ["tiny", '{"monero":{"usd":1e-9}}', null],
			["huge", '{"monero":{"usd":123456789012345678901234567890}}', null],
		];
		const seen: B[] = [];
		for (const [name, body, want] of gecko) {
			h = await redteamHost({ pool: 1 });
			await h.host.http.respond(KRAKEN("USD"), krakenPrice("0"));
			await h.host.http.respond(GECKO("usd"), new Response(body));
			const r = await tip({ amount: { fiatMinor: "500", currency: "USD" } });
			const inv = (await h.invoices())[0];
			seen.push({ name, want, got: inv?.expectedAtomic ?? null, code: code(r) ?? null, source: inv?.rate?.source ?? null });
			await h.host.dispose();
			h = undefined;
		}
		expect(seen.filter((s) => s.got !== s.want || s.code !== null)).toEqual([]);
		expect(seen[0].source).toBe("api.coingecko.com");
	});
});

describe("A3: hostile tip notes and bodies", () => {
	// Control, format and line or paragraph separators: what "control and format characters out" promises. Private-use
	// characters and noncharacters are kept (seen in round 1, not promised either way; they render as boxes at worst).
	const stripped = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

	it.fails("[T08][F02] [RT-03] A3: a note with a lone surrogate (text that isn't valid Unicode) is refused or cleaned", async () => {
		h = await redteamHost({ pool: 3 });
		for (const note of ["lone" + String.fromCharCode(0xd800) + "surrogate", "lone" + String.fromCharCode(0xdfff) + "high"]) {
			const r = await tip({ note });
			const stored = (await h.invoices()).find((i) => i.token === data(r)?.token)?.buyer?.note as string | undefined;
			if (stored !== undefined) expect(wellFormed(stored), JSON.stringify(stored)).toBe(true);
		}
	});

	it("[T08][F02] A3: format, bidi, zero-width, tag and separator characters never reach the stored note", async () => {
		h = await redteamHost({ pool: 30 });
		const hostile = [
			"a\u202eevil\u202c", "a\u2066b\u2067c\u2068d\u2069", "a\u200eb\u200fc\u061cd", "a\u200bb\u200cc\u200dd\u2060e\ufeff", "tag\u{e0041}\u{e0042}\u{e007f}",
			"soft\u00adhyphen", "line\u2028para\u2029end", "nel\u0085vt\u000bff\u000c", "private\ue000use", "nonchar\ufffe\uffff",
			"interlinear\ufff9a\ufffab\ufffb", "mongolian\u180evowel", "hangul\u3164filler", "braille\u2800blank", "combining" + "\u0301".repeat(120),
		];
		const seen: B[] = [];
		for (const note of hostile) {
			const r = await tip({ note });
			const stored = (await h.invoices()).find((i) => i.token === data(r)?.token);
			seen.push({ note: JSON.stringify(note), code: code(r) ?? null, stored: stored?.buyer?.note ?? null });
		}
		expect(seen.filter((s) => s.code !== null && s.code !== "INVALID_REQUEST")).toEqual([]);
		expect(seen.filter((s) => s.stored !== null && stripped.test(s.stored)).map((s) => s.note)).toEqual([]);
	});

	it("[T08] A3: markup, script, SVG and URL payloads are stored as the literal text, at most 140 characters", async () => {
		h = await redteamHost({ pool: 10 });
		const payloads = ["<script>alert(1)</script>", '<img src=x onerror="alert(1)">', "<svg onload=alert(1)>", "javascript:alert(1)", "[click](javascript:alert(1))", "{{constructor.constructor('alert(1)')()}}", "'; DROP TABLE invoices; --", '{"$gt": ""}', "${7*7}"];
		for (const note of payloads) {
			const r = await tip({ note });
			expect((await h.invoices()).find((i) => i.token === data(r)?.token)?.buyer?.note, note).toBe(note);
		}
		// Over 140 characters the plugin refuses; past the route's 4 KiB body limit EmDash refuses first (413).
		for (const n of [141, 1_000, 100_000]) {
			const r = await tip({ note: longString(n) });
			expect(code(r) === "INVALID_REQUEST" || r.status === 413, String(n)).toBe(true);
		}
	});

	it("[F02] A3: wrong types for note, amount and contentRef are refused; nothing is claimed", async () => {
		h = await redteamHost({ pool: 3 });
		const bad: B[] = [
			{ note: ["a"] }, { note: { toString: "x" } }, { note: true }, { note: 1 }, { amount: [] }, { amount: { fiatMinor: ["500"], currency: "USD" } }, { amount: { xmrAtomic: { n: 1 } } },
			{ amount: 5 }, { amount: true }, { contentRef: "posts/x" }, { contentRef: ["posts", "x"] }, { contentRef: { collection: ["posts"], id: "x" } }, { contentRef: { collection: "posts", id: 5 } },
		];
		for (const b of bad) expect(code(await tip(b)), JSON.stringify(b)).toBe("INVALID_REQUEST");
		expect(await h.invoices()).toEqual([]);
	});

	it("[F02][T06] A3: __proto__ keys in the body, amount or contentRef carry nothing through", async () => {
		h = await redteamHost({ pool: 5 });
		const raws = [
			'{"kind":"tip","__proto__":{"note":"proto","amount":{"xmrAtomic":"100000000"}}}',
			'{"kind":"tip","amount":{"__proto__":{"xmrAtomic":"100000000"}}}',
			'{"kind":"tip","amount":{"__proto__":{"fiatMinor":"500","currency":"USD"}}}',
			'{"kind":"tip","constructor":{"prototype":{"note":"proto"}}}',
		];
		for (const raw of raws) {
			const r = await h.checkout(raw);
			if (code(r)) continue;
			const inv = (await h.invoices()).find((i) => i.token === data(r)?.token)!;
			expect({ raw, expectedAtomic: inv.expectedAtomic, note: inv.buyer?.note ?? null }).toEqual({ raw, expectedAtomic: null, note: null });
		}
		const probe = await tip();
		expect(data(probe)?.token).toBeTruthy();
		expect(({} as B).note).toBeUndefined();
	});

	it("[F02] A3: bodies that aren't a JSON object, and a body of a megabyte, are refused without a crash", async () => {
		h = await redteamHost({ pool: 3 });
		for (const raw of ["", " ", "{", "null", "[]", '"tip"', "1", "true", '{"kind":"tip"', `{"kind":"tip","note":"${"a".repeat(1_000_000)}"}`, `[${"[".repeat(5000)}${"]".repeat(5000)}]`]) {
			const r = await h.checkout(raw);
			expect(r.status, raw.slice(0, 30)).toBeLessThan(500);
			expect(data(r)?.token, raw.slice(0, 30)).toBeUndefined();
		}
		expect(await h.invoices()).toEqual([]);
		expect(data(await tip())?.token).toBeTruthy(); // still answering
	});
});

describe("A4: status tokens", () => {
	it("[F03] A4: empty, malformed, huge, encoded and near-miss tokens all get the one generic not-found reply", async () => {
		h = await redteamHost({ pool: 2 });
		const token = data(await tip())!.token as string;
		const unknown = await h.status("AAAAAAAAAAAAAAAAAAAAAA");
		expect(code(unknown)).toBe("INVOICE_NOT_FOUND");
		const tries = [
			"", "x", "a".repeat(10_240), "%00", "%01", "%E2%80%AE", "%FF", "%ZZ", `${token}=`, `${token}%20`, `%20${token}`, `${token}%00`, token.toUpperCase(), token.toLowerCase(),
			token.slice(0, 21), `${token}A`, `${token}&token=AAAA`, encodeURIComponent(token).replace(/_/g, "%5F"), `${token.replace(/-/g, "+").replace(/_/g, "/")}`, `${token}==`,
			"../../admin", "inv_1", "__proto__", "constructor", "toString", "hasOwnProperty",
		];
		for (const t of tries) {
			if (t === token.toUpperCase() && t === token) continue;
			const r = await h.status(t);
			// An encoding the platform maps back to the exact token may find it; nothing else may answer anything but not-found.
			if (data(r)?.status) {
				expect(decodeURIComponent(t.split("&")[0]), t).toBe(token);
				continue;
			}
			expect({ t: t.slice(0, 40), status: r.status, text: r.text }).toEqual({ t: t.slice(0, 40), status: unknown.status, text: unknown.text });
		}
		// No token parameter at all.
		const none = await h.host.actions.routes.request("status", { method: "GET", url: ROUTE_URL("status") });
		expect(await none.text()).toBe(unknown.text);
		const twice = await h.host.actions.routes.request("status", { method: "GET", url: ROUTE_URL("status", `?token[]=${token}`) });
		expect(await twice.text()).toBe(unknown.text);
	});

	it("[F03][T09][P03] A4: a found invoice's status carries no internal ID, pool index, note or heights, and isn't cacheable", async () => {
		h = await redteamHost({ pool: 2 });
		const token = data(await tip({ note: "secret note" }))!.token as string;
		const res = await h.host.actions.routes.request("status", { method: "GET", url: ROUTE_URL("status", `?token=${token}`) });
		const body = await res.text();
		const [inv] = await h.invoices();
		for (const leak of [inv.id, "secret note", `"addrIndex"`, `"createdHeight"`, `"expiresHeight"`, `"seq"`, `"buyer"`, `"via"`, `"token"`]) expect(body, leak).not.toContain(leak);
		expect(res.headers.get("cache-control") ?? "").toMatch(/no-store/);
	});
});

describe("A7, A8: the open-invoice cap, an emptied pool and racing claims", () => {
	const shiftPast = async (r: RedteamHost) => {
		// Time passes for the cap: the plugin counts an invoice as open until its expiresAt, so moving every stored
		// invoice's window into the past plays the 30 minutes going by.
		for (const inv of await r.invoices()) await r.host.fixtures.plugin.storage("invoices", inv.id, { ...inv, createdAt: inv.createdAt - 3_600_000, expiresAt: inv.expiresAt - 3_600_000 });
	};
	const unique = (invs: B[]) => {
		expect(new Set(invs.map((i) => i.subaddress)).size).toBe(invs.length);
		expect(new Set(invs.map((i) => i.addrIndex)).size).toBe(invs.length);
	};

	it("[T05][P02] A7: the cap refuses with no claim; once the windows close the pool drains to NO_ADDRESS_AVAILABLE and no address is reused", async () => {
		h = await redteamHost({ pool: 55, lastSyncAgo: 20 * 60_000 }); // the bridge is silent: no refill
		for (let i = 0; i < SITE_CAP; i++) expect(data(await tip())?.token, `tip ${i}`).toBeTruthy();
		for (let i = 0; i < 5; i++) expect(code(await tip())).toBe("TOO_MANY_OPEN");
		expect((await h.pool()).filter((p) => p.status === "claimed")).toHaveLength(SITE_CAP);
		await shiftPast(h);
		const codes: string[] = [];
		for (let i = 0; i < 20; i++) codes.push(code(await tip()) ?? "ok");
		expect(codes).toEqual([...Array(15).fill("ok"), ...Array(5).fill("NO_ADDRESS_AVAILABLE")]);
		const invs = await h.invoices();
		expect(invs).toHaveLength(55);
		unique(invs);
		const pool = await h.pool();
		expect(pool.every((p) => p.status === "claimed")).toBe(true);
		for (const p of pool) expect(invs.find((i) => i.id === p.invoiceId)?.subaddress, String(p.addrIndex)).toBe(p.address);
	});

	it("[T05][P02] A8: 50 concurrent checkouts for the last free address: exactly one wins", async () => {
		h = await redteamHost({ pool: 1 });
		const replies = await Promise.all(Array.from({ length: 50 }, () => tip()));
		const codes = replies.map((r) => code(r) ?? "ok");
		expect(codes.filter((c) => c === "ok")).toHaveLength(1);
		expect(new Set(codes.filter((c) => c !== "ok"))).toEqual(new Set(["NO_ADDRESS_AVAILABLE"]));
		expect(await h.invoices()).toHaveLength(1);
	});

	it("[T05][P02] A8: 50 concurrent checkouts for 30 free addresses: distinct addresses, no claim without an invoice, no reuse", async () => {
		h = await redteamHost({ pool: 30 });
		const replies = await Promise.all(Array.from({ length: 50 }, () => tip()));
		const invs = await h.invoices();
		expect(replies.filter((r) => data(r)?.token)).toHaveLength(invs.length);
		unique(invs);
		const claimed = (await h.pool()).filter((p) => p.status === "claimed");
		expect(claimed).toHaveLength(invs.length);
		for (const p of claimed) expect(invs.some((i) => i.id === p.invoiceId), String(p.addrIndex)).toBe(true);
		for (const r of replies) if (!data(r)?.token) expect(code(r)).toBe("NO_ADDRESS_AVAILABLE");
	});

	it.fails("[T05] [RT-04] A8: 30 concurrent tips with 30 free addresses all get one; none is told there's no address", async () => {
		h = await redteamHost({ pool: 30 });
		const replies = await Promise.all(Array.from({ length: 30 }, () => tip()));
		expect(replies.map((r) => code(r) ?? "ok").filter((c) => c !== "ok")).toEqual([]);
	});

	it("[T05] A8: 50 concurrent checkouts with 60 free addresses never get past the site-wide cap", async () => {
		h = await redteamHost({ pool: 60 });
		const replies = await Promise.all(Array.from({ length: 50 }, () => tip()));
		const ok = replies.filter((r) => data(r)?.token).length;
		expect(ok).toBeLessThanOrEqual(SITE_CAP);
		expect(await h.invoices()).toHaveLength(ok);
		unique(await h.invoices());
	});
});

describe("A10: tip amount bounds", () => {
	it("[F02] A10: the floor and the top are accepted as given; every other spelling of a number is refused", async () => {
		h = await redteamHost({ pool: 40 });
		for (const ok of [FLOOR, "1000000000000000"]) {
			const r = await tip({ amount: { xmrAtomic: ok } });
			expect(data(r)?.amountAtomic, ok).toBe(ok);
		}
		const bad: unknown[] = [
			"99999999", "1000000000000001", "18446744073709551615", "18446744073709551616", "0x5F5E100", "1e8", " 100000000", "100000000 ", "+100000000", "-100000000",
			"0100000000", "\uff11\uff10\uff10\uff10\uff10\uff10\uff10\uff10\uff10", "100000000\n", "", "1_000_000_000", 100000000, 1e8, "100000000.0", "100000000n", "\u0660\u0661\u0660\u0660\u0660\u0660\u0660\u0660\u0660\u0660", null,
		];
		const accepted = [];
		for (const v of bad) {
			const r = await tip({ amount: { xmrAtomic: v } });
			if (!code(r)) accepted.push({ v, amountAtomic: data(r)?.amountAtomic });
		}
		expect(accepted).toEqual([]);
	});

	it("[F02] A10: fiat amounts: odd spellings and currencies are refused; the largest allowed converts with integer math", async () => {
		h = await redteamHost({ pool: 30 });
		await h.price("USD", "150.00");
		const r = await tip({ amount: { fiatMinor: "1000000", currency: "USD" } }); // 10,000.00 USD at 150: 66.666666666667 XMR
		expect(data(r)?.amountAtomic).toBe("66666666666667");
		const bad: B[] = [
			{ fiatMinor: "0500", currency: "USD" }, { fiatMinor: "5e2", currency: "USD" }, { fiatMinor: "500.0", currency: "USD" }, { fiatMinor: " 500", currency: "USD" },
			{ fiatMinor: "500", currency: "usd" }, { fiatMinor: "500", currency: "USD " }, { fiatMinor: "500", currency: "XMR" }, { fiatMinor: "500", currency: ["USD"] },
			{ fiatMinor: "123456789012345678901234567890", currency: "USD" }, { fiatMinor: "500", currency: "USD\u0000" }, { fiatMinor: "+500", currency: "USD" },
		];
		const accepted = [];
		for (const amount of bad) {
			const x = await tip({ amount });
			if (!code(x)) accepted.push({ amount, amountAtomic: data(x)?.amountAtomic });
		}
		expect(accepted).toEqual([]);
	});
});

describe("A11: which entries a tip may name", () => {
	it("[T30][F02] A11: a tip may name only a published entry, in the collection it lives in", async () => {
		await withPosts({ pool: 10 });
		const r = h as RedteamHost;
		for (const status of ["draft", "scheduled", "archived", "private", "trash", "pending"]) {
			try {
				await r.host.fixtures.content("posts", { slug: `s-${status}`, status, data: { title: status } } as never);
			} catch {
				continue; // the host doesn't know this status
			}
			const id = await entryId("posts", `s-${status}`);
			expect(code(await tip({ contentRef: { collection: "posts", id } })), status).toBe("ENTRY_NOT_FOUND");
		}
		const hello = await entryId("posts", "hello");
		expect(code(await tip({ contentRef: { collection: "pages", id: hello } }))).toBe("ENTRY_NOT_FOUND");
		for (const collection of ["_emdash_users", "users", "options", "__proto__", "posts\u0000", "POSTS"]) {
			expect(["ENTRY_NOT_FOUND", "INVALID_REQUEST"], collection).toContain(code(await tip({ contentRef: { collection, id: hello } })));
		}
		for (const id of ["", " ", `${hello} `, hello.toLowerCase() === hello ? hello.toUpperCase() : hello.toLowerCase(), "%", "*", "' OR 1=1 --"]) {
			expect(["ENTRY_NOT_FOUND", "INVALID_REQUEST"], JSON.stringify(id)).toContain(code(await tip({ contentRef: { collection: "posts", id } })));
		}
		expect(await r.invoices()).toEqual([]);
	});
});

describe("L3: the Cloudflare refusal comes from the runtime, not from headers", () => {
	it("[T19] L3: every Cloudflare header a visitor can send leaves a Node site taking tips", async () => {
		h = await redteamHost({ pool: 3 });
		const headers = {
			"cf-ray": "8a1b2c3d4e5f-LAX", "cf-ipcountry": "US", "cf-connecting-ip": "203.0.113.9", "cf-visitor": '{"scheme":"https"}', "cf-worker": "evil.workers.dev",
			cf: '{"country":"US","colo":"LAX"}', "x-cf-geo": "US", "cdn-loop": "cloudflare",
		};
		const r = await h.checkout({ kind: "tip" }, headers);
		expect(data(r)?.token).toBeTruthy();
	});

	it("[T19] L3: with the runtime's geo set, checkout refuses before claiming anything", async () => {
		h = await redteamHost({ pool: 3 });
		const r = (await h.checkoutAs({ geo: { country: "US" } } as never, { kind: "tip" })) as B;
		expect(JSON.stringify(r)).toContain("UNSUPPORTED_PLATFORM");
		expect(await h.invoices()).toEqual([]);
		expect((await h.pool()).every((p) => p.status === "free")).toBe(true);
	});
});
