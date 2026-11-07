// Spec change 48 on the plugin (RT-33, RT-34; Wyatt, 2026-11-06): a settled invoice is judged on the floor it settled
// under, a healed height stops the floor rising, and the ignored-payment line uses the same floor as totals.
import { afterEach, describe, expect, it } from "vitest";

import { type Invoice, type Transfer, evaluate, floorHeight, ignoredOld, newInvoice, totals } from "../../src/core/invoice";
import { isWatched } from "../../src/core/watch";
import { type RedteamHost, redteamHost } from "./harness";

const HOUR = 3_600_000;
const T0 = 1_794_000_000_000;
const AMOUNT = "500000000";
let txn = 0;

const tipAt = (createdHeight: number, now = T0): Invoice =>
	newInvoice({ id: "inv_test", token: "tok", kind: "tip", fiatMinor: null, xmrAtomic: BigInt(AMOUNT), currency: "USD", rate: null, speed: "standard", subaddress: "7test", addrIndex: 1, network: "stagenet", now, chainHeight: createdHeight });

const mined = (height: number, siteHeight: number, over: Partial<Transfer> = {}): Transfer => ({
	txid: (++txn).toString(16).padStart(64, "0"),
	amountAtomic: AMOUNT,
	height,
	confirmations: Math.max(0, siteHeight - height + 1),
	unlockTime: "0",
	doubleSpendSeen: false,
	timestamp: 1_790_000_000,
	seenAt: T0,
	poolTs: null,
	...over,
});

/** One sync's evaluation: the transfers at their depth for this height, then evaluate. */
function at(inv: Invoice, height: number, now: number) {
	const transfers = inv.transfers.map((t) => (t.height > 0 ? { ...t, confirmations: Math.max(0, height - t.height + 1) } : t));
	return evaluate({ ...inv, transfers, seq: now }, { now, chainHeight: height });
}

describe("RT-34: a settled invoice keeps the floor it settled under", () => {
	it("[R10][T14] [RT-34] the in-memory shape: inflated tip, honest payment, settled through 2,245,119 and on, no alert, then it leaves the watch list", () => {
		let inv = tipAt(3_245_086);
		inv.transfers = [mined(2_245_088, 2_245_090)];
		const first = at(inv, 2_245_090, T0 + HOUR);
		expect(first.invoice.status).toBe("settled");
		inv = first.invoice;
		const settledFloor = inv.settledFloor;
		expect(settledFloor).toBeLessThanOrEqual(2_245_088);
		for (let h = 2_245_091; h <= 2_245_400; h++) {
			const r = at(inv, h, T0 + HOUR + (h - 2_245_090) * 120_000);
			expect(r.invoice.status, `height ${h}`).toBe("settled");
			expect(r.events.filter((e) => e.type === "alert"), `height ${h}`).toEqual([]);
			expect(r.invoice.settledFloor, `height ${h}`).toBe(settledFloor);
			inv = r.invoice;
		}
		expect(isWatched(inv, T0 + 2 * HOUR)).toBe(false);
	});

	it("[R10] [RT-34] a real double-spend after settling still reverses, with the alert", () => {
		let inv = tipAt(3_245_086);
		inv.transfers = [mined(2_245_088, 2_245_090)];
		inv = at(inv, 2_245_090, T0 + HOUR).invoice;
		inv.transfers = inv.transfers.map((t) => ({ ...t, doubleSpendSeen: true }));
		const r = at(inv, 2_245_092, T0 + HOUR + 240_000);
		expect(r.invoice.status).toBe("review");
		expect(r.invoice.reviewReason).toBe("reversed");
		expect(r.events).toContainEqual({ type: "alert", kind: "reversed" });
	});

	it("[R10] [RT-34] every path into settled stores the floor: from open, and reopened from expired", () => {
		const open = tipAt(2_245_000);
		open.transfers = [mined(2_245_001, 2_245_010)];
		const a = at(open, 2_245_010, T0 + 60_000).invoice;
		expect(a.status).toBe("settled");
		expect(a.settledFloor).toBe(2_245_000 - 30);

		const gone = tipAt(2_245_000);
		const expired = at({ ...gone, seq: gone.expiresAt + 1 }, 2_245_020, gone.expiresAt + 2).invoice;
		expect(expired.status).toBe("expired");
		expired.transfers = [mined(2_245_021, 2_245_040)];
		const b = at(expired, 2_245_040, expired.expiresAt + 3_000).invoice;
		expect(b.status).toBe("settled");
		expect(b.reopened).toBe(true);
		expect(b.settledFloor).toBe(2_245_000 - 30);
	});
});

describe("RT-34: a healed height stops the floor rising", () => {
	it("[T14][P02] [RT-34] an inflated open tip whose first report comes 200 blocks after the heal still settles", () => {
		const inv = tipAt(3_245_086);
		inv.transfers = [mined(2_245_006, 2_245_206)];
		const r = at(inv, 2_245_206, T0 + 7 * HOUR);
		expect(r.invoice.status).toBe("settled");
	});

	it("[T14][P02] [RT-34] a payment mined 500 blocks before the heal is credited, not left below the floor for good", () => {
		const inv = tipAt(3_245_086);
		inv.transfers = [mined(2_245_000 - 500, 2_245_000)];
		const r = at(inv, 2_245_000, T0 + 20 * HOUR);
		expect(r.invoice.status).toBe("settled");
		expect(ignoredOld(r.invoice, 2_245_000)).toEqual([]);
	});

	it("[P02][T14] [RT-34] a payment older than the estimate stays ignored, and the pin never rises", () => {
		let inv = tipAt(3_245_086);
		// 20 hours is 600 expected blocks, so the pin is 2,245,000 - 30 - 1,200.
		inv.transfers = [mined(2_245_000 - 2_000, 2_245_000)];
		const pin = 2_245_000 - 30 - 1_200;
		inv = at(inv, 2_245_000, T0 + 20 * HOUR).invoice;
		expect(inv.floorPin).toBe(pin);
		expect(inv.status).toBe("expired");
		expect(ignoredOld(inv, 2_245_000)).toHaveLength(1);
		inv = at(inv, 2_247_000, T0 + 60 * HOUR).invoice;
		expect(inv.floorPin).toBe(pin);
		expect(floorHeight(inv, 2_247_000)).toBe(pin);
	});

	it("[T14] [RT-34] a re-pair to a node a few blocks behind pins an honest open tip just below its normal floor (recorded, spec change 48), and an honest payment counts", () => {
		let inv = tipAt(2_245_100);
		inv = at(inv, 2_245_097, T0 + 240_000).invoice;
		expect(inv.floorPin).toBeLessThan(2_245_100 - 30);
		expect(inv.floorPin).toBeGreaterThan(2_245_100 - 45);
		inv.transfers = [mined(2_245_098, 2_245_110)];
		expect(at(inv, 2_245_110, T0 + 600_000).invoice.status).toBe("settled");
	});

	it("[P02] [RT-34] an honest tip with no heal gets no pin, and its floor is as before", () => {
		const inv = at(tipAt(2_245_100), 2_245_200, T0 + 600_000).invoice;
		expect(inv.floorPin).toBeUndefined();
		expect(floorHeight(inv, 2_245_200)).toBe(2_245_100 - 30);
	});
});

describe("RT-33: a tip settled before the floor existed", () => {
	const preFloor = (): Invoice => {
		const inv = tipAt(2_242_155, T0);
		inv.status = "settled";
		inv.settledAt = T0;
		inv.finalAt = T0;
		const h = 2_242_160;
		inv.transfers = [mined(2_240_100, h), mined(2_230_165, h), mined(2_230_085, h)];
		return inv;
	};
	it("[R10][T14] [RT-33] stays settled with no alert, leaves the watch list, and stores no floor", () => {
		const r = at(preFloor(), 2_244_000, T0 + 6 * HOUR);
		expect(r.invoice.status).toBe("settled");
		expect(r.events.filter((e) => e.type === "alert")).toEqual([]);
		expect(r.invoice.settledFloor).toBeUndefined();
		expect(isWatched(r.invoice, T0 + 6 * HOUR)).toBe(false);
	});
	it("[R10][P02] [RT-33] its old payments still show on the ignored line: spec change 47's answer 1(a), the one fallback", () => {
		expect(ignoredOld(preFloor(), 2_244_000)).toHaveLength(3);
	});
});

describe("the ignored line and totals use the same floor (Wyatt, spec change 48)", () => {
	it("[P02] [RT-34] nothing counted in totals ever appears on the ignored line, at any height, inflated or honest", () => {
		for (const created of [2_245_000, 3_245_086]) {
			for (const offset of [-3_000, -500, -31, -30, 0, 2, 40]) {
				let inv = tipAt(created);
				const heal = 2_245_000;
				inv.transfers = [mined(heal + offset, heal)];
				for (const h of [heal, heal + 28, heal + 31, heal + 32, heal + 100, heal + 5_000]) {
					inv = at(inv, h, T0 + 20 * HOUR + (h - heal) * 120_000).invoice;
					const ignored = ignoredOld(inv, h);
					const counted = totals(inv, h);
					const label = `created ${created}, offset ${offset}, height ${h}`;
					expect(BigInt(counted.received) + BigInt(ignored.length) * BigInt(AMOUNT), label).toBe(BigInt(AMOUNT));
				}
			}
		}
	});
});

describe("the new fields stay private", () => {
	let h: RedteamHost | undefined;
	afterEach(async () => {
		await h?.host.dispose();
		h = undefined;
	});
	it("[T14] [RT-34] neither floor field reaches the public status route", async () => {
		h = await redteamHost({ pool: 6 });
		for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
		const token = ((await h.checkout({ kind: "tip" })).json as { data: { token: string } }).data.token;
		const inv = (await h.invoices()).find((i) => i.token === token)!;
		await h.host.fixtures.plugin.storage("invoices", inv.id, { ...inv, settledFloor: 1, floorPin: 2 });
		const text = JSON.stringify((await h.status(token)).json);
		expect(text).not.toContain("settledFloor");
		expect(text).not.toContain("floorPin");
	});
});
