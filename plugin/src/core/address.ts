/**
 * A pool address's network, read from its network byte (spec change 36: invoices store asset, chain and network; sync
 * drops an address whose network can't be read). Monero's base58 is decoded block by block, the same way as the theme's
 * tip-address check (theme/src/address.ts; no shared package, so the decoder is copied). The checksum (Keccak-256) isn't
 * checked: WebCrypto has no Keccak, and wallets check it before sending.
 */
export type MoneroNetwork = "mainnet" | "stagenet" | "testnet";

/** Subaddress network bytes only: pool rows are subaddresses (index 1 and up), never a standard address. */
const SUBADDRESS_TAGS: ReadonlyMap<number, MoneroNetwork> = new Map([
	[42, "mainnet"],
	[36, "stagenet"],
	[63, "testnet"],
]);

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Encoded length for a block of 0..8 bytes. */
const ENCODED_SIZES = [0, 2, 3, 5, 6, 7, 9, 10, 11];

/** Monero's block-wise base58 to bytes, or null if any block is malformed or overflows its size. */
function decode(text: string): Uint8Array | null {
	const out: number[] = [];
	for (let i = 0; i < text.length; i += 11) {
		const block = text.slice(i, i + 11);
		const size = ENCODED_SIZES.indexOf(block.length);
		if (size < 0) return null;
		let n = 0n;
		for (const c of block) {
			const d = ALPHABET.indexOf(c);
			if (d < 0) return null;
			n = n * 58n + BigInt(d);
		}
		if (n >= 1n << BigInt(8 * size)) return null;
		for (let k = size - 1; k >= 0; k--) out.push(Number((n >> BigInt(8 * k)) & 0xffn));
	}
	return Uint8Array.from(out);
}

/** The network of a 95-character subaddress, or null for anything else. */
export function subaddressNetwork(address: unknown): MoneroNetwork | null {
	if (typeof address !== "string" || address.length !== 95) return null;
	const bytes = decode(address);
	if (!bytes || bytes.length !== 69) return null;
	return SUBADDRESS_TAGS.get(bytes[0]) ?? null;
}
