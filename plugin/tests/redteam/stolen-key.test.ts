// Phase 07b pass 1, round 1 (black box): plan group D, an attacker holding the bridge's signing key (the paired RFC 8032
// test key, which h.sync signs with). The spec's stated worst case is free goods / a fake tip shown received, not lost
// funds. Only the D1-D6 checks in docs/redteam-plan.md are run here, each with its stated break condition, and nothing
// beyond them (Wyatt, 2026-10-26). An attack whose result is wider than the stated limit is committed as it.fails and
// filed; a check that confirms the stated limit holds is a normal passing test that records exactly what it fulfils.
import { afterEach, describe, expect, it } from "vitest";

import { H0, type RedteamHost, type Reply, redteamHost } from "./harness";
import { TAGS, fakeAddress } from "../addresses";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const ok = (r: Reply) => data(r)?.ok === true;
const tr = (amount: string, confirmations: number, o: B = {}) => ({ txid: "ab".repeat(32), amount, confirmations, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...o });
const byId = async (r: RedteamHost, id: string) => (await r.invoices()).find((i) => i.id === id) as B;

/** One open tip on a paired site, with a free pool to claim from. */
async function openTip(o: Parameters<typeof redteamHost>[0] = { pool: 6 }) {
	h = await redteamHost(o);
	for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
	const token = data(await h.checkout({ kind: "tip" }))!.token as string;
	const inv = (await h.invoices()).find((i) => i.token === token)!;
	return { h, inv };
}

describe("D1: forge a settled tip (the stated limit)", () => {
	it("[T03] D1: a forged snapshot settles an open tip; record what settling a tip fulfils", async () => {
		const { h, inv } = await openTip();
		expect(inv.status).toBe("new");
		const r = await h.sync({ height: H0 + 5, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] });
		expect(ok(r)).toBe(true);
		const after = await byId(h, inv.id);
		expect(after.status).toBe("settled");
		// What a settled tip fulfils: nothing ships. It records a received amount and counts toward the admin-only
		// per-entry total (D6). There is no order, no download, no email sent. That is the stated worst case for tips.
		expect(after.transfers).toHaveLength(1);
		expect(after.settledAt).toBeGreaterThan(0);
	});
});

describe("D2: push attacker-controlled pool addresses", () => {
	// Break (beyond the stated limit): a forged sync makes NEW tipper payments go to an attacker address, which the
	// "controls the pay page" caveat doesn't already cover. If so, the report's "free goods / fake tip" wording is
	// incomplete. RT-08 records it. A duplicate/reused index corrupting the pool would be its own finding (D2b).
	// Spec change 46 (D3): a new row waits 45 s before hand-out, and the honest wallet host checks every free row in that
	// time. These two replace the it.fails: prevention while the honest host runs, and the limit while it's stopped.
	it("[T03][P02] [RT-08] D2: an address a forged sync adds to the pool is never handed to a tipper to pay, while the honest wallet host runs", async () => {
		h = await redteamHost({ pool: 1 });
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		const attacker = fakeAddress(TAGS.stagenet[1], 2, "ATTACKER");
		await h.sync({ height: H0 + 2, addresses: [{ index: 2, address: attacker }] });
		// Drain the one honest address; the next tipper isn't handed index 2 within the wait.
		await h.checkout({ kind: "tip" });
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		// The honest wallet host's next sync (12-15 s later) reports it; after the wait it's still never handed out.
		await h.sync({ checks: { pool: { state: "mismatch", bad: [2] } } });
		await h.agePool();
		const later = data(await h.checkout({ kind: "tip" }));
		expect(later?.address, "a tipper was handed the attacker's address").not.toBe(attacker);
	});

	it("[T03] [RT-08] D2, what's left (spec change 44's wording): with the honest wallet host stopped, nothing reports, and after 45 s the forged row is handed out", async () => {
		h = await redteamHost({ pool: 0 });
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		const attacker = fakeAddress(TAGS.stagenet[1], 2, "ATTACKER");
		await h.sync({ height: H0 + 2, addresses: [{ index: 2, address: attacker }] });
		await h.agePool();
		expect(data(await h.checkout({ kind: "tip" }))?.address).toBe(attacker);
	});

	it("[T03][P02] D2b: a forged address reusing a claimed index never overwrites that row; no two invoices share an address", async () => {
		const { h, inv } = await openTip({ pool: 2 });
		const honest = inv.subaddress as string;
		const evil = fakeAddress(TAGS.stagenet[1], 999, "EVIL");
		// Reuse the claimed index with a different address.
		await h.sync({ height: H0 + 3, addresses: [{ index: inv.addrIndex, address: evil }] });
		const claimed = (await h.pool()).find((p) => p.addrIndex === inv.addrIndex)!;
		expect(claimed.address, "the claimed row's address was overwritten").toBe(honest);
		expect(claimed.invoiceId).toBe(inv.id);
		expect((await byId(h, inv.id)).subaddress).toBe(honest);
		// P02 holds at the invoice level: the unique subaddress index means no two invoices ever share an address,
		// whatever the pool holds (see RT-09 for the pool row itself).
		const invs = await h.invoices();
		expect(new Set(invs.map((i) => i.subaddress)).size).toBe(invs.length);
	});

	it.fails("[P02] [RT-09] D2b: a forged sync can't add a pool address that duplicates one already held", async () => {
		const { h, inv } = await openTip({ pool: 2 });
		const honest = inv.subaddress as string;
		// Claim a fresh free index with the address already in use at inv.addrIndex.
		await h.sync({ height: H0 + 3, addresses: [{ index: 50, address: honest }] });
		const withHonest = (await h.pool()).filter((p) => p.address === honest);
		expect(withHonest, "the pool holds the same address on two rows").toHaveLength(1);
	});
});

describe("D3: review-queue and state abuse", () => {
	it("[T03][T12] D3: dropping a settled tip's transfers moves it to review (reversed), a real lifecycle state, with no miscount", async () => {
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 5, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] });
		expect((await byId(h, inv.id)).status).toBe("settled");
		await h.sync({ height: H0 + 6, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		const after = await byId(h, inv.id);
		expect(after.status).toBe("review");
		expect(after.reviewReason).toBe("reversed");
		// Counting is honest: a reversed tip has no counted amount, so it must not count toward a total (D6/T30).
		expect((after.transfers ?? []).length).toBe(0);
	});

	it("[T03] D3: re-opening an expired tip needs a payment the snapshot claims was made in time; it can't reach a forbidden state", async () => {
		const { h, inv } = await openTip();
		// Expire it: a sync from after the deadline with nothing paid.
		await h.host.fixtures.plugin.storage("invoices", inv.id, { ...inv, expiresAt: Date.now() - 3_600_000 });
		await h.sync({ height: H0 + (inv.expiresHeight - H0) + 10, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		expect((await byId(h, inv.id)).status).toBe("expired");
		// A forged snapshot claiming a payment mined in time reopens it (the stated free-goods limit). Tips never go to
		// review as late (spec change 33). The only states reachable are the lifecycle's own.
		await h.sync({ height: H0 + 100, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10, { height: inv.expiresHeight - 1 })] }] });
		const after = await byId(h, inv.id);
		expect(["settled", "confirming", "seen", "expired"]).toContain(after.status);
		expect(after.status).not.toBe("review");
	});
});

describe("D4: watch-list manipulation", () => {
	it("[T03] D4: huge and far-apart indexes in a forged sync don't crash, scan unbounded, or lose a real invoice", async () => {
		const { h, inv } = await openTip();
		const far = [inv.addrIndex, 2 ** 31, 2 ** 31 + 1, 1_000_000, 4_294_967_295];
		const r = await h.sync({ height: H0 + 5, snapshots: far.map((index) => ({ index, transfers: index === inv.addrIndex ? [tr("500000000", 10)] : [] })) });
		expect(r.status).toBeLessThan(500);
		// The real invoice is still tracked and settles from its own index.
		expect((await byId(h, inv.id)).status).toBe("settled");
		// A second sync still answers with a bounded watch list.
		const again = await h.sync({ height: H0 + 6, snapshots: [] });
		expect(ok(again)).toBe(true);
		expect(Array.isArray(data(again)?.watch)).toBe(true);
	});
});

describe("D5: a forged sync can't change an invoice's terms", () => {
	it("[T07] D5: a forged snapshot never lowers required or changes the expected amount or currency", async () => {
		const { h, inv } = await openTip();
		const was = { required: inv.required, expectedAtomic: inv.expectedAtomic, minAtomic: inv.minAtomic, fiat: inv.fiat ?? null, rate: inv.rate ?? null };
		// Snapshots carry only transfers; try to smuggle terms in anyway, at the snapshot and the transfer.
		await h.sync({
			height: H0 + 5, required: 0, expectedAtomic: "1", minAtomic: "1", fiat: { amountMinor: "1", currency: "EUR" }, rate: { minor: "1" },
			snapshots: [{ index: inv.addrIndex, required: 0, expectedAtomic: "1", minAtomic: "1", transfers: [tr("1", 0, { required: 0, expectedAtomic: "1" })] }],
		} as B);
		const after = await byId(h, inv.id);
		expect({ required: after.required, expectedAtomic: after.expectedAtomic, minAtomic: after.minAtomic, fiat: after.fiat ?? null, rate: after.rate ?? null }).toEqual(was);
	});
});

describe("D6: inflate a per-entry tip total with forged settled tips", () => {
	it("[T31][T03] D6: forged settling can only inflate a total through tips that already exist, by the amounts in the snapshot; record the reach", async () => {
		h = await redteamHost({ pool: 6 });
		await h.host.fixtures.plugin.kv("state:setupDone", true);
		await h.host.fixtures.collection({ slug: "posts", label: "Posts", fields: [{ slug: "title", label: "Title", type: "string" }] } as never);
		await h.host.fixtures.content("posts", { slug: "hello", status: "published", data: { title: "Hello" } } as never);
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		const id = ((await h.host.inspect.content.list("posts")) as B[]).find((e) => e.slug === "hello")!.id as string;
		// Three real tips tied to the entry (the attacker can only settle invoices that exist).
		const invs: B[] = [];
		for (let i = 0; i < 3; i++) {
			const token = data(await h.checkout({ kind: "tip", contentRef: { collection: "posts", id } }))!.token as string;
			invs.push((await h.invoices()).find((x) => x.token === token)!);
		}
		// Forge a large settled amount on each.
		await h.sync({ height: H0 + 5, snapshots: invs.map((inv) => ({ index: inv.addrIndex, transfers: [tr("9000000000000", 10)] })) });
		for (const inv of invs) expect((await byId(h, inv.id)).status).toBe("settled");
		// The admin-only per-entry total now reads the forged sum. The reach is exactly: (open tips for the entry) x
		// (amount the attacker writes). It can't invent tips for an entry nobody tipped, nor touch another entry's total.
		const page = JSON.stringify((await h.host.admin.loadPage("/payments")).blocks);
		expect(page).toContain("27"); // 3 x 9 XMR = 27 XMR, the forged total
		// A forged settled tip for a nonexistent entry has no invoice to settle: nothing to inflate there.
		const before = await h.invoices();
		await h.sync({ height: H0 + 6, snapshots: [{ index: 9999, transfers: [tr("9000000000000", 10)] }] });
		expect((await h.invoices()).length).toBe(before.length);
	});
});
