// Spec change 46, items 3 and 4: at a re-pair the bridge says whether it's the same wallet, and each wallet keeps its
// own numbering (wallet w's index i is the site number w * 2^32 + i). handleSync against the in-memory store.
import { describe, expect, it } from "vitest";

import { FINAL_DEPTH } from "../../src/core/constants";
import { addressDigest } from "../../src/core/digest";
import { type Invoice, newInvoice } from "../../src/core/invoice";
import { WALLET_SPAN, siteIndex } from "../../src/core/walletindex";
import { handleSync } from "../../src/sync/handle";
import { newPairingCode } from "../../src/sync/pairing";
import { type KeyName, MemoryStore, PUBLIC_KEYS, bytesOf, signedHeaders } from "./helpers";
import { fakeSubaddress } from "../addresses";

const T0 = 1_790_000_000_000;
const H0 = 3_000_000;
/** Wallet 0's (the shop wallet's) and wallet 1's addresses: different strings at the same own index. */
const SHOP = (i: number) => fakeSubaddress(i, "S");
const OTHER = (i: number) => fakeSubaddress(i, "O");
const TXID = (n: number) => n.toString(16).padStart(64, "0");

const body = (over: Record<string, unknown> = {}) => ({ v: 1, seq: T0, height: H0, addresses: [], snapshots: [], ...over });
async function send(store: MemoryStore, b: unknown, opts: { now?: number; key?: KeyName } = {}) {
	const now = opts.now ?? T0;
	const bytes = bytesOf(b);
	return handleSync({ body: bytes, headers: await signedHeaders(bytes, now, opts.key ?? "test1"), now }, store);
}
type Ok = { ok: true; poolFree: number; poolTop: number; watch: number[]; probes?: Array<{ wallet: number; index: number; digest: string }>; restoreHeight?: number };
const ok = (out: Awaited<ReturnType<typeof send>>) => {
	if (!("ok" in out.response)) throw new Error(`refused: ${JSON.stringify(out.response)}`);
	return out.response as unknown as Ok;
};

function tip(id: string, over: Partial<Invoice> = {}): Invoice {
	return { ...newInvoice({ network: "stagenet", id, token: id.padEnd(22, "t"), kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress: "", addrIndex: 0, now: T0, chainHeight: H0 }), ...over };
}

/**
 * The dev site's shape on 2026-11-01 (spec change 46's test case): wallet 0 with 306 claimed rows (1-305 and 356) and free
 * rows 357-405, all under test1, with no wallet state yet (a site from before spec change 46).
 */
function devSite() {
	const store = new MemoryStore();
	store.publicKey = PUBLIC_KEYS.test1;
	const claimed = [...Array.from({ length: 305 }, (_, i) => i + 1), 356];
	for (const i of claimed) store.pool.set(i, { addrIndex: i, address: SHOP(i), status: "claimed", keyId: "old", invoiceId: `inv_${i}` });
	for (let i = 357; i <= 405; i++) store.pool.set(i, { addrIndex: i, address: SHOP(i), status: "free", keyId: "old" });
	store.paidTop = 300;
	return store;
}

async function repair(store: MemoryStore, key: KeyName, now = T0 + 1000) {
	const { code, state } = await newPairingCode(now);
	store.pairing = state;
	return send(store, body({ seq: now, pair: { code, publicKey: PUBLIC_KEYS[key] } }), { key, now });
}

describe("the probe and the wait (spec change 46, item 3)", () => {
	it("[P02] a fresh site's first pairing is wallet 0 at once: no probes, its addresses accepted", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const out = ok(await send(store, body({ pair: { code, publicKey: PUBLIC_KEYS.test1 }, addresses: [{ index: 1, address: SHOP(1) }] })));
		expect(out.probes).toBeUndefined();
		expect(out).toMatchObject({ poolFree: 1, poolTop: 1 });
		expect(store.wallets?.current).toEqual({ keyId: PUBLIC_KEYS.test1.slice(0, 16), wallet: 0 });
		expect(store.wallets?.list[0]).toMatchObject({ wallet: 0, probe: { index: 1, address: SHOP(1) } });
	});

	it("[P02] a paired site from before spec change 46 (no wallet state) is wallet 0, unchanged", async () => {
		const store = devSite();
		const out = ok(await send(store, body({ addresses: [{ index: 406, address: SHOP(406) }] })));
		expect(out.probes).toBeUndefined();
		expect(out.poolTop).toBe(406);
		expect(store.pool.get(406)).toMatchObject({ status: "free" });
	});

	it("[T03][P02] a re-pair on a site with history waits: probes by digest, poolTop 0, an empty watch, addresses ignored", async () => {
		const store = devSite();
		const out = ok(await repair(store, "test2"));
		expect(out.probes).toEqual([{ wallet: 0, index: 1, digest: await addressDigest(SHOP(1)) }]);
		expect(out).toMatchObject({ poolFree: 0, poolTop: 0, watch: [] });
		// Until the answer, the new key's addresses are ignored, and the probes keep coming.
		const again = ok(await send(store, body({ seq: T0 + 2000, addresses: [{ index: 1, address: OTHER(1) }] }), { key: "test2", now: T0 + 2000 }));
		expect(again.probes).toHaveLength(1);
		expect(again.poolFree).toBe(0);
		expect(store.pool.get(1)?.address).toBe(SHOP(1));
		expect(store.network).toBeNull();
	});

	it("[T03][P02] while waiting no snapshot is applied: a settled tip under FINAL_DEPTH stays settled when the new host reports its index empty", async () => {
		const store = devSite();
		const settled = tip("inv_356", { addrIndex: 356, subaddress: SHOP(356), status: "settled", settledAt: T0, finalAt: T0, seq: T0 - 5000,
			transfers: [{ txid: TXID(1), amountAtomic: "500000000", confirmations: 3, height: H0 - 2, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", seenAt: T0, poolTs: null }] });
		expect(3).toBeLessThan(FINAL_DEPTH);
		store.invoices.set(settled.id, settled);
		const out = ok(await repair(store, "test2"));
		expect(out.watch).toEqual([]);
		const res = await send(store, body({ seq: T0 + 2000, snapshots: [{ index: 356, transfers: [] }] }), { key: "test2", now: T0 + 2000 });
		expect(res.events).toEqual([]);
		expect(store.invoices.get("inv_356")).toMatchObject({ status: "settled" });
	});

	it("[P02] the pairing response's restore height covers every wallet's watched invoices", async () => {
		const store = devSite();
		store.invoices.set("inv_356", tip("inv_356", { addrIndex: 356, subaddress: SHOP(356), createdHeight: H0 - 100 }));
		const out = ok(await repair(store, "test2"));
		expect(out.restoreHeight).toBeLessThanOrEqual(H0 - 100);
	});

	it("[T03] a match that isn't among the probes is ignored: the site keeps waiting", async () => {
		const store = devSite();
		await repair(store, "test2");
		const out = ok(await send(store, body({ seq: T0 + 2000, wallet: { match: 7, receivedTop: 0 }, addresses: [{ index: 1, address: OTHER(1) }] }), { key: "test2", now: T0 + 2000 }));
		expect(out.probes).toHaveLength(1);
		expect(store.wallets?.current.wallet).toBeNull();
		expect(store.pool.get(1)?.address).toBe(SHOP(1));
	});
});

describe("each wallet keeps its own numbering (spec change 46, item 4)", () => {
	it("[P02] Wyatt's test case: after a different-wallet re-pair the first pool address is the new wallet's own index 1, and the gap baseline is its receivedTop", async () => {
		const store = devSite();
		await repair(store, "test2");
		const answered = ok(await send(store, body({ seq: T0 + 2000, wallet: { match: null, receivedTop: 0 } }), { key: "test2", now: T0 + 2000 }));
		expect(answered.probes).toBeUndefined();
		expect(answered.poolTop).toBe(0); // the new wallet holds nothing yet: its own numbering, not 356
		expect(store.wallets?.current.wallet).toBe(1);
		expect(store.paidTops.get(1)).toBe(0);
		const filled = ok(await send(store, body({ seq: T0 + 3000, addresses: [1, 2, 3].map((i) => ({ index: i, address: OTHER(i) })) }), { key: "test2", now: T0 + 3000 }));
		expect(filled).toMatchObject({ poolFree: 3, poolTop: 3 });
		expect(store.pool.get(siteIndex(1, 1))).toMatchObject({ address: OTHER(1), status: "free" });
		expect(store.pool.get(1)?.address).toBe(SHOP(1)); // wallet 0's own index 1 untouched
		expect(store.wallets?.list.find((w) => w.wallet === 1)?.probe).toEqual({ index: 1, address: OTHER(1) });
	});

	it("[P02] a returning wallet the site has forgotten: the baseline starts at its receivedTop, not 0", async () => {
		const store = devSite();
		await repair(store, "test2");
		await send(store, body({ seq: T0 + 2000, wallet: { match: null, receivedTop: 405 } }), { key: "test2", now: T0 + 2000 });
		expect(store.paidTops.get(1)).toBe(405);
	});

	it("[P02] snapshots, notePaid and the watch list speak the current wallet's own indexes", async () => {
		const store = devSite();
		await repair(store, "test2");
		await send(store, body({ seq: T0 + 2000, wallet: { match: null, receivedTop: 0 }, addresses: [1, 2].map((i) => ({ index: i, address: OTHER(i) })) }), { key: "test2", now: T0 + 2000 });
		const n = siteIndex(1, 2);
		const row = store.pool.get(n)!;
		row.status = "claimed";
		row.invoiceId = "inv_w1";
		store.invoices.set("inv_w1", tip("inv_w1", { addrIndex: n, subaddress: OTHER(2) }));
		const pay = { txid: TXID(5), amount: "500000000", confirmations: 1, height: H0, timestamp: 1_790_000_100, doubleSpendSeen: false, unlockTime: "0" };
		const out = ok(await send(store, body({ seq: T0 + 3000, height: H0 + 1, snapshots: [{ index: 2, transfers: [pay] }] }), { key: "test2", now: T0 + 3000 }));
		expect(store.invoices.get("inv_w1")?.transfers).toHaveLength(1);
		expect(store.paidTops.get(1)).toBe(2);
		expect(store.paidTop).toBe(300); // wallet 0's baseline unchanged
		expect(out.watch).toContain(2);
		expect(out.watch.every((i) => i < WALLET_SPAN)).toBe(true);
	});

	it("[P02] a match resumes that wallet: poolTop is its own highest, and its invoices take snapshots again", async () => {
		const store = devSite();
		await repair(store, "test2");
		await send(store, body({ seq: T0 + 2000, wallet: { match: null, receivedTop: 0 }, addresses: [{ index: 1, address: OTHER(1) }] }), { key: "test2", now: T0 + 2000 });
		// Back to the shop wallet with a third key.
		const probes = ok(await repair(store, "test1", T0 + 5000)).probes;
		expect(probes?.map((p) => p.wallet)).toEqual([1, 0]); // most recent first
		const back = ok(await send(store, body({ seq: T0 + 6000, wallet: { match: 0, receivedTop: 300 } }), { now: T0 + 6000 }));
		expect(store.wallets?.current.wallet).toBe(0);
		expect(back.poolTop).toBe(356); // wallet 0's free rows were dropped at the first re-pair; its claimed top stays
		await send(store, body({ seq: T0 + 7000, addresses: [{ index: 357, address: SHOP(357) }] }), { now: T0 + 7000 });
		expect(store.pool.get(357)).toMatchObject({ address: SHOP(357), status: "free" });
	});

	it("[T03] a bridge that never answers gets no addresses", async () => {
		const store = devSite();
		await repair(store, "test2");
		for (let k = 2; k <= 4; k++) {
			await send(store, body({ seq: T0 + k * 1000, addresses: [{ index: 1, address: OTHER(1) }, { index: 500, address: OTHER(500) }] }), { key: "test2", now: T0 + k * 1000 });
		}
		expect(store.pool.has(500)).toBe(false);
		expect(store.pool.has(siteIndex(1, 1))).toBe(false);
	});
});

describe("the address digest", () => {
	it("[T03] is the base64 of the first 16 bytes of SHA-256 over the address string", async () => {
		const a = SHOP(1);
		const full = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(a)));
		expect(await addressDigest(a)).toBe(btoa(String.fromCharCode(...full.slice(0, 16))));
		expect(await addressDigest(a)).toHaveLength(24);
		expect(await addressDigest(OTHER(1))).not.toBe(await addressDigest(a));
	});
});
