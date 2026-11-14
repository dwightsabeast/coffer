// Spec change 48 on the plugin, Mark settled (Wyatt, 2026-11-08): marking an invoice settled stores the floor it settled
// under, as a settle from a sync does, so payments below the floor never count toward it. Marking settled changes the
// status, not the money: Received and the tips totals add only transfers at or above the floor, never the requested
// amount. With no fallback left, a pre-floor dev row (settled, no stored floor) is judged on the moving floor and still
// loads on the admin page.
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
const SITE = H0 + 40;
const CREATED = H0 + 20;
const FLOOR = CREATED - 30;
const T0 = Date.UTC(2026, 9, 14, 12); // Oct 14, 12:00 UTC
const HELLO = { id: "01HELLO", title: "Hello & welcome" };
const ABSENT = Symbol("no state:bridge");

let txn = 0;
const transfer = (amountAtomic: string, height: number, over: Partial<Transfer> = {}): Transfer => ({
	txid: (++txn).toString(16).padStart(64, "0"),
	amountAtomic,
	height,
	confirmations: SITE - height + 1,
	timestamp: 1_790_000_000,
	doubleSpendSeen: false,
	unlockTime: "0",
	seenAt: T0,
	poolTs: null,
	...over,
});

/** A visitor's tip to HELLO, created at CREATED, so its moving floor is FLOOR. */
function tip(n: number, over: Partial<Invoice> = {}): Invoice {
	const inv = newInvoice({
		id: `inv_t${n}`, token: `t${String(n).padStart(21, "0")}`, kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard",
		subaddress: fakeSubaddress(n, "T"), addrIndex: n, network: "stagenet", now: T0 + n * 60_000, chainHeight: CREATED,
		contentRef: { collection: "posts", id: HELLO.id }, uriDescription: `Tip: ${HELLO.title}`,
	});
	return { ...inv, via: "checkout", ...over };
}
/** Something arrived, then the wallet changed: a tip the page offers Mark settled for. */
const waiting = (n: number, transfers: Transfer[], over: Partial<Invoice> = {}) => tip(n, { status: "review", reviewReason: "wallet_changed", transfers, ...over });
/** An ordinary settled tip, its payment above its floor and its floor stored, as a sync would leave it. */
const settled = (n: number, amount: string) =>
	tip(n, { status: "settled", settledAt: T0 + 600_000, finalAt: T0 + 600_000, settledFloor: FLOOR, transfers: [transfer(amount, CREATED + 2)] });

async function setup(invoices: Invoice[], bridge: unknown = { height: SITE, lastSyncAt: Date.now() - 30_000, version: 1, outdated: false }) {
	const h = await createPluginRuntimeTestHost();
	host = h;
	await h.fixtures.plugin.setting("bridgePublicKey", PUBLIC_KEYS.test1);
	if (bridge !== ABSENT) await h.fixtures.plugin.kv("state:bridge", bridge);
	await h.fixtures.plugin.kv("state:setupDone", true);
	await h.http.respond("https://api.kraken.com/0/public/Ticker?pair=XMRUSD", new Response(JSON.stringify({ error: [], result: { XXMRZUSD: { c: ["150.00", "1.0"] } } })));
	for (const inv of invoices) await h.fixtures.plugin.storage("invoices", inv.id, inv);
	return h;
}

const h = () => host as PluginRuntimeTestHost;
const load = async () => (await h().admin.loadPage("/payments")).blocks as B[];
const settle = async (id: string) => ((await h().admin.act("/payments", "invoice_action", { value: `settle:${id}` })) as B).toast as B;
const stored = async (id: string) => (await h().inspect.storage.list<Invoice>("invoices")).find((r) => r.id === id)?.data as Invoice;
async function status(token: string): Promise<B> {
	const res = await h().actions.routes.request("status", { method: "GET", url: `https://site.test/_emdash/api/plugins/coffer/status?token=${token}` });
	return ((await res.json()) as B).data as B;
}
function tipsSection(blocks: B[]): B[] {
	const start = blocks.findIndex((b) => b.type === "header" && b.text === "Tips");
	expect(start).toBeGreaterThan(-1);
	const end = blocks.findIndex((b, i) => i > start && b.type === "header");
	return blocks.slice(start, end === -1 ? undefined : end);
}
const totalsFields = (s: B[]) => s.find((b) => b.type === "fields" && b.block_id === undefined)?.fields as B[];
const byEntry = (s: B[]) => s.find((b) => b.type === "fields" && b.block_id === "tips_by_entry")?.fields as B[];
const texts = (s: B[]) => s.filter((b) => b.type === "section" || b.type === "context").map((b) => String(b.text));

describe("Mark settled stores the floor: the status changes, the money doesn't (Wyatt, 2026-11-08)", () => {
	it("[P02] [RT-31] a tip whose every transfer is below its floor adds nothing to Received, its entry or its row, and the settled count rises by one", async () => {
		const target = waiting(2, [transfer("500000000", H0 - 500), transfer("200000000", H0 - 400)]);
		await setup([settled(1, "1000000000"), target]);
		const before = tipsSection(await load());
		expect(totalsFields(before)).toEqual([{ label: "Received", value: "0.001 XMR" }, { label: "Tips", value: "1 settled" }]);

		expect((await settle(target.id)).type).toBe("success");

		const after = tipsSection(await load());
		expect(totalsFields(after)).toEqual([{ label: "Received", value: "0.001 XMR" }, { label: "Tips", value: "2 settled" }]);
		expect(byEntry(after)).toEqual([{ label: HELLO.title, value: "2 tips, 0.001 XMR" }]);
		expect(texts(after).some((t) => t.endsWith(`: 0 XMR to ${HELLO.title}. Settled.`))).toBe(true);
		expect(texts(after)).toContain("Older payments to this address were ignored: 0.0007 XMR in 2 transfers, mined at blocks 2,999,500 to 2,999,600, before this tip.");
		expect(await status(target.token)).toMatchObject({ status: "settled", receivedAtomic: "0" });

		// The stored floor, not today's height, keeps it so: a heal later drops the site below the old payments' blocks,
		// where a moving floor would let them count.
		await h().fixtures.plugin.kv("state:bridge", { height: H0 - 600, lastSyncAt: Date.now() - 30_000, version: 1, outdated: false });
		expect(totalsFields(tipsSection(await load()))).toEqual([{ label: "Received", value: "0.001 XMR" }, { label: "Tips", value: "2 settled" }]);
		expect(await status(target.token)).toMatchObject({ status: "settled", receivedAtomic: "0" });
	});

	it("[P02] [RT-31] one transfer above the floor and one below: only the one above is added", async () => {
		const target = waiting(2, [transfer("200000000", CREATED + 1), transfer("500000000", H0 - 500)]);
		await setup([settled(1, "1000000000"), target]);
		await settle(target.id);
		const after = tipsSection(await load());
		expect(totalsFields(after)).toEqual([{ label: "Received", value: "0.0012 XMR" }, { label: "Tips", value: "2 settled" }]);
		expect(texts(after)).toContain("An older payment to this address was ignored: 0.0005 XMR, mined at block 2,999,500, before this tip.");
		expect(await status(target.token)).toMatchObject({ status: "settled", receivedAtomic: "200000000" });
	});

	it("[P02] [RT-34] the stored floor: createdHeight - 30 with the site above it, the pin when a healed height pinned one", async () => {
		const plain = waiting(2, [transfer("500000000", H0 - 500)]);
		const pinned = waiting(3, [transfer("500000000", H0 - 500)], { floorPin: H0 - 2_000 });
		await setup([plain, pinned]);
		await settle(plain.id);
		await settle(pinned.id);
		expect((await stored(plain.id)).settledFloor).toBe(FLOOR);
		expect((await stored(pinned.id)).settledFloor).toBe(H0 - 2_000);
		// Under the pin, the old payment counts; under the moving floor it doesn't.
		expect(await status(pinned.token)).toMatchObject({ receivedAtomic: "500000000" });
		expect(await status(plain.token)).toMatchObject({ receivedAtomic: "0" });
	});

	it("[R10] [RT-34] a reversed tip marked settled keeps the floor it first settled under", async () => {
		const reversed = tip(2, { status: "review", reviewReason: "reversed", settledAt: T0, settledFloor: H0 - 7, transfers: [transfer("500000000", H0 - 8)] });
		await setup([reversed], { height: SITE + 5_000, lastSyncAt: Date.now() - 30_000, version: 1, outdated: false });
		await settle(reversed.id);
		const after = await stored(reversed.id);
		expect(after).toMatchObject({ status: "settled", adminFinal: true, settledAt: T0, settledFloor: H0 - 7 });
	});

	// Wyatt, 2026-11-08: a floor of NaN or 0 would make every old transfer count again.
	const badBridges: Array<[string, unknown]> = [
		["no state:bridge", ABSENT],
		["no height field", { lastSyncAt: Date.now(), version: 1, outdated: false }],
		["height null", { height: null }],
		["height 0", { height: 0 }],
		["height -5", { height: -5 }],
		["height 1.5", { height: 1.5 }],
		["height true", { height: true }],
		['height "12"', { height: "12" }],
		["height {}", { height: {} }],
		["height []", { height: [] }],
	];
	for (const [label, bridge] of badBridges) {
		it(`[P02] [RT-31] Mark settled with ${label}: the stored floor is createdHeight - 30, never NaN or 0, and the old payment doesn't count`, async () => {
			const target = waiting(2, [transfer("500000000", 5)]);
			await setup([target], bridge);
			expect((await settle(target.id)).type).toBe("success");
			const floor = (await stored(target.id)).settledFloor;
			expect(Number.isSafeInteger(floor), String(floor)).toBe(true);
			expect(floor).toBe(FLOOR);
			expect(await status(target.token)).toMatchObject({ status: "settled", receivedAtomic: "0" });
		});
	}
});

describe("a pre-floor dev row (settled, no stored floor) on the admin page", () => {
	it("[P02] [RT-33] the inv_f7ea94de1471f114 shape loads with no error: 0 XMR settled, its old payments on the ignored line, left out of Received", async () => {
		const preFloor = tip(2, {
			status: "settled", settledAt: T0, finalAt: T0,
			transfers: [transfer("100000000", H0 - 100), transfer("100000000", H0 - 1_000), transfer("100000000", H0 - 4_000)],
		});
		await setup([settled(1, "1000000000"), preFloor]);
		const s = tipsSection(await load());
		expect(totalsFields(s)).toEqual([{ label: "Received", value: "0.001 XMR" }, { label: "Tips", value: "2 settled" }]);
		expect(texts(s).some((t) => t.endsWith(`: 0 XMR to ${HELLO.title}. Settled.`))).toBe(true);
		expect(texts(s)).toContain("Older payments to this address were ignored: 0.0003 XMR in 3 transfers, mined at blocks 2,996,000 to 2,999,900, before this tip.");
	});
});
