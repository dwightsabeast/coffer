// Phase 09, step 3: what ties a tip to a person (spec change 49, items 1 to 3: the invoice ID, each payment's amount,
// block and Transaction ID, the address in short form), and "Show older tips" (the `tips_page` action, Wyatt 2026-11-08):
// a storage cursor over the Tips view's own query, on the private admin route. The pay token is a secret (T09): it never
// appears on any row or page. The user and header refusals for the admin route are EmDash's, before the plugin runs, so
// the test host can't make them; scripts/dev-e2e.mjs checks them on a dev site.
import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { type Invoice, type Transfer, newInvoice } from "../../src/core/invoice";
import { PUBLIC_KEYS } from "../sync/helpers";
import { fakeSubaddress } from "../addresses";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

type B = Record<string, any>;
const H0 = 3_000_000;
const T0 = Date.UTC(2026, 9, 14, 12);
const PAGE = "/payments";

const transfer = (amountAtomic: string, over: Partial<Transfer> = {}): Transfer => ({ txid: `${amountAtomic}`.padStart(64, "a"), amountAtomic, confirmations: 12, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", seenAt: T0, poolTs: null, ...over });
const token = (n: number) => `tok${String(n).padStart(19, "0")}`;
function tip(n: number, over: Partial<Invoice> = {}): Invoice {
	const inv = newInvoice({ id: `inv_t${String(n).padStart(3, "0")}`, token: token(n), kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress: fakeSubaddress(n, "T"), addrIndex: n, network: "stagenet", now: T0 + n * 60_000, chainHeight: H0, uriDescription: "Tip" });
	return { ...inv, via: "checkout", ...over };
}
const settled = (n: number, amount = "100000000", over: Partial<Invoice> = {}) => tip(n, { status: "settled", settledAt: T0 + n * 60_000 + 600_000, finalAt: T0 + n * 60_000 + 600_000, transfers: [transfer(amount, { txid: n.toString(16).padStart(64, "b") })], ...over });
/** An admin's test tip: no `via`. */
const testTip = (n: number) => {
	const { via: _via, ...rest } = settled(n, "900000000");
	return rest as Invoice;
};

async function setup(invoices: Invoice[]) {
	const h = await createPluginRuntimeTestHost();
	host = h;
	await h.fixtures.plugin.setting("bridgePublicKey", PUBLIC_KEYS.test1);
	await h.fixtures.plugin.kv("state:bridge", { height: H0 + 40, lastSyncAt: Date.now() - 30_000, version: 1, outdated: false });
	await h.fixtures.plugin.kv("state:setupDone", true);
	await h.http.respond("https://api.kraken.com/0/public/Ticker?pair=XMRUSD", new Response(JSON.stringify({ error: [], result: { XXMRZUSD: { c: ["150.00", "1.0"] } } })));
	// One at a time, oldest first, so storage's own order is the order they were made in, as on a real site.
	for (const inv of invoices) await h.fixtures.plugin.storage("invoices", inv.id, inv);
	return h;
}
const r = () => host as PluginRuntimeTestHost;
const load = async () => (await r().admin.loadPage(PAGE)).blocks as B[];
const act = (value?: unknown) => r().admin.act(PAGE, "tips_page", value === undefined ? {} : { value });
function tipsSection(blocks: B[]): B[] {
	const start = blocks.findIndex((b) => b.type === "header" && b.text === "Tips");
	expect(start).toBeGreaterThan(-1);
	const end = blocks.findIndex((b, i) => i > start && b.type === "header");
	return blocks.slice(start, end === -1 ? undefined : end);
}
/** The invoice IDs listed, in order: each sits alone in its own code block. */
const listed = (blocks: B[]) => tipsSection(blocks).filter((b) => b.type === "code" && /^inv_[A-Za-z0-9_]+$/.test(String(b.code))).map((b) => b.code as string);
const nav = (blocks: B[]) => tipsSection(blocks).filter((b) => b.type === "actions").flatMap((b) => b.elements as B[]).filter((e) => e.action_id === "tips_page");
const older = (blocks: B[]) => nav(blocks).find((e) => e.label === "Show older tips");
const stored = async () => JSON.stringify((await r().inspect.storage.list<Invoice>("invoices")).map((i) => i.data).sort((a, b) => a.id.localeCompare(b.id)));
const id = (n: number) => `inv_t${String(n).padStart(3, "0")}`;

describe("tip rows (spec change 49, items 1 to 3)", () => {
	it("[T09] each tip shows its invoice ID in a box of its own, its address in short form, and each payment's amount, block and Transaction ID; never the pay token", async () => {
		const two = settled(2, "100000000", { transfers: [transfer("250000000", { txid: "c".repeat(64), height: H0 + 3, confirmations: 9 }), transfer("50000000", { txid: "d".repeat(64), height: 0, confirmations: 0 }), transfer("70000000", { txid: "e".repeat(64), unlockTime: "99999999999999999999" })] });
		await setup([settled(1), two, tip(3)]);
		const s = tipsSection(await load());
		expect(listed(s)).toEqual([id(3), id(2), id(1)]);
		const addr = fakeSubaddress(2, "T");
		expect(s).toContainEqual({ type: "context", text: `Address ${addr.slice(0, 6)}…${addr.slice(-6)}` });
		expect(s).toContainEqual({
			type: "code",
			code: [
				`Payment 1 of 3: 0.000250000000 XMR, block ${H0 + 3}, 9 confirmations when last checked (Oct 14), counted`,
				`Transaction ID: ${"c".repeat(64)}`,
				"",
				"Payment 2 of 3: 0.000050000000 XMR, not in a block yet, 0 confirmations when last checked (Oct 14), counted",
				`Transaction ID: ${"d".repeat(64)}`,
				"",
				`Payment 3 of 3: 0.000070000000 XMR, block ${H0 + 1}, 12 confirmations when last checked (Oct 14), not counted: time-locked`,
				`Transaction ID: ${"e".repeat(64)}`,
			].join("\n"),
		});
		// A tip with no payment has its ID and address, and no payments box.
		const text = JSON.stringify(s);
		expect(text).not.toContain("Payment 1 of 0");
		// No full address and no pay token anywhere on the page.
		const page = JSON.stringify(await load());
		for (const n of [1, 2, 3]) {
			expect(page).not.toContain(token(n));
			expect(page).not.toContain(fakeSubaddress(n, "T"));
		}
	});
});

describe("Show older tips (tips_page)", () => {
	it("[F04] pages by 10 on a storage cursor, oldest last; Newest tips goes back; the totals and the stored invoices don't change", async () => {
		await setup(Array.from({ length: 25 }, (_, i) => settled(i + 1)));
		const before = await stored();
		const first = await load();
		expect(listed(first)).toEqual(Array.from({ length: 10 }, (_, i) => id(25 - i)));
		expect(nav(first).map((e) => e.label)).toEqual(["Show older tips"]);
		const totals = tipsSection(first).find((b) => b.type === "fields");
		const second = (await act(older(first)?.value)).blocks as B[];
		expect(listed(second)).toEqual(Array.from({ length: 10 }, (_, i) => id(15 - i)));
		expect(nav(second).map((e) => e.label)).toEqual(["Newest tips", "Show older tips"]);
		expect(tipsSection(second).find((b) => b.type === "fields")).toEqual(totals);
		const third = (await act(older(second)?.value)).blocks as B[];
		expect(listed(third)).toEqual(Array.from({ length: 5 }, (_, i) => id(5 - i)));
		expect(nav(third).map((e) => e.label)).toEqual(["Newest tips"]);
		const back = (await act(nav(third)[0].value)).blocks as B[];
		expect(listed(back)).toEqual(listed(first));
		expect(await stored()).toBe(before);
	});

	it("[T30] test tips are on no page and in no total, so a page can hold fewer than 10", async () => {
		// Newest first: 12 visitor, 3 test, 5 visitor, 2 test, 3 visitor.
		const all = [...[1, 2, 3].map((n) => settled(n)), ...[4, 5].map(testTip), ...[6, 7, 8, 9, 10].map((n) => settled(n)), ...[11, 12, 13].map(testTip), ...Array.from({ length: 12 }, (_, i) => settled(14 + i))];
		await setup(all);
		const seen: string[] = [];
		let page = await load();
		const sizes: number[] = [];
		for (let i = 0; i < 6; i++) {
			seen.push(...listed(page));
			sizes.push(listed(page).length);
			expect(JSON.stringify(tipsSection(page))).not.toContain("0.0009"); // a test tip's amount
			const next = older(page);
			if (!next) break;
			page = (await act(next.value)).blocks as B[];
		}
		const visitors = all.filter((t) => t.via === "checkout").map((t) => t.id).sort().reverse();
		expect(seen).toEqual(visitors);
		expect(sizes.some((n) => n < 10)).toBe(true);
		expect(tipsSection(await load())).toContainEqual({ type: "fields", fields: [{ label: "Received", value: "0.002 XMR" }, { label: "Tips", value: "20 settled" }] });
	});

	it("[P04] an older tip past the 30-day purge shows without its note", async () => {
		await setup([settled(1, "100000000", {}), ...Array.from({ length: 10 }, (_, i) => settled(i + 2, "100000000", { buyer: { note: `note ${i + 2}` } }))]);
		const second = (await act(older(await load())?.value)).blocks as B[];
		expect(listed(second)).toEqual([id(1)]);
		expect(JSON.stringify(tipsSection(second))).not.toContain("Note:");
	});

	it("[F04] a malformed or forged cursor gets an error toast and the newest page, changes nothing, and never crashes", async () => {
		await setup([...Array.from({ length: 25 }, (_, i) => settled(i + 1)), { ...settled(40), kind: "product", id: "inv_p040" } as Invoice]);
		const before = await stored();
		const first = await load();
		const good = older(first)?.value as { cursor: string };
		const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
		const refused: unknown[] = [
			{ cursor: 42 }, { cursor: null }, { cursor: {} }, { cursor: [good.cursor] }, { cursor: "" }, { cursor: " " }, { cursor: "x".repeat(1001) }, { cursor: `${good.cursor}${"A".repeat(2000)}` },
			{ cursor: "not-base64-!!" }, { cursor: good.cursor.slice(0, -4) }, { cursor: `${good.cursor.slice(0, -2)}%%` }, { cursor: b64("just a string") }, { cursor: b64(null) }, { cursor: b64({ id: 5, orderValue: 7 }) }, { cursor: b64({ orderValue: "1" }) },
			"a bare string", 7, [], { start: 12 },
		];
		for (const value of refused) {
			const res = await act(value);
			expect(res.toast, JSON.stringify(value)).toEqual({ type: "error", message: "That page of tips isn't available. Showing the newest." });
			expect(listed(res.blocks as B[]), JSON.stringify(value)).toEqual(listed(first));
		}
		// Well formed, but not from this list: EmDash reads a cursor as a position, so these can't be told from a real one.
		// They show some page of visitor tips or the newest with the toast: read-only either way, and never another kind.
		const product = (await r().admin.act(PAGE, "invoices_page", { value: {} })).blocks as B[];
		expect(JSON.stringify(product)).not.toContain("inv_p040"); // release 1 lists no product invoices at all
		for (const value of [{ cursor: b64({ orderValue: String(T0 + 7 * 60_000), id: "inv_p040" }) }, { cursor: b64({ orderValue: "zzzz", id: "zzzz" }) }, { cursor: b64({ orderValue: "-1", id: "" }) }, { cursor: b64({ orderValue: "9".repeat(400), id: "inv_t001", sortValues: ["x", 1, null] }) }]) {
			const res = await act(value);
			const ids = listed(res.blocks as B[]);
			expect(ids.every((i) => /^inv_t\d{3}$/.test(i)), JSON.stringify(value)).toBe(true);
			expect(JSON.stringify(res.blocks)).not.toContain("inv_p040");
		}
		expect(await stored()).toBe(before);
	});

	it("[T09] no page of tips shows a pay token or a full address", async () => {
		await setup(Array.from({ length: 25 }, (_, i) => settled(i + 1, "100000000", { buyer: { note: "hi" } })));
		let page = await load();
		for (let i = 0; i < 4; i++) {
			const text = JSON.stringify(page);
			for (let n = 1; n <= 25; n++) {
				expect(text).not.toContain(token(n));
				expect(text).not.toContain(fakeSubaddress(n, "T"));
			}
			const next = older(page);
			if (!next) break;
			expect(JSON.stringify(next.value)).not.toMatch(/tok\d{19}/);
			page = (await act(next.value)).blocks as B[];
		}
	});
});
