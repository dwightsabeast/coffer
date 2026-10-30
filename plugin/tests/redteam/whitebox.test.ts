// Phase 07b pass 1, round 2, Step 2 (white box): attacks found by reading plugin/src, beyond round 1's black box.
// Each one that lands is committed as it.fails with its RT id; a test that records how the code behaves today (evidence
// for a finding filed elsewhere) is a normal passing test and says so.
import { afterEach, describe, expect, it } from "vitest";

import { H0, type RedteamHost, type Reply, redteamHost } from "./harness";
import { PUBLIC_KEYS } from "../sync/helpers";
import { RESTORE_MARGIN_BLOCKS } from "../../src/core/constants";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const ok = (r: Reply) => data(r)?.ok === true;
const tr = (amount: string, confirmations: number, o: B = {}) => ({ txid: "cd".repeat(32), amount, confirmations, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...o });
const byId = async (r: RedteamHost, id: string) => (await r.invoices()).find((i) => i.id === id) as B;
const YEAR_MS = 365 * 86_400_000;

/** One open tip on a paired site (test1), with a free pool to claim from. */
async function openTip(o: Parameters<typeof redteamHost>[0] = { pool: 6 }) {
	h = await redteamHost(o);
	for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
	const token = data(await h.checkout({ kind: "tip" }))!.token as string;
	const inv = (await h.invoices()).find((i) => i.token === token)!;
	return { h, inv };
}

describe("Far-future seq (C2's untried case; Wyatt: defense in depth, a bridge bug could do it without an attacker)", () => {
	// seq is the bridge's clock in ms (bridgeloop.go nextSeq) and x-xmr-ts the same clock in seconds, but the plugin checks
	// only that seq is a positive safe integer (protocol.ts) and newer than the invoice's (merge.ts). One snapshot with a
	// seq years ahead makes every later honest snapshot for that invoice "not newer", so it is ignored.
	it.fails("[T04] [RT-24] a snapshot whose seq is years ahead of its signed timestamp doesn't stop honest snapshots applying", async () => {
		const { h, inv } = await openTip();
		await h.sync({ seq: Date.now() + 10 * YEAR_MS, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		// The real payment, reported honestly with the bridge's real clock.
		expect(ok(await h.sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] }))).toBe(true);
		expect((await byId(h, inv.id)).status).toBe("settled");
	});

	it.fails("[T04] [RT-24] an untouched expired tip isn't dropped from the watch by one far-future seq", async () => {
		const { h, inv } = await openTip();
		await h.host.fixtures.plugin.storage("invoices", inv.id, { ...inv, expiresAt: Date.now() - 3_600_000 });
		await h.sync({ height: H0 + 2, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		expect((await byId(h, inv.id)).status).toBe("expired");
		expect(data(await h.sync({ height: H0 + 3 }))?.watch).toContain(inv.addrIndex); // inside its 24-hour late window
		await h.sync({ seq: Date.now() + 10 * YEAR_MS, height: H0 + 4, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		expect(data(await h.sync({ height: H0 + 5 }))?.watch).toContain(inv.addrIndex);
	});
});

describe("E4, plugin side: a reported chain height sticks (evidence for Step 3's dishonest-node question)", () => {
	// handle.ts keeps max(stored, reported) (spec change 16) and checks the reported height only as a safe integer
	// (protocol.ts). These pass: they record what one high report does, for the bridge-side finding.
	const HIGH = H0 + 1_000_000;

	it("[T14][R09] one high height is kept; later honest heights don't lower it", async () => {
		const { h } = await openTip();
		expect(ok(await h.sync({ height: HIGH }))).toBe(true);
		expect(ok(await h.sync({ height: H0 + 6 }))).toBe(true);
		expect((await h.host.inspect.kv.get<B>("state:bridge"))?.height).toBe(HIGH);
	});

	it("[T14][R09] invoices made afterwards take the high height as their created and expiry heights", async () => {
		const { h } = await openTip();
		await h.sync({ height: HIGH });
		const token = data(await h.checkout({ kind: "tip" }))!.token as string;
		const inv = (await h.invoices()).find((i) => i.token === token)!;
		expect(inv.createdHeight).toBe(HIGH);
		expect(inv.expiresHeight).toBeGreaterThan(HIGH);
	});

	it("[T14][R09] a new wallet host's suggested restore height then lies in the future, so its wallet would skip real payments", async () => {
		h = await redteamHost({ pool: 6 });
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		await h.sync({ height: HIGH });
		expect(data(await h.checkout({ kind: "tip" }))?.token).toBeTruthy(); // one watched invoice, made at the high height
		const blocks = (await h.host.admin.act("/payments", "connect_wallet_host")).blocks as B[];
		const cmd = blocks.find((b) => b.type === "code" && String(b.code).includes("/install.sh"))?.code as string;
		const pairCode = cmd.match(/--pair ([A-Za-z0-9_-]{22})$/)![1];
		const r = await h.sync({ height: 0, addresses: [], snapshots: [], pair: { code: pairCode, publicKey: PUBLIC_KEYS.test2 } }, { key: "test2" });
		expect(ok(r)).toBe(true);
		expect(data(r)?.restoreHeight).toBe(HIGH - RESTORE_MARGIN_BLOCKS);
	});
});

describe("J4: a payment that vanishes before settlement (R10)", () => {
	// spec.md: "reversed" is for a settled invoice whose payment falls below the threshold. Before settling, the state
	// machine draws no way back, and the code recomputes the status from the transfers it is given. This records what
	// that does: the invoice goes back to new, never settles, raises no alert, and expires normally.
	it("[R10][T12] J4: a confirming tip whose payment vanishes goes back to new, never settles, alerts no one", async () => {
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 2, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 0, { height: 0 })] }] });
		expect((await byId(h, inv.id)).status).toBe("confirming");
		const r = await h.sync({ height: H0 + 3, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		expect(ok(r)).toBe(true);
		const after = await byId(h, inv.id);
		expect(after.status).toBe("new");
		expect(after.reviewReason).toBeUndefined();
		expect(after.settledAt).toBeUndefined();
		// At its deadline, with a sync from after it and nothing paid, it expires like any unpaid tip.
		await h.host.fixtures.plugin.storage("invoices", inv.id, { ...after, expiresAt: Date.now() - 1000 });
		await h.sync({ seq: Date.now(), height: H0 + 4, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
		expect((await byId(h, inv.id)).status).toBe("expired");
	});
});

describe("J3: an admin decision and a sync on the same invoice at once (R05, T07)", () => {
	// admin.ts and handle.ts each read the invoice, change it and write it whole, with no version check. Run both at once,
	// many times, and check the stored result is one the admin was told about: a success toast for "expire" must leave
	// the invoice decided by the admin (adminFinal), never silently overwritten by the sync's settle. On 2026-10-30 every
	// round in the test host, with either request started first (42 rounds), ended with the admin's decision kept. The
	// Node runner does interleave requests where they wait on storage (RT-07's live race), so this guards the outcome; it
	// doesn't prove the interleaving can't happen there.
	it("[R05][T07] J3: when the admin's expire succeeds, the sync racing it never silently undoes it", async () => {
		const outcomes: string[] = [];
		for (let round = 0; round < 12; round++) {
			const { h, inv } = await openTip();
			const [toast] = await Promise.all([
				h.host.admin.act("/payments", "invoice_action", { value: `expire:${inv.id}` }).then((r) => (r as B).toast?.type as string),
				h.sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] }),
			]);
			const after = await byId(h, inv.id);
			outcomes.push(`${toast}:${after.status}:${after.adminFinal === true}`);
			if (toast === "success") expect(after.adminFinal, outcomes.join(" ")).toBe(true);
			await h.host.dispose();
		}
	});
});

describe("I3: when the 30-day purge clock starts (P04)", () => {
	// P04: buyer data goes 30 days after the invoice is "settled, expired or decided". finalAt is set when an invoice
	// first leaves the open states, which includes entering review, and an admin decision keeps it (admin.ts `??=`), so
	// a review the admin hasn't decided loses its buyer data 30 days after it began. In release 1 that is a tip's note;
	// with products, an underpaid order's refund address.
	it.fails("[P04] [RT-25] I3: an invoice still waiting in review keeps its buyer data past 30 days until the admin decides", async () => {
		const { h, inv } = await openTip();
		const DAY = 86_400_000;
		const old = Date.now() - 31 * DAY;
		await h.host.fixtures.plugin.storage("invoices", inv.id, {
			...inv, status: "review", reviewReason: "reversed", finalAt: old, expiresAt: old, settledAt: old - 1000, buyer: { note: "please refund" },
			transfers: [{ ...tr("500000000", 2), seenAt: old - 2000, poolTs: null }],
		});
		await (h.host as any).transport.invokeHook("cron", { name: "housekeeping", scheduledAt: new Date().toISOString() });
		const after = await byId(h, inv.id);
		expect(after.status).toBe("review");
		expect(after.buyer?.note).toBe("please refund");
	});
});
