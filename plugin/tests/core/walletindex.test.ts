import { describe, expect, it } from "vitest";

import { MAX_WALLET_INDEX, WALLET_SPAN, ownIndex, siteIndex, walletOf, walletRange } from "../../src/core/walletindex";

describe("per-wallet numbering (spec change 46, D1)", () => {
	it("[P02] wallet 0 keeps today's numbers; wallet w's index i is w * 2^32 + i, and splits back", () => {
		expect(siteIndex(0, 356)).toBe(356);
		expect(siteIndex(1, 1)).toBe(WALLET_SPAN + 1);
		for (const [w, i] of [[0, 1], [0, MAX_WALLET_INDEX], [1, 1], [7, 405], [2 ** 21 - 1, MAX_WALLET_INDEX]]) {
			const n = siteIndex(w, i);
			expect(Number.isSafeInteger(n)).toBe(true);
			expect(walletOf(n)).toBe(w);
			expect(ownIndex(n)).toBe(i);
		}
	});
	it("[P02] two wallets never share a number: a wallet's top index is below the next wallet's first", () => {
		expect(siteIndex(0, MAX_WALLET_INDEX)).toBeLessThan(siteIndex(1, 1));
		expect(walletRange(2)).toEqual({ gte: 2 * WALLET_SPAN, lt: 3 * WALLET_SPAN });
	});
	it("[P02] refuses anything that isn't a safe integer or outside a wallet's range", () => {
		for (const [w, i] of [[0, -1], [0, WALLET_SPAN], [0, 1.5], [-1, 1], [0.5, 1], [2 ** 21, 1]]) {
			expect(() => siteIndex(w, i)).toThrow(RangeError);
		}
	});
});
