// The pairing's pool drop (spec change 45) against a minimal fake pool: mark each free row "dropped" with a guarded
// updateIf, then delete the marked rows. updateIf doesn't change a row's revision, so a compareAndDelete on a revision
// read earlier would still delete a row a checkout claimed in between; the status guard can't.
import { expect, it } from "vitest";

import { CtxSyncStore } from "../../src/store";

type Row = { addrIndex: number; address: string; status: string; keyId?: string; invoiceId?: string };

function fakeCtx(rows: Row[], beforeUpdate?: (id: string, pool: Map<string, Row>) => void) {
	const pool = new Map<string, Row>(rows.map((r) => [String(r.addrIndex), { ...r }]));
	const matches = (row: Row, where?: { status?: string | { in: string[] } }) =>
		!where?.status || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status));
	const ctx = {
		storage: {
			pool: {
				async query({ where, limit }: { where?: { status?: string | { in: string[] } }; limit: number }) {
					const items = [...pool.entries()].filter(([, r]) => matches(r, where)).slice(0, limit).map(([id, data]) => ({ id, data: { ...data } }));
					return { items, hasMore: false };
				},
				async updateIf(id: string, { where, set }: { where: { status: string }; set: Partial<Row> }) {
					beforeUpdate?.(id, pool);
					const row = pool.get(id);
					if (!row || !matches(row, where)) return { applied: false };
					Object.assign(row, set);
					return { applied: true, data: { ...row } };
				},
				async deleteMany(ids: string[]) {
					let n = 0;
					for (const id of ids) if (pool.delete(id)) n++;
					return n;
				},
			},
		},
	};
	return { ctx, pool };
}

const row = (i: number, status: string, over: Partial<Row> = {}): Row => ({ addrIndex: i, address: `addr${i}`, status, ...over });

it("[T03][R08] drops free and leftover dropped rows, keeps claimed ones", async () => {
	const f = fakeCtx([row(1, "claimed", { invoiceId: "inv_1" }), row(2, "free"), row(3, "dropped"), row(4, "free")]);
	await new CtxSyncStore(f.ctx as never).poolDropUnused();
	expect([...f.pool.keys()]).toEqual(["1"]);
	expect(f.pool.get("1")).toMatchObject({ status: "claimed", invoiceId: "inv_1" });
});

it("[T03][R08] a checkout that claims a row while the drop runs keeps that row", async () => {
	// Row 2 is read as free, then a checkout claims it before the drop's guarded update reaches it.
	const f = fakeCtx([row(1, "free"), row(2, "free"), row(3, "free")], (id, pool) => {
		const r = pool.get(id);
		if (id === "2" && r?.status === "free") Object.assign(r, { status: "claimed", invoiceId: "inv_race" });
	});
	await new CtxSyncStore(f.ctx as never).poolDropUnused();
	expect([...f.pool.keys()]).toEqual(["2"]);
	expect(f.pool.get("2")).toMatchObject({ status: "claimed", invoiceId: "inv_race" });
});

it("[T03][R08] an empty pool, or one with only claimed rows, needs one query and changes nothing", async () => {
	const f = fakeCtx([row(7, "claimed", { invoiceId: "inv_7" })]);
	await new CtxSyncStore(f.ctx as never).poolDropUnused();
	expect(f.pool.get("7")).toMatchObject({ status: "claimed" });
});
