// Spec change 46 (D3): checkout hands out a free row only once it's 45 s old, so the honest wallet host has checked it
// first; a row it reports as not from its wallet turns "bad" and is never handed out. Through the runtime host.
import { afterEach, describe, expect, it } from "vitest";

import { HANDOUT_WAIT_MS } from "../../src/checkout";
import { TAGS, fakeAddress } from "../addresses";
import { type RedteamHost, type Reply, redteamHost } from "../redteam/harness";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const HONEST = (i: number) => fakeAddress(TAGS.stagenet[1], i, "HONEST");
const THIEF = (i: number) => fakeAddress(TAGS.stagenet[1], i, "THIEF");

describe("the wait before hand-out (spec change 46, D3)", () => {
	it("[P02][T03] a new row isn't handed out for 45 s: NO_ADDRESS_AVAILABLE until then", async () => {
		expect(HANDOUT_WAIT_MS).toBe(45_000);
		h = await redteamHost({ pool: 0 });
		expect(data(await h.sync({ addresses: [{ index: 1, address: HONEST(1) }] }))?.ok).toBe(true);
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		await h.agePool();
		expect(data(await h.checkout({ kind: "tip" }))?.address).toBe(HONEST(1));
	});

	it("[P02][T03][R08] [RT-08] a forged row is never handed out when the honest bridge reports within the window", async () => {
		h = await redteamHost({ pool: 0 });
		await h.sync({ addresses: [5, 6, 7].map((i) => ({ index: i, address: HONEST(i) })) });
		await h.agePool();
		// The thief, holding the key, adds a row below the honest ones, so checkout would pick it first.
		await h.sync({ addresses: [{ index: 2, address: THIEF(2) }] });
		expect(data(await h.checkout({ kind: "tip" }))?.address).toBe(HONEST(5));
		// The honest bridge's next sync reports it.
		await h.sync({ checks: { pool: { state: "mismatch", bad: [2] } } });
		await h.agePool(); // even once 45 s have passed
		const handed = [data(await h.checkout({ kind: "tip" }))?.address, data(await h.checkout({ kind: "tip" }))?.address];
		expect(handed).toEqual([HONEST(6), HONEST(7)]);
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		expect((await h.pool()).find((p) => p.addrIndex === 2)?.status).toBe("bad");
	});

	it("[P02] the admin's test address while every free row is still being checked says so", async () => {
		h = await redteamHost({ pool: 0 });
		await h.price("USD", "150.00");
		await h.sync({ addresses: [{ index: 1, address: HONEST(1) }] });
		expect((await h.host.admin.act("/payments", "get_test_address")).toast).toEqual({ type: "error", message: "Payment addresses are being checked against your wallet. Try again in a minute." });
	});
});
