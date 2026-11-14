// The 07b harness itself: the seeded generator reproduces, failures carry their seed, and the host helpers reach the
// routes. Harness checks, not attacks, so no matrix tags.
import { afterEach, describe, expect, it } from "vitest";

import { type RedteamHost, redteamHost } from "./harness";
import { longString, rng, seedFrom, withSeed } from "./random";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

describe("redteam random", () => {
	it("the same seed gives the same stream; another seed doesn't", () => {
		const draw = (seed: number) => {
			const r = rng(seed);
			return [r.u32(), r.int(-5, 5), r.edgeNumber(), r.hostileString(), JSON.stringify(r.json()), Array.from(r.mutate(r.bytes(32)))];
		};
		expect(draw(42)).toEqual(draw(42));
		expect(draw(42)).not.toEqual(draw(43));
	});

	it("int stays in range and reaches both ends", () => {
		const r = rng(7);
		const seen = new Set(Array.from({ length: 500 }, () => r.int(-2, 2)));
		expect([...seen].sort()).toEqual([-1, -2, 0, 1, 2]);
	});

	it("mutate always changes a non-empty input", () => {
		const r = rng(1);
		const input = new TextEncoder().encode('{"v":1,"seq":2}');
		for (let i = 0; i < 200; i++) expect(Array.from(r.mutate(input))).not.toEqual(Array.from(input));
	});

	it("a failure names its seed; REDTEAM_SEED must be a uint32", async () => {
		await expect(withSeed(() => { throw new Error("boom"); }, 1234)).rejects.toThrow(/^\[seed 1234\] boom$/);
		expect(await withSeed((r) => r.seed, 99)).toBe(99);
		expect(seedFrom("5")).toBe(5);
		for (const bad of ["-1", "1.5", "4294967296", "x"]) expect(() => seedFrom(bad)).toThrow();
		expect(longString(1_000_000)).toHaveLength(1_000_000);
	});
});

describe("redteam host", () => {
	it("reaches bridge/sync, checkout, status and the transport", async () => {
		h = await redteamHost({ pool: 2 });
		expect((await h.sync({})).json).toMatchObject({ success: true, data: { ok: true, poolFree: 2 } });
		expect((await h.sync({}, { key: "test2" })).json).toMatchObject({ data: { error: { code: "BAD_SIGNATURE" } } });
		expect((await h.sync({}, { unsigned: true })).json).toMatchObject({ data: { error: { code: "MISSING_SIGNATURE" } } });
		expect((await h.status("A".repeat(22))).json).toMatchObject({ data: { error: { code: "INVOICE_NOT_FOUND" } } });
		expect((await h.checkout({ kind: "tip" })).json).toMatchObject({ success: true, data: { status: "new", token: expect.any(String) } });
		const viaTransport = (await h.checkoutAs({ ip: "203.0.113.9", userAgent: null, referer: null, geo: null }, { kind: "tip" })) as Record<string, unknown>;
		expect(viaTransport).toMatchObject({ status: "new", token: expect.any(String) });
		expect((await h.pool()).filter((p) => p.status === "claimed")).toHaveLength(2);
	});

	it("an unpaired host refuses syncs", async () => {
		h = await redteamHost({ paired: null });
		expect((await h.sync({})).json).toMatchObject({ data: { error: { code: "NOT_PAIRED" } } });
	});
});
