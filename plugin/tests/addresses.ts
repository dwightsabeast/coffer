// Fake Monero addresses for tests, in the right format: Monero's block base58 of a network byte, 64 made-up key bytes and
// a checksum of zeros (never Keccak's), so no wallet would send to one. Tests only: the plugin decodes, never encodes.
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ENCODED_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];

/** 8-byte blocks to 11 characters each, the last partial block to its own length. */
export function encodeBase58(bytes: Uint8Array): string {
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

/** A 95-character address with this network byte; `i` and `salt` make it unique. */
export function fakeAddress(tag: number, i: number, salt = ""): string {
	const bytes = new Uint8Array(69);
	bytes[0] = tag;
	new DataView(bytes.buffer).setUint32(1, i);
	const s = new TextEncoder().encode(salt).slice(0, 16);
	bytes.set(s, 5);
	for (let k = 5 + s.length; k < 65; k++) bytes[k] = (k * 37 + 11) & 0xff;
	return encodeBase58(bytes);
}

/** Network bytes: standard address, subaddress. */
export const TAGS = { mainnet: [18, 42], stagenet: [24, 36], testnet: [53, 63] } as const;

/** A fake stagenet subaddress (byte 36) for a pool index. */
export const fakeSubaddress = (i: number, salt = "") => fakeAddress(TAGS.stagenet[1], i, salt);
