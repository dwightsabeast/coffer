// The pool claim loop when the database refuses an invoice (spec change 3: `subaddress` is unique on invoices). Tested
// against a minimal fake context because the runtime test host doesn't apply `uniqueIndexes`; on a real site EmDash
// creates a UNIQUE index on json_extract(data, '$.subaddress'), and the 2f close entry in docs/progress.md shows it refusing a duplicate.
import { expect, it } from "vitest";

import { claimAndStore } from "../../src/checkout";
import type { Invoice } from "../../src/core/invoice";
import { TAGS, fakeAddress, fakeSubaddress } from "../addresses";
import { KEY_IDS, PUBLIC_KEYS } from "../sync/helpers";

const ADDR = (i: number) => fakeSubaddress(i, "B");

/** Paired with test1 and, unless `network` says otherwise, a stored stagenet network for that key (spec change 45). */
function fakeCtx(freeRows: number, takenAddresses: string[], o: { key?: string | null; network?: unknown } = {}) {
	const pool = new Map<string, { addrIndex: number; address: string; status: string; keyId?: string; invoiceId?: string }>();
	for (let i = 1; i <= freeRows; i++) pool.set(String(i), { addrIndex: i, address: ADDR(i), status: "free", keyId: KEY_IDS.test1 });
	const key = o.key === undefined ? PUBLIC_KEYS.test1 : o.key;
	const network = o.network === undefined ? { network: "stagenet", keyId: KEY_IDS.test1 } : o.network;
	const invoices = new Map<string, { subaddress: string }>(takenAddresses.map((a, n) => [`inv_old${n}`, { subaddress: a }]));
	const ctx = {
		settings: { get: async (k: string) => (k === "bridgePublicKey" ? key : null) },
		kv: { get: async (k: string) => (k === "state:network" ? network : null) },
		storage: {
			pool: {
				async query() {
					const items = [...pool.entries()].filter(([, r]) => r.status === "free").sort(([, a], [, b]) => a.addrIndex - b.addrIndex).slice(0, 5).map(([id, data]) => ({ id, data }));
					return { items, hasMore: false };
				},
				async updateIf(id: string, { set }: { set: { status: string; invoiceId?: string } }) {
					const row = pool.get(id);
					if (!row || row.status !== "free") return { applied: false };
					Object.assign(row, set);
					return { applied: true };
				},
			},
			invoices: {
				async put(id: string, inv: { subaddress: string }) {
					if ([...invoices.values()].some((i) => i.subaddress === inv.subaddress)) throw new Error("UNIQUE constraint failed");
					invoices.set(id, inv);
				},
			},
		},
	};
	return { ctx, pool, invoices };
}

const build = (row: { addrIndex: number; address: string; network: string }) => ({ id: `inv_${row.addrIndex}`, subaddress: row.address, addrIndex: row.addrIndex, network: row.network }) as unknown as Invoice;

it("[T05][P02] an address already on an invoice is refused; the row stays claimed and checkout uses another free one", async () => {
	const f = fakeCtx(3, [ADDR(1)]);
	const inv = await claimAndStore(f.ctx as never, build);
	expect(inv).not.toBeNull();
	expect(inv?.subaddress).not.toBe(ADDR(1));
	expect(f.pool.get("1")).toMatchObject({ status: "claimed" }); // never handed out again
	expect(f.pool.get(String(inv?.addrIndex))).toMatchObject({ status: "claimed", invoiceId: inv?.id });
	expect([...f.invoices.values()].filter((i) => i.subaddress === ADDR(1))).toHaveLength(1);
});

it("[T05] NO_ADDRESS_AVAILABLE (null) when every free address is already used", async () => {
	const f = fakeCtx(2, [ADDR(1), ADDR(2)]);
	expect(await claimAndStore(f.ctx as never, build)).toBeNull();
	expect([...f.pool.values()].every((r) => r.status === "claimed")).toBe(true);
});

it("[T20] a row whose network can't be read (only one stored before spec change 36's sync check) is claimed with no invoice and skipped", async () => {
	const f = fakeCtx(2, []);
	(f.pool.get("1") as { address: string }).address = fakeAddress(38, 1); // network byte 38: no network
	const inv = await claimAndStore(f.ctx as never, build);
	expect(inv).toMatchObject({ addrIndex: 2, subaddress: ADDR(2), network: "stagenet" });
	expect(f.pool.get("1")).toEqual({ addrIndex: 1, address: fakeAddress(38, 1), status: "claimed", keyId: KEY_IDS.test1 });
	expect(f.invoices.size).toBe(1);
});

it("[T20][P02] [RT-11] a row on another network than the stored one is claimed with no invoice and skipped", async () => {
	const f = fakeCtx(2, []);
	const mainnet = fakeAddress(TAGS.mainnet[1], 1, "M");
	(f.pool.get("1") as { address: string }).address = mainnet;
	const inv = await claimAndStore(f.ctx as never, build);
	expect(inv).toMatchObject({ addrIndex: 2, network: "stagenet" });
	expect(f.pool.get("1")).toEqual({ addrIndex: 1, address: mainnet, status: "claimed", keyId: KEY_IDS.test1 });
	expect(f.invoices.size).toBe(1);
});

it("[T03][R08] a row from another pairing, or from before key IDs, is claimed with no invoice and skipped", async () => {
	for (const keyId of [KEY_IDS.test2, undefined]) {
		const f = fakeCtx(2, []);
		const row = f.pool.get("1") as { keyId?: string };
		if (keyId === undefined) delete row.keyId;
		else row.keyId = keyId;
		expect(await claimAndStore(f.ctx as never, build), String(keyId)).toMatchObject({ addrIndex: 2 });
		expect(f.pool.get("1")).toMatchObject({ status: "claimed" });
		expect(f.pool.get("1")).not.toHaveProperty("invoiceId");
		expect(f.invoices.size).toBe(1);
	}
});

it("[T20] with no network stored for the paired key, no row is skipped for its network", async () => {
	const f = fakeCtx(1, [], { network: { network: "mainnet", keyId: KEY_IDS.test2 } });
	expect(await claimAndStore(f.ctx as never, build)).toMatchObject({ addrIndex: 1, network: "stagenet" });
});

it("[T03] with no bridge key stored, nothing is handed out", async () => {
	const f = fakeCtx(2, [], { key: null, network: null });
	expect(await claimAndStore(f.ctx as never, build)).toBeNull();
	expect(f.invoices.size).toBe(0);
});
