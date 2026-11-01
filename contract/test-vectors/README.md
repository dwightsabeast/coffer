# bridge/sync test vectors

`sync-signature.json` is shared by both sides of `POST /_emdash/api/plugins/coffer/bridge/sync`: the plugin's tests read it now (`plugin/tests/sync/vectors.test.ts`), and the Go bridge's tests read it in phase 03, so the two can't drift. Regenerate it with `node contract/test-vectors/make-sync-signature.mjs` (Node 22+, no dependencies); never edit it by hand.

Keys are the published RFC 8032 section 7.1 test keys: TEST 1 plays the paired bridge, TEST 2 a wrong key. Ed25519 signatures are deterministic, so a correct signer reproduces every `signature` exactly.

## What the bridge must do (docs/spec.md, API contracts; phase 02 session 2c)

- **Message:** the UTF-8 bytes of `x-xmr-ts` (Unix seconds), then `\n`, then the exact body bytes. Send the base64 (standard, padded) signature in `x-xmr-sig`.
- **Encoding:** the body is UTF-8 JSON with no byte-order mark. The plugin verifies first, then decodes strictly; a BOM or invalid UTF-8 fails with `INVALID_ENCODING`.
- **Clock:** `x-xmr-ts` within 300 seconds of the site's clock. `seq` is the bridge clock in milliseconds and must grow.
- **Version:** `v: 1`. The plugin accepts the current and the previous version.
- **Amounts:** `amount` and `unlockTime` are decimal strings (wallet-rpc's uint64, never through a float), up to 20 digits.
- **Caps per request:** body at most 256 KiB; at most 100 `addresses`, 100 `snapshots`, and 32 `transfers` per snapshot. Split anything bigger across syncs. A malformed transfer rejects the whole request; malformed or already-known pool addresses are skipped.
- **Headers:** send no `Origin` and no `Authorization`.
- **Snapshots:** each sync carries a snapshot for every index on the last response's `watch` list, with an empty `transfers` array when nothing arrived. An unpaid invoice expires only on a snapshot from after its deadline. When more than 100 indexes are watched, rotate them across syncs.
- **Pairing:** while the admin's code is active (15 minutes, single use), send a body of at most 4 KiB with `"pair": { "code": "<22 base64url chars>", "publicKey": "<base64 of the 32-byte key>" }`, signed with that new key. Only then is the body read before the signature is checked. Once the code is used or expired, nothing is read before the signature, so a request with an old code fails as `NOT_PAIRED` (no key stored yet) or `BAD_SIGNATURE`.

## Responses

EmDash wraps every plugin route's result: success is HTTP 200 `{ "success": true, "data": <result> }`, and a domain error is also HTTP 200, `{ "success": true, "data": { "error": { "code": ... } } }` (sandboxed routes can't set statuses). EmDash's own checks answer before the plugin runs, with `"success": false`: a body over 256 KiB is HTTP 413 `INVALID_PLUGIN_REQUEST`; a cross-origin `Origin` is 403 `CSRF_REJECTED`; an invalid `Authorization: Bearer` is 401 `INVALID_TOKEN`.

## Error codes (`data.error.code`)

| Code | Meaning |
| --- | --- |
| `NOT_PAIRED` | No bridge key stored and no pairing code active |
| `MISSING_SIGNATURE` | `x-xmr-ts` or `x-xmr-sig` missing or malformed |
| `STALE_TIMESTAMP` | `x-xmr-ts` more than 300 s from the site's clock |
| `BAD_SIGNATURE` | The signature doesn't verify |
| `INVALID_ENCODING` | Verified, but not strict UTF-8 (invalid bytes or a leading BOM) |
| `INVALID_BODY` | Not valid JSON, a missing or malformed field, or a cap exceeded |
| `UNSUPPORTED_VERSION` | `v` is neither the current nor the previous version |
| `PAIRING_NOT_ACTIVE` | A `pair` field from the paired bridge when no code was ever issued |
| `PAIRING_REJECTED` | A wrong code while one is active, or a `pair` field from the paired bridge after its code was used or expired |
| `SEQ_OUT_OF_RANGE` | Verified, but `seq` is more than 300 s from `x-xmr-ts` × 1000 (spec change 46, item 5) |

Success (`data`): `{ "ok": true, "poolFree": <free addresses>, "poolTarget": 50, "watch": [<subaddress indexes to keep reporting>] }`.

## Spec change 46: the pool check, the probe, and numbering from handed-out rows

`address-digest.json` holds one address and its digest; the plugin (`plugin/tests/sync/vectors.test.ts`) and the bridge (`bridge/internal/syncclient/spec46_test.go`) both check it. Regenerate it with `node contract/test-vectors/make-address-digest.mjs`; never edit it by hand. Signing is unchanged, so `sync-signature.json` is too.

- **Digest:** the standard padded base64 of the first 16 bytes of SHA-256 over the address string's UTF-8 bytes (24 characters). The site sends digests, never addresses, so a key holder learns no address it didn't already have.
- **Indexes:** every address and snapshot index is the current wallet's own subaddress index, 1..2³²−1; anything outside is `INVALID_BODY`. The site numbers wallet *w*'s rows *w* × 2³² + index internally; the wire never shows that.
- **`seq`:** the bridge clock in ms, within 300 s of `x-xmr-ts` × 1000, or `SEQ_OUT_OF_RANGE`.

**New response fields (`data`):**

| Field | Meaning |
| --- | --- |
| `claimedTop` | The current wallet's highest index the site has handed out (claimed). Free, `bad` and `dropped` rows don't count, so a stolen key can't move it. 0 while waiting for the probe answer. The bridge's only numbering cue: it catches up to it, never further than `claimedTop + 50`, and re-offers above it. `poolTop` stays, unused for numbering. |
| `check` | Up to 150 `{ index, digest }` of the current wallet's rows for the bridge to check: every free row (lowest first), rows added in the last 24 h, open invoices' rows, then a rotation that moves on every 30 s. |
| `probes` | Present only while the site waits for the bridge's answer after a re-pair on a site with history; possibly empty. Up to 10 `{ wallet, index: 1, digest }`, most recent first. A probe at any index but 1 is a malformed response. While present: `poolTop`, `claimedTop` 0, an empty `watch`, and the site takes no addresses and applies no snapshots. |

**New request fields:**

| Field | Meaning |
| --- | --- |
| `wallet` | The answer to `probes`: `{ "match": <wallet> \| null, "receivedTop": <highest index with a transfer> }`. `null` starts a new wallet whose gap baseline is `receivedTop`; a match not among the probes is ignored. |
| `probeDigest` | The digest of the bridge's own index-1 address. Sent with the answer, and with every sync until one carrying it succeeds; the site keeps the first as the current wallet's probe and ignores later ones. A malformed one is dropped. |
| `checks.pool` | The check of the last `check` list: `{ "state": "ok" }`, or `{ "state": "mismatch", "bad": [<own index>…] }` with at most 20. An index the wallet holds with another digest is bad; so is one it doesn't hold above `claimedTop + 50`. A mismatch goes out at once (a sync with no snapshots or addresses), before any catch-up; "ok" waits until every row can be compared. The site turns bad rows "bad", sends their invoices to review, and shows a red banner until the next pairing; an "ok" never clears it. |

