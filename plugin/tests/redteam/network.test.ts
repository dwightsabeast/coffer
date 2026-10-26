// Phase 07b pass 1, round 1: L5, the mixed-network pool (T20, P02). A sync that brings a mainnet subaddress into a
// stagenet site's pool, or a stagenet one into a mainnet site's pool. This is the pre-agreed finding: not refused yet,
// filed as RT-11 and fixed in pass 1 through the finding flow (Wyatt, 2026-10-26, docs/decisions.md). The failing [T20]
// test is written here first.
import { afterEach, describe, expect, it } from "vitest";

import { H0, type RedteamHost, type Reply, redteamHost } from "./harness";
import { subaddressNetwork } from "../../src/core/address";
import { TAGS, fakeAddress } from "../addresses";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const ok = (r: Reply) => ((r.json as B | null)?.data as B | undefined)?.ok === true;

describe("L5: a sync can't mix networks in the pool", () => {
	it.fails("[T20][P02] [RT-11] L5: a mainnet subaddress is not added to a stagenet site's pool", async () => {
		// The site is stagenet (its existing pool and invoices are stagenet, as on the stagenet dev site).
		h = await redteamHost({ pool: 2, poolNetwork: "stagenet" });
		const mainnet = fakeAddress(TAGS.mainnet[1], 900, "WRONGNET");
		expect(subaddressNetwork(mainnet)).toBe("mainnet");
		const r = await h.sync({ height: H0 + 2, addresses: [{ index: 900, address: mainnet }] });
		expect(ok(r)).toBe(true); // the sync itself is well-formed and signed
		const wrong = (await h.pool()).filter((p) => subaddressNetwork(p.address) !== "stagenet");
		expect(wrong, "a wrong-network address is in the stagenet pool").toEqual([]);
	});

	it.fails("[T20][P02] [RT-11] L5: a stagenet subaddress is not added to a mainnet site's pool", async () => {
		h = await redteamHost({ pool: 2, poolNetwork: "mainnet" });
		const stagenet = fakeAddress(TAGS.stagenet[1], 901, "WRONGNET");
		expect(subaddressNetwork(stagenet)).toBe("stagenet");
		await h.sync({ height: H0 + 2, addresses: [{ index: 901, address: stagenet }] });
		const wrong = (await h.pool()).filter((p) => subaddressNetwork(p.address) !== "mainnet");
		expect(wrong, "a wrong-network address is in the mainnet pool").toEqual([]);
	});

	it("[T20] L5: an address whose network byte can't be read is still dropped (the existing guard holds)", async () => {
		h = await redteamHost({ pool: 2, poolNetwork: "stagenet" });
		// A 95-char base58 string with a network byte that isn't any Monero subaddress byte.
		const unreadable = fakeAddress(99, 902, "NONET");
		expect(subaddressNetwork(unreadable)).toBeNull();
		await h.sync({ height: H0 + 2, addresses: [{ index: 902, address: unreadable }] });
		expect((await h.pool()).some((p) => p.addrIndex === 902)).toBe(false);
	});
});
