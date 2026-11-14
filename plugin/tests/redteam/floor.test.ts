// Spec change 47 on the plugin (RT-31 and RT-26's site side; Wyatt's D4-D7, 2026-11-02, and answers 1-2):
// - the floor: a confirmed transfer mined below min(createdHeight, the site's height) - 30 doesn't count toward an
//   invoice's sums or settlement; an unconfirmed one does; the paid-top behind the gap warning still sees it; the admin
//   page says so, with the amount, never the buyer;
// - a pairing whose request carries a height (the bridge sends only a bounded one) resets the site's height to it, and
//   a pairing with none keeps it; between pairings the height never goes down;
// - the restore height a pairing suggests uses the healed height;
// - checkout refuses while the site has no height (tips too): an invoice created then would have no floor for good.
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
let txn = 0;
/** A transfer of `amount` atomic units mined at `height` (0: unmined), with a fresh txid. */
const tr = (amount: string, height: number, confirmations = 12) => ({
	txid: (++txn).toString(16).padStart(64, "0"),
	amount,
	confirmations: height === 0 ? 0 : confirmations,
	height,
	timestamp: 1_790_000_000,
	doubleSpendSeen: false,
	unlockTime: "0",
});
const byId = async (r: RedteamHost, id: string) => (await r.invoices()).find((i) => i.id === id) as B;
const bridgeHeight = async (r: RedteamHost) => (await r.host.inspect.kv.get<B>("state:bridge"))?.height as number;
const page = async (r: RedteamHost) => JSON.stringify((await r.host.admin.loadPage("/payments")).blocks);

/** One open tip on a paired site (test1) whose height is `height`, with a free pool. */
async function openTip(height = H0) {
	h = await redteamHost({ pool: 6 });
	for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
	// The site's stored height, as if its bridge had last reported it (a fixture: a sync can't lower it).
	if (height !== H0) await h.host.fixtures.plugin.kv("state:bridge", { height, lastSyncAt: Date.now() - 30_000, version: 1, outdated: false });
	const token = data(await h.checkout({ kind: "tip" }))!.token as string;
	const inv = (await h.invoices()).find((i) => i.token === token)!;
	return { h, inv, token };
}

/** Re-pair the same wallet with key test2, the pairing request carrying `height`, then answer the probe as wallet 0. */
async function repair(r: RedteamHost, height: number) {
	const blocks = (await r.host.admin.act("/payments", "connect_wallet_host")).blocks as B[];
	const cmd = blocks.find((b) => b.type === "code" && String(b.code).includes("/install.sh"))?.code as string;
	const code = cmd.match(/--pair ([A-Za-z0-9_-]{22})$/)![1];
	const paired = await r.sync({ height, addresses: [], snapshots: [], pair: { code, publicKey: PUBLIC_KEYS.test2 } }, { key: "test2" });
	expect(ok(paired)).toBe(true);
	return paired;
}
const answer = (r: RedteamHost, height: number, body: B = {}) => r.sync({ height, wallet: { match: 0, receivedTop: 0 }, ...body }, { key: "test2" });

describe("RT-31: payments older than the invoice don't count (spec change 47, D5 30 blocks)", () => {
	it("[P02][T14] [RT-31] 46's live step 6: three transfers mined before the tip leave it new; status shows nothing; the admin page says they were ignored", async () => {
		const { h, inv, token } = await openTip(2_242_155);
		expect(inv.createdHeight).toBe(2_242_155);
		const old = [tr("1000000000", 2_240_100, 2055), tr("1000000000", 2_230_165, 11_990), tr("1000000000", 2_230_085, 12_070)];
		expect(ok(await h.sync({ height: 2_242_160, snapshots: [{ index: inv.addrIndex, transfers: old }] }))).toBe(true);
		expect((await byId(h, inv.id)).status).toBe("new");
		const st = data(await h.status(token))!;
		expect(st.status).toBe("new");
		expect(st.receivedAtomic).toBe("0");
		const p = await page(h);
		expect(p).toContain("Older payments to this address were ignored: 0.003 XMR in 3 transfers, mined at blocks 2,230,085 to 2,240,100, before this tip.");
		// The buyer never sees it.
		expect(JSON.stringify(st)).not.toContain("ignored");
	});

	it("[P02][T14] [RT-31] the margin's edge: mined 30 blocks below createdHeight counts, 31 doesn't", async () => {
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", H0 - 31)] }] });
		expect((await byId(h, inv.id)).status).toBe("new");
		await h.sync({ height: H0 + 13, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", H0 - 31), tr("500000000", H0 - 30)] }] });
		expect((await byId(h, inv.id)).status).toBe("settled");
	});

	it("[P02][T14] [RT-31] an unconfirmed transfer counts as before (it has no height yet)", async () => {
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 1, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 0)] }] });
		expect((await byId(h, inv.id)).status).toBe("confirming");
	});

	it("[P02] the paid-top behind the gap warning still sees an old payment (the wallet app sees it too; D6)", async () => {
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 1, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", H0 - 5000)] }] });
		expect((await byId(h, inv.id)).status).toBe("new");
		expect(await h.host.inspect.kv.get<number>("state:paidTop")).toBe(inv.addrIndex);
	});

	it("[P02][T14] [RT-31] D7: at the edge of D2's tolerance and D5's margin, an honest payment still counts", async () => {
		// The bridge reports up to 10 blocks above the second node (D2), so createdHeight can run 10 above the real chain; a
		// payment mined at the real height is 10 below it, well inside the 30-block margin.
		const { h, inv } = await openTip();
		await h.sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", H0 - 10)] }] });
		expect((await byId(h, inv.id)).status).toBe("settled");
	});
});

describe("RT-26 on the site: a pairing heals the height (spec change 47, D4)", () => {
	it("[T14][R09] [RT-26] a pairing with a bounded height resets the site's height, lower included; one with none keeps it", async () => {
		const { h } = await openTip(H0 + 1_000_000);
		expect(await bridgeHeight(h)).toBe(H0 + 1_000_000);
		await repair(h, H0 + 5);
		expect(await bridgeHeight(h)).toBe(H0 + 5);
		// No height in the pairing request (the bridge couldn't bound one): the site keeps its own.
		h.host.dispose();
		const again = await openTip(H0 + 50);
		await repair(again.h, 0);
		expect(await bridgeHeight(again.h)).toBe(H0 + 50);
	});

	it("[T14][R09] [RT-26] D7: a re-pair with a wallet still scanning doesn't lower the site's height", async () => {
		const { h } = await openTip();
		await repair(h, H0 + 5);
		// The new wallet host's wallet, restored from keys, reports what it has scanned so far.
		expect(ok(await answer(h, 579_994))).toBe(true);
		expect(await bridgeHeight(h)).toBe(H0 + 5);
	});

	it("[T14][R09][P02] [RT-26] D7: an open invoice created under an inflated height counts an honest payment once a pairing has healed the height", async () => {
		const { h, inv } = await openTip(H0 + 1_000_000);
		expect(inv.createdHeight).toBe(H0 + 1_000_000);
		await repair(h, H0 + 5);
		await answer(h, H0 + 5);
		expect(ok(await h.sync({ height: H0 + 18, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", H0 + 6)] }] }, { key: "test2" }))).toBe(true);
		expect((await byId(h, inv.id)).status).toBe("settled");
	});

	it("[T14][R09] [RT-26] the restore height a healing pairing suggests follows the healed height, not the inflated createdHeight", async () => {
		const { h } = await openTip(H0 + 1_000_000);
		const r = await repair(h, H0 + 5);
		expect(data(r)?.restoreHeight).toBe(H0 + 5 - RESTORE_MARGIN_BLOCKS);
	});
});

describe("No height yet: checkout refuses (Wyatt's answer 2, tips too)", () => {
	it("[P02][T14] [RT-31] while the site has no height, a tip checkout refuses WALLET_HOST_SYNCING", async () => {
		h = await redteamHost({ pool: 6 });
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		await h.host.fixtures.plugin.kv("state:bridge", { height: 0, lastSyncAt: Date.now() - 10_000, version: 1, outdated: false });
		expect(data(await h.checkout({ kind: "tip" }))?.error?.code).toBe("WALLET_HOST_SYNCING");
		// Its first height lifts the refusal.
		expect(ok(await h.sync({ height: H0 }))).toBe(true);
		expect(data(await h.checkout({ kind: "tip" }))?.token).toBeTruthy();
	});
});
