/**
 * The spec change 18 A fallback address (a shop address shown when Coffer can't make a tip invoice), checked for format
 * and network so a typo can't put a broken QR on the site (Wyatt, phase 07). Monero's base58 is decoded block by block
 * and the leading network byte compared. The checksum (Keccak-256) isn't checked: WebCrypto has no Keccak, and wallets
 * check it themselves before sending.
 */
export type MoneroNetwork = "mainnet" | "stagenet" | "testnet";

/** Network bytes: standard address, subaddress. Integrated addresses (106 characters) aren't accepted. */
const TAGS: Record<MoneroNetwork, readonly [number, number]> = { mainnet: [18, 42], stagenet: [24, 36], testnet: [53, 63] };

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

export type AddressCheck = { ok: true; address: string } | { ok: false; reason: string };

export function checkTipAddress(address: unknown, network: MoneroNetwork): AddressCheck {
	if (!(network in TAGS)) return { ok: false, reason: 'The tip address can\'t be checked: network must be "mainnet", "stagenet" or "testnet". Check tipEndpoint\'s network.' };
	const invalid = (why = "") => ({ ok: false as const, reason: `The tip address isn't a valid ${network} Monero address${why}. Check the address given to tipEndpoint.` });
	if (typeof address !== "string" || address.length !== 95) return invalid();
	const bytes = decode(address);
	if (!bytes || bytes.length !== 69) return invalid();
	const tag = bytes[0];
	if ((TAGS[network] as readonly number[]).includes(tag)) return { ok: true, address };
	const other = (Object.keys(TAGS) as MoneroNetwork[]).find((n) => (TAGS[n] as readonly number[]).includes(tag));
	return invalid(other ? ` (it's for ${other})` : "");
}
