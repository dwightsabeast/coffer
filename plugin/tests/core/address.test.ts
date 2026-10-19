// A pool address's network, from its network byte (spec change 36, Wyatt 2026-10-18): only a subaddress of a known
// network is readable; anything else is null, and sync drops it.
import { describe, expect, it } from "vitest";

import { subaddressNetwork } from "../../src/core/address";
import { TAGS, encodeBase58, fakeAddress } from "../addresses";

describe("subaddressNetwork", () => {
	it("each network's subaddress byte gives that network", () => {
		for (const [network, [, sub]] of Object.entries(TAGS)) {
			const a = fakeAddress(sub, 1);
			expect(a).toHaveLength(95);
			expect(subaddressNetwork(a), network).toBe(network);
		}
		// The usual first characters: 8 mainnet, 7 stagenet, B testnet.
		expect([fakeAddress(42, 5)[0], fakeAddress(36, 5)[0], fakeAddress(63, 5)[0]]).toEqual(["8", "7", "B"]);
	});

	it("standard addresses and unknown bytes are null: pool rows are subaddresses", () => {
		for (const [, [standard]] of Object.entries(TAGS)) expect(subaddressNetwork(fakeAddress(standard, 1))).toBeNull();
		expect(subaddressNetwork(fakeAddress(38, 1))).toBeNull();
		// The old test fixtures' shape: right length and alphabet, network byte 38.
		expect(subaddressNetwork(`7${"1".padStart(94, "T")}`)).toBeNull();
	});

	it("malformed text is null: wrong length, a character outside the alphabet, a block that overflows", () => {
		const a = fakeAddress(36, 1);
		expect(subaddressNetwork(a.slice(0, 94))).toBeNull();
		expect(subaddressNetwork(`${a}1`)).toBeNull();
		expect(subaddressNetwork(`${a.slice(0, 94)}0`)).toBeNull();
		expect(subaddressNetwork(`${a.slice(0, 94)}l`)).toBeNull();
		expect(subaddressNetwork(`zzzzzzzzzzz${a.slice(11)}`)).toBeNull();
		expect(subaddressNetwork(42)).toBeNull();
		expect(subaddressNetwork("")).toBeNull();
	});

	it("an integrated address (106 characters) is null", () => {
		const bytes = Uint8Array.from({ length: 77 }, (_, i) => (i === 0 ? 19 : (i * 13) & 0xff));
		const integrated = encodeBase58(bytes);
		expect(integrated).toHaveLength(106);
		expect(subaddressNetwork(integrated)).toBeNull();
	});
});
