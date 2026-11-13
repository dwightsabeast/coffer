// The store's paging helper (spec change 35, condition 2): page through to the end, under a safety cap, and say when the
// cap cut the scan short. It used to stop silently at 10 pages of 100.
import { describe, expect, it } from "vitest";

import { CtxSyncStore, MAX_SCAN_PAGES, collect } from "../src/store";
import type { PairingClaim } from "../src/sync/handle";
import type { PairingState } from "../src/sync/pairing";

function fakeCollection(total: number) {
	const calls: Array<Record<string, unknown>> = [];
	return {
		calls,
		col: {
			async query(opts: { where: unknown; limit: number; cursor?: string }) {
				calls.push(opts as Record<string, unknown>);
				const from = opts.cursor ? Number(opts.cursor) : 0;
				const items = Array.from({ length: Math.max(0, Math.min(opts.limit, total - from)) }, (_, i) => ({ id: `i${from + i}`, data: { id: `i${from + i}` } }));
				const next = from + items.length;
				return { items, hasMore: next < total, cursor: next < total ? String(next) : undefined };
			},
		},
	};
}

describe("collect", () => {
	it("[R11] reads every page to the end, well past the old 1,000", async () => {
		const { col, calls } = fakeCollection(2_345);
		const r = await collect(col as never, { status: "x" });
		expect(r.items).toHaveLength(2_345);
		expect(r.truncated).toBe(false);
		expect(calls).toHaveLength(24);
		expect(calls.every((c) => c.limit === 100)).toBe(true);
	});

	it("[R11] stops at the safety cap and says so", async () => {
		const { col } = fakeCollection(1_000);
		const r = await collect(col as never, {}, 3);
		expect(r.items).toHaveLength(300);
		expect(r.truncated).toBe(true);
		const exact = await collect(fakeCollection(300).col as never, {}, 3);
		expect(exact).toMatchObject({ truncated: false });
		expect(exact.items).toHaveLength(300);
	});

	it("[R11] the cap covers the most the spam cap allows: 40 every 30 minutes, kept 8 days", () => {
		expect(MAX_SCAN_PAGES * 100).toBeGreaterThanOrEqual(40 * 2 * 24 * 8);
	});
});

// RT-07 (spec change 50): the pairing code is claimed with one conditional KV write, so only one request can win it.
describe("claimPairing and releasePairing", () => {
	const KEY = "state:pairing";
	/** A KV with revisions, as EmDash's conditional writes behave: every write changes the revision. */
	function versionedKv(initial?: PairingState) {
		const rows = new Map<string, { value: unknown; revision: number }>();
		let next = 1;
		const put = (key: string, value: unknown) => {
			const revision = next++;
			rows.set(key, { value, revision });
			return String(revision);
		};
		if (initial) put(KEY, initial);
		const kv = {
			get: async (key: string) => rows.get(key)?.value ?? null,
			set: async (key: string, value: unknown) => void put(key, value),
			getVersioned: async (key: string) => {
				const row = rows.get(key);
				return row ? { value: structuredClone(row.value), revision: String(row.revision) } : null;
			},
			compareAndSet: async (key: string, expected: string | null, value: unknown) => {
				const row = rows.get(key);
				if (expected === null ? row !== undefined : row === undefined || String(row.revision) !== expected) return { applied: false as const };
				return { applied: true as const, revision: put(key, value) };
			},
		};
		return { kv, store: new CtxSyncStore({ kv } as never), value: () => rows.get(KEY)?.value };
	}
	const state: PairingState = { codeHash: "hash-a", expiresAt: 2_000_000_000_000, used: false };

	it("[T13] [RT-07] of two claims on one code at the same moment, one is applied; the code is then marked used", async () => {
		const { store, value } = versionedKv(state);
		const claims = await Promise.all([store.claimPairing(state), store.claimPairing(state)]);
		expect(claims.filter((c) => c !== null)).toHaveLength(1);
		expect(value()).toEqual({ ...state, used: true });
		expect(await store.claimPairing(state)).toBeNull();
	});

	it("[T13] [RT-07] no claim on a missing code, a used one, or one the admin has replaced", async () => {
		expect(await versionedKv().store.claimPairing(state)).toBeNull();
		expect(await versionedKv({ ...state, used: true }).store.claimPairing(state)).toBeNull();
		const replaced = versionedKv({ ...state, codeHash: "hash-b" });
		expect(await replaced.store.claimPairing(state)).toBeNull();
		expect(replaced.value()).toEqual({ ...state, codeHash: "hash-b" });
	});

	it("[T13] [R08] a release puts the code back, and it can be claimed again", async () => {
		const { store, value } = versionedKv(state);
		const claim = await store.claimPairing(state);
		expect(claim).not.toBeNull();
		await store.releasePairing(claim as PairingClaim);
		expect(value()).toEqual(state);
		expect(await store.claimPairing(state)).not.toBeNull();
	});

	it("[T13] a release after the admin issued a new code changes nothing, and a failing release doesn't throw", async () => {
		const { kv, store, value } = versionedKv(state);
		const claim = (await store.claimPairing(state)) as PairingClaim;
		const newer = { ...state, codeHash: "hash-b" };
		await kv.set(KEY, newer);
		await store.releasePairing(claim);
		expect(value()).toEqual(newer);
		kv.compareAndSet = async () => {
			throw new Error("storage write failed");
		};
		await expect(store.releasePairing(claim)).resolves.toBeUndefined();
	});
});
