// Spec change 46, item 1 (D3): the honest bridge checks the site's pool. Every response carries `check`, digests of the
// current wallet's rows; the bridge reports `checks.pool`. handleSync against the in-memory store.
import { describe, expect, it } from "vitest";

import { addressDigest } from "../../src/core/digest";
import { type Invoice, newInvoice } from "../../src/core/invoice";
import { siteIndex } from "../../src/core/walletindex";
import { CHECK_ROTATE_MS, MAX_CHECK, RECENT_MS, handleSync } from "../../src/sync/handle";
import { newPairingCode } from "../../src/sync/pairing";
import { POOL_TARGET } from "../../src/sync/protocol";
import { type KeyName, MemoryStore, PUBLIC_KEYS, bytesOf, signedHeaders } from "./helpers";
import { TAGS, fakeAddress, fakeSubaddress } from "../addresses";

const T0 = 1_790_000_000_000;
const H0 = 3_000_000;
const HONEST = (i: number) => fakeSubaddress(i, "H");
const THIEF = (i: number) => fakeSubaddress(i, "X");

const body = (over: Record<string, unknown> = {}) => ({ v: 1, seq: T0, height: H0, addresses: [], snapshots: [], ...over });
async function send(store: MemoryStore, b: unknown, opts: { now?: number; key?: KeyName } = {}) {
	const now = opts.now ?? T0;
	const bytes = bytesOf(b);
	return handleSync({ body: bytes, headers: await signedHeaders(bytes, now, opts.key ?? "test1"), now }, store);
}
type Ok = { ok: true; poolFree: number; poolTop: number; watch: number[]; check?: Array<{ index: number; digest: string }> };
const ok = (out: Awaited<ReturnType<typeof send>>) => {
	if (!("ok" in out.response)) throw new Error(`refused: ${JSON.stringify(out.response)}`);
	return out.response as unknown as Ok;
};
const addrs = (from: number, n: number, make = HONEST) => Array.from({ length: n }, (_, k) => ({ index: from + k, address: make(from + k) }));
const at = (s: number) => T0 + s * 1000;

function paired() {
	const store = new MemoryStore();
	store.publicKey = PUBLIC_KEYS.test1;
	return store;
}
function tip(id: string, index: number, address: string, over: Partial<Invoice> = {}): Invoice {
	return { ...newInvoice({ network: "stagenet", id, token: id.padEnd(22, "t"), kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress: address, addrIndex: index, now: T0, chainHeight: H0 }), ...over };
}
function claim(store: MemoryStore, index: number, inv: Invoice) {
	store.claim(index, inv);
}
const digests = async (rows: Array<{ index: number; address: string }>) => Promise.all(rows.map(async (r) => ({ index: r.index, digest: await addressDigest(r.address) })));

describe("the check list (spec change 46, item 1)", () => {
	it("[T03][R08] every free row is in it, by digest, lowest index first; no addresses are sent", async () => {
		const store = paired();
		const out = ok(await send(store, body({ addresses: addrs(1, 3) })));
		expect(out.check).toEqual(await digests(addrs(1, 3)));
		expect(JSON.stringify(out)).not.toContain(HONEST(1));
	});

	it("[T03][R08] only the current wallet's rows", async () => {
		const store = paired();
		store.pool.set(7, { addrIndex: 7, address: HONEST(7), status: "claimed", invoiceId: "inv_7" });
		store.wallets = { current: { keyId: PUBLIC_KEYS.test1.slice(0, 16), wallet: 1 }, list: [{ wallet: 1 }, { wallet: 0, probe: { digest: "qYtoTZjlFXXSf7Ul9MFxxg==" } }] };
		const out = ok(await send(store, body({ addresses: addrs(1, 2, THIEF) })));
		expect(out.check?.map((c) => c.index)).toEqual([1, 2]);
		expect(store.pool.has(siteIndex(1, 1))).toBe(true);
	});

	it("[T03][R08] a row added in the last 24 hours stays in the list once claimed, even settled within seconds", async () => {
		const store = paired();
		await send(store, body({ addresses: addrs(1, 2) }));
		claim(store, 2, tip("inv_2", 2, HONEST(2), { status: "settled", settledAt: at(5), finalAt: at(5) }));
		const out = ok(await send(store, body({ seq: at(10) }), { now: at(10) }));
		expect(out.check?.map((c) => c.index)).toEqual([1, 2]); // 2 isn't free or open: it's there as a recent row
		expect(RECENT_MS).toBe(24 * 3_600_000);
	});

	it("[T03][R08] open invoices' rows are in the list", async () => {
		const store = paired();
		store.pool.set(5, { addrIndex: 5, address: HONEST(5), status: "claimed", invoiceId: "inv_5" });
		store.invoices.set("inv_5", tip("inv_5", 5, HONEST(5)));
		const out = ok(await send(store, body()));
		expect(out.check?.map((c) => c.index)).toContain(5);
	});

	it("[T03] the rotation reaches every claimed row, moving at most every 30 s: a thief syncing often doesn't move it", async () => {
		const store = paired();
		for (let i = 1; i <= 120; i++) store.pool.set(i, { addrIndex: i, address: HONEST(i), status: "claimed", invoiceId: `inv_${i}` });
		const first = ok(await send(store, body())).check?.map((c) => c.index);
		expect(first).toEqual(Array.from({ length: 50 }, (_, k) => k + 1));
		for (let s = 1; s < 30; s++) expect(ok(await send(store, body({ seq: at(s) }), { now: at(s) })).check?.map((c) => c.index)).toEqual(first);
		const second = ok(await send(store, body({ seq: at(30) }), { now: at(30) })).check?.map((c) => c.index);
		expect(second).toEqual(Array.from({ length: 50 }, (_, k) => k + 51));
		const third = ok(await send(store, body({ seq: at(60) }), { now: at(60) })).check?.map((c) => c.index);
		expect(third).toEqual(Array.from({ length: 20 }, (_, k) => k + 101));
		expect(CHECK_ROTATE_MS).toBe(30_000);
		const wrapped = ok(await send(store, body({ seq: at(90) }), { now: at(90) })).check?.map((c) => c.index);
		expect(wrapped?.[0]).toBe(1);
	});

	it("[T03] capped at 150", async () => {
		const store = paired();
		for (let i = 1; i <= 200; i++) store.pool.set(i, { addrIndex: i, address: HONEST(i), status: "free", keyId: PUBLIC_KEYS.test1.slice(0, 16) });
		const out = ok(await send(store, body()));
		expect(MAX_CHECK).toBe(150);
		expect(out.check).toHaveLength(150);
		expect(out.check?.[0].index).toBe(1);
	});

	it("[T03] none while the site waits for the probe answer", async () => {
		const store = paired();
		await send(store, body({ addresses: addrs(1, 2) }));
		claim(store, 1, tip("inv_1", 1, HONEST(1)));
		const { code, state } = await newPairingCode(at(1));
		store.pairing = state;
		const out = ok(await send(store, body({ seq: at(1), pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2", now: at(1) }));
		expect(out.check).toBeUndefined();
	});
});

describe("the free cap (spec change 46, D3)", () => {
	it("[T03] once 50 rows are free, a sync's further addresses are ignored", async () => {
		const store = paired();
		const out = ok(await send(store, body({ addresses: addrs(1, 60) })));
		expect(out.poolFree).toBe(POOL_TARGET);
		expect(store.pool.has(50)).toBe(true);
		expect(store.pool.has(51)).toBe(false);
		ok(await send(store, body({ seq: at(1), addresses: addrs(51, 5) }), { now: at(1) }));
		expect(store.pool.has(51)).toBe(false);
	});
});

describe("the bridge's report (spec change 46, item 1)", () => {
	async function forged() {
		const store = paired();
		await send(store, body({ addresses: addrs(1, 3) }));
		// The thief, with the same key, adds its own row.
		await send(store, body({ seq: at(1), addresses: [{ index: 9, address: THIEF(9) }] }), { now: at(1) });
		return store;
	}

	it("[T03][R08] \"ok\" records when the check last passed", async () => {
		const store = paired();
		await send(store, body({ checks: { pool: { state: "ok" } } }), { now: at(3) });
		expect(store.poolCheck).toEqual({ lastOkAt: at(3) });
	});

	it("[T03][R08] a mismatch: the bad rows leave the pool's counts, are never handed out, and a later \"ok\" doesn't clear it", async () => {
		const store = await forged();
		const out = ok(await send(store, body({ seq: at(2), checks: { pool: { state: "mismatch", bad: [9] } } }), { now: at(2) }));
		expect(store.pool.get(9)?.status).toBe("bad");
		expect(out).toMatchObject({ poolFree: 3, poolTop: 3 });
		expect(out.check?.map((c) => c.index)).toEqual([1, 2, 3]);
		expect(store.poolCheck?.mismatch).toEqual({ at: at(2), keyId: PUBLIC_KEYS.test1.slice(0, 16) });
		await send(store, body({ seq: at(3), checks: { pool: { state: "ok" } } }), { now: at(3) });
		expect(store.poolCheck?.mismatch).toEqual({ at: at(2), keyId: PUBLIC_KEYS.test1.slice(0, 16) });
	});

	it("[T03][R08] one forged row at index 4,000,000,000 doesn't lift poolTop once found", async () => {
		const store = paired();
		await send(store, body({ addresses: addrs(1, 2) }));
		await send(store, body({ seq: at(1), addresses: [{ index: 4_000_000_000, address: THIEF(4) }] }), { now: at(1) });
		expect(ok(await send(store, body({ seq: at(2) }), { now: at(2) })).poolTop).toBe(4_000_000_000);
		const out = ok(await send(store, body({ seq: at(3), checks: { pool: { state: "mismatch", bad: [4_000_000_000] } } }), { now: at(3) }));
		expect(out.poolTop).toBe(2);
	});

	it("[T03][R08] every invoice on a bad row goes to review (not_your_wallet), closed and admin-decided ones included", async () => {
		const store = await forged();
		claim(store, 9, tip("inv_9", 9, THIEF(9), { status: "settled", settledAt: at(1), finalAt: at(1), adminFinal: true }));
		const out = await send(store, body({ seq: at(2), checks: { pool: { state: "mismatch", bad: [9] } } }), { now: at(2) });
		expect(store.invoices.get("inv_9")).toMatchObject({ status: "review", reviewReason: "not_your_wallet" });
		expect(store.invoices.get("inv_9")?.adminFinal).toBeUndefined();
		expect(out.events).toContainEqual({ invoiceId: "inv_9", event: { type: "status", from: "settled", to: "review", reason: "not_your_wallet" } });
		// No longer watched, and the honest wallet host's own snapshot for that index is ignored.
		const later = ok(await send(store, body({ seq: at(3), snapshots: [{ index: 9, transfers: [] }] }), { now: at(3) }));
		expect(later.watch).not.toContain(9);
		expect(store.invoices.get("inv_9")?.transfers).toEqual([]);
	});

	it("[T20][T03] an address on another network from the current key counts as a mismatch, with no row to mark", async () => {
		const store = paired();
		await send(store, body({ addresses: addrs(1, 1) }));
		await send(store, body({ seq: at(1), addresses: [{ index: 2, address: fakeAddress(TAGS.mainnet[1], 2, "M") }] }), { now: at(1) });
		expect(store.pool.has(2)).toBe(false);
		expect(store.poolCheck?.mismatch?.at).toBe(at(1));
	});

	it("[T03][R08] a new pairing clears the mismatch", async () => {
		const store = await forged();
		await send(store, body({ seq: at(2), checks: { pool: { state: "mismatch", bad: [9] } } }), { now: at(2) });
		const { code, state } = await newPairingCode(at(3));
		store.pairing = state;
		await send(store, body({ seq: at(3), pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2", now: at(3) });
		expect(store.poolCheck?.mismatch).toBeUndefined();
		expect(store.pool.get(9)?.status).toBe("bad"); // never deleted
	});

	it("[T03] a report is ignored while the site waits for the probe answer", async () => {
		const store = await forged();
		claim(store, 1, tip("inv_1", 1, HONEST(1)));
		const { code, state } = await newPairingCode(at(3));
		store.pairing = state;
		await send(store, body({ seq: at(3), pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2", now: at(3) });
		await send(store, body({ seq: at(4), checks: { pool: { state: "mismatch", bad: [1] } } }), { key: "test2", now: at(4) });
		expect(store.pool.get(1)?.status).toBe("claimed");
		expect(store.poolCheck?.mismatch).toBeUndefined();
	});
});
