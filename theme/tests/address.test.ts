// The spec change 18 A fallback address is checked for format and network (Wyatt, phase 07): Monero base58, 95
// characters (integrated addresses refused), and a network byte that matches the configured network.
import { describe, expect, it } from "vitest";

import { checkTipAddress } from "../src/address";

// Monero's base58: 8-byte blocks to 11 characters, the last partial block to its own length (tests only; the code under
// test decodes).
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ENCODED_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];
function encode(bytes: Uint8Array): string {
	let out = "";
	for (let i = 0; i < bytes.length; i += 8) {
		const block = bytes.slice(i, i + 8);
		let n = 0n;
		for (const b of block) n = (n << 8n) | BigInt(b);
		let s = "";
		for (let k = 0; k < ENCODED_SIZES[block.length]; k++) {
			s = ALPHABET[Number(n % 58n)] + s;
			n /= 58n;
		}
		out += s;
	}
	return out;
}
/** A well-formed address for a network tag: the tag, 64 key bytes, 4 checksum bytes (not a real checksum). */
const address = (tag: number, seed = 7) => encode(Uint8Array.from([tag, ...Array.from({ length: 68 }, (_, i) => (seed * 31 + i * 17) & 0xff)]));

const TAGS = { mainnet: [18, 42], stagenet: [24, 36], testnet: [53, 63] } as const;

describe("checkTipAddress", () => {
	it("each network's standard and subaddress forms pass for their own network", () => {
		for (const [network, [standard, sub]] of Object.entries(TAGS) as Array<[keyof typeof TAGS, readonly number[]]>) {
			for (const tag of [standard, sub]) {
				const a = address(tag);
				expect(a).toHaveLength(95);
				expect(checkTipAddress(a, network), `${network} ${tag}`).toEqual({ ok: true, address: a });
			}
		}
		// The usual first characters: 4/8 mainnet, 5/7 stagenet, 9 or A/B testnet (the first character depends on the
		// whole first block, not only the network byte).
		expect([address(18)[0], address(42)[0], address(24)[0], address(36)[0], address(63)[0]]).toEqual(["4", "8", "5", "7", "B"]);
		expect(["9", "A"]).toContain(address(53)[0]);
	});

	it("[T20] another network's address is refused, naming the network expected", () => {
		expect(checkTipAddress(address(24), "mainnet")).toEqual({ ok: false, reason: "The tip address isn't a valid mainnet Monero address (it's for stagenet). Check the address given to tipEndpoint." });
		expect(checkTipAddress(address(18), "stagenet")).toMatchObject({ ok: false, reason: expect.stringContaining("(it's for mainnet)") });
	});

	it("bad length, bad characters, an integrated address, an unknown tag, or nothing at all: refused", () => {
		const good = address(18);
		const bad = [good.slice(1), `${good}1`, `${good.slice(0, 94)}0`, `${good.slice(0, 94)}O`, `${good.slice(0, 94)}l`, ` ${good.slice(1)}`, encode(Uint8Array.from([19, ...Array.from({ length: 76 }, () => 1)])), address(99), "", undefined, 42];
		for (const a of bad) expect(checkTipAddress(a as string, "mainnet"), String(a)).toMatchObject({ ok: false, reason: expect.stringContaining("isn't a valid mainnet Monero address") });
	});

	it("[T20] an unknown network setting is refused too", () => {
		expect(checkTipAddress(address(18), "main" as never)).toMatchObject({ ok: false, reason: expect.stringContaining('network must be "mainnet", "stagenet" or "testnet"') });
	});
});
