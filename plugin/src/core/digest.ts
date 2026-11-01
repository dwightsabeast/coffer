/**
 * The address digest the site sends instead of an address (spec change 46, D3): the base64 of the first 16 bytes of
 * SHA-256 over the address string. The bridge computes the same from its own wallet, so it can compare without the
 * site ever sending a key holder the shop's addresses.
 */
export async function addressDigest(address: string): Promise<string> {
	const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(address)));
	let s = "";
	for (const b of hash.subarray(0, 16)) s += String.fromCharCode(b);
	return btoa(s);
}
