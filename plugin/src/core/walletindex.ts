/**
 * Per-wallet numbering (spec change 46, item 4; D1). The site numbers wallet w's pool rows and invoices
 * w * 2^32 + the wallet's own subaddress index, so a re-pair to another wallet starts that wallet's numbering at its own
 * index 1 while `addrIndex` stays one unique index (the trust contract's storage is unchanged). Wallet 0 is every row
 * stored before spec change 46. On the wire the bridge and the site speak only the wallet's own indexes. Every reader
 * of `addrIndex` goes through these helpers.
 */

/** One wallet's span of site numbers: past Monero's 32-bit subaddress index, so no two wallets collide. */
export const WALLET_SPAN = 2 ** 32;
/** A wallet's own subaddress indexes are 1..2^32-1 (index 0 is the wallet's main address, never in the pool). */
export const MAX_WALLET_INDEX = WALLET_SPAN - 1;

/** The site number of a wallet's own index. Throws rather than return a number that isn't a safe integer. */
export function siteIndex(wallet: number, index: number): number {
	if (!Number.isSafeInteger(wallet) || wallet < 0) throw new RangeError(`bad wallet number ${wallet}`);
	if (!Number.isSafeInteger(index) || index < 0 || index > MAX_WALLET_INDEX) throw new RangeError(`bad wallet index ${index}`);
	const n = wallet * WALLET_SPAN + index;
	if (!Number.isSafeInteger(n)) throw new RangeError(`site index past 2^53 for wallet ${wallet}`);
	return n;
}

/** The wallet a site number belongs to. */
export const walletOf = (siteNumber: number): number => Math.floor(siteNumber / WALLET_SPAN);

/** The wallet's own index for a site number: what the wallet app calls the address. */
export const ownIndex = (siteNumber: number): number => siteNumber % WALLET_SPAN;

/** The site numbers of one wallet, as a storage range ({ gte, lt }). */
export const walletRange = (wallet: number): { gte: number; lt: number } => ({ gte: siteIndex(wallet, 0), lt: siteIndex(wallet, 0) + WALLET_SPAN });
