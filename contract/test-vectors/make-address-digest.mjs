// Writes address-digest.json: one address and its digest (spec change 46, D3), the value the site sends in `check` and
// `probes` instead of the address, and the bridge computes from its own wallet. The digest is the standard padded
// base64 of the first 16 bytes of SHA-256 over the address string's UTF-8 bytes. Computed here with node:crypto, apart
// from both the plugin (WebCrypto) and the bridge (Go), so all three must agree. The address is made up, in the shape
// of a stagenet subaddress (95 base58 characters); it belongs to no wallet. Node 22+, no dependencies.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const address = "7" + "CofferAddressDigestTestVector".padEnd(94, "1");
if (address.length !== 95 || !/^[1-9A-HJ-NP-Za-km-z]+$/.test(address)) throw new Error("not a 95-character base58 string");
const digest = createHash("sha256").update(address, "utf8").digest().subarray(0, 16).toString("base64");
const out = { description: "Spec change 46: an address and the digest the site and the bridge compute for it (base64 of the first 16 bytes of SHA-256 over the address string).", address, digest };
writeFileSync(new URL("./address-digest.json", import.meta.url), JSON.stringify(out, null, "\t") + "\n");
console.log(digest);
