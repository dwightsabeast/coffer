// handleSync end to end against an in-memory store: pairing, pool top-up, snapshots, seq replays, the watch list.
import { describe, expect, it } from "vitest";

import { RESTORE_MARGIN_BLOCKS } from "../../src/core/constants";
import { type Invoice, newInvoice } from "../../src/core/invoice";
import { handleSync } from "../../src/sync/handle";
import { PAIRING_TTL_MS, keyId, newPairingCode } from "../../src/sync/pairing";
import { PAIR_MAX_BYTES } from "../../src/sync/protocol";
import { KEY_IDS, type KeyName, MemoryStore, PUBLIC_KEYS, bytesOf, signedHeaders } from "./helpers";
import { TAGS, fakeAddress, fakeSubaddress } from "../addresses";

const T0 = 1_790_000_000_000;
const H0 = 3_000_000;
const ADDR = (i: number) => fakeSubaddress(i, "A");
const TXID = (n: number) => n.toString(16).padStart(64, "0");

function syncBody(over: Record<string, unknown> = {}) {
	return { v: 1, seq: T0, height: H0, addresses: [], snapshots: [], ...over };
}
async function send(store: MemoryStore, body: unknown, opts: { now?: number; key?: KeyName; raw?: Uint8Array } = {}) {
	const now = opts.now ?? T0;
	const bytes = opts.raw ?? bytesOf(body);
	return handleSync({ body: bytes, headers: await signedHeaders(bytes, now, opts.key ?? "test1"), now }, store);
}
const errorCode = (out: Awaited<ReturnType<typeof send>>) => ("error" in out.response ? out.response.error.code : "ok");

function pairedStore(key: KeyName = "test1") {
	const store = new MemoryStore();
	store.publicKey = PUBLIC_KEYS[key];
	return store;
}

describe("pairing", () => {
	it("a key ID is the key's first 16 base64 characters, different for the two test keys (spec change 45)", () => {
		expect(keyId(PUBLIC_KEYS.test1)).toBe(PUBLIC_KEYS.test1.slice(0, 16));
		expect(keyId(PUBLIC_KEYS.test1)).toHaveLength(16);
		expect(keyId(PUBLIC_KEYS.test1)).not.toBe(keyId(PUBLIC_KEYS.test2));
	});

	it("[T03] NOT_PAIRED without a key or an active code", async () => {
		expect(errorCode(await send(new MemoryStore(), syncBody()))).toBe("NOT_PAIRED");
	});

	it("[T13] pairs with an active code and a body signed by the key it carries, then burns the code", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const out = await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test1 } }));
		expect(out.response).toMatchObject({ ok: true });
		expect(out.paired).toBe(true);
		expect(store.publicKey).toBe(PUBLIC_KEYS.test1);
		expect(store.pairing?.used).toBe(true);
		// The paired key now signs ordinary syncs.
		expect(errorCode(await send(store, syncBody({ seq: T0 + 1 }), { now: T0 + 1000 }))).toBe("ok");
	});

	it("[T13] rejects a wrong code while one is active, and stores nothing", async () => {
		const store = new MemoryStore();
		store.pairing = (await newPairingCode(T0)).state;
		const out = await send(store, syncBody({ pair: { code: "A".repeat(22), publicKey: PUBLIC_KEYS.test1 } }));
		expect(errorCode(out)).toBe("PAIRING_REJECTED");
		expect(store.publicKey).toBeNull();
		expect(store.pairing?.used).toBe(false);
	});

	it("[T03][T13] rejects a body signed by a key other than the one it carries, without burning the code", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const out = await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test1 } }), { key: "test2" });
		expect(errorCode(out)).toBe("BAD_SIGNATURE");
		expect(store.publicKey).toBeNull();
		expect(store.pairing?.used).toBe(false);
	});

	it("[T13] an expired code is not active: nothing is parsed before the signature, so the request is not paired", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const later = T0 + PAIRING_TTL_MS;
		expect(errorCode(await send(store, syncBody({ seq: later, pair: { code, publicKey: PUBLIC_KEYS.test1 } }), { now: later }))).toBe("NOT_PAIRED");
	});

	it("[T13] a used code can't pair a second bridge (its body isn't parsed before the signature check)", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test1 } }));
		const again = await send(store, syncBody({ seq: T0 + 1, pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2", now: T0 + 1000 });
		expect(errorCode(again)).toBe("BAD_SIGNATURE");
		expect(store.publicKey).toBe(PUBLIC_KEYS.test1);
	});

	it("[T13] a pair field signed by the paired bridge: PAIRING_NOT_ACTIVE without any code, PAIRING_REJECTED with a used one", async () => {
		const never = pairedStore();
		expect(errorCode(await send(never, syncBody({ pair: { code: "A".repeat(22), publicKey: PUBLIC_KEYS.test1 } })))).toBe("PAIRING_NOT_ACTIVE");
		const used = pairedStore();
		used.pairing = { ...(await newPairingCode(T0)).state, used: true };
		expect(errorCode(await send(used, syncBody({ pair: { code: "A".repeat(22), publicKey: PUBLIC_KEYS.test1 } })))).toBe("PAIRING_REJECTED");
	});

	it("[T13][F01] a pairing body over 4 KiB takes the ordinary path and can't pair", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const body = syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test1 }, padding: "x".repeat(PAIR_MAX_BYTES) });
		expect(bytesOf(body).length).toBeGreaterThan(PAIR_MAX_BYTES);
		expect(errorCode(await send(store, body))).toBe("NOT_PAIRED");
		expect(store.pairing?.used).toBe(false);
	});

	it("[R09] the pairing response suggests a restore height: the oldest watched invoice's createdHeight minus a margin (spec change 17)", async () => {
		expect(RESTORE_MARGIN_BLOCKS).toBe(720);
		const inv = (id: string, index: number, chainHeight: number, now = T0): Invoice =>
			({ ...newInvoice({ network: "stagenet", id, token: "tok", kind: "product", fiatMinor: 1200n, currency: "USD", rate: { minor: 15000n, source: "t" }, speed: "standard", subaddress: ADDR(index), addrIndex: index, now, chainHeight }) });
		const paired = async (invoices: Invoice[]) => {
			const store = new MemoryStore();
			const { code, state } = await newPairingCode(T0);
			store.pairing = state;
			for (const i of invoices) store.invoices.set(i.id, i);
			// The pairing carries its node's bounded height, above every invoice here (spec change 47's healing, where it
			// is below, is in tests/redteam/floor.test.ts).
			const out = await send(store, syncBody({ height: H0 + 200, pair: { code, publicKey: PUBLIC_KEYS.test1 } }));
			return { store, response: out.response };
		};
		// Nothing watched: no suggestion, so the installer uses today.
		expect((await paired([])).response).not.toHaveProperty("restoreHeight");
		// Two open invoices and one expired three days ago (no longer watched): the older open one counts.
		const old = { ...inv("inv_old", 3, H0 - 5000, T0 - 3 * 86_400_000), status: "expired" as const };
		const { store, response } = await paired([inv("inv_a", 1, H0 + 100), inv("inv_b", 2, H0 + 50), old]);
		expect(response).toMatchObject({ ok: true, restoreHeight: H0 + 50 - RESTORE_MARGIN_BLOCKS });
		// Ordinary syncs never carry it.
		expect((await send(store, syncBody({ seq: T0 + 1 }), { now: T0 + 1000 })).response).not.toHaveProperty("restoreHeight");
		// Never below 0.
		expect((await paired([inv("inv_low", 1, 100)])).response).toMatchObject({ restoreHeight: 0 });
	});

	it("[T03][T13][R08] a new pairing replaces the old key", async () => {
		const store = pairedStore("test1");
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		expect(errorCode(await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2" }))).toBe("ok");
		expect(store.publicKey).toBe(PUBLIC_KEYS.test2);
		expect(errorCode(await send(store, syncBody({ seq: T0 + 1 }), { now: T0 + 1000, key: "test1" }))).toBe("BAD_SIGNATURE");
		expect(errorCode(await send(store, syncBody({ seq: T0 + 2 }), { now: T0 + 2000, key: "test2" }))).toBe("ok");
	});
});

describe("ordinary syncs", () => {
	it("[T03][T04][F01] forged, tampered, stale and badly encoded requests change nothing", async () => {
		const store = pairedStore();
		expect(errorCode(await send(store, syncBody(), { key: "test2" }))).toBe("BAD_SIGNATURE");
		const bytes = bytesOf(syncBody({ height: H0 + 1 }));
		const headers = await signedHeaders(bytes, T0);
		const tampered = bytesOf(syncBody({ height: H0 + 2 }));
		expect(errorCode({ ...(await handleSync({ body: tampered, headers, now: T0 }, store)) })).toBe("BAD_SIGNATURE");
		expect(errorCode(await handleSync({ body: bytes, headers, now: T0 + 301_000 }, store))).toBe("STALE_TIMESTAMP");
		const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(syncBody())]);
		expect(errorCode(await send(store, null, { raw: bom }))).toBe("INVALID_ENCODING");
		expect(store.bridge).toBeNull();
	});

	it("records the bridge's height, time and protocol version", async () => {
		const store = pairedStore();
		await send(store, syncBody({ height: H0 + 7 }), { now: T0 + 500 });
		expect(store.bridge).toEqual({ height: H0 + 7, lastSyncAt: T0 + 500, lastHeardAt: T0 + 500, version: 1, outdated: false });
	});

	it("records the bridge's checks with its state; a sync without them clears them (an older bridge)", async () => {
		const store = pairedStore();
		const checks = { node: { state: "ok" }, wallet: { state: "behind", detail: "wallet at 1, node at 9" } };
		await send(store, syncBody({ checks }), { now: T0 + 500 });
		expect(store.bridge).toEqual({ height: H0, lastSyncAt: T0 + 500, lastHeardAt: T0 + 500, version: 1, outdated: false, checks });
		await send(store, syncBody({ seq: T0 + 1 }), { now: T0 + 1000 });
		expect(store.bridge).not.toHaveProperty("checks");
	});

	it("notes the highest index with a counted payment, once per sync, never lowering it (the unpaid address gap, spec change 9)", async () => {
		const store = pairedStore();
		const t = (over: Record<string, unknown> = {}) => ({ txid: TXID(1), amount: "1000", confirmations: 1, height: H0, timestamp: 1_790_000_100, doubleSpendSeen: false, unlockTime: "0", ...over });
		await send(store, syncBody({ snapshots: [{ index: 3, transfers: [] }] }));
		expect(store.paidTop).toBeNull();
		await send(store, syncBody({ seq: T0 + 1, snapshots: [{ index: 5, transfers: [t()] }, { index: 4, transfers: [t({ txid: TXID(2) })] }] }), { now: T0 + 1000 });
		expect(store.paidTop).toBe(5);
		await send(store, syncBody({ seq: T0 + 2, snapshots: [{ index: 3, transfers: [t()] }, { index: 9, transfers: [t({ unlockTime: "10" }), t({ txid: TXID(2), doubleSpendSeen: true })] }] }), { now: T0 + 2000 });
		expect(store.paidTop).toBe(5); // lower, time-locked and flagged don't count
		await send(store, syncBody({ seq: T0 + 3, snapshots: [{ index: 9, transfers: [t()] }] }), { now: T0 + 3000 });
		expect(store.paidTop).toBe(9);
	});

	it("the stored height never goes down (spec change 16): a fresh wallet's low first height keeps the stored one", async () => {
		const store = pairedStore();
		await send(store, syncBody({ height: H0 + 7 }), { now: T0 + 500 });
		await send(store, syncBody({ seq: T0 + 1, height: 579_994 }), { now: T0 + 1000 });
		expect(store.bridge).toEqual({ height: H0 + 7, lastSyncAt: T0 + 1000, lastHeardAt: T0 + 1000, version: 1, outdated: false });
		await send(store, syncBody({ seq: T0 + 2, height: H0 + 9 }), { now: T0 + 2000 });
		expect(store.bridge?.height).toBe(H0 + 9);
	});

	it("[T12] snapshots are judged at the stored height when the reported one is lower: no false reorg after a fresh wallet's first sync", async () => {
		const store = pairedStore();
		await send(store, syncBody({ addresses: [{ index: 1, address: ADDR(1) }] }));
		const inv = newInvoice({ network: "stagenet", id: "inv_r", token: "tok", kind: "product", fiatMinor: 1200n, currency: "USD", rate: { minor: 15000n, source: "t" }, speed: "standard", subaddress: "", addrIndex: 0, now: T0, chainHeight: H0 });
		store.claim(1, inv);
		const amount = inv.expectedAtomic as string;
		const snap = (confirmations: number, height: number) => [{ index: 1, transfers: [{ txid: TXID(1), amount, confirmations, height, timestamp: 1_790_000_100, doubleSpendSeen: false, unlockTime: "0" }] }];
		await send(store, syncBody({ seq: T0 + 10_000, height: H0 + 2, snapshots: snap(2, H0 + 1) }), { now: T0 + 10_000 });
		expect(store.invoices.get("inv_r")?.status).toBe("settled");
		// A fresh wallet's first sync: tiny height, the transfer back in the pool. Re-confirming starts at the stored height.
		await send(store, syncBody({ seq: T0 + 20_000, height: 579_994, snapshots: snap(0, 0) }), { now: T0 + 20_000 });
		expect(store.invoices.get("inv_r")).toMatchObject({ status: "settled", reconfirmingSince: H0 + 2 });
		// Two blocks later, still unmined: well short of RECONFIRM_BLOCKS, so still settled.
		await send(store, syncBody({ seq: T0 + 30_000, height: H0 + 4, snapshots: snap(0, 0) }), { now: T0 + 30_000 });
		expect(store.invoices.get("inv_r")).toMatchObject({ status: "settled", reconfirmingSince: H0 + 2 });
	});

	it("[T05] tops up the pool with new indexes only, and reports the free count and target", async () => {
		const store = pairedStore();
		const out = await send(store, syncBody({ addresses: [1, 2, 3].map((i) => ({ index: i, address: ADDR(i) })) }));
		expect(out.response).toMatchObject({ ok: true, poolFree: 3, poolTarget: 50 });
		const again = await send(store, syncBody({ seq: T0 + 1, addresses: [{ index: 3, address: ADDR(99) }, { index: 4, address: ADDR(4) }] }), { now: T0 + 1000 });
		expect(again.response).toMatchObject({ poolFree: 4 });
		expect(store.pool.get(3)?.address).toBe(ADDR(3)); // an existing index is never overwritten
	});

	it("reports poolTop, the highest index the site holds: 0 when empty, claimed rows and this request's addresses included", async () => {
		const store = pairedStore();
		expect((await send(store, syncBody())).response).toMatchObject({ ok: true, poolTop: 0 });
		const out = await send(store, syncBody({ seq: T0 + 1, addresses: [9, 12].map((i) => ({ index: i, address: ADDR(i) })) }), { now: T0 + 1000 });
		expect(out.response).toMatchObject({ poolTop: 12 });
		store.pool.set(261, { addrIndex: 261, address: ADDR(261), status: "claimed", invoiceId: "inv_far" });
		expect((await send(store, syncBody({ seq: T0 + 2 }), { now: T0 + 2000 })).response).toMatchObject({ poolTop: 261 });
	});

	it("applies a snapshot to the invoice on that subaddress, ignores unknown indexes, and returns the watch list", async () => {
		const store = pairedStore();
		await send(store, syncBody({ addresses: [1, 2].map((i) => ({ index: i, address: ADDR(i) })) }));
		const inv = newInvoice({ network: "stagenet", id: "inv_a", token: "tok", kind: "product", fiatMinor: 1200n, currency: "USD", rate: { minor: 15000n, source: "t" }, speed: "standard", subaddress: "", addrIndex: 0, now: T0, chainHeight: H0 });
		store.claim(1, inv);
		const amount = inv.expectedAtomic as string;
		const pay = (seq: number, height: number, confirmations: number) => ({
			seq, height: H0 + 2,
			snapshots: [{ index: 1, transfers: [{ txid: TXID(1), amount, confirmations, height, timestamp: 1_790_000_100, doubleSpendSeen: false, unlockTime: "0" }] }, { index: 2, transfers: [] }, { index: 77, transfers: [] }],
		});
		const first = await send(store, syncBody(pay(T0 + 10_000, 0, 0)), { now: T0 + 10_000 });
		expect(first.response).toMatchObject({ ok: true, watch: [1] });
		expect(first.events).toContainEqual({ invoiceId: "inv_a", event: { type: "status", from: "new", to: "confirming" } });
		const stored = store.invoices.get("inv_a");
		expect(stored?.transfers[0]).toMatchObject({ seenAt: T0 + 10_000, poolTs: 1_790_000_100 });

		const settled = await send(store, syncBody(pay(T0 + 20_000, H0 + 1, 2)), { now: T0 + 20_000 });
		expect(settled.events).toContainEqual({ invoiceId: "inv_a", event: { type: "status", from: "confirming", to: "settled" } });
		const after = store.invoices.get("inv_a");
		expect(after).toMatchObject({ status: "settled", seq: T0 + 20_000 });
		expect(after?.transfers[0]).toMatchObject({ seenAt: T0 + 10_000, poolTs: 1_790_000_100, height: H0 + 1 }); // first-seen data kept
		expect(settled.response).toMatchObject({ watch: [1] }); // settled but only 2 deep

		const deep = await send(store, syncBody(pay(T0 + 30_000, H0 + 1, 10)), { now: T0 + 30_000 });
		expect(deep.response).toMatchObject({ watch: [] }); // 10 deep: no longer watched
	});

	it("[T04] a replayed snapshot (seq not newer) is ignored, even re-signed with a fresh timestamp; retries are idempotent", async () => {
		const store = pairedStore();
		await send(store, syncBody({ addresses: [{ index: 1, address: ADDR(1) }] }));
		const inv = newInvoice({ network: "stagenet", id: "inv_b", token: "tok", kind: "product", fiatMinor: 1200n, currency: "USD", rate: { minor: 15000n, source: "t" }, speed: "standard", subaddress: "", addrIndex: 0, now: T0, chainHeight: H0 });
		store.claim(1, inv);
		const amount = inv.expectedAtomic as string;
		const snap = (n: number) => [{ index: 1, transfers: Array.from({ length: n }, (_, i) => ({ txid: TXID(i + 1), amount, confirmations: 3, height: H0 + 1, timestamp: 1_790_000_100, doubleSpendSeen: false, unlockTime: "0" })) }];
		await send(store, syncBody({ seq: T0 + 50_000, height: H0 + 3, snapshots: snap(2) }), { now: T0 + 50_000 });
		const before = structuredClone(store.invoices.get("inv_b"));
		// An old snapshot (fewer transfers), replayed later with a fresh signature: ignored.
		const replay = await send(store, syncBody({ seq: T0 + 40_000, height: H0 + 3, snapshots: snap(1) }), { now: T0 + 60_000 });
		expect(replay.response).toMatchObject({ ok: true });
		expect(store.invoices.get("inv_b")).toEqual(before);
		// The same request retried: same seq, so nothing changes either.
		await send(store, syncBody({ seq: T0 + 50_000, height: H0 + 3, snapshots: snap(2) }), { now: T0 + 61_000 });
		expect(store.invoices.get("inv_b")).toEqual(before);
	});

	it("[R01] from pairing to a settled invoice", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const paired = await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test1 }, addresses: [1, 2, 3, 4, 5].map((i) => ({ index: i, address: ADDR(i) })) }));
		expect(paired.response).toMatchObject({ ok: true, poolFree: 5, watch: [] });
		const inv = newInvoice({ network: "stagenet", id: "inv_c", token: "tok", kind: "product", fiatMinor: 15000n, currency: "USD", rate: { minor: 15000n, source: "t" }, speed: "standard", subaddress: "", addrIndex: 0, now: T0, chainHeight: H0 });
		store.claim(3, inv); // $150: 1 XMR, 5 confirmations
		let now = T0;
		const amount = inv.expectedAtomic as string;
		for (let confs = 0; confs <= 5; confs++) {
			now += 120_000;
			const height = confs === 0 ? 0 : H0 + 1;
			await send(store, syncBody({ seq: now, height: H0 + confs, snapshots: [{ index: 3, transfers: [{ txid: TXID(9), amount, confirmations: confs, height, timestamp: 1_790_000_200, doubleSpendSeen: false, unlockTime: "0" }] }] }), { now });
		}
		expect(store.invoices.get("inv_c")).toMatchObject({ status: "settled", required: 5 });
	});
});

// Spec change 29: only a full sync counts as one. A pairing request, or the bridge's "starting" message while
// wallet-rpc isn't ready, says the wallet host is alive (lastHeardAt) but not that its wallet has synced (lastSyncAt).
describe("one network per pairing (spec change 45)", () => {
	const MAIN = (i: number) => fakeAddress(TAGS.mainnet[1], i, "M");
	const UNREADABLE = (i: number) => fakeAddress(99, i, "U");
	const indexes = (store: MemoryStore) => [...store.pool.keys()].sort((a, b) => a - b);

	it("[T20][P02] [RT-11] with no stored network, the first address sets it for the key that sent it; another network's address is dropped", async () => {
		const store = pairedStore();
		await send(store, syncBody({ addresses: [{ index: 1, address: ADDR(1) }, { index: 2, address: MAIN(2) }, { index: 3, address: ADDR(3) }] }));
		expect(indexes(store)).toEqual([1, 3]);
		expect(store.network).toEqual({ network: "stagenet", keyId: KEY_IDS.test1 });
	});

	it("[T20][P02] [RT-11] a mixed first batch keeps only the first readable address's network, in the body's order", async () => {
		const store = pairedStore();
		const addresses = [{ index: 1, address: UNREADABLE(1) }, { index: 2, address: MAIN(2) }, { index: 3, address: ADDR(3) }, { index: 4, address: MAIN(4) }];
		await send(store, syncBody({ addresses }));
		expect(indexes(store)).toEqual([2, 4]);
		expect(store.network).toEqual({ network: "mainnet", keyId: KEY_IDS.test1 });
	});

	it("[T20][P02] [RT-11] the stored network holds for later syncs: another network's address is dropped and the network stays", async () => {
		const store = pairedStore();
		store.network = { network: "stagenet", keyId: KEY_IDS.test1 };
		await send(store, syncBody({ addresses: [{ index: 5, address: MAIN(5) }] }));
		expect(indexes(store)).toEqual([]);
		expect(store.network).toEqual({ network: "stagenet", keyId: KEY_IDS.test1 });
	});

	it("[T20][T03] a stored network from another key counts as not known: this key's first address sets its own", async () => {
		const store = pairedStore("test1");
		store.network = { network: "mainnet", keyId: KEY_IDS.test2 };
		await send(store, syncBody({ addresses: [{ index: 1, address: ADDR(1) }] }));
		expect(indexes(store)).toEqual([1]);
		expect(store.network).toEqual({ network: "stagenet", keyId: KEY_IDS.test1 });
	});

	it("[T03] each pool row carries the ID of the key that signed the sync, and when it was added (spec change 46)", async () => {
		const store = pairedStore("test2");
		await send(store, syncBody({ addresses: [{ index: 1, address: ADDR(1) }] }), { key: "test2" });
		expect(store.pool.get(1)).toEqual({ addrIndex: 1, address: ADDR(1), status: "free", keyId: KEY_IDS.test2, addedAt: T0 });
	});

	it("[T03][R08] a sync whose key is replaced by a pairing while it runs is refused, and changes nothing", async () => {
		// The first read of the key (the signature check) sees test1; a pairing to test2 lands straight after.
		class RacingStore extends MemoryStore {
			reads = 0;
			override async getPublicKey() {
				const key = this.publicKey;
				if (++this.reads === 1) this.publicKey = PUBLIC_KEYS.test2;
				return key;
			}
		}
		const store = new RacingStore();
		store.publicKey = PUBLIC_KEYS.test1;
		const out = await send(store, syncBody({ height: H0 + 5, addresses: [{ index: 1, address: ADDR(1) }] }));
		expect(errorCode(out)).toBe("BAD_SIGNATURE");
		expect(store.pool.size).toBe(0);
		expect(store.network).toBeNull();
		expect(store.bridge).toBeNull();
	});
});

describe("a new pairing starts the pool afresh (spec change 45)", () => {
	async function pairWith(store: MemoryStore, key: KeyName, now = T0) {
		const { code, state } = await newPairingCode(now);
		store.pairing = state;
		return { code, out: await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS[key] } }), { key, now }) };
	}

	it("[T20][T03][R08] [RT-29] pairing drops every unused address and clears the network; claimed rows stay and poolTop falls to the highest", async () => {
		const store = pairedStore("test1");
		await send(store, syncBody({ addresses: [1, 2, 3, 4].map((i) => ({ index: i, address: ADDR(i) })) }));
		store.claim(2, newInvoice({ network: "stagenet", id: "inv_2", token: "t".repeat(22), kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress: ADDR(2), addrIndex: 2, now: T0, chainHeight: H0 }));
		const { out } = await pairWith(store, "test2", T0 + 1000);
		// Spec change 46: a site with history waits for the probe answer (poolTop 0), then the matched wallet's top.
		expect(out.response).toMatchObject({ ok: true, poolFree: 0, poolTop: 0 });
		const answered = await send(store, syncBody({ seq: T0 + 2000, wallet: { match: 0, receivedTop: 0 } }), { key: "test2", now: T0 + 2000 });
		expect(answered.response).toMatchObject({ ok: true, poolFree: 0, poolTop: 2 });
		expect([...store.pool.keys()]).toEqual([2]);
		expect(store.network).toBeNull();
		expect(store.invoices.has("inv_2")).toBe(true);
	});

	it("[T03][T13][R08] a pairing that fails after the drops: the old key still syncs, the new key is refused, and the code pairs on a retry", async () => {
		class FailingStore extends MemoryStore {
			failNext = true;
			override async setPublicKey(k: string) {
				if (this.failNext) {
					this.failNext = false;
					throw new Error("storage write failed");
				}
				await super.setPublicKey(k);
			}
		}
		const store = new FailingStore();
		store.publicKey = PUBLIC_KEYS.test1;
		await send(store, syncBody({ addresses: [1, 2].map((i) => ({ index: i, address: ADDR(i) })) }));
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const pairBody = syncBody({ seq: T0 + 1, pair: { code, publicKey: PUBLIC_KEYS.test2 } });
		await expect(send(store, pairBody, { key: "test2", now: T0 + 1000 })).rejects.toThrow("storage write failed");
		// The drops happened before the failure; nothing else did.
		expect(store.pool.size).toBe(0);
		expect(store.publicKey).toBe(PUBLIC_KEYS.test1);
		expect(store.pairing?.used).toBe(false);
		// The old pairing still works and refills; the new key isn't paired.
		expect(errorCode(await send(store, syncBody({ seq: T0 + 2, addresses: [{ index: 3, address: ADDR(3) }] }), { now: T0 + 2000 }))).toBe("ok");
		expect([...store.pool.keys()]).toEqual([3]);
		expect(errorCode(await send(store, syncBody({ seq: T0 + 3 }), { key: "test2", now: T0 + 3000 }))).toBe("BAD_SIGNATURE");
		// A retry with the same code pairs, and starts the pool afresh again.
		expect(errorCode(await send(store, pairBody, { key: "test2", now: T0 + 4000 }))).toBe("ok");
		expect(store.publicKey).toBe(PUBLIC_KEYS.test2);
		expect(store.pairing?.used).toBe(true);
		expect(store.pool.size).toBe(0);
	});

	it("[T20][T03] a pairing body's own addresses set the new pairing's network and carry the new key's ID", async () => {
		const store = pairedStore("test1");
		store.network = { network: "stagenet", keyId: KEY_IDS.test1 };
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const MAIN = (i: number) => fakeAddress(TAGS.mainnet[1], i, "M");
		await send(store, syncBody({ pair: { code, publicKey: PUBLIC_KEYS.test2 }, addresses: [{ index: 1, address: MAIN(1) }] }), { key: "test2" });
		expect(store.network).toEqual({ network: "mainnet", keyId: KEY_IDS.test2 });
		expect(store.pool.get(1)).toMatchObject({ status: "free", keyId: KEY_IDS.test2 });
	});
});

describe("heard, not synced (spec change 29)", () => {
	it("a pairing request: heard, not synced, no checks kept; the height still sets the floor", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		await send(store, syncBody({ height: H0 + 3, pair: { code, publicKey: PUBLIC_KEYS.test1 } }), { now: T0 + 100 });
		expect(store.bridge).toEqual({ height: H0 + 3, lastHeardAt: T0 + 100, version: 1, outdated: false });
		await send(store, syncBody({ seq: T0 + 1, height: H0 + 4 }), { now: T0 + 200 });
		expect(store.bridge).toEqual({ height: H0 + 4, lastSyncAt: T0 + 200, lastHeardAt: T0 + 200, version: 1, outdated: false });
	});

	it("pairing a new wallet host forgets the old one's last sync and checks", async () => {
		const store = pairedStore();
		await send(store, syncBody({ checks: { wallet: { state: "ok" } } }), { now: T0 + 100 });
		const { code, state } = await newPairingCode(T0 + 150);
		store.pairing = state;
		await send(store, syncBody({ seq: T0 + 1, pair: { code, publicKey: PUBLIC_KEYS.test2 } }), { now: T0 + 200, key: "test2" });
		expect(store.bridge).toEqual({ height: H0, lastHeardAt: T0 + 200, version: 1, outdated: false });
	});

	it("a starting message: heard, the last full sync and the height kept, nothing applied", async () => {
		const store = pairedStore();
		const inv = newInvoice({ network: "stagenet", id: "inv_1", token: "t".repeat(22), kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress: ADDR(5), addrIndex: 5, now: T0, chainHeight: H0 });
		store.invoices.set(inv.id, inv);
		await send(store, syncBody({ height: H0 + 7 }), { now: T0 + 500 });
		const starting = { node: { state: "ok" }, wallet: { state: "starting", detail: "starting Monero's wallet program" } };
		const out = await send(store, syncBody({ seq: T0 + 1, height: 0, checks: starting }), { now: T0 + 1000 });
		expect(out.response).toMatchObject({ ok: true });
		expect(store.bridge).toEqual({ height: H0 + 7, lastSyncAt: T0 + 500, lastHeardAt: T0 + 1000, version: 1, outdated: false, checks: starting });
		expect(store.invoices.get("inv_1")).toEqual(inv);
	});
});

describe("the seq bound (spec change 46, item 5; RT-24)", () => {
	it("[T04] a sync whose seq is more than 300 s from its signed timestamp is refused and changes nothing; 300 s is accepted", async () => {
		const store = pairedStore();
		for (const seq of [T0 + 300_001, T0 - 300_001, T0 + 10 * 365 * 86_400_000]) {
			expect(errorCode(await send(store, syncBody({ seq, addresses: [{ index: 1, address: ADDR(1) }] })))).toBe("SEQ_OUT_OF_RANGE");
		}
		expect(store.pool.size).toBe(0);
		expect(store.bridge).toBeNull();
		expect(errorCode(await send(store, syncBody({ seq: T0 + 300_000 })))).toBe("ok");
		expect(errorCode(await send(store, syncBody({ seq: T0 + 1000 - 300_000 }), { now: T0 + 1000 }))).toBe("ok");
	});

	it("[T04][T13] the pairing path applies it too, and a refused pairing doesn't burn the code", async () => {
		const store = new MemoryStore();
		const { code, state } = await newPairingCode(T0);
		store.pairing = state;
		const out = await send(store, syncBody({ seq: T0 + 300_001, pair: { code, publicKey: PUBLIC_KEYS.test1 } }));
		expect(errorCode(out)).toBe("SEQ_OUT_OF_RANGE");
		expect(store.publicKey).toBeNull();
		expect(store.pairing?.used).toBe(false);
		expect(errorCode(await send(store, syncBody({ seq: T0 + 300_000, pair: { code, publicKey: PUBLIC_KEYS.test1 } })))).toBe("ok");
	});
});
