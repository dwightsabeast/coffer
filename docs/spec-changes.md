# Proposed spec changes

The spec (`docs/spec.md`) is a snapshot of a live doc that Wyatt owns. Claude never edits it. When the code needs the design to change, or EmDash or Monero behaves differently from what the spec assumes, add an entry here and stop for Wyatt's decision. Once Wyatt decides, he updates the live doc and the snapshot, and the entry's status changes.

Entry format:

```text
## N. Short title  (status: proposed | accepted | rejected | superseded)
Found in: phase, file or test
Spec says: quote or section name
Evidence: what was observed (command, test, output, doc link)
Proposal: the smallest change that fixes it
Effect on the admin budget: none, or what changes
Effect on the trust contract: none, or what changes (any broadening is a major version)
```

## Entries

## 1. Declare `bridge/sync`'s body as `"bytes"`, not `"text"`  (status: accepted, 2026-10-03)
Found in: phase 01, spike Q1 (`spikes/xmr-spike/tests/q1-ed25519.test.ts`, `spikes/xmr-spike/evidence/q1-*.txt`)
Spec says: API contracts, `POST bridge/sync`: "Declared with `request: { body: "text", headers: ["x-xmr-ts", "x-xmr-sig"], maxBytes }`, so the handler sees the exact raw bytes." Plugin manifest, routes table: "raw text (`maxBytes` capped)".
Evidence: In all three places (plugin test host, `astro dev`, built server on workerd), a `"text"` body reaches the handler as a decoded string, not the raw bytes. EmDash 1.1.0 strips a leading UTF-8 BOM (77 bytes in, 74 re-encoded, so a correctly signed body fails verification) and rejects invalid UTF-8 with `400 INVALID_PLUGIN_REQUEST` before the plugin runs. The same six vectors declared as `"bytes"` arrive as a `Uint8Array` identical to what was signed, and every verdict matches Node's `crypto.verify`. Ed25519 itself works everywhere under the standard `"Ed25519"` name.
Proposal: declare `bridge/sync` with `request: { body: "bytes", headers: ["x-xmr-ts", "x-xmr-sig"], maxBytes }`; verify the signature over `ts + "\n" + bytes`, then decode with `new TextDecoder("utf-8", { fatal: true })` and parse JSON. The spec's sentence "the handler sees the exact raw bytes" becomes true as written. With `"text"`, both failure modes are fail-closed (no security hole), and the Go bridge's `encoding/json` never emits a BOM or invalid UTF-8, so `"text"` would also work in practice; `"bytes"` removes the dependency on that.
Effect on the admin budget: none.
Effect on the trust contract: the route's name, method and public access are unchanged; only its declared body mode changes, before the first release, so no installed user has consented to the old one. CLAUDE.md's "raw text body" wording would change to "raw bytes body".
Wyatt's decision (2026-10-03), the terms for the bridge:
1. `bridge/sync` takes `"bytes"`.
2. The signature is checked over exactly those bytes.
3. Only after the signature passes does the plugin decode them, as strict UTF-8, rejecting a leading byte-order mark.
4. The bridge never sends a byte-order mark. (First written as "sends"; Wyatt confirmed "never" the same day.)
Wyatt updates the live spec and `docs/spec.md`; CLAUDE.md's trust-contract line "raw text body" becomes "raw bytes body" with that update.
Done 2026-10-03: live spec revision 69 and `docs/spec.md` updated.

## 2. Nothing depends on the cron; it stays as a backup  (status: accepted, 2026-10-03)
Found in: phase 01, spike Q3 (`spikes/xmr-spike/tests/q3-cron.test.ts`, `evidence/q3-*.txt`; EmDash 1.1.0 source `emdash-runtime.ts` `runPluginInstallLifecycle`, `setPluginStatus`; `astro/routes/api/admin/plugins/{registry,marketplace}/install`)
Spec says: Plugin manifest, Hooks: "`plugin:install` seeds defaults and schedules the cron; `cron` runs the sweep". Invoice lifecycle, Cron sweep: expiry, reorg review, ending watches, the 30-day purge, and the silent-bridge flag.
Evidence: EmDash 1.1.0 runs `plugin:install` (then `plugin:activate`) only when a plugin is installed from the registry or marketplace through the admin API. A config-managed plugin (`sandboxed: [...]`) gets neither hook at startup or restart: on the dev site under `astro dev` the spike's install and activate records stayed empty and no task was scheduled. `plugin:activate` also runs when the plugin is switched on in the admin (`setPluginStatus`). In the test host, `actions.plugin.activate()` scheduled the task, the scheduler fired it once per (simulated) minute, and the task survived `host.restart()`. Node timing: see the Q3 row of `docs/spike-findings.md` (scheduler wakes at the next due time, at least 1 s and at most 60 s apart; schedules are croner expressions, 5- or 6-field).
Proposal (Wyatt's):
- Expiry happens inside `bridge/sync`: a post-deadline sync is required for expiry anyway ("expire on evidence"), so the sync that covers an invoice after `expiresAt` expires it (or sends it to review).
- Ending finished watches (24-hour window, settled 10 confirmations deep) and the 30-day buyer-data purge also run in `bridge/sync`, in small bounded batches per request, so no sync exceeds the per-request limits.
- The silent-bridge flag is computed when the admin page (or the dashboard widget) loads, from the last sync time.
- Claude's addition, for Wyatt to confirm: the reorg rule (a settled invoice whose payment left the chain and was not re-mined within 5 blocks goes to review) also depends only on sync evidence, so it moves into `bridge/sync` too.
- The cron stays as a backup that runs the same bounded batch functions, scheduled idempotently (`ctx.cron.schedule` upserts by name) from `plugin:install`, `plugin:activate`, or the first admin page load, whichever comes first.
Effect on the admin budget: none (no setting, no step).
Effect on the trust contract: none (no capability, route, storage or admin declaration changes).
Wyatt's decision (2026-10-03): accepted as written, including Claude's reorg addition. The spec also says why the backup cron is always scheduled (pairing happens on the admin page, so every working install loads it) and why it stays (the 30-day purge goes by the calendar, so the cron keeps it running if the wallet host is retired). Live spec revision 69 and `docs/spec.md` updated.

## 3. Make `subaddress` a unique index on `invoices`  (status: accepted, 2026-10-03)
Found in: phase 01, spike Q6 (`spikes/xmr-spike/tests/q6-pool-claims.test.ts`, `scripts/claim-race.mjs`, `evidence/q6-*.txt`)
Spec says: Plugin manifest, storage: `"invoices": { "indexes": ["status", "expiresAt", "subaddress", ["kind", "createdAt"]], "uniqueIndexes": ["token"] }`; Key design decisions: one subaddress per invoice, never reused.
Evidence: `updateIf` claims were correct in all three places (exactly one of 20 claims of one row applied; 20 claim-loop requests on 5 rows made 5 distinct claims), with no errors. But concurrency was not really exercised: the first request won every round, which suggests the runner and SQLite handled the requests one after another. PostgreSQL (where the documented `StorageSerializationError` applies) was not tested.
Proposal: move `subaddress` from `indexes` to `uniqueIndexes` on `invoices`, so the database itself refuses a second invoice with an address already used, whatever happens in the claim path. Checkout treats a unique-index violation as a lost claim and retries within its bounded loop (or returns `NO_ADDRESS_AVAILABLE`).
Effect on the admin budget: none.
Effect on the trust contract: a storage index declaration changes, before the first release, so no installed user has consented to the old one.
Wyatt's decision (2026-10-03): accepted as written. Phase 02 adds a test that a second invoice with an address already used is refused and checkout retries with the next address. Live spec revision 69 and `docs/spec.md` updated (manifest `uniqueIndexes`, and "Address claims and limits" under `POST checkout`).

## 4. Spam limits must work without a client IP  (status: accepted, 2026-10-03)
Found in: phase 01, spike Q5 (`spikes/xmr-spike` `echo` route; `evidence/q5-box-trusted-header.txt`, `evidence/q2-q5-pc-round{1,2}.txt`; EmDash source `plugins/request-meta.ts`)
Spec says: Open question 6, "whether `requestMeta` gives the real client IP on public routes … which decides whether per-IP buckets help"; phase 02: "cap on open invoices per hashed client bucket … using `requestMeta` as the spike found it".
Evidence: On a Node site (`astro dev` or built), `requestMeta.ip` is `null` by default, both directly and behind a Cloudflare Tunnel. It becomes the real IP only if the operator sets `EMDASH_TRUSTED_PROXY_HEADERS` (or `trustedProxyHeaders`), and then anyone who can reach the origin without going through the proxy can choose their own IP. On Cloudflare Workers deployments EmDash uses the `cf` object and the IP is real and trustworthy.
Proposal: per-IP buckets apply only when `requestMeta.ip` is non-null. When it is `null`, checkout falls back to a site-wide cap on open (unpaid, unexpired) invoices, sized well below the pool target so the address pool can't be drained by one client, plus the existing short invoice window. No new setting and no request to set an environment variable; the admin page's health panel may say "per-visitor limits off: the site doesn't pass client IPs" as information, not a red line.
Effect on the admin budget: none (deliberately: asking admins to configure trusted proxy headers would add a setup step and, done wrong, a spoofing hole).
Effect on the trust contract: none.
Wyatt's decision (2026-10-03): accepted, with two refinements:
1. An invoice counts as open for the site-wide cap until its `expiresAt`, by the plugin's clock. This only decides whether a new checkout is allowed, never an invoice's status, so "expire on evidence" still holds. Without it, a bridge outage would keep unpaid invoices open (with entry 2, formal expiry waits for a sync), fill the cap and lock checkout until the bridge came back.
2. The spec states the tradeoff plainly: without client IPs, one spammer can fill the cap and block checkout until those invoices' windows close, but can't take money or mark the wrong invoice paid. The remedy is a rate-limit rule for the checkout route at Cloudflare or the proxy, explained in phase 09's install docs, never a plugin setting.
Live spec revision 69 and `docs/spec.md` updated (Security model threat table, Privacy, the Health bullet and the "Bridge down" failure row).

## 5. A payment mined in time counts as on time, however it was first reported  (status: accepted, 2026-10-03)
Found in: phase 01 review, checking spike Q7's `timestamp` finding against the spec (raised by Claude in Wyatt's planning chat)
Spec says: Invoice lifecycle, Rules, "On time or late": "the plugin saw the transfer before `expiresAt`; or the wallet's timestamp from when it was first reported unmined is before `expiresAt`; or, if it was first reported already mined, its block height is at most `expiresHeight`".
Evidence: Q7 confirmed that `timestamp` is when the wallet first saw an unmined transfer. If the wallet host is offline when a buyer pays on time and comes back after `expiresAt` while the transfer is still unmined, its first-seen timestamp is after the deadline, and the height test didn't apply because the transfer wasn't first reported mined. The payment went to review as late even when it was mined by `expiresHeight`.
Proposal: any one of the three pieces of evidence is enough, and the height test applies whenever the transfer is mined, however it was first reported.
Effect on the admin budget: none (fewer false review items).
Effect on the trust contract: none.
Wyatt's decision (2026-10-03): accepted. Live spec revision 69 and `docs/spec.md` updated.

## 6. The admin page path can't be `"/"`  (status: accepted, 2026-10-03)
Found in: phase 02, session 2a (`pnpm test` in `plugin/`, which runs `emdash-plugin validate` first)
Spec says: Plugin manifest: `"admin": { "pages": [{ "path": "/", "label": "Monero payments" }], ... }`.
Evidence: `@emdash-cms/plugin-cli` 0.13.2 (manifest schema from `@emdash-cms/plugin-types` 0.5.0) rejects it: `admin.pages[0].path: admin page path must be at least 2 characters (leading slash + name)` and `admin page path must start with "/" and contain only letters, digits, "-", "_", "/"`.
Proposal: `"path": "/payments"` (label unchanged, "Monero payments"). It is the plugin's only admin page, so the path shows only in the admin URL, where `/payments` reads naturally.
Effect on the admin budget: none.
Effect on the trust contract: the admin page declaration changes before the first release, so no installed user has consented to the old one.
Wyatt's decision (2026-10-03): accepted, `"/payments"`. Wyatt updates the live spec and `docs/spec.md`; `plugin/emdash-plugin.jsonc` already uses it.

## 7. Lifecycle clarifications from phase 02 session 2b  (status: accepted, 2026-10-03)
Found in: phase 02 session 2b, porting the proof of concept's rules into `plugin/src/core/` (`invoice.ts`, `presets.ts`, `watch.ts`; tests in `plugin/tests/core/`)
Spec says: Invoice lifecycle, Rules and Confirmation presets; `bridge/sync`, Watch list. The spec is silent or the proof of concept differs on the points below.
Evidence: `plugin/tests/core/scenarios.test.ts` (each point has a test); a mutation check removing item 6 fails both of its tests.
Proposal (the spec should state these):
1. Fiat currencies with two decimals only for now (USD, EUR, GBP and similar); the preset tiers compare integer minor units (under 10,000 / 10,000 to 100,000 inclusive / over 100,000 for two decimals). Other currencies later, with the decimal count as a parameter.
2. Boundaries are inclusive: seen or first reported unmined exactly at `expiresAt` is on time, as is a block height exactly `expiresHeight`.
3. An expired invoice whose on-time payment turns up later but is below the threshold goes to `review` with reason `underpaid`, like an underpayment seen at the deadline (the proof of concept left it `expired`, silently).
4. A tip below the dust floor at expiry just expires (as in the proof of concept); phase 07 decides tips under dust.
5. A settled invoice stays watched until its payment is 10 deep or re-confirming, but never longer than 24 hours after settling.
6. An unmined transfer that isn't proven on time is undecided while the chain is below `expiresHeight`, because it can still be mined in time. While any transfer is undecided, the invoice waits with `pendingExpiry` instead of expiring or going to review as late; once the chain reaches `expiresHeight` with the transfer still unmined, it is late. Without this, spec change 5 fails in the case it was written for: the wallet host comes back after the deadline and first reports the payment unmined, the plugin calls it late and sends the invoice to review (admin-only), and the later on-time mining can no longer settle it. The extra wait is at most 3 blocks (the grace) past the window.
Effect on the admin budget: none (fewer false review items).
Effect on the trust contract: none.
Wyatt's decision (2026-10-03): items 1-5 accepted as answered in session 2b; item 6 accepted. Wyatt folds the entry into the live spec and `docs/spec.md`.

## 8. Price sources: Kraken first, CoinGecko as the fallback; USD and EUR only  (status: accepted, 2026-10-03)
Found in: phase 02 session 2d, checking the price APIs' current terms before writing the rate fetch (a phase 02 stop point)
Spec says: API contracts and Amount math: "The rate comes from the first price API that answers, falls back to the second"; Plugin manifest: `"allowedHosts": ["api.coingecko.com", "api.kraken.com"]` with CoinGecko first; "The price-API hosts are a first choice; their current terms and rate limits still need checking."
Evidence (2026-10-03): both answer without a key (`curl` from the dev box: CoinGecko `simple/price` for USD, EUR, GBP; Kraken `Ticker` for XMRUSD and XMREUR; Kraken has no XMR/GBP pair, `EQuery:Unknown asset pair`). CoinGecko's docs say the keyless API is "not suitable for production workloads, scheduled polling, or high-frequency updates", limited to about 10–30 calls a minute per IP and varying with load (https://docs.coingecko.com/docs/keyless-public-api); its free Demo key needs an account, an API key and a visible "Powered by CoinGecko" attribution (https://www.coingecko.com/en/api/pricing, https://www.coingecko.com/en/api_terms). Kraken's public market-data endpoints need no account and allow about one call a second per IP (https://support.kraken.com/articles/206548367-what-are-the-api-rate-limits-). The plugin calls at most once a minute per currency (60-second cache).
Proposal: Kraken's public `Ticker` first, CoinGecko's keyless `simple/price` as the fallback, both parsed as decimal strings into integer minor units. Supported currencies USD and EUR, which both sources quote. GBP is left out for now (only one source). No API key and no new setting; `RATE_UNAVAILABLE` when both fail, never a stale price.
Effect on the admin budget: none.
Effect on the trust contract: none (the same two hosts; only the order changes).
Wyatt's decision (2026-10-03): accepted: Kraken first; GBP left out for now. Wyatt updates the live spec and `docs/spec.md`.


## 9. The shop's wallet app may miss payments after a long run of unpaid addresses (subaddress lookahead)  (status: accepted, 2026-10-04)
Found in: Wyatt, 2026-10-04, reviewing phase 02 before phase 03
Spec says: Key design decisions: "Pre-created address pool, one subaddress per invoice, never reused". Bridge service, Pool top-up: "create the missing subaddresses (`create_address`, account 0 …)". The spec says nothing about how other wallets holding the same keys find those addresses.
Evidence (not yet tested; phase 03 tests it):
- A Monero wallet doesn't scan every possible subaddress. It keeps a lookahead window past the highest index that has received money, 200 per account by default in `wallet2`, and grows the window as payments arrive (to be confirmed on stagenet).
- The bridge's own `monero-wallet-rpc` knows every address it created with `create_address`, so the bridge and the plugin still see the payment.
- The shop's wallet app (GUI, Feather, Cake, the CLI, restored from the seed) knows only its default window. Every checkout claims a new index, and abandoned checkouts are never paid. After 200 or more claimed-but-unpaid indexes in a row, a payment to a later index can be settled in the plugin but missing from the app's balance until the app's lookahead is raised.
- The same applies to a reinstalled bridge: a fresh `generate_from_keys` wallet starts with the default window, so it must recreate addresses up to the highest pool index before it reconciles.
- Checked 2026-10-04: `/opt/monero/monero-wallet-rpc --help` (0.18.5.1) lists no lookahead option.
Proposal:
1. Phase 03 tests it on stagenet. With more than 200 unpaid indexes past the last paid one, pay the far address, then check:
   - the bridge reports the payment
   - a second view-only wallet restored from the same keys with default settings (standing in for the shop's app) doesn't see it
   - what makes it appear (raising the lookahead, creating addresses up to the index)
   - that a reinstalled bridge (fresh wallet from keys) sees payments to high indexes after it reconciles
2. The plugin computes the gap from data it already stores: the highest claimed pool index minus the highest index with a counted payment.
3. The admin page (phase 04) warns before the gap gets close: a red health line from a constant threshold (proposed: 150 of 200; a constant, no setting), naming the fix in the wallet app. It belongs with the spec's existing Health check "a run of unpaid expired invoices".
4. Address reuse is not proposed (`docs/decisions.md`: never reused).
Effect on the admin budget: no new setting or install step. The fix for the warning (raising the app's lookahead, once, when it shows) is an occasional manual task and touches "no routine upkeep"; Wyatt decides whether that is acceptable or the feature must change.
Effect on the trust contract: none (no capability, host, route, storage or admin declaration changes).
Wyatt's decision (2026-10-04): accepted (phase 03's stagenet test, the phase 04 warning from a constant threshold, phase 05's wallet-app check). Still open: how an admin raises the wallet app's lookahead, and whether that manual step is acceptable at all. This doesn't block phase 03. Its stagenet test supplies the evidence (what works, in which wallet apps), and Wyatt decides before the phase 04 warning text is written. Tracked under "Still to decide" in `docs/decisions.md`. Wyatt updates the live spec and `docs/spec.md`.
Evidence from phase 03 session 3h (stagenet, 2026-10-06; files `~/xmr-pay-dev-data/3h-*`):
- **Gap:** the bridge's own pool top-up was driven past index 310 (`dev-invoices.mjs drain-pool`, five rounds). A checkout got index 261, 252 past the last paid index (9). Wyatt paid it. The bridge reported it, and it settled at 2 confirmations (02:40:14 UTC). The bridge's wallet sees it because it created that address itself.
- **Shop app stand-in** (`TestLiveLookahead`, `3h-L2-output.txt`): a second view-only wallet-rpc, restored from the same keys with default settings.
  1. As restored: the payment to index 261 is **not seen**.
  2. After `create_address` up to 261 and two auto-refreshes: **still not seen**. Creating the address doesn't find a payment in blocks already scanned.
  3. After `rescan_blockchain`: **seen**, 1784471529 atomic at height 2222980, 8 s from a recent restore height.
  
  So the fix for a wallet app is both steps, addresses up to the index and then a rescan. (Raising the lookahead before restoring should work too; that's not tested here, and there's no lookahead option in wallet-rpc.)
- **Reinstall:** see spec change 15. A reinstalled bridge does **not** recreate addresses before it reconciles. One consequence was observed: a settled invoice falsely moved to review `reversed`.

## 10. The comparison checks compare a defined verdict, and our verifier may be stricter by named policy  (status: accepted, 2026-10-04)
Found in: phase 03 session 3b-1, `bridge/oracle/oracle_test.go` against `gpgv` 2.4.7 (`~/xmr-pay-dev-data/3b1-oracle-gpgv.txt`)
Spec says: Bridge service, "Tests the decision depends on": "Differential oracles in CI only: the real `hashes.txt` and the corpus run through `gpgv` and ProtonMail `go-crypto` as well, and all three verdicts must match."
Evidence: 26 inputs (the real `hashes.txt`, 9 signed test files, 16 altered copies of the real file) × 3 keys = 78 comparisons.
- **What "verdict" means.** It is defined as "exactly one valid signature by the pinned primary key over this text, unexpired". `gpgv`'s status lines are mapped to that question: exit 0, exactly one `VALIDSIG` whose signing key and primary key are both the pinned key, and no `BADSIG`, `ERRSIG`, `EXPSIG` or `NO_PUBKEY`. Without this mapping, `gpgv` "accepts" a file signed by a subkey and a file carrying two signatures, which revision 70 tells us to refuse.
- **Results.** 73 match. Our verifier never accepted anything `gpgv` refused, and every text both accepted was identical after canonicalization.
- **The five differences** are all refusals by our verifier of things `gpgv` accepts:
  1. text before the signed block
  2. text after the signature
  3. a SHA-384 signature
  4. a missing armor checksum
  5. a `Version:` header in the signature armor

  Items 1 to 3 are revision 70 policy ("text outside the signed block", "SHA-256 or SHA-512 only"). Items 4 and 5 are Claude's strict reading: revision 70 says "a bad armor checksum" and doesn't mention armor headers. RFC 9580 makes the checksum optional, and `gpgv` ignores signature-block headers.
- `go-crypto` isn't run yet (see the dependency question in the 3b-1 progress entry).
Proposal:
1. **Replace "all three verdicts must match" with:**
   - every oracle's output is mapped to that one verdict
   - the check fails if our verifier accepts anything an oracle refuses, or if accepted texts differ
   - our verifier may refuse what an oracle accepts only where a named policy says so, listed in the test with its reason
2. **Keep items 4 and 5 strict:** require the checksum, and allow no armor headers in the signature block. Monero's current file has a checksum and no headers.
   - If Monero's format changes, the bridge refuses the new `hashes.txt`, keeps its current wallet-rpc, and turns a health check red. That is the same path as a key change, fixed by a bridge update.
   - The alternative is to follow RFC 9580 (checksum optional, headers ignored). That is more tolerant of format changes, but it accepts more variants of the input.
Effect on the admin budget: none, unless Monero changes the file's format (then one bridge update, as with a key change).
Effect on the trust contract: none.
Wyatt's decision (2026-10-04): accepted, strict. The verdict definition and the failure rule as proposed; a missing armor checksum and signature-block armor headers stay refused. Wyatt updates the live spec and `docs/spec.md`.

## 11. wallet-rpc does not check the view key against the address; the bridge must  (status: accepted, 2026-10-04)
Found in: phase 03 session 3c, live test `TestLiveShopWallet` (`bridge/cmd/xmr-bridge/live_test.go`, output `~/xmr-pay-dev-data/3c-live-shop-wallet.txt`)
Spec says: Bridge service, duty 1: "Create the view-only wallet with `generate_from_keys` (primary address and private view key, no spend key …)". Phase 03 rules: "The bridge never handles a spend key, and refuses input that looks like one or like a seed." The 3c plan (approved, item 3) relied on wallet-rpc refusing a view key that doesn't belong to the address.
Evidence:
- The real `monero-wallet-rpc` 0.18.5.1 (stagenet) was given the shop's real address and a well-formed view key that isn't the shop's. `generate_from_keys` **returned success** and created the wallet.
- Source of v0.18.5.1 confirms it:
  - `src/wallet/wallet_rpc_server.cpp`, `on_generate_from_keys`, only checks that the view key parses as hex ("Failed to parse view key secret key").
  - With no spend key it calls `wallet2::generate(…, info.address, viewkey, …)`, and that function (`src/wallet/wallet2.cpp`, the overload at line 5851) calls `m_account.create_from_viewkey(address, viewkey)` with no comparison.
  - The CLI wallet's "view key does not match" check is in `simplewallet`, not in this path.
- Consequences without a check of our own:
  1. A mistyped or wrong view key makes a wallet that silently never sees a payment. Setup would stall at the test tip with no clear reason.
  2. A **spend key** pasted at the view-key prompt is accepted and stored in the wallet file on the wallet host, against the rule above.
Proposal:
1. **Before anything reaches wallet-rpc,** the bridge computes the public key of the entered value (scalar × the Ed25519 base point) and compares it with the address's public view key (bytes 33–64 of the decoded address).
   - **Equal:** go on.
   - **Equal to the address's public *spend* key:** refuse with "that is the shop wallet's SPEND key: never enter it here; paste the private VIEW key", and drop the value.
   - **Neither:** refuse with "that private view key doesn't belong to this address".
2. **Implementation:** Go's standard library has Ed25519 signatures but no raw scalar multiplication on the base point, so this needs a small base-point multiplication of our own, about 150 lines on `math/big`, in the shipped bridge (Tier 1, standard library only, like the hash-list verifier). It runs once at install, on a value the admin just typed.
3. **Tests**, before it is trusted:
   - Against Go's own `crypto/ed25519`, as an oracle in the test only: for random seeds, our multiplication of the clamped `SHA-512(seed)` scalar must equal `ed25519.NewKeyFromSeed(seed).Public()`, plus the RFC 8032 section 7.1 keys.
   - A property test: `k·G == (k mod l)·G`.
   - Fuzzing.
   - Live: the real stagenet view key matches the real address, and a wrong key is refused.
4. **Also** `wallet.Open` keeps checking `get_address`. That only proves the address, not the key, so the install-time check is the one that matters.
Effect on the admin budget: none. A wrong or spend key is caught at the prompt with a message, instead of a setup that never sees the test tip.
Effect on the trust contract: none (plugin unchanged). The bridge gains about 150 lines of curve arithmetic that we own.
Wyatt's decision (2026-10-04): accepted, the bridge's own check as proposed. This replaces item 3 of the approved 3c plan (relying on wallet-rpc's check). Wyatt updates the live spec and `docs/spec.md`.

## 12. More than 32 transfers to one address: the bridge sends the 32 largest  (status: accepted, 2026-10-04)
Found in: phase 03 session 3d plan, comparing the plugin's caps with what a wallet can report
Spec says: API contracts, `POST bridge/sync`: a snapshot carries the transfers to one watched subaddress. The plugin caps a snapshot at 32 transfers (phase 02, `MAX_TRANSFERS`; `contract/test-vectors/README.md`) and refuses the whole request beyond that. The spec doesn't say what the bridge does when a subaddress has received more.
Evidence: anyone who sees a pay address can send it many tiny payments, so more than 32 incoming transfers to one invoice address is possible, if unlikely from a real buyer.
Proposal: when an index has more than 32 incoming transfers, the bridge sends the 32 largest (ties broken by the earlier height), logs a warning, and shows it in `xmr-bridge status`. Dropping the smallest can only lower the reported total, so it can't make an invoice look paid that isn't; an honest buyer paying in more than 32 parts would go to review as underpaid, where the admin sees the transfers in the wallet.
Effect on the admin budget: none.
Effect on the trust contract: none.
Wyatt's decision (2026-10-04): accepted with the 3d plan. Wyatt updates the live spec and `docs/spec.md`.

## 13. The remote-node cross-check: what is compared, when, with whom, and how the site hears of it  (status: accepted, 2026-10-04)
Found in: phase 03 session 3e plan
Spec says: Bridge service, duty 6: "Cross-check on remote nodes: before reporting a transfer as confirmed, compare the block hash at its height with a second node. A mismatch holds the transfer at 0 confirmations and turns a health check red." Open question 12: which second nodes to use by default.
Evidence (reasoning, before code): the wallet trusts its node's view of the chain. Comparing "the block hash at its height" means asking the configured node for that hash, and a dishonest node could serve the wallet a fabricated block yet answer that question honestly. Asking the second node about the txid directly would close that, but tells the second node's operator which transactions this wallet host cares about.
Proposal (Wyatt's decisions, 2026-10-04):
1. **What:**
   - For each mined transfer the bridge is about to report, it asks a second node for the whole block at that height (`get_block`).
   - The transfer's txid must be in that block's transaction list, and that block's hash must equal the configured node's hash at the same height.
   - Confirmations reported are the smaller of the two nodes' counts.
   - The second node learns a height, not a txid.
   - Results are kept per (txid, height); a reorg changes the height, so the transfer is checked again.
2. **When:** only when the configured node is not your own, meaning its address is not loopback and not a private or link-local address (a host name is resolved first). A node on the same machine or your LAN is trusted.
3. **With whom:** a built-in list of public nodes per network, tried in random order; no setting. The list is chosen with Wyatt in 3e (open question 12) and changes only with a bridge release.
4. **A mismatch** holds the transfer at 0 confirmations and turns the check red. **No second node answering** reports confirmations as they are, with an amber "node check unavailable", so a public-node outage can't stall every payment.
5. **The site:** the bridge sends an optional `checks` field in the sync body (the plugin ignores unknown fields today); the plugin shows it on the admin page in phase 04. Until then it shows in `xmr-bridge status` and the log.
Effect on the admin budget: none (no setting; your own node needs nothing).
Effect on the trust contract: none for the plugin. The bridge makes outbound requests to the listed public nodes only when the configured node is remote.

## 14. The plugin is renamed Coffer (slug `coffer`)  (status: proposed, 2026-10-05; the rename itself is Wyatt's decision, the spec text is for him to fold in)
Found in: Wyatt's request before phase 03 session 3h. Code changed in commit `2f0bdf1`.
Spec says: Plugin manifest: `"slug": "xmr-pay"`, `"name": "Monero Payments"`. The plugin is called xmr-pay throughout.
Evidence: EmDash takes the plugin id from the manifest slug, and the id is part of everything the plugin owns on a site. So the rename makes a new plugin, not an upgrade of the old one:
- The route prefix `/_emdash/api/plugins/<id>/…`. The bridge's sync URL is now `/_emdash/api/plugins/coffer/bridge/sync`, and the access-rule advice says `/_emdash/api/plugins/coffer/*`.
- `_plugin_storage.plugin_id`, the index names `idx_plugin_<id>_<collection>_<field>`, the `plugin:<id>:settings:*` options and the `_emdash_cron_tasks` row (dev site, `data.db`, checked 2026-10-05).
- A site that ran xmr-pay keeps that data until it's removed. On the dev site it was removed by hand: EmDash's own uninstall handlers act only on registry and marketplace plugins, not on plugins listed in `astro.config.mjs` (`emdash` `api-*.mjs`, `handleRegistryUninstall` and `handleMarketplaceUninstall`). Nothing has been published under either slug, so no real site is affected.
Proposal: change these in the spec:
- line 1, the title: "Coffer: Monero payments for EmDash, design spec" or similar (Wyatt's wording)
- line 55, the diagram: "Coffer plugin"
- line 149, `"slug": "coffer"`; line 154, `"name": "Coffer"`. The admin page label and widget title ("Monero payments") and the widget id `xmr-status` stay, being part of the admin trust contract.
- line 345, the pool top-up label: "a label such as `coffer`" (the bridge now uses `coffer`; nothing reads the label back)
- line 356 and line 588: `/_emdash/api/plugins/coffer/bridge/sync`
- lines 501, 507, 512, 526 and 537: "xmr-pay" becomes "Coffer"
Kept as they are (Wyatt, 2026-10-05):
- The wallet-host side is still **xmr-bridge**: the binary, the service user, `/var/lib/xmr-bridge`, `/etc/xmr-bridge`, the unit, the update guard, and the signed prefix `"xmr-bridge-release-v1\n"`. `install.sh` now says "xmr-bridge installer:" and uses `xmr-bridge.XXXXXX` temp folders.
- The repo, its folder `~/xmr-pay`, and the dev-box paths (`~/xmr-pay-dev-data`, `~/xmr-pay-devkeys`, `~/.config/xmr-pay-dev`).
Left for Wyatt:
- The unit's `Description=xmr-pay wallet host (xmr-bridge)` (`bridge/internal/installer/unit.go:10`) is unchanged, because the unit was out of scope. It's the one place the admin still sees the old name (`systemctl status`).
- The proof of concept (`docs/poc/monero-payments-poc.html`, `poc-simulation.js`) is a snapshot of the published page and still says xmr-pay, including its `SYNC_PATH`.
- Whether `coffer` is free as a registry slug under your publisher and as an npm name (phase 06 and phase 09).
Effect on the admin budget: none.
Effect on the trust contract: capabilities, allowed hosts, route names, storage collections and indexes are unchanged. The route URLs and the plugin's identity change, which is a fresh install with a fresh consent, not an update.

## 15. A reinstalled bridge must catch its wallet up to the site's pool before it reports  (status: accepted, 2026-10-07)
Found in: phase 03 session 3h, step L3 (stagenet, dev box). Evidence files: `~/xmr-pay-dev-data/3h-L3-*.txt` and `3h-watch.txt`.
Spec says: spec change 9: "a reinstalled bridge (a fresh wallet from keys) must recreate addresses up to the highest pool index before it reconciles". Bridge service, Reconcile on start. The bridge has no code for this; the sync response doesn't tell it the pool's highest index.
Evidence. The bridge was uninstalled with `--delete-data` and reinstalled from keys (restore height 2222850, before every payment of the session). The site kept its pool: 311 indexes, free 262–311. The fresh wallet knew indexes up to about 10, from the payments it found while scanning.
1. **A false "reversed".** The first sync after the reinstall (02:53:35 UTC, 7 s after the wallet opened) reported watched index 261 as empty, because the fresh wallet has no address 261. The plugin moved the settled invoice `far` to review `reversed` with received 0, and raised the admin alert. Its payment is on the chain, and the invoice stays in review. An open invoice paid before a reinstall would instead look unpaid and expire.
2. **An accidental, lazy catch-up.** While the pool was full, the bridge created nothing. Once a checkout claimed one row, the site asked for 1 address. The fresh wallet's `create_address` returned a low index the site already had (about 11; inferred from 303 creations ending at 312, since the journal logs counts, not indexes), so it was silently skipped (`plugin/src/sync/handle.ts:109`). A pending address makes the bridge sync again at once, so it looped: **303 syncs in 31 s** (02:56:13–02:56:44), one address each, until index 312. It's harmless at this size, but it's a burst of signed requests that grows with the pool's history, and it only starts after the next checkout.
3. **What did work.** `far2` (index 262), paid after that catch-up, was seen in the mempool and settled (03:03:24). A payment *mined* to an index before the fresh wallet creates it would be missed for good, because blocks already scanned aren't rescanned (spec change 9, stand-in step 2).
4. **A side note for any rescan:** the bridge's wallet-rpc client times out after 5 s (`supervise.go:285`), and `rescan_blockchain` answers only when it's finished. wallet-rpc carries on regardless (`TestLiveLookahead`).
Proposal (smallest that fixes 1–3):
- **Plugin:** the `bridge/sync` response gains `poolTop`, the highest `addrIndex` the site holds (pool and invoices). An optional field: older bridges ignore it.
- **Bridge, at start and whenever `poolTop` is above the wallet's highest index, before sending any snapshot:**
  - create addresses up to `poolTop`, without sending them (the site has them already)
  - then `rescan_blockchain` once, with its own long timeout
  - then reconcile as now
  
  While catching up it sends no snapshots, so nothing can look reversed or unpaid. `status` shows "catching up the wallet (n of m addresses)".
- **Bridge, top-ups:** start numbering from the wallet's next index only once that index is above `poolTop`. That removes the duplicate loop.
- **Tests:** unit tests with fakes (fresh wallet, pool above it, no snapshots before catch-up, one rescan, no duplicate addresses), then this L3 run again on stagenet.
Effect on the admin budget: none. No setting or step; a reinstall just takes the time of one rescan.
Effect on the trust contract: none. It adds a response field on an existing route; no capability, host, route or storage change.

## 16. The height the site relies on can be far off: a fresh wallet's first sync, and checkout's estimate after a silence  (status: accepted, 2026-10-08; sub-choice recorded as the recommended one, refuse checkout while the bridge is silent, open to Wyatt's override before implementation)
Found in: phase 03 session 3i (stagenet, dev box). Evidence: `~/xmr-pay-dev-data/3i-status-output.txt` (journal), `3h-watch.txt`, the `far3` invoice in the dev database.
Spec says: `bridge/sync` carries the wallet's `height`, which the plugin stores as the chain height (`state:bridge`). Checkout sets `createdHeight` from it, and `expiresHeight` = that + 15 + 3 blocks. A payment reported after the deadline counts if it was mined at or below `expiresHeight` (Lifecycle, "On time or late").
Evidence:
1. **A fresh wallet reports a tiny height.** After the reinstall, the bridge logged `wallet open height=579994` (the chain was at 2224442). Its first sync, the learning one, sends that height, and the site stored it for about 12 s until the catch-up and the next sync. 3h's first sync also came 7 s after the wallet opened. Any first install does the same while the wallet is still refreshing.
2. **Checkout's estimate after a silence was 35 blocks low.** With the bridge silent for about 1.5 days, checkout estimated the height as the last sync's plus 2 minutes a block (`checkout.ts:142`). It gave `createdHeight` 2224369 against a real 2224404. So `far3`'s `expiresHeight` (2224387) was below the chain the moment it was made.

Effect: an invoice created in either state gets an `expiresHeight` that is too low, by about 1.6 million blocks in case 1. A payment to it that the plugin doesn't see before `expiresAt` (a bridge outage) can then never count as on time by its block height. It would go to review `late` although it was paid in time. Nothing in 3i was affected: `far3` was never paid, and no checkout fell in case 1's window.
Proposal (smallest):
- **Plugin:** the stored height never goes down (`max(stored, reported)`). That covers case 1, since the site already holds the real height from before. A first install has no stored height and no invoices yet.
- **Plugin, checkout:** if the last sync is older than the silent-bridge threshold (5 minutes, spec change 2), refuse checkout with a domain error such as `WALLET_HOST_SILENT` instead of estimating. Or, the gentler option: keep the estimate but count `expiresHeight` as unknown, so only the time-based on-time rules apply. Wyatt to choose. Refusing is simpler and is what the admin alert already implies.
- **Bridge (optional):** don't send a sync until wallet-rpc's height is within a few blocks of the node's. It needs a node call the bridge already makes for the cross-check.

Effect on the admin budget: none. Trust contract: none (a new domain error code, if chosen).
Implemented in session 3j (2026-10-08), with the bridge part skipped (Wyatt): `bridge/sync` stores `max(stored, reported)` and judges snapshots at that height; checkout returns `WALLET_HOST_SILENT` when the bridge never synced or its last sync is more than 5 minutes old, checked after the product lookup and before the price request, and otherwise uses the last sync's height with no estimate. Spec text to fold in, API contracts, checkout errors: `{ "error": { "code": "PRODUCT_NOT_FOUND | RATE_UNAVAILABLE | NO_ADDRESS_AVAILABLE | TOO_MANY_OPEN | WALLET_HOST_SILENT" } }`, with: "`WALLET_HOST_SILENT`: the wallet host hasn't synced for over 5 minutes (the admin page shows the same alert), so the site can't be sure of the chain height an invoice's deadline is set from."

## 17. A reinstall's restore height  (status: accepted, 2026-10-08; option (a), recommended, open to Wyatt's override before implementation)
Found in: phase 03 session 3i.
Spec says: the installer creates the wallet "with a restore height of today (no full-chain scan)" (Admin setup, step 3). `xmr-bridge install --restore-height` defaults to today.
Evidence: spec change 15's catch-up rescans from the wallet's restore height. In 3i, `far4` was paid and mined while the bridge was uninstalled. The rescan found it only because the reinstall passed `--restore-height 2222850`. With the default it would have been missed, and the invoice would have expired unpaid.
Proposal: when the site already holds invoices, the restore height must be at or below the oldest watched invoice's `createdHeight`. Either:
- **(a)** the `bridge/sync` pairing response returns a suggested restore height (the minimum `createdHeight` of watched invoices, minus a margin), and the installer uses it when no `--restore-height` was given, before creating the wallet. That reorders the install a little, because pairing would come before the wallet's creation.
- **(b)** the bridge compares, on its first sync, the oldest watched invoice's height (sent in the response) with its restore height. If the restore height is too new, it recreates the wallet from keys with the lower height (it needs the view key again, read from the existing wallet or asked for again).

(a) is simpler and keeps the view key handling as it is. Effect on the admin budget: none for (a) (no prompt or setting). Trust contract: a response field.
Implemented in session 3j (2026-10-08), option (a) with a 720-block margin (Wyatt):
- **Plugin:** the response that completes a pairing carries `restoreHeight` = the oldest watched invoice's `createdHeight` − 720, floored at 0, and leaves it out when nothing is watched. Ordinary syncs never carry it.
- **Bridge:** `xmr-bridge install` now pairs before it creates the wallet. A new wallet's restore height is `--restore-height` if given (with a warning when it is newer than the suggestion), else the suggestion, else the node's height. The height used is written to the config.
- **A kept wallet** (a rerun for the same address, or `xmr-bridge pair`) keeps its height. The admin is told how to start over (`uninstall --delete-data`, then install again) when that height is newer than the suggestion. There's no warning when the height wasn't written down (wallets made before 3j without `--restore-height`).
- If wallet creation fails after pairing, the code is spent; the error says to press Connect wallet host for a new one.
Spec text to fold in, Admin setup step 3: "creates the view-only wallet with a restore height of today (no full-chain scan), or, when the site already has open invoices, from just before the oldest of them (the pairing response suggests it), so a reinstall sees payments made while the wallet host was away"; and in the installer's steps, pairing moves before the wallet's creation. API contracts, `bridge/sync` response: "`restoreHeight` (number, on the response that completes a pairing only, absent when no invoice is watched)".

## 18. A tips-only tier with no wallet host  (status: A accepted for phase 07, B deferred until after release 1; 2026-10-16)
Found in: Wyatt's planning chat, 2026-10-08, comparing Coffer with SlowBearDigger's `xmr-pay` (npm 1.1.0, published 2026-06-21; README section "You do not need a dedicated server"). Not found by code or tests; it reopens a decision at Wyatt's request.
Spec says:
- Key design decisions, "Wallet host on its own Linux machine": "A watcher inside the plugin and running on the site's server were both considered and rejected."
- Where the wallet host runs: "Considered and rejected: … a watcher inside the plugin with no machine at all (the site would hold the view key and depend on public nodes)."
- Tip jar mode, the options table: "Static address | One primary address and QR in the theme, no plugin | Works today, zero moving parts | Address reuse, no confirmation, no per-post attribution".
- Admin budget: "Required settings | None."
- `docs/decisions.md`: "The wallet host must be a separate machine from the site; no in-plugin "quick setup" mode". `CLAUDE.md`, trust contract: "The plugin never calls the wallet, a node, the bridge, or any host but the two price APIs."

Evidence:
1. **xmr-pay's claim.** "confirming a Monero payment is, underneath, just reading public blockchain data and doing some math", so no always-on box is needed. It offers three ways:
   - **Proof mode:** the buyer pastes a txid and a tx key or tx proof; a stateless endpoint checks it against one or more nodes.
   - **Watch mode:** "a long-running process you host", holding the view key (through wallet-rpc or a WASM scanner).
   - **Its WordPress plugin:** both, in pure PHP with vendored monerophp curve code, run by WP-Cron and checkout page loads.
2. **How each maps to a sandboxed EmDash plugin** (`docs/reference/emdash-knowledge-base.md` 9.9 and 6.11):
   - **Watch mode:** the sandbox has no long-lived process, and a Cloudflare-hosted site has no server to run one on. On a Node site it would run on the site's own server, which the installer refuses.
   - **Scanning inside the plugin** (the WordPress route): puts the view key in the site's database, the case the spec rejected. On Cloudflare it must also fit 50 ms CPU and 10 subrequests per call, with at least one variable-base curve multiplication per transaction in every block.
   - **Proof checking:** fits the sandbox's shape: one public route, no long-lived process, no view key. The site needs only a public shop address, and a proof is bound to that address.
3. **Their JavaScript can't be used as-is.**
   - `verifyPayment` needs `monero-ts`: a multi-MB WASM build, rejected in `docs/decisions.md`, and over the 128 KB `backend.js` cap.
   - `verifyPaymentViaRpc` needs a wallet-rpc, which is a server.
   - So a proof check in the plugin means our own Keccak-256 and Ed25519 point arithmetic in TypeScript. WebCrypto's Ed25519 only signs and verifies.
   - Precedent: spec change 11's base-point multiplication in the bridge (`internal/edwards`, about 150 lines on `math/big`).
   - The plugin bundle is 27.9 KB of 128 KB today.
4. **Two traps a proof check must close.**
   - **The encrypted amount (`ecdhInfo`) isn't checked by consensus,** so a sender can write any amount there. The check must decode the amount and verify it against the output's commitment (`C == mask·G + amount·H`), as `wallet2` does when it checks a tx key.
   - **The check trusts the node for the transaction itself.** A dishonest node can serve a transaction that was never mined, built to match a proof the attacker made. Two independent nodes agreeing, plus the txid being in the block at its height (the spec change 13 check), limit this; nothing removes it. That's why this proposal covers tips only: a forged tip releases nothing, a forged order would.
5. **Why it matters.** Coffer's pitch says it isn't for "anyone without a machine of their own or a host they trust", and "no server" is xmr-pay's headline. A tier with no machine and no view key on the site answers that without giving up "the site holds nothing worth stealing".

Proposal: two steps, decided separately. Neither changes phase 04.

**A. Static tip button (theme kit, phase 06).** The spec's "Static address" option, shipped as a mode of Coffer's tip button instead of being left to each theme.
- The button takes a shop address as a prop. That can be the primary address or a subaddress set aside for tips, which keeps the primary address unpublished.
- It shows a locally rendered QR, the address, copy and "open in wallet", with a plain label: the site doesn't confirm these tips.
- Once a wallet host is paired, the same button makes tip invoices (phase 07), with no theme edit in between.
- For Wyatt: while checkout returns `WALLET_HOST_SILENT`, should the button fall back to the static address (tips keep flowing during an outage, unrecorded) or show the error?
- No plugin change.

**B. Proof-checked tips with no wallet host (plugin, phase 07 at the earliest), only if the spike below passes.**
1. **Tip address:** the admin types the tip address once on the admin page. It's public data, not a secret.
2. **Submitting a proof:** after paying, the buyer submits:
   - the txid
   - the tx key or an OutProofV2
   - optionally, the entry reference and a note

   A new public route (for example `tip/prove`, POST) validates the format before any network call and refuses a txid already recorded (a unique index). The pay page prefers the OutProof where the buyer's wallet offers one: a tx key also lets the site test the transaction's other outputs, such as the buyer's change, against addresses it knows.
3. **The check:** the plugin asks two nodes from a built-in list for the transaction and the chain height. The nodes learn which txid the site asked about, not the amount or the address. A tip counts only if:
   - both nodes return the same transaction, mined, and the txid is in the block at that height
   - `unlock_time` is 0 and there's no double-spend flag
   - the proof is valid for the tip address
   - each amount decodes and matches its commitment
   - the sum to the tip address is at least the dust floor
   - confirmations are at least the lowest tier of the speed preset
4. **Not passed yet:** a transaction that isn't mined, or is short of confirmations, is stored as pending and rechecked in bounded batches by the backup cron and the status route (as in spec change 2). Nothing counts as a tip until it passes. A node that doesn't answer means "try again", never a tip.
5. **After it passes:** the tip counts toward per-entry totals and notes exactly like a settled tip invoice. The admin page marks it "checked by public nodes".
6. **Pairing a wallet host later:** new tips switch to tip invoices. Only the bridge, holding the view key, can confirm that a tip subaddress belongs to its wallet. How it reports that is a detail for phase 07.
7. **Spam:** checkout's site-wide cap approach, plus a per-minute cap on node calls, so a flood of fake submissions can't exhaust the nodes or the CPU budget.

**Spike for B** (about half a session, after phase 04):
1. Does `ctx.http.fetch` reach `http://` hosts and non-default ports (18081, 18089) listed in `allowedHosts`, on both runners? If not, only HTTPS nodes qualify. How many public HTTPS nodes exist for stagenet and mainnet?
2. CPU: our own BigInt verifier on a real 2-output and a 16-output stagenet transaction, in the Cloudflare runner (50 ms) and in workerd.
3. Size: what the verifier adds to `backend.js`.
4. Outbound calls per check against Cloudflare's 10-subrequest cap, and whether `ctx.storage` calls count toward it.
5. Correctness: our verifier against the dev box's `monero-wallet-rpc` (`check_tx_key`, `check_tx_proof`) as an oracle on stagenet. Cases:
   - real tips
   - a wrong key
   - a wrong address
   - a hand-built mismatched `ecdhInfo` amount
   - a time-locked transaction
   - a fabricated transaction served by a proxy node
6. Buyer side: which wallets show a tx key or make a tx proof, and in how many steps (a setup-friction row for buyers).

If any of items 1–4 fails, B is dropped and A stands alone.

Effect on the admin budget:
- **A:** none. The tip button takes one prop (the address); no new step.
- **B:** a tips-only site is set up with the registry install plus one typed value: no command, no machine, no view key. But the address is a fourth setting, required in this tier, against "Required settings: None"; Wyatt decides whether that's acceptable. No routine upkeep for admins. The built-in node list needs plugin releases as nodes disappear, which is upkeep for the maintainer, not the admin.

Effect on the trust contract:
- **A:** none.
- **B:** broadens it:
  - `allowedHosts` gains the built-in node hosts
  - a new public route
  - a unique `txid` index, on `invoices` or a new collection
  - a fourth setting
  - CLAUDE.md's line "never calls … a node" changes

  If all of it lands before the first release, no installed site has consented to the old contract. After release, adding a node host is a broadening, so a major version.
- **Both keep** the reason behind the "no in-plugin watcher" decision: no key of any kind on the site; the view key stays on the wallet host or nowhere. B does take on the rejected watcher's other cost, depending on public nodes, and accepts it for tips only. Only the decision's wording, "no in-plugin quick setup mode", is reopened.

Recommended order (planning chat): accept A for phase 06. Run B's spike after phase 04 and decide B before phase 07. Phase 04 goes ahead as written.
Decision (Wyatt, 2026-10-16, phase 07 plan):
- **A is built in phase 07, as a fallback of the invoice tip button** rather than a separate mode.
  - The button takes an optional shop `address` and a `network`.
  - When checkout can't make a tip invoice (no free pool address, as before pairing; the open-invoice cap reached, `TOO_MANY_OPEN`, added by Wyatt; or the plugin can't answer), the visitor sees that address with a local QR, Copy, and "This site doesn't confirm these tips."
  - Once a wallet host is paired, the same button makes tip invoices with no theme edit.
  - The question above about `WALLET_HOST_SILENT` is moot: tips are taken while the host is silent (spec change 33).
- **The address is checked** (Wyatt): base58 alphabet and length (95; integrated addresses refused), and its network byte against `network`.
  - A bad one shows an error for the site's admin, never a QR or the address.
  - The base58 checksum needs Keccak-256, which WebCrypto lacks; wallets check it before sending.
- **B (proof-checked tips) waits until after release 1,** spike included.

## 19. The "paste a key by hand" fallback has nothing to paste  (status: accepted, 2026-10-09, option (a))
Found in: phase 04 session 4b, building the Settings section.
Spec says: Configuration, "Bridge public key | filled in by pairing | … Pasting a key by hand is a fallback for advanced setups. Not a secret." Phase 04, Settings: "The bridge public key read-only, with 'paste a key by hand' as an advanced fallback."
Evidence:
- `xmr-bridge` makes its key only inside pairing (`internal/pairing.Pair`): a new key per attempt, saved only when the site accepts it.
- No command prints the public key (`grep PublicKeyText bridge/cmd`: nothing), and no command makes a key without pairing.
- So an admin has no key to paste. A pasted key would also leave the bridge without the private key that matches it.

The fallback would only help where pairing fails but signed syncs would work. Pairing and syncs use the same route, the same signature check and the same outbound connection, so nothing found so far fits that.

Proposal:
- **(a), recommended:** drop the fallback from the spec. Pairing stays the only way to set the key, and the admin page shows the key read-only, as built in 4b.
- **(b):** a new `xmr-bridge key --new` that makes and saves a key and prints its public half; the admin pastes it into a form on the admin page. That's one more bridge command, one more admin path to test and document, and a way to put a key on the site that no pairing code vouches for.

Effect on the admin budget: none for (a); for (b), an extra advanced path (not part of setup).
Effect on the trust contract: none for either (the key setting exists already).
Wyatt's decision (2026-10-09): (a), drop the fallback. Also, `xmr-bridge status` prints the bridge's public key in the form the admin page shows, so the admin can check they match. Implemented in phase 04 session 4b.
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Configuration, the Bridge public key row: "| Bridge public key | filled in by pairing | none | Shown read-only; pairing is the only way to set it. `xmr-bridge status` on the wallet host prints the same key, so the two can be compared. Not a secret. |"
- No other line of the spec mentions pasting a key. Key design decisions ("…instead of a key to copy by hand") already says pairing replaces copying a key.

## 20. A node that's still syncing passes every check  (status: accepted, 2026-10-12, as part of Wyatt's approved phase 05 plan)
Found in: phase 05, preparing run A on a newly started node (Wyatt's notes, 2026-10-12).
Spec says: Configuration, Monero node: "Defaults to a local `monerod` if one answers (recommended); otherwise asks for a remote node you trust." Bridge service, duty 6 (and spec change 13, item 3): a second node from a built-in list. Phase 04's wallet check (`checks.wallet`) compares the wallet's height with its node's: `ok`, `behind`, `unavailable`.
Evidence:
- `get_info` from run A's new node over restricted RPC, from the dev box, on 2026-10-12: `nettype` stagenet, `height` 94,954, `target_height` 2,227,755, `synchronized: false`, `busy_syncing: true`, `restricted: true`. So `synchronized` and `target_height` do come through restricted RPC; `version` comes back empty there.
- The installer's node check (`chooseNode`) tests the network and `offline`, not `synchronized`, so it accepts that node.
- The wallet check compares the wallet only with its own node's height. A wallet on a half-synced node reads `ok`, and the admin page's checklist shows Wallet synced, while a payment on the real chain can't appear until the node catches up. That is exactly an admin who has just started their own node.
- The cross-check's second node had the same gap: a syncing second node gives a low height, so every payment is held at 0 confirmations. It could also pick the configured node itself, since every stagenet node listed as online today is on the built-in list.

Proposal (accepted):
1. **Installer:** when the chosen node isn't synchronized, it says so in one line (block N of about M, payments can't show until it has caught up, a new node can take hours, `xmr-bridge status` shows progress) and goes on. No new prompt, no refusal.
2. **Wallet check:** a new state, `syncing`, when the wallet host's node says it isn't synchronized. It takes precedence over `ok` and `behind`. `xmr-bridge status` shows the wallet check too.
3. **Admin page:** Wallet synced is not done while the state is `syncing`; a red health line says the node is still syncing, with one action (wait; check with `xmr-bridge status`). The plugin accepts the new state; an older plugin drops unknown states, so no protocol version change.
4. **Second node:** never on the configured node's host (any scheme or port), and only one that says it is synchronized.
5. **Checkout is unchanged in this change, and that is not safe; open for Wyatt.** The bridge reports the wallet's height, which can't pass its node's. An invoice created while the node syncs gets `createdHeight` and `expiresHeight` from that low height (spec change 16's `max(stored, reported)` doesn't help on a first install, which has no stored height). A payment mined on the real chain is far above `expiresHeight`. As the node catches up, the invoice expires on the rising heights, and the payment then counts as late and goes to review, although it was paid in time. Corrected 2026-10-12: this item first said the opposite. Options:
   - **(a), recommended:** checkout refuses while the wallet check says `syncing`, like spec change 16's `WALLET_HOST_SILENT`. It needs a new checkout error code or a reuse of that one, which is an API contract change. Get a test address already waits, because Wallet synced is to do.
   - **(b):** keep checkout and treat `expiresHeight` as unknown for invoices created during a sync, so only the time-based rules apply.
   Until Wyatt decides, the setup test is unaffected: run A starts only after the node has caught up, and run B uses a synced public node.

   **Wyatt's decision (2026-10-12): (a), with a new code.** Implemented the same day:
   - Checkout refuses with `WALLET_HOST_SYNCING` while the last sync's wallet check is `syncing`. As with `WALLET_HOST_SILENT`, it refuses before the price request, so nothing is claimed. A silent host is reported as silent, since its last check is stale.
   - Get a test address refuses with a message saying the node is still catching up.
   - The admin page's red line adds "Checkout is paused until then."
   - Spec text to fold in, API contracts, checkout errors: add `WALLET_HOST_SYNCING` to the code list (`… | WALLET_HOST_SILENT | WALLET_HOST_SYNCING`), with: "`WALLET_HOST_SYNCING`: the wallet host's node is still catching up with the network (the admin page shows the same alert), so the chain height an invoice's deadline is set from would be far too low. Pages treat it like `WALLET_HOST_SILENT`: payments are temporarily unavailable."

Effect on the admin budget: none (one installer line, no prompt or step). A new node's sync time is outside the 15 minutes; the message makes the wait visible instead of silent.
Effect on the trust contract: none (the `checks` field is optional information in the sync body; no new route, capability, host or storage).
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Configuration, Monero node row: "… otherwise asks for a remote node you trust. If the node is still catching up with the network, the installer says so and goes on."
- Bridge service, duty 6: "… with a second node from a built-in list: never the configured node's own host, and only one that has caught up with the network."
- Admin page, health: "The wallet's height against its node's, and whether that node has caught up with the network."

## 21. The install command works without curl  (status: accepted, 2026-10-12)
Found in: phase 05, preparing the wallet-host container `coffer-test` (Wyatt's update 2).
Spec says: Bridge service, The install command: `curl -fsSL https://<release host>/install.sh | sh -s -- --site … --pair …`. The admin budget: "no software to install first".
Evidence:
- `command -v` on a clean container from Proxmox's plain Ubuntu 24.04 template: `sha256sum`, `sudo`, `wget` and `python3` are there; `curl` is not. A minimal Debian 12 container has no `curl` either (phase 05 prep).
- Both the admin page's command and `installer/install.sh` (its own check, then the bridge download) needed curl, so fixing only one would fail one step later.
- Proxmox containers are a likely home for a wallet host, so this is the common case, not an edge case.

Decision (Wyatt, 2026-10-12):
1. **The admin page's command** picks one downloader before fetching anything: curl, else wget, else a plain message saying what to install and to paste the command again. Still one line, no added step:
   `if command -v curl >/dev/null; then curl -fsSL <URL>; elif command -v wget >/dev/null; then wget -nv -O- <URL>; else echo "This command needs curl or wget. Install one (on Debian or Ubuntu: sudo apt install curl), then paste this command again." >&2; fi | sh -s -- --site … --pair …`
   - Not `curl … || wget …`: a curl that fails part way would send its partial output and then wget's whole copy into `sh`.
   - `-nv`, not `-q`: `wget -q` prints nothing on a 404, so the command would end silently.
   - It no longer runs in fish; bash, dash and zsh are fine.
2. **`install.sh`** uses curl with `--proto` as before, else `wget --max-redirect=0`, else the same plain message. The SHA-256 check and everything after it are unchanged.
3. **What stands in for `--proto` on the wget path: no redirects at all.** GNU wget can't limit the protocol a redirect goes to (`--https-only` applies only to recursive downloads), so it follows none, and the release URL keeps the protocol the build allows. Integrity never depended on it: the binary must match the SHA-256 written into `install.sh`. Open item for phase 09's install host: the binaries must be served from `RELEASE_BASE` without a redirect (GitHub Releases asset URLs redirect).

Effect on the admin budget: better. A machine without curl no longer needs software installed first; a machine with neither curl nor wget is told plainly what to install.
Effect on the trust contract: none.
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Bridge service, The install command, the code block:
  ```sh
  # Linux, the only supported platform at launch; curl or wget
  if command -v curl >/dev/null; then curl -fsSL https://<release host>/install.sh; elif command -v wget >/dev/null; then wget -nv -O- https://<release host>/install.sh; else echo "This command needs curl or wget. Install one (on Debian or Ubuntu: sudo apt install curl), then paste this command again." >&2; fi | sh -s -- --site https://example.com --pair <one-time code>
  ```
- After it: "The command uses curl, or wget where curl isn't installed (as on a clean Ubuntu or Debian container). With neither, it says what to install."


## 22. Tips first: two releases  (status: accepted, 2026-10-13)
Found in: Wyatt's plan change of 2026-10-13 (`docs/plan-change-tips-first.md`, Part 1), during phase 05.
Spec says: Build plan and testing, steps 5 to 9: one release after the store adapter (step 8).
Evidence: two Stripe-based payment plugins and a commerce plugin are already on the EmDash registry. Nothing is fulfilled on a tip, so a tips-only release carries far less risk than selling goods. No release reaches mainnet without an adversarial pass first.
Decision (Wyatt, 2026-10-13):
1. **Release 1, tips only:** phase 05 (unchanged; the confirmed test payment is a test tip), 06 (scoped to what tips need), 07 (unchanged), the new 07b (adversarial testing, pass 1), then 09 (release, mainnet tips trial). No order or product checkout.
2. **Release 2, orders:** 08 (store adapter), 08b (adversarial testing, pass 2), 09b (orders release, security report regenerated to cover orders).
3. **Goods kept out of release 1 by one switch** (Wyatt's choice of 2026-10-13, over leaving the code out of the build): a single constant in the plugin. With it off, `checkout` accepts only `kind: "tip"`, and `product` and `order` get the same reply as an unknown `kind`. The admin page hides what only products use (the "All invoices" table filtered to products, the review advice's "find it under All invoices" hint). The release-1 theme package has no PayButton. Dev and release builds run the same code. Phase 07 turns it off when tip checkout lands; release 2 turns it on. Pass 1 attacks every path (07b, row A0).
4. **The trust contract stays as declared:** release 1 publishes today's manifest unchanged. Per the spec and phase 08, orders need no new capability, host, route or index. If phase 08 finds it needs more (for example an `orderRef` index for a store that retries checkout), release 2 takes the version bump and the admin's fresh consent, written up here first.
5. **Security reports:** release 1's published report covers tips. Order-only threats stay listed, marked "covered in release 2".
6. **Sidebar icon:** the admin page declares `"icon": "coins"` (Phosphor's Coins; EmDash shows its generic plug when none is declared), set in phase 09's manifest step.

Effect on the admin budget: none.
Effect on the trust contract: none (item 4). The icon is an admin-page change, not part of the trust contract.
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Build plan and testing: after step 7, "7b. **Adversarial testing, pass 1.** A fresh session that didn't write the code attacks everything a tips-only install exposes, and proves no order path is reachable." Step 9 becomes "**Release 1 (tips).**" with the mainnet tips trial. After it: "8b. **Adversarial testing, pass 2** (orders, products, the store adapter, and a retest of pass 1 on changed code)" and "9b. **Release 2 (orders).**" Step 8 is marked as release 2.

## 23. The site address a sandboxed plugin gets can be localhost for good  (status: accepted, 2026-10-13)
Found in: phase 05, run A attempt 1 (`~/xmr-pay-dev-data/05-setup/run-a-attempt-1.md`, local).
Spec says: Admin setup and upkeep, the install flow: the admin page shows the install command with the site's own address. The plugin's address was assumed to follow the site's configured `siteUrl` (or `EMDASH_SITE_URL`), as the old admin hint said.
Evidence (EmDash 1.1.0, from its source):
- A sandboxed plugin's `ctx.site.url` is the `emdash:site_url` option and nothing else (`emdash-runtime`, `readSiteInfo`; the Node runtime sets no `deps.siteInfo`).
- That option is written once, at site setup (`setIfAbsent`). Setup under `astro dev` on localhost saves the request's own origin, so this dev site holds `http://localhost:4321`. The dev setup bypass also overwrites it with the request's origin.
- `siteUrl` and `EMDASH_SITE_URL` never update it. EmDash's own sign-in reads those first (`getPublicOrigin`), which is why the passkey worked at `https://dev.wyattdilley.com` while Coffer's command said localhost.
- EmDash's settings page has no field for it: its "url" setting writes `site:url`, a different key. Nothing in the CLI writes it either.
- So a real admin who first set their site up under `npm run dev`, or who later moved domains, gets a command aimed at the wrong address, and can only fix it in the database.
- On the Node runner, a route that declares no `request` block gets every request header except EmDash's strip list (cookies, authorization, Cloudflare Access headers, `x-emdash-request`). The admin route declares none, so the browser's `Origin` reaches it. The phase 01 stripping applies to routes with a `request` block, such as `bridge/sync`. Proved live on the dev site (saved address localhost): with `Origin: https://dev.wyattdilley.com` the page used that address; without it, the red line.

Decision (Wyatt, 2026-10-13), with his five conditions:
1. **A saved public https address is always used.** When the admin's browser is on a different https origin, an alert names both and the command keeps the saved one: no silent switch after a domain move (condition 5).
2. **Otherwise the admin's own browser Origin is used,** when it is a bare https origin that isn't loopback (condition 2). This covers a saved address that is loopback, plain http or missing.
3. **Anything else:** a red line naming the saved address, no command, and Connect wallet host refuses.
4. **Origin is read only on the private admin route** (signed in, `plugins:manage`), never on a public route (condition 3). Tests show spoofed `Origin`, `Host` and `X-Forwarded-Host` change nothing in the `status`, `checkout` and `bridge/sync` replies.
5. **The page says which address the command uses and where it came from** (condition 4): "(from your browser, because EmDash's saved address for this site is http://localhost:4321)" or "(EmDash's saved address for this site)".
6. **Proven before building on it** (condition 1): the runtime test host with real headers, and the live probe above.
7. **The installer** refuses a `--site` on localhost, 127.0.0.0/8 or ::1 without `--allow-same-machine`, before any prompt. Its same-machine check also moved ahead of the address and view-key prompts.

Effect on the admin budget: better. An admin whose EmDash saved a wrong address no longer needs a database edit; one opening the page at an address the wallet host can't use is told so, with no command.
Effect on the trust contract: none. No new route, header declaration, capability or setting.
Matrix note (for `docs/security-matrix.md`, row F06; Wyatt copies it into the Claude Doc): "The admin page reads the request's `Origin` header, on the private admin route only, and only to fill in the wallet host's site address when EmDash's saved one is loopback, plain http or missing; https only, never loopback. Public routes build no URL from any request header. Tests: `plugin/tests/routes/admin-site.test.ts`."
Upstream note (draft for Wyatt to post to EmDash): "`ctx.site.url` for sandboxed plugins comes only from the `emdash:site_url` option, which setup writes once (under `astro dev`, as the loopback origin) and nothing else updates. `siteUrl` and `EMDASH_SITE_URL` are ignored for it, though sign-in and invites prefer them (`getPublicOrigin`). Could plugin site info prefer the configured origin, as `getSiteBaseUrl` does, or could the admin settings expose the saved address?"
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Admin setup and upkeep, the install flow: "The command carries the site's address: EmDash's saved address when it is a public https one; otherwise the address the admin has the page open at, when that is https. The page says which, and shows no command when neither will do."
- Bridge service, the install command: the four-line form (spec change 21's command, split at `if` / `elif` / `else` / `fi`, with the shorter message "This needs curl or wget: sudo apt install curl, then paste again.").

## 24. Help the owner find the test tip in their wallet app  (status: accepted, 2026-10-15)
Found in: phase 05, run A attempt 2 (`~/xmr-pay-dev-data/05-setup/run-a-attempt-2.md`, local).
Spec says: Admin setup and upkeep, the setup checklist ending in a test tip; spec change 9 makes "the tip shows in the shop's wallet app, with its amount" a pass criterion.
Evidence:
- Coffer settled the test tip at 02:22:30 UTC, about 4 minutes in (block 2,228,686, txid `2f88c81c…c972ec`). The node agreed.
- Feather's shop wallet stayed empty, and the run failed at about 16½ minutes.
- Cause: Feather 2.8.1 gave the new 16-word (Polyseed) stagenet wallet a restore height of 2,230,020 from the seed's creation date, about 1,300 blocks above the chain. It scanned nothing.
- Feather 2.8.1 can't change the restore height of an open wallet. Re-restoring with "Override embedded wallet creation date" and height 2,228,000 showed the tip.
- The admin page gave the owner nothing to look for. A settled test tip appears nowhere but the checklist's "Done", and the `monero:` link under the test address has no label.

Proposal (Wyatt's suggestions 1–7, with Claude's recommendation on when):

| # | What | Where | When (recommended) |
| --- | --- | --- | --- |
| 1 | After the test tip settles, show its amount, txid and block height, with "Look for this in your shop wallet's history" | Plugin, setup section | Before the rerun of A |
| 2 | Beside it, a "Not in your wallet app?" hint: the app must be synced to the wallet host's height (shown); its restore height must be at or below block N (the tip's block); rescan if not | Plugin | Before the rerun of A |
| 3 | In the checklist, before Get a test address: "Open your shop wallet app and let it finish syncing. If the wallet is new, check its restore height is at or below block N", with N the wallet host's current height | Plugin | Before the rerun of A |
| 3b | Label the `monero:` link: "Payment link: fills in the address and amount in most wallets" | Plugin | Before the rerun of A |
| 4 | "Your shop wallet app" section in the install docs: a synced node, and the restore height of a new wallet | Phase 09 docs | Phase 09 |
| 5 | Setup-test protocol: a wallet prep step before the clock (restart, heights match, restore height below the current block); the run sheet records Coffer's settle time, the wallet app's show time and the confirmation wait separately | `docs/setup-test.md`, run sheets | Before the rerun of A (the prep is already in the local organizer sheet) |
| 6 | Upstream note for Feather (draft below) | For Wyatt to post | Any time |
| 7 | Preventive wording everywhere: check the shop wallet's restore height right after creating it, before installing; redo the restore then if needed | Setup test, phase 09 docs | With 5 and 4 |
| — | The installer's node prompt (the tester looked up the address) | Organizer sheet now; prompt wording at the next release rebuild | Not before the rerun: it would need another release build and signature |
| — | A place to see tips | Phase 07's tips view (already planned) | Phase 07 |

Effect on the admin budget: better, because a wallet-app mismatch shows up while it's cheap to fix. Item 3 adds guidance text, not a step Coffer runs or checks; there's no new setting or prompt.
Effect on the trust contract: none (admin page text only; the txid and height are already stored).

Decision (Wyatt, 2026-10-15): as proposed, with the "when" column as recommended. Item 1's details show in a "Test tip received" section at the top of the page for 24 hours after the tip settles (the plugin's clock, for display only), and inside Setup (complete) for good. Built before the rerun of A: items 1, 2, 3 and 3b in `plugin/src/admin.ts` (tests in `plugin/tests/routes/admin-setup.test.ts`), and items 5 and 7 in `docs/setup-test.md` ("Before the clock", the split timing table, pass criterion 7) and the local run sheets.

Addendum, item 3b (run B attempt 2, 2026-10-16):
- **What happened:** pasting the page's `monero:` link into Feather 2.8.1's Pay to box gave "Unable to resolve OpenAlias: Address empty", and the tester pasted the address alone.
- **Cause, from Feather's 2.8.1 source (`src/widgets/PayToEdit.cpp`, `src/SendWidget.cpp`):**
  - Feather reads a link only from a keyboard paste whose text starts with `monero:` (`keyPressEvent` → `pasteEvent` → `parse_uri_to_object`).
  - Pasted any other way, for example from the right-click menu, the link stays raw text. Text with a dot and no spaces counts as an OpenAlias (`isOpenAlias`), and the "Resolve OpenAlias" button then fails with "Address empty".
- **The link itself is well-formed:** Monero's `wallet2::parse_uri` accepts it (`tx_amount`, `tx_description`), and the admin's code block is a plain `<pre>` with no line numbers. The link can't drop the dot, because the amount needs one.
- **Fix:** the label now says how to paste and what to do if it fails: "Payment link: wallets that read one fill in the address and amount. Paste it with the keyboard (Ctrl+V, or Cmd+V on a Mac). If your wallet doesn't fill in the address, or says it can't resolve an OpenAlias, copy the address above instead." Step 6 of `docs/setup-test.md` says the same.

Upstream note for Feather (draft; Wyatt decides whether to post it, and no LAN addresses go in it):
"Feather 2.8.1, stagenet: a new wallet with a 16-word Polyseed got restore height 2,230,020, while the chain was at about 2,228,700 (2026-10-14). The height is in the future, so the wallet silently scans nothing and misses every payment until the chain passes it. Debug info shows the height, but nothing changes it; the only fix is restoring again with 'Override embedded wallet creation date'. Two asks: (1) clamp a new wallet's restore height to the node's current height; (2) expose the existing 'Change restore height' action (it's in the source but on no menu)."
Second note (same thread or separate): "Feather 2.8.1: a `monero:` URI pasted into Pay to from the right-click menu isn't parsed (only a Ctrl+V paste reaches `pasteEvent`), and a URI with an amount looks like an OpenAlias (`isOpenAlias`: a dot and no spaces), so 'Resolve OpenAlias' fails with 'Address empty'. Could `insertFromMimeData` route `monero:` text through the same URI parser, and could `isOpenAlias` skip text starting with `monero:`?"

## 25. Admin upkeep: tip records, quiet-host alerts, versions, a recovery sheet, an activity log  (status: proposed, 2026-10-14)
Found in: Wyatt's planning chat of 2026-10-14 ("what would make the admin side easier to live with"), after reading the spec, spec changes 1–24 and phases 07, 07b and 09.
Spec says:
- Phase 07: "a tips view with totals per entry (counted, settled tips only) and recent notes."
- Admin setup and upkeep, Health: one line per check, shown on the admin page and dashboard widget; the silent-bridge line turns red after 5 minutes without a sync.
- Updates: the bridge updates itself and wallet-rpc daily (on by default, can be turned off); an older protocol version shows "wallet host update available".
- Build plan step 10, Later versions: "Receipts through `email:send` … Each capability addition re-prompts consent."
- Proposed earlier, undecided: a reconciliation export (settled txids and amounts, to check in the owner's own wallet).

Evidence:
- Every invoice already stores `fiat` (amount, currency), `rate` (locked at checkout), `settledAt`, `transfers[]` (txid, amount, height) and `kind`. A tip's fiat value is already known; nothing shows it over time or lets the owner take it away. Tips are taxable income for most owners, and today they'd have to rebuild that record by hand from their wallet and a price history.
- Buyer notes are purged 30 days after an invoice is final. Invoices themselves are kept. So a record of amounts can be complete, but notes can't be, and anything that exports notes must say so.
- Health lines only help when someone opens the admin page. A home wallet host that loses power or a tunnel that lapses stays red until the owner happens to look, and every tip in that time waits.
- Run A attempt 2 showed that restore height is the easiest thing for an owner to get wrong, and the moment they most need the right number is when a wallet host has died. Spec changes 15 and 17 cover how a reinstall catches up; nothing hands the owner the numbers ahead of time.
- When auto-update is turned off, nothing tells the owner they've fallen behind until the protocol version gap shows up, and a Monero network upgrade would make an old wallet-rpc stop seeing payments.
- Re-pairs, setting changes and review decisions leave no trace the owner can read. A re-pair nobody remembers making is a security signal (it may mean the bridge key was replaced), and a trail makes support questions answerable.

Proposal (five parts, separable; Claude's recommendation on when):

| # | What | Where | Trust contract | When (recommended) |
| --- | --- | --- | --- | --- |
| 1 | **Tip record.** Extend phase 07's tips view with totals for this month, this year and all time, in XMR and in the site currency at each tip's locked rate. Add an export of settled tips: date (UTC), txid, block height, amount in XMR, rate, fiat value, currency, rate source, entry. This is the same table as the proposed reconciliation export; build them as one. Label the fiat column "value at the rate locked at checkout (up to 30 minutes before payment)" and add a line under the export: "Not tax advice. Check how your country values crypto income." Notes stay out of the export (they're purged after 30 days anyway). | Plugin (phase 07 tips view) | None, if the export fits an existing route (see question A) | Release 1, phase 07 |
| 1b | Store the price host that answered as `rateSource` on new invoices, so the export can name it. Older invoices show "not recorded". | Plugin, invoice field | None (a field, not an index or collection) | With 1 |
| 2 | **Quiet-host email.** One email when the wallet host has been silent for a set time (default 2 hours), one when it's back. Never more than one of each per outage. Off until the owner turns it on and EmDash has an email provider. | Plugin | Adds `email:send`: a new version and fresh consent | Release 2, bundled with buyer receipts so owners see one consent prompt for both |
| 2b | Until then: a short "Get told when this breaks" line in the install docs, pointing to the dashboard widget and to any uptime checker the owner already uses against the site (no new Coffer surface). | Phase 09 docs | None | Release 1, phase 09 |
| 3 | **Versions on the health list.** One line: bridge version, wallet-rpc version, auto-update on/off. Yellow when auto-update is off and the bridge's daily check found something newer: "Updates are off on your wallet host, and Monero X is out. Run `xmr-bridge update`." Requires the bridge to send its own and wallet-rpc's versions, plus "newer available", in the signed sync. | Plugin and bridge | None (sync body fields, not manifest) | Release 1 if the sync change is small, otherwise release 2. Ties to phase 09's open self-update question |
| 4 | **Recovery sheet.** A "If your wallet host dies" section on the admin page, closed by default, showing only public facts: the shop's primary address (shortened), the bridge key fingerprint, the restore height to use (the block before the first settled invoice, or the install height if none), the highest pool address index (so a rebuilt wallet looks far enough ahead), and the four steps to rebuild and re-pair. A "print this" hint. No view key, no seed. | Plugin text, plus phase 09 docs | None (all values already stored) | Release 1, with spec change 24's text work or phase 07 |
| 5 | **Activity log.** A short list of re-pairs, settings saves, review-queue decisions and test tips, newest first, each with time and which admin did it. Keep the last 100 entries in plugin KV, not a new collection. A re-pair entry gets a "Didn't do this? Re-pair now and check the wallet host" line. | Plugin | None if KV (see question B) | Release 2, or release 1 if A and B come back cheap |

Effect on the admin budget: setup unchanged (nothing here is a setup step; 2 is opt-in). Upkeep better: the owner gets a tax-ready record without rebuilding it, hears about outages, sees when they're behind on updates, and has recovery numbers before they need them.
Effect on the trust contract: none for 1, 1b, 2b, 3, 4 and (if B holds) 5. Part 2 adds `email:send` and must wait for a release that already re-prompts.

Questions for Claude Code to answer before any of this is built (from EmDash 1.1.0 source, as in spec change 23):
- A. **How does the owner get the export out?** Options, cheapest first: (i) a Block Kit code or text block holding CSV the owner copies; (ii) a raw text/csv response from the existing private admin route; (iii) a new private admin route. Say whether (ii) or (iii) changes the consent dialog or anything spec change 22 item 4 freezes. On a phone, (i) is awkward past a few dozen rows; note the limit.
- B. **Can the admin route see who is signed in** (for "which admin" in part 5), and is plugin KV available to a sandboxed plugin without a manifest change? If either is no, say what part 5 can do instead.
- C. **Does `email:send` reach a sandboxed plugin** on EmDash 1.1/1.2 when the site has an `email:deliver` provider (Wyatt's own site uses emdash-smtp)? Proof only, no build.
- D. For part 3: does the bridge's daily update check already know wallet-rpc's latest version when auto-update is off, or does it skip the check?

Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
- Admin setup and upkeep, Health: add "Versions: bridge, wallet-rpc, auto-update on or off; yellow when updates are off and a newer release is out."
- Tip jar mode: "The tips view shows totals by month, year and all time in XMR and in the site currency at each tip's locked rate, and exports settled tips (date, txid, height, XMR, rate, fiat value, rate source, entry) for bookkeeping. Notes are not exported."
- Admin setup and upkeep: add "Recovery: the admin page keeps the public numbers needed to rebuild a wallet host (primary address, bridge key fingerprint, restore height, highest pool index) with the steps to do it."
- Build plan step 10, Later versions: add "an opt-in email when the wallet host goes quiet and when it's back, shipped with receipts under the same `email:send` consent."

Not proposed (considered and left out): scheduled crypto-to-fiat conversion, or anything that moves funds. It needs spend authority and exchange keys on a server, which breaks "the site holds nothing worth stealing" and "money goes straight to the merchant." The tip record (part 1) and a docs page on converting XMR cover the need without custody.

Answers (Claude Code, 2026-10-15, from the EmDash 1.1.0 source installed in the dev site, and this repo's bridge):
- **A. The export.**
  - **(i) works today.** A Block Kit `code` block holds any string. `@emdash-cms/blocks` (`BLOCK_RESPONSE_LIMITS`) caps each string at 64 KB, the whole admin reply at 256 KB and 2,000 nodes. A CSV row of the proposed columns is about 200 bytes, so one block holds about 300 rows: one block per year, or per month in a busy year, fits. kumo 2.6.0's `CodeBlock` has no copy button, so the owner selects the text by hand: fine on a desktop, awkward on a phone past a few dozen rows.
  - **(ii) isn't possible.** The manifest validator requires the Block Kit `admin` route to be a private POST JSON route (`validateBlockKitAdminRoute`), and the runtime checks every `admin` reply as Block Kit (`validateSandboxedAdminResponse`); anything else becomes a 502 `INVALID_BLOCK_RESPONSE`. Raw replies exist only on routes declared `response: "raw"`.
  - **(iii) is possible but doesn't give a download.**
    - A new private route declared `response: "raw"` can return `text/csv` with `content-disposition` (an allowed header; 8 MB body cap; EmDash adds `nosniff` and a sandbox CSP).
    - EmDash's consent dialog doesn't change: its update gate (`handleRegistryUpdate`) re-prompts only for added capabilities, newly public routes and changed MCP tools. It does change Coffer's frozen route list and spec change 22 item 4 (release 1 ships today's manifest), so it's Wyatt's decision and release 2 at the earliest.
    - It can't be a link the owner clicks: private routes refuse a signed-in session without the `X-EmDash-Request: 1` header (`authorizePrivatePluginRouteRequest`, its CSRF check), so a plain link gets a 403, and Block Kit has no download action. Only an API-token `curl` reaches it, which is an admin step.
  - **Recommendation:** (i), one code block per year with its row count above it.
- **B. Who is signed in, and KV.** Yes to both.
  - A private route's handler gets `user` (id, email, name, role), filled in by the host after its own auth check; no `users:read` needed (`RouteContext.user` in `plugins/types.ts`; the workerd wrapper passes `serializedRequest.user`). It's undefined for an API-token call with no bound user: part 5 would log "an API token" then.
  - `ctx.kv` needs no capability or manifest entry (the sandbox bridge's `kv/*` calls). Coffer already uses it.
- **C. `email:send` from a sandboxed plugin.** Yes, on 1.1.0, when the plugin declares `email:send` and the site has an `email:deliver` provider.
  - The runtime hands `emailPipeline.send` to the sandbox runner (`setEmailSend`); the bridge's `email/send` checks the capability, then the provider, and throws "Email is not configured" without one.
  - A sandboxed send carries the plugin id as its source, so the site's `email:beforeSend` and `email:afterSend` hooks see it (only auth email skips them).
  - From source only, not run live. EmDash 1.2 isn't installed here, so this covers 1.1.0 only.
- **D. The update check with auto-update off.** It skips the check.
  - `startUpdates` (`bridge/cmd/xmr-bridge/update.go`) sets "off (installed with --no-auto-update)" and returns before checking anything.
  - The check is already separate from the install: `monerodl.Fetcher.Latest` fetches and verifies only the signed `hashes.txt`. Part 3 needs a small bridge change (check only, when off) and new signed sync body fields, a change to the spec's API contracts.
  - Also found: there is no `xmr-bridge update` command (the CLI has install, uninstall, version, run, pair, status, notify). Part 3's proposed line names it, and so does today's "Wallet host update available" banner (`plugin/src/admin.ts`). Logged in `docs/progress.md` for phase 09's self-update work.

## 26. The test tip's confirmations  (status: accepted, 2026-10-16)
Found in: phase 05, run A attempt 3 (`~/xmr-pay-dev-data/05-setup/run-A.md`, local), which passed at 13 minutes. Wyatt asked whether the test tip needs 2 confirmations.
Spec says: Admin setup and upkeep, Install flow step 6: "Send a test tip … Setup is done when it settles." Confirmation presets: Under 100 (site currency) is Fast 1, Standard 2, Strict 10; tips use that tier (`requiredConfirmations`). "Nothing is fulfilled at zero confirmations."
Evidence:
- Attempt 3's test tip, from the dev database and the node (UTC):

  | Event | Time | Gap |
  | --- | --- | --- |
  | Test address | 23:18:50 | |
  | Tip in the pool (the page showed Payment seen) | 23:20:00 | |
  | Mined in block 2,230,085 | 23:23:17 | 3 min 17 s in the pool |
  | Block 2,230,086 | 23:28:38 | 5 min 21 s more |
  | Settled | 23:29:01 | 23 s for the next sync |

  - The confirmation wait was 9 of the run's 13 minutes. Coffer's own share was the 23-second sync.
  - With 1 confirmation it would have settled at about 23:23:40: about 8½ minutes in all.
- Block times vary: Monero targets one block every 2 minutes, but the gaps are random. Assuming a steady 2-minute rate, the tip waits more than 9 minutes after it's sent about 1 time in 16 with 2 confirmations, and about 1 time in 90 with 1. Real gaps vary more than that, as attempt 3's 5-minute gap shows.
- The test tip takes its target from the confirmation speed setting. An owner who chooses Strict before testing waits for 10 confirmations, about 20 minutes on average, and goes over the budget every time.
- Nothing is fulfilled on a test tip. It's the owner's own money, from their own second wallet, and it only proves that the wallet host and site see a payment. The checks that follow (seen, mined, counted: `unlockTime` "0" and no double-spend flag, then settled) are the same at 1 confirmation as at 2.

Proposal: the test tip from Get a test address always needs **1 confirmation** (a constant), whatever the speed setting. It's never zero: it still has to be mined and counted. Public tips (phase 07) and orders keep the preset. The waiting line says so: "Payment seen: 0 of 1 confirmation. A test tip needs one; your buyers' payments use your confirmation speed."
Effect on the admin budget: better. The typical wait drops by about one block, and choosing Strict no longer breaks setup.
Effect on the trust contract: none.
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here): Install flow step 6: "Setup is done when it settles, at one confirmation whatever the speed setting (a test tip fulfils nothing)."
Decision (Wyatt, 2026-10-16): accepted as proposed. Only the test tip from Get a test address; public tips (phase 07) and orders keep the preset.

## 27. The payments page doesn't update by itself  (status: accepted, 2026-10-16)
Found in: phase 05, run A attempt 3, confusion log at 5:19 MDT (steps 6c and 7). The tester reloaded the page by hand to see Payment seen and then the confirmations. It cost no time, but they expected the page to update on its own.
Spec says: Admin setup and upkeep, Install flow step 4: "The admin page's setup checklist turns green item by item". It doesn't say how.
Evidence (EmDash 1.1.0, from the installed `@emdash-cms/admin` and `@emdash-cms/blocks`):
- A plugin's admin page sends one `page_load` when it opens (a `useEffect` in the Block Kit page renderer) and never again. There's no timer or polling, and the dashboard widget works the same way.
- A reply can carry `blocks` and `toast`. The validator also accepts `refresh`, `navigate` and `patch`, but those are content-editor panel effects: the admin page renderer reads only `blocks` and `toast`. Even `refresh: true` would reload once, not on a schedule.
- Block Kit has no element that refreshes itself.
- A `block_action` reply re-renders the page in place, so a button can refresh the page without a full browser reload.
- A Check again while the install command is on screen would lose the command: it's shown once, and only its hash is stored. So a refresh must not run on that view, or must warn first.

Proposal:
1. **During setup only** (checklist not done), add a line at the bottom of the Setup section: "Checked at HH:MM:SS UTC. This page doesn't update by itself." It goes next to a **Check again** button, a new `block_action` that only re-renders the page.
2. **Not on the pairing-code view.** There the line says "Reload this page after the installer says Done". It mustn't come earlier, because the command would be gone.
3. **After setup,** nothing new. Health's "Last sync" already says how fresh the data is.
4. **An upstream note for EmDash** (draft, for Wyatt to post): "Block Kit admin pages load once. Could a page reply carry an optional `refresh_after_seconds` (with a minimum, paused while the tab is hidden) so a status page can update itself? A plugin waiting on an external event (a payment, a sync) today has to tell the admin to reload."

Effect on the admin budget: none in time. It's clearer while the admin waits, and the setup test's "reload" wording stays as a fallback.
Effect on the trust contract: none (a button on the existing page; no route, page, widget or setting).
Decision (Wyatt, 2026-10-16): accepted as proposed, with the button kept off the install-command view, and the upstream note (item 4) drafted for Wyatt to post.

## 28. An https remote node breaks wallet creation  (status: accepted, 2026-10-16, items 1 and 3)
Found in: phase 05, run B attempt 1 (`~/xmr-pay-dev-data/05-setup/B1-*`, local).
- The installer paired, then stopped at "Creating the view-only wallet" with `walletrpc: wallet-rpc error 0: .`
- The node was `https://stagenet.xmr.kernal.eu:38089`.
- No service was installed, the pairing code was used up, and the site showed the wallet host as paired.

Spec says:
- Bridge service: a remote node is allowed (spec change 13 adds the cross-check).
- The installer takes an `http` or `https` node URL.

Evidence (the dev box, monero-wallet-rpc v0.18.5.1, the shop wallet view-only in a temporary folder, deleted after; outputs in `05-setup/B1-repro-*.txt`, `B1-ssl-probe.txt`):
- **Reproduced.** `TestLiveShopWallet` with `XMR_BRIDGE_LIVE_NODE=https://stagenet.xmr.kernal.eu:38089` fails at `generate_from_keys` in 1.5 s with the same error. With the local node it passes, and with `http://` on the same host the wallet is created.
- **Cause, from wallet-rpc's log:** `wallet2.cpp:431` throws "Enabling --daemon-ssl requires --daemon-ssl-allow-any-cert or --daemon-ssl-ca-certificates or --daemon-ssl-allowed-fingerprints or use of a .onion/.i2p domain".
  - For an `https` node, the bridge starts wallet-rpc with `--daemon-ssl enabled` and nothing else (`supervise.New`). That means system-CA checking, which the wallet treats as too weak by design.
  - The exception comes from `make_new`, outside `on_generate_from_keys`'s own try blocks, so the generic catch in `wallet_rpc_server.h:148` answers with code 0 and an empty message.
  - Every https node fails this way. kernal.eu is not at fault.
- **The installer's pre-checks passed.** Its own Go client reached the node over https (`noderpc.GetInfo`), so nothing caught this before the pairing code was used.
- **What the wallet accepts** (`TestLiveDaemonSSL`, three cases against kernal.eu):
  1. `--daemon-ssl enabled` alone: the same error 0.
  2. Adding `--daemon-ssl-ca-certificates /etc/ssl/certs/ca-certificates.crt --daemon-ssl-allow-chained`: the wallet is created and rescans over TLS, at the node's height.
  3. The same flags, dialling the node by IP address: also accepted. The certificate names only `*.xmr.kernal.eu` and `xmr.kernal.eu` (checked with `openssl s_client`). So in this mode wallet-rpc checks that the certificate chains to a trusted CA, **not that it was issued for the node's name**.
- **Pinning a fingerprint at install** would break at the next renewal: kernal.eu's certificate expires 2026-11-21. Every renewal would need routine upkeep, so it's out.
- **The site said "Wallet synced" with no wallet.** The pairing request counts as a sync (`plugin/src/sync/handle.ts` stores `lastSyncAt` and the installer's height), so the checklist shows paired and synced for up to 5 minutes (`SILENT_MS`) when nothing is running.

Proposal (Claude's recommendation first):
1. **For an https node, give wallet-rpc the system CA bundle with `--daemon-ssl-allow-chained`.**
   - It's the first bundle that exists of `/etc/ssl/certs/ca-certificates.crt` (Debian, Ubuntu) and `/etc/pki/tls/certs/ca-bundle.crt` (Fedora, RHEL).
   - If there's none, the installer refuses an https node **before pairing**, with a message that says why.
   - This is still TLS, but it doesn't check the name: an attacker on the path with any publicly trusted certificate could stand in for the node. That's no worse than a dishonest node, which spec change 13's cross-check already assumes, and better than plain http, which is allowed today.
   - A security matrix row records the gap, and 07b attacks it.
   - Bridge change, small, tests first. It needs a release rebuild and Wyatt's signature.
2. **Later, if Wyatt wants the name checked:** the bridge forwards wallet-rpc's node traffic through a loopback port. wallet-rpc speaks http to the bridge, and the bridge speaks https to the node, with Go's full checks (system roots and the host name). Standard library only (`net/http/httputil`). It's more code, and the installer's wallet creation would need it too.
3. **Either way, the installer says why wallet-rpc refused.** When wallet-rpc answers with code 0 and no message, the installer quotes the last ERROR line from wallet-rpc's log instead of "error 0".
4. **For triage, not part of this fix:**
   - The pairing-only "Wallet synced": count a pairing request as paired, not as synced (a plugin change).
   - The installer pairs before it creates the wallet (spec change 17), so a failure there always uses up the code. The fix above removes this cause, but any other wallet-rpc failure still costs a new code.

Effect on the admin budget: none for a working setup. Without the fix, every admin who chooses an https node fails setup and needs a new code.
Effect on the trust contract: none (bridge only; the plugin's contract is unchanged).

Decision (Wyatt, 2026-10-16): items 1 and 3 now, then run B is repeated over https. Item 2, the bridge's TLS forwarder that checks the node's name, is **decided before phase 09** (Wyatt, 2026-10-16), with 07b's man-in-the-middle row as evidence. Item 4 goes to triage.
- Built:
  - `supervise.CABundle` and `DefaultCABundles`; an https node gets `--daemon-ssl-ca-certificates <bundle> --daemon-ssl-allow-chained`, and `New` refuses with `ErrNoCABundle` when there's none
  - the installer's node check refuses an https node without a bundle, at the prompt or for `--node`, before pairing
  - `explainWalletRPC` quotes wallet-rpc's last log error (`supervise.LastError`) in place of a bare "error 0"
- Tests: `internal/supervise/ssl_test.go`, `TestHTTPSNodeNeedsACABundle` in `internal/installer`, `cmd/xmr-bridge/explain_test.go`. The live proofs are `TestLiveDaemonSSL` and `TestLiveShopWallet` with `XMR_BRIDGE_LIVE_NODE`.
- Found by the first live run with the fix: `generate_from_keys` over kernal.eu's https takes more than the supervisor client's 5 s. There was no error, the call was just cut off, so run B would have failed again, this time with a timeout.
  - `generate_from_keys` and `open_wallet` now run without the client's timeout, like `rescan_blockchain`. The installer bounds wallet creation at 3 minutes, and the service's open is bounded by the supervisor's 60 s start-up limit.
  - The untimed view now shares the client's digest-auth state. Separate nonce counts collided as soon as `open_wallet` went untimed (`TestOpenCloseAndAddress` caught it). That collision was latent after `rescan_blockchain` too.
  - Test: `TestWalletCallsOutlastTheClientTimeout`.

Matrix note (for `docs/security-matrix.md`; Wyatt copies it into the Claude Doc): "An https remote node: wallet-rpc checks that the node's certificate chains to the system's trusted CAs, but not that it was issued for the node's name (Monero 0.18.5.1, `--daemon-ssl-allow-chained`). An on-path attacker with any publicly trusted certificate can stand in for the node. That gives no more power than a dishonest node, which the remote-node cross-check (spec change 13) is for. 07b (section E) attacks it with a valid certificate for another name. Spec change 28 item 2 (the bridge checks the name) is decided before phase 09."

## 29. "Wallet synced" while nothing runs on the wallet host  (status: accepted, 2026-10-16; built 2026-10-16)
Found in: phase 05, run B attempt 1 (spec change 28's evidence). The installer paired, then failed to create the wallet, so no service was installed. The site's checklist still showed "Wallet host paired" and "Wallet synced" (3 of 5).
Spec says:
- Install flow step 4: "The admin page's setup checklist turns green item by item: wallet host paired, wallet synced, …"
- API contracts, Pairing: a `pair` body is checked, then the key stored. Whether it also counts as a sync isn't said.

Evidence:
- `plugin/src/sync/handle.ts` applies a pairing request like any other sync. It stores the bridge state with `lastSyncAt: now` and the installer's node height.
- The checklist's "Wallet synced" is true when there's bridge state, the host isn't silent and no `checks` say behind or syncing. A pairing request carries no `checks`, so the item turns Done at once.
- Health's "Last sync" also counts it. The silent-host line only turns red 5 minutes later (`SILENT_MS`).
- `checkoutHeight` takes the same state, so for those 5 minutes a checkout would be accepted with no wallet host running. The pool is empty after a pairing-only request, so nothing could actually be claimed.

Proposal: a pairing request stores the key and marks the host paired, but **doesn't count as a sync.**
- Its height still sets the chain-height floor (spec change 16), but `lastSyncAt` isn't set.
- "Wallet synced", Health's "Last sync" and checkout wait for the first sync from the running service.
- Until then, the checklist keeps its existing line: "the wallet host syncs within a minute of pairing".
- If no sync arrives within 5 minutes of pairing, the page says so and names the fix: "Paired, but the wallet host hasn't synced. On the wallet host, run: sudo xmr-bridge status --config /etc/xmr-bridge/config".

It's a plugin change, and the wire protocol is unchanged. Tests: a pairing-only request leaves "Wallet synced" to do and checkout refused; the first normal sync turns it Done.
Effect on the admin budget: better. A failed install no longer looks half done.
Decision (Wyatt, 2026-10-16):
- Accepted, built **after run B**, so run B uses the same plugin as run A.
- Condition: the "hasn't synced" message must not fire during a slow but healthy first start. For example, the first `open_wallet` took about 33 s over a remote https node while wallet-rpc caught up (spec change 28's live run). A reinstall from an older restore height can take longer.
- To be settled when it's built: what the 5 minutes count from, and whether the bridge reports "starting" before its first full sync. Either way, tests cover a first sync that arrives late but before the limit.
- Settled (Wyatt, 2026-10-16): **the bridge says "starting".** A plugin-only timer can't meet the condition: the worst healthy start is about 6 minutes after pairing (wallet creation up to 3 min, a failed first `Init` while catching up, then the bridge's sync backoff), past a 5-minute alarm counted from pairing.
- How it was built:
  - **Bridge** (`internal/bridgeloop`):
    - While wallet-rpc isn't ready, each attempt sends a signed message: `checks.wallet` is `{"state": "starting"}`, height 0, `addresses` and `snapshots` as `[]`, and the node check.
    - Retries stay at `startingEvery` (1 min; with the 30 s wallet wait, one about every 90 s) instead of backing off to 5 minutes. A failed send backs off as before.
    - These messages aren't counted as syncs, refusals or unreachable, so the update guard (`selfupdate.Decide`) still sees a wallet-rpc that never gets ready as no syncs.
    - Older plugins drop the unknown state.
  - **Plugin:**
    - The bridge state gains `lastHeardAt` (any signed message). `lastSyncAt` now means a full sync and is absent until the first.
    - A pairing request is heard, not synced, and forgets the previous host's sync and checks. A "starting" message is heard and keeps the last full sync. Neither applies wallet evidence: no snapshots, and height 0 never lowers the stored height.
    - Silence counts from the last message of any kind.
    - **"Paired, but the wallet host hasn't synced"** (red, with `sudo xmr-bridge status --config /etc/xmr-bridge/config`) needs no full sync since pairing and nothing heard for 5 minutes. Pairing to the first "starting" message is bounded by the installer's 3-minute wallet-creation cap plus the 30 s wallet wait.
    - **A synced host that restarts** shows amber "The wallet host is starting" while checkout is paused.
    - **"No payment addresses ready"** waits for the first full sync, because the pool is empty until then by design.
    - Checkout needs a full sync, as before.
- Tests:
  - bridge: `TestStartingWhileWalletRPCIsNotReady`, `TestStartingNeedsAKey`, `TestRetryWait`
  - plugin: three in `tests/sync/handle.test.ts` and four in `tests/routes/admin-health.test.ts`, including "a slow but healthy first start … then the first sync turns it Done"
  - the protocol test accepts "starting"
- It needs a release rebuild for the bridge half. Until then, the plugin half works with today's bridge: "Wallet synced" waits for the real first sync, and the 5-minute line counts from pairing.
- Spec text to fold in (Wyatt; `docs/spec.md` is not edited here):
  - **API contracts, bridge/sync, checks:** "wallet `starting`: wallet-rpc isn't ready yet; the body carries no wallet data (height 0, empty lists). The plugin records it as heard, not synced."
  - **Pairing:** "A pairing request counts as heard from, not as a sync: Wallet synced waits for the first sync from the running service."
  - **Health:** "silent" counts from the last message of any kind.
Effect on the trust contract: none.

## 30. The installer's node prompt: a bare host name  (status: accepted, 2026-10-16)
Found in: phase 05, run B attempt 1. The tester typed `kernal.eu` (Wyatt, 2026-10-16), not the full address `https://stagenet.xmr.kernal.eu:38089`, three times. The installer gave up, and the tester ran the whole command again, typing the address and view key a second time. No pairing code was used, because nothing had changed yet.
Spec says: Install flow: the installer asks for a node only when none answers locally ("a remote node only if your own monerod doesn't answer").
Evidence (`bridge/internal/config/config.go`, `validateNode`; `bridge/internal/installer/install.go`, `chooseNode`, `retry`):
- **The same reply every time:** `config: node must be an http or https URL such as http://127.0.0.1:18081`.
  - The `config:` prefix is internal.
  - The example is a loopback address with the mainnet port, at a prompt that only appears when no local node answers.
  - Nothing says what was wrong with what the tester typed.
- **After three tries:** "giving up after 3 tries". The message doesn't say that nothing changed or that the pairing code still works.
- **A latent hole: the prompt doesn't require a port, but `supervise.New` does.**
  - `https://stagenet.xmr.kernal.eu` with no port passes the prompt's check. Go's client tries port 443, so it passes only if a node answers there.
  - It would then fail at wallet creation, after pairing has used the code.
  - Same class as spec change 28: a check before pairing that's looser than what runs after it.

Proposal:
1. **The message names what's missing in the admin's own input,** without "config:". For example: "kernal.eu isn't a full node address. It needs http:// or https:// at the start and a port at the end, like https://node.example:38089." For a typed `host:port`, it also says "Did you mean https://host:port?" It never guesses and goes on by itself.
2. **The prompt requires a port,** the same rule `supervise.New` applies, so the check before pairing matches what wallet-rpc needs. Test: an address with no port is refused at the prompt.
3. **After the third wrong try:** "Nothing was changed on this machine, and the pairing code still works. Paste the install command again." The installer still stops after three tries.
4. **The example in the prompt stays a public-node shape** (`https://node.example:38089`), the same in the prompt and in the message.

It's a bridge change: installer text and one check. It needs a release rebuild.
Effect on the admin budget: better. A typo costs one retry, not a rerun.
Decision (Wyatt, 2026-10-16): accepted. Build it now, tests first, and include it in the release rebuild before Wyatt signs, so run B tests the new prompt.
Effect on the trust contract: none.

## 31. The first start after a reinstall can fail Init while wallet-rpc catches up  (status: accepted, 2026-10-16)
Found in: spec change 28's live run (`TestLiveShopWallet` against kernal.eu over https; `~/xmr-pay-dev-data/05-setup/B1-fix-live2-wallet-rpc.log` and its `.bridge` log, local). Not seen in run A or run B.
Spec says: Bridge service, duty 1: run wallet-rpc and keep it running. Spec change 17: a reinstall restores from an older height so it sees the site's open invoices.
Evidence:
- **The test's wallet was created about 10,000 blocks below the chain.** The service's first start took 38 s, then failed `Init` and restarted: `init: walletrpc: get_address: … Client.Timeout exceeded`.
- **`open_wallet` (untimed since spec change 28) took about 33 s** while wallet-rpc caught up. Then the next call, `get_address`, was cut at the client's 5 s.
- **The restart was ready in 2.4 s.** wallet-rpc saves its progress when stopped, so restarts converge rather than loop.
- **The installer creates a new wallet at today's height,** which is why neither run saw this.
- **A reinstall from an older restore height (spec change 17) can restart a few times before it settles.** Each restart counts against the update guard's restart limit if it happens just after an update.

Proposal: `wallet.Open`'s calls (`open_wallet`, then `get_address`) are bounded only by `Init`'s context (the supervisor's 60 s), not by the client's 5 s. It's a small bridge change with a test like `TestWalletCallsOutlastTheClientTimeout`.
Effect on the admin budget: none (it removes a silent restart).
Effect on the trust contract: none.
Decision (Wyatt, 2026-10-16): accepted. Build it, then rebuild the dev release (with spec change 29's bridge half); Wyatt signs it.

## 32. The pay page can't show the address or QR from the token  (status: accepted, 2026-10-16)
Found in: phase 06 planning, reading `plugin/src/status.ts` against the phase file. Not found by a test.
Spec says: Theme integration, piece 2: "`/pay/[token]` page: server-fetches `status`, then shows the amount in XMR and fiat, the address with a copy button, a QR code of the `monero:` URI". API contracts, `GET status`: the response has `status`, `confirmations`, `required`, `amountAtomic`, `receivedAtomic`, `expiresAt`, `settledAt`, `pendingExpiry` and `reconfirming`.
Evidence:
- **`status` has no address, no URI, no fiat amount and no tip minimum.** Only `checkout`'s response has the address and URI, and the pay page gets only the token, from its path. A reload, a shared link or a page opened from the admin has no checkout response at all.
- **The invoice doesn't keep the URI's description.** Checkout builds `tx_description` from the product entry's title (`checkout.ts`), and the title isn't stored. So `status` can't rebuild checkout's URI byte for byte without reading the product entry on every 5-second poll.
- **The admin test tip builds its own URI** (`tipUri` in `admin.ts`), so there are already two copies of the URI format.

Proposal:
1. **`status` also returns:**
   - `kind`: `product`, `tip` or `order`
   - `address`: the invoice's subaddress
   - `uri`: the same `monero:` URI checkout returned
   - `fiat`: `{ amountMinor, currency }` (decimal string and code), or `null` for a tip with no fiat amount
   - `minAtomic`: a tip's floor (decimal string), or `null`
2. **Checkout stores the URI's description on the invoice** (`uriDescription`; for the test tip "Coffer test tip"). An invoice made before this change gets a URI with no `tx_description`.
3. **One function builds every URI:** `paymentUri(address, amountAtomic, description)` in `plugin/src/core/`, used by checkout, `status` and the admin page. The amount is the invoice's expected amount, or a tip's floor when it has none, as the test tip's link does today. Phase 07 decides what an open public tip's URI carries.
4. **The token remains the only key.** Anyone holding it already sees the address and amount on the pay page.

Effect on the admin budget: none.
Effect on the trust contract: none. Same route, method and visibility. No capability, collection or index change; `uriDescription` is a new optional field in invoice data.
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here): API contracts, `GET status`: add `kind`, `address`, `uri`, `fiat` and `minAtomic` to the example, with "`uri` is the same as checkout's".
Decision (Wyatt, 2026-10-16): accepted, during the phase 06 plan.

## 33. Tips: never late, watched longer, settled at the floor  (status: accepted, 2026-10-16)
Found in: phase 07 planning, settling the four items in `docs/decisions.md`'s 2026-10-12 tips row, and the phase file's amount rule against the code.
Spec says: Tip jar mode: "An open tip settles on any amount at or above the dust floor"; "Confirmations: the lowest tier of the chosen speed preset". Invoice lifecycle: a payment made after the window goes to review as `late`. API contracts, `bridge/sync`, "Watch list": expired and review invoices inside the 24-hour late window. Phase 07 file: "With an amount: settles like a product at tolerance."
Evidence:
- **Tips are taken while the host is silent or syncing** (decisions, 2026-10-12). Such a tip takes its deadline from the last sync's height, which is stale or far too low, so a tip paid on time could look late.
- **The phase file's "at tolerance" would lose money.** `totals()` already uses a tip's floor (`minAtomic`) as its threshold for every tip. A set-amount tip held to 99.5% would stay "seen" when underpaid, and since tips have no underpaid review, it would expire with real money on it.
- **The 24-hour watch window misses a tip paid during an outage longer than a day.**
- **A longer watch has a cost** (Wyatt asked).
  - The site-wide cap is 40 open invoices per 30-minute window, so a bot can make about 1,920 invoices a day.
  - Watched for 7 days, that's about 13,440 addresses on the bridge's list. The bridge reports 100 a sync, about 135 syncs a pass, and real tips wait behind the junk.
  - The plugin would rebuild the list from about 15,000 rows a sync.

Proposal (Wyatt's decisions, 2026-10-16):
1. **A tip settles on any counted amount at or above the floor (0.0001 XMR), whenever it's seen.**
   - It is never `late`.
   - An expired tip that receives the floor or more reopens to confirming, then settled.
   - A set amount (fiat or XMR) only fills in the payment link; whatever arrives is recorded. A tip is never `underpaid`.
2. **Below the floor at the end of the window, a tip expires quietly,** as the proof of concept does.
3. **Watched for 7 days after its window, except when untouched:** a tip with no transfer ever reported leaves the list once the wallet host has reported its address empty for 24 hours past its window.
   - Measured by the invoice's `seq` (the bridge's clock of the newest snapshot applied), not the plugin's clock.
   - During an outage, `seq` doesn't advance, so the tip stays watched.
   - With a healthy host, a bot's hold is about 1,920 addresses, as for products today.
4. **Tips are taken while the host is silent or syncing,** at the last sync's height, which never goes down. Products keep refusing.
5. **A fiat amount with no price available becomes an open tip** instead of failing.
6. **Wording:**
   - When the pool is empty, the tip button says "Tips can't be taken right now. Please try again in a few minutes."
   - Every tip's pay page says "Tips are confirmed when the shop's wallet sees them; this can take a while."
   - A tip's Paid card shows the amount received.
   - No new status field.

Effect on the admin budget: none.
Effect on the trust contract: none (lifecycle and watch rules; no route, setting, capability or index change).
Spec text to fold in (Wyatt; `docs/spec.md` is not edited here): Tip jar mode (amount, the watch, silent hosts), Invoice lifecycle (the tips rule), the `bridge/sync` watch list.

## 34. The public "tips received" count  (status: deferred, 2026-10-16)
Found in: phase 07 planning (the phase file's stop point).
Spec says: Tip jar mode, "Public display: off by default. The owner may enable a tips-received count, but never amounts or notes."
Evidence:
- **A visitor's page can read plugin data only through a public route.** Status needs an invoice's token, so a count needs a new public route, or another way to read it.
- **Turning it on needs a fourth setting.**
- Both touch the frozen trust contract (routes, settings).

Proposal: not in release 1. Revisit after release 1, as a new version with a fresh consent prompt if it's wanted.
Effect on the admin budget: none (one fewer optional setting).
Effect on the trust contract: none now.
Decision (Wyatt, 2026-10-16): deferred, as proposed.

## 35. Coffer can't pair on Cloudflare: 10 bridge calls per plugin invocation  (status: B accepted for release 1 with conditions; A planned for release 1.x or 2; 2026-10-16)
Found in: the phase 07 Cloudflare spike (`docs/spike-findings.md`, "Phase 07 spike"; `spikes/cf-runner/`).
Spec says:
- Key design decisions and Architecture: Coffer is a sandboxed plugin for EmDash sites, with no platform named.
- The registry listing reaches every site with a sandbox runner, and EmDash's templates default to Cloudflare Workers.
- Phase 01 didn't measure Cloudflare's limits ("Not covered: Cloudflare Workers limits").

Evidence (measured on a throwaway site on Cloudflare Workers, EmDash 1.1.0):
- **Every call a sandboxed plugin makes through EmDash's bridge counts as a subrequest,** and the 11th in one invocation throws: KV, settings, storage, content and `ctx.http`. The limit is fixed by EmDash.
- **Coffer's pairing sync fails with zero addresses.** Without pairing nothing else runs.
- **Read from the code, Coffer's other routes are over the limit too:**
  - checkout with a pool: about 12 calls
  - a sync: per snapshot and per address
  - the admin page: dozens
- **Batching helps, within limits:**
  - `getMany` is one call for up to 98 ids (D1's parameter limit; EmDash doesn't split batches)
  - `putMany` is one call but about 47 ms a row
- **CPU is not the constraint:** about 0.5 s passed.
- **On Node,** the workerd runner enforces only wall time, which is why every test so far passed.

Options:
- **A. Redesign Coffer to a 10-call budget per route invocation before release 1.**
  - State moves into a few KV values: pairing, the bridge, buckets, and a watch index mapping each watched address to its invoice id. That replaces the watch-list scan, which also fixes the silent 1,000-row truncation (session 7a).
  - Lookups by address become `getMany`.
  - Writes become small `putMany`s.
  - Settings are read in one call.
  - **The bridge sends fewer snapshots and addresses per sync** (a bridge change and a release rebuild; the protocol's caps stay as upper bounds).
  - **The admin page builds from the KV state** plus one or two queries.
  - **Each route gets a test that counts its bridge calls,** so the budget can't silently regress.
  - Then the whole suite again, the dev site, and this spike site.
  - Several sessions; it touches the store, sync, checkout, the admin page and the bridge.
- **B. Release 1 is for Node-hosted EmDash sites only.**
  - The registry listing and install docs say so.
  - Cloudflare support comes in a later release with A.
  - A Cloudflare site that installs it anyway can't pair, and today would see a generic route error.
  - Smallest change now, but a poor first impression on EmDash's default platform.
- **C. Upstream, in parallel:** an EmDash note, for Wyatt to post, asking for a higher or configurable limit for bridge calls, or batching (and for `getMany` to split to D1's limit). Not in our control.

Recommendation:
- **A before release 1, with C posted now.**
- Phase 07 pauses after 7a's plugin work. A becomes its own phase (07c), before 7b and 7c, because the tips view and the tip button sit on the same calls.
- **If release 1's date matters more, B now and A next,** with the listing saying "Node.js sites" in the meantime.

Effect on the admin budget:
- **A:** none for Node sites; it makes Cloudflare sites possible at all.
- **B:** excludes Cloudflare sites from release 1.

Effect on the trust contract: none for A or B (no capability, host, route or index change; KV keys aren't part of it).
Decision (Wyatt, 2026-10-16): **B for release 1 (Node-hosted sites), with three conditions; A is the plan for release 1.x or 2.**
1. **On a Cloudflare-hosted site, Coffer detects it and says so clearly instead of failing mid-pairing.**
   - **Detection:** `requestMeta.geo` is set only when the request carries Cloudflare's `cf` object, which exists only in the Workers runtime. Checked on the spike site: `geo` is present, with country, region and city. On Node, EmDash's `extractGeo` returns null, because there's no `cf` object, even behind Cloudflare's proxy or a tunnel.
   - **Before any bridge call:**
     - `bridge/sync` answers `{ error: { code: "UNSUPPORTED_PLATFORM" } }`
     - `checkout` answers the same
     - the admin page shows one message ("Coffer doesn't support EmDash sites hosted on Cloudflare Workers yet") and nothing else
   - **The bridge and installer** turn that code into a plain line instead of a generic error (a bridge change, in the next release rebuild).
   - **The theme's `checkoutErrorMessage`** gets a line for it.
   - **The `status` route** stays as is (it fits the limit).
2. **The 1,000-row watch truncation is in Coffer's own scan helper** (`collect()`, 10 pages of 100), **so it affects Node too.**
   - **Release 1 fix:** the watch-candidate scans page through to the end, under a safety cap sized to the most the spam cap allows (40 open invoices per 30 minutes, kept 8 days for tips: about 15,400 rows; cap 200 pages). The admin page's Health warns if the cap is ever reached.
   - **Cost on Node:** about 0.2 s a sync at 15,000 invoices (session 7a).
   - **A** replaces the scan with a KV watch index.
3. **In 7b and 7c, use `getMany`/`putMany` where it's cheap** (at most 98 ids a call), so A is smaller later.

## 36. Store adapter and coexistence with other payment plugins  (status: R2 and the stored coin fields accepted for release 1, 2026-10-18; the rest proposed, 2026-10-16)
Found in: Wyatt's planning notes, 2026-10-16 (not found by code or tests). Wyatt treats coexistence as a hard requirement: a shop will usually run Stripe or another gateway next to Coffer, so Coffer must have no shared names, no shared data, no effects outside its own pages, and no assumption that it is the main or only gateway.
Spec says: Commerce readiness, "The payment contract (the pattern for others)": two calls and five statuses (`open`, `processing`, `paid`, `expired`, `needs_review`), "No shared secret between store and payment method", "No webhooks", the DashCommerce adapter first. Theme integration: the `/pay/[token]` page. API contracts: the checkout response's `"payUrl": "/pay/<token>"`.
Proposal (Wyatt's note):
- **Shape:** the Coffer core (exists, store-agnostic); a neutral adapter contract in the core (release 2); one thin adapter per store, Otta first once UrumiAI/otta.sh discussion #406 is answered, then DashCommerce and others (release 2); a default "Pay with Monero" button in `@cofferhq/astro`. The store's payment interface (for example Otta's PaymentGateway) is the shared layer; everything behind it stays Coffer's.
- **Coexistence rules** (core, adapters and theme kit):
  - **R1** Namespaced method ID `coffer:xmr` (later coins `coffer:<chain>`), never `crypto` or `monero`.
  - **R2** Namespaced public paths: default `/pay/coffer/[token]` instead of `/pay/[token]`; the owner may choose another path.
  - **R3** Own data only: Coffer never writes a store's order records; it reports status through the adapter.
  - **R4** The strict CSP, response headers and hidden EmDash toolbar apply only to Coffer's pay and tip pages: no site-wide middleware or global headers.
  - **R5** No global styles or scripts: `coffer-` classes, `--coffer-*` properties, no window globals, scripts only on Coffer's pages.
  - **R6** Coffer owns the invoice, the store owns the order; the adapter maps states; the store's order ID is an opaque reference; status updates are idempotent and keyed by invoice token.
  - **R7** No exclusivity: never hides, disables, reorders or pre-selects other methods.
  - **R8** Contained failure: when Coffer can't take payments (bridge silent, node syncing for orders, Cloudflare unsupported, the release-1 switch off), the adapter reports "unavailable, with a reason"; other methods keep working.
  - **R9** Separate secrets: Coffer's keys, pairing secrets and any callback signatures are never shared with, or accepted from, another plugin.
  - **R10** Refunds: the adapter reports "refund not supported, handle manually".
  - **R11** The store passes fiat amount and currency; Coffer converts, locks the quote, and returns the XMR amount and expiry.
- **Adapter contract (draft):** `isAvailable()` → `{ available, reason? }`; `createInvoice({ storeOrderRef, amount, currency, description, returnUrl })` → `{ invoiceToken, payUrl, xmrAmount, expiresAt }`; `getStatus(invoiceToken)` → a state and the received amount. Notifying the store is open until #406 is answered (a signed callback to Otta's commerce service, or the store polling).
- **Default button:** `<CofferPayButton>` (name to confirm); works without JavaScript; styled only through `--coffer-*`; text "Pay with Monero"; icon slot empty until Wyatt's own icon is ready; optional for stores with their own picker.
- **Before release 1:** (1) decide the R2 path and update the snippet and installation text before phase 09; (2) audit R4/R5 (CSP, headers, the toolbar placeholder of `36384b6`, no global CSS or scripts) and report.
- **Release 2 (phases 08 and 08b):** the adapter contract, the Otta adapter, the default button; a coexistence test on the dev site with a small fake gateway plugin (both options show and complete on their own, no route clash, Coffer's headers only on its pages, the other method works with Coffer unavailable, uninstalling Coffer leaves the other plugin and its orders alone); 08b attacks from a co-installed hostile plugin (read Coffer's storage, call its admin routes, spoof "paid" into an order, reuse a token across stores); security-matrix rows for R3, R4, R6, R8, R9.
- **Room for other coins** (build the seam, not the coins):
  - Chain-specific, one driver per coin: address handling, the payment link (inside `paymentUri()`), when a payment counts, price source and tip minimum, the bridge backend (the pairing protocol carries a chain ID and version), button and page wording.
  - Coin-neutral: **C1** method IDs `coffer:<chain>`; **C2** states pending / seen / paid / underpaid / expired for every coin; **C3** amounts as integer strings in atomic units plus `decimals` (XMR 12, BTC 8, ETH 18) in the contract, status route and storage; **C4** one coin per invoice, chosen before it's created; **C5** the pay path stays coin-neutral.
  - Before release 1: store the coin as asset + network (for example `{ asset: "xmr", network: "mainnet" }`) on invoices and tips, defaulting to Monero mainnet; pick and document a method-ID format with room for the network (`coffer:xmr`, later `coffer:usdc-base`); check the status route, `isPaid` and the adapter draft for Monero assumptions; keep the chain driver interface internal.
  - Release 2: a fake second chain driver, tests only, takes an invoice end to end (create, pay, settle, expire, underpay) without Monero code; the same seam should absorb FCMP++/Carrot (spec change 38).
  - Privacy honesty: each coin's privacy level stated on the admin and pay pages. Security-matrix rows for C3 and the fake-driver test.
- **Later, recorded only:** one bridge with coins switched on one at a time (a Monero-only install stays as simple); separately installed coin drivers, each with its own dependency review; watch-only for every coin; detection models (Bitcoin gap limits, account-based matching, Lightning); per-coin admin on/off, health and totals (never summed, fiat recorded at arrival); per-coin pricing and expiry; a coin picker; per-coin test networks and CI; per-coin docs off the registry text.
- **Open questions in the note:** (1) `/pay/coffer/[token]` as the default? (2) also test against a real registry plugin such as Stripe Checkout for EmDash in test mode (needs a Stripe test account)? (3) the button's name.

Checked against the code (2026-10-18, read-only; nothing changed):
- **R2 breaks today, small fix.** `plugin/docs/installation.md` and `theme/README.md` put the page at `src/pages/pay/[token].astro`; `tipEndpoint()` defaults to `payPath: "/pay"` and `TipButton` to `action: "/pay/tip"` (both overridable). The plugin has no pay path (checkout returns the token; the admin page is mounted under `/_emdash/admin/plugins/coffer/`). The fix: those two defaults to `/pay/coffer`, the snippets to `src/pages/pay/coffer/[token].astro` and `src/pages/pay/coffer/tip.ts`, the theme tests that post to `/pay/tip`, and the dev site's two files. `tip` can't collide with a token (22 characters). The spec's contract example `"payUrl": "/pay/<token>"` would change too.
- **R4 and R5 are met.** The CSP and privacy headers are set only on the pay page's own response (`preparePayPage` → `setPayPageHeaders`, `theme/src/headers.ts`) and the tip endpoint's own responses (`page()` in `theme/src/tip.ts`). The toolbar placeholder is only in `PayPage.astro` and those pages. `PAGE_CSS`'s global selectors (`:root`, `*`, `body`, `[hidden]`) appear only inside Coffer's own complete HTML documents. `TipButton`, the one piece on site pages, has no script and an Astro-scoped style with `coffer-tip*` classes that reads `--coffer-tip-*` without setting it. `CLIENT_SCRIPT` is an immediately-called function with no window globals. The plugin is sandboxed and can't add middleware or headers. Not pinned by a test yet: a theme test that `TipButton` renders no `<script>` and no unscoped selector is proposed.
- **R3 and R9 are met by the sandbox** (per-plugin storage; Coffer's only secrets are its own). R1, R6–R8, R10 and R11 have nothing to check until the adapter exists; R8's reasons already exist as codes (`WALLET_HOST_SILENT`, `WALLET_HOST_SYNCING`, `UNSUPPORTED_PLATFORM`, `NO_ADDRESS_AVAILABLE`).
- **The plugin never learns the network.** The bridge's config has one, but neither pairing nor sync carries it, and the plugin accepts any 95-character subaddress. Storing `{ asset, network }` on new invoices could derive the network from the subaddress's network byte at checkout (the theme's `address.ts` decodes it already), with no protocol change, and read a missing value as mainnet. No collection or index changes, so no trust-contract change.
- **"Network" means two things in the note:** a test tier (stagenet vs mainnet) and a chain (USDC on Base vs Ethereum, as in `coffer:usdc-base`). Storing `asset`, `chain` and `network` separately would keep them apart; the method ID would then carry asset and chain, never the tier.
- **C2's state names differ from both the code and the spec.** The code stores `new` / `seen` / `confirming` / `settled` / `expired` / `review` (review reasons `underpaid`, `late`, `reorg`, `reversed`; underpaid is a reason, not a state). The spec's payment contract already maps these to five store-facing statuses (`open`, `processing`, `paid`, `expired`, `needs_review`). Proposed: keep the stored states and the spec's mapping, and adopt the spec's five as C2.
- **The status route meets C3's string rule** (`amountAtomic`, `receivedAtomic`, `minAtomic` are decimal strings with neutral names) but has no `decimals` or asset field, and `uri` is `monero:`. Adding `asset` and `decimals` as response fields keeps the route as it is.
- **Monero names in public contracts:** checkout's tip amount `{ xmrAtomic }` (a later coin can add `{ atomic, asset }` beside it), and the adapter draft's `xmrAmount` (proposed: `amountAtomic` plus `decimals`).
- **The theme hard-codes Monero:** `isStatus` requires `uri.startsWith("monero:")` (a deliberate check), `xmr()` assumes 12 decimals, "XMR" and "Pay with Monero" are in `PayPage`, and the fallback "0.0001 XMR" text. `isPaid` is coin-neutral. The URI is built in one place (`paymentUri()`, `plugin/src/core/uri.ts`).
- **Where the note meets the spec's existing contract** (for Wyatt): the spec says "No webhooks" (a callback would put the store's host in `allowedHosts`, a new consent and a major version) and "No shared secret", where the note leaves a signed callback open (R9); phase 08 builds the DashCommerce adapter first, where the note says Otta first; and phase 08's file notes DinkusKit allows one active payment provider per store, which R7 can't control.
Proposed homes: the release-1 items (R2; asset and network on invoices; `asset` and `decimals` on status) as one phase 07 session before 07b, so 07b tests the final paths; the rest in phases 08 and 08b as the note says; the security-matrix rows with `docs/security-matrix.md` before 07b.
Effect on the admin budget: none (R2 changes where the snippet's files go, not how many).
Effect on the trust contract: none for the release-1 items (no route, capability, host, collection or index change; a new stored field and new status fields). A signed callback to a store would broaden `allowedHosts`.
Wyatt's decisions (2026-10-18):
1. **R2:** the default pay path is `/pay/coffer/[token]`, built in phase 07 session 7e, before 07b. The installation text's tip-button step waits for 7e, so its paths are written once.
2. **The coin is stored as asset, chain and network, three separate fields.**
   - **Chain** is `"monero"` for now.
   - **A missing value reads as** `xmr` / `monero` / `mainnet`.
   - **Method IDs use asset and chain, never the network.**
3. **The method-ID format** (decided 2026-10-18, built in phase 08):
   - The short form `coffer:<asset>`, with the chain spelled out (`coffer:<asset>-<chain>`) only when it isn't the asset's home chain: `coffer:xmr`, `coffer:eth-base`, `coffer:usdc-base`.
   - **Assets with no home chain,** such as stablecoins, always include it.
   - The ID is made from the stored fields and never parsed back.
Still proposed: the rest of the entry (release 2), and the note's open questions 2 and 3.
Built (phase 07 session 7e, 2026-10-18):
- **The pay path:** `tipEndpoint` defaults to `payPath: "/pay/coffer"` and `TipButton` to `action: "/pay/coffer/tip"`; the README and installation text give `src/pages/pay/coffer/[token].astro` and `src/pages/pay/coffer/tip.ts`.
- **The network byte:** `subaddressNetwork()` (`plugin/src/core/address.ts`) reads it, and sync drops a pool address it can't read (Wyatt, 2026-10-18).
- **Stored coin fields:** invoices store `asset`, `chain` and `network`; `coinOf()` reads an older invoice as xmr on monero, with the network from its stored subaddress, else mainnet (Wyatt). A pool row whose network can't be read is claimed with no invoice and skipped.
- **Status** returns `asset`, `chain`, `network` and `decimals` (Wyatt, 2026-10-18).
- **R5 is pinned by a theme test.**
- **Not done:** method IDs (phase 08); refusing a pool that mixes networks (recorded for 07b, Wyatt).
- **Spec text to fold in** (Wyatt; `docs/spec.md` is not edited here):
  - Theme integration: the `/pay/[token]` page and tip button paths become `/pay/coffer/...`.
  - The payment contract's `"payUrl": "/pay/<token>"` becomes `"/pay/coffer/<token>"`.
  - API contracts, `GET status`: the four new fields.
  - `bridge/sync`: an address must carry a subaddress network byte.

## 37. Same-machine wallet host: an "easy install" option  (status: proposed, 2026-10-16)
Found in: Wyatt's planning chat, 2026-10-16, while asking whether FCMP++ lets Coffer drop the bridge (it doesn't; spec change 38) and whether admins could have a slightly less private option. Not found by code or tests; it reopens a decision at Wyatt's request.
Spec says: Key design decisions, "Wallet host on its own Linux machine" (a watcher in the plugin and running on the site's server were both rejected; trade-off "Every admin needs one always-on Linux machine"). Security model: "Required: a separate machine. The installer checks for a running EmDash site on the same machine and stops if it finds one." Spec change 23: the installer refuses a localhost `--site` or a same-machine install before asking for keys. The installer's `--allow-same-machine` exists for dev (session 3i). The view key and the bridge's signing key sit in files only the service account can read; wallet-rpc is bound to localhost with a generated login. CLAUDE.md, fixed platform decisions: "it must be a separate machine from the site".
Evidence (Wyatt's note):
1. The second machine is the biggest barrier to installing: run A showed the plugin side takes minutes; finding and keeping alive a second always-on Linux box is the cost. Most small sites run on one VPS or one home server.
2. Running `monerod`, a wallet and the shop on one server is normal for small Monero merchants.
3. What it costs, with the bridge's own service account kept: a bug in EmDash, a theme or another plugin running as the site's user doesn't get the view key (different file owner, wallet-rpc login). Root on the server does, revealing incoming payments but never able to spend. On a VPS the hosting company can read disk and memory, which it can't with a separate home wallet host: the honest headline for VPS users. Detection, signing, the plugin's trust contract and buyer-facing behavior are unchanged.
4. Same code, installer, bridge and updates; only the refusal and the wording change. Smaller new attack surface than any bridgeless mode, and no new crypto code.
5. Not for Cloudflare-hosted sites (no server; spec change 35). Their zero-setup option is the static tip button (spec change 18 A).
Proposal:
1. **The installer offers it instead of refusing.** On the site's own machine it stops before asking for keys and asks: "Coffer is being installed on the same server as your site. That's easier, but if someone gets full (root) control of this server, or your hosting company looks, they can see your shop's incoming payments. They can never spend them. A separate machine avoids this. Continue on this server? [y/N]". Non-interactive installs need `--same-machine` (`--allow-same-machine` kept as an alias).
2. **Separation on the box:** the same dedicated `xmr-bridge` account, never the site's user; key and config files `0600` owned by it; wallet-rpc on localhost with its generated login; systemd hardening on the unit (`NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`, `PrivateTmp`, read-write paths limited to its own state). The installer refuses if the site's user and the bridge's user would be the same.
3. **Site URL:** the bridge may post over loopback (`http://127.0.0.1:<port>`) on the same machine (the sync is signed and never leaves the box); otherwise the public https URL. Spec change 23's localhost refusal stays for separate-machine installs.
4. **Node choice:** a local `monerod` if one answers; otherwise the installer explains the choice (a pruned node's disk and RAM, with current measured figures, versus a remote node with the existing cross-check). No new node logic.
5. **The admin page says which setup it is:** an optional `sameMachine: true` sync field (compatible); a neutral Health line, "Wallet host: same server as this site", linking to the docs in item 7.
6. **Moving later:** documented (install on the new machine, re-pair, uninstall from the site's server; reconcile on start covers the gap). No new command unless the docs show it's clumsy.
7. **Docs and the security report:** a "Where to run the wallet host" section (separate machine, most private; same server, easiest; Cloudflare, not yet). Security-matrix rows: site-app compromise (mitigated, tested), root compromise (accepted, documented), hosting-provider access (accepted, documented, VPS only).
Tests: a run C on `coffer-test` with a copy of the dev site on the same container, timed against run A; as the site's user, reading the key and config files and calling wallet-rpc without the login all fail (matrix-tagged); loopback sync works and a tampered or replayed one is still rejected; `--same-machine`, the old alias, and the same-user refusal; the Health line shows only for same-machine installs.
Claude's notes (2026-10-18): the dev site answers on `localhost` (IPv6 `::1`), not `127.0.0.1`, so item 3 should allow any loopback address. Item 2's same-user refusal needs a way to learn the site's user, which today's installer doesn't have (it detects a running EmDash site, not its account).
When (recommended in the note): release 1.1, right after release 1; small enough for release 1 if Wyatt wants the easy install at launch (cost: run C before phase 09, the matrix rows before 07b).
Decisions for Wyatt: A, release 1 or 1.1 (recommended 1.1); B, the prompt's default, No (recommended) or Yes; C, whether the installer and docs name the hosting provider explicitly (recommended yes).
Effect on the admin budget: lowers it for most admins (no second machine). The prompt is one more question only on a same-machine install.
Effect on the trust contract: none for the plugin's manifest; one optional sync field and one Health line. The installer change ships in the signed bridge release.

## 38. FCMP++ / Carrot readiness spike  (status: proposed, 2026-10-16)
Found in: Wyatt's planning chat, 2026-10-16 ("I want to ensure day 1 support when Monero FCMP++ comes"), revised the same day. Not found by code or tests; it plans ahead for a Monero network upgrade.
Goal: when FCMP++ reaches mainnet, every install keeps seeing payments on fork day, and owners whose wallets were created after the fork can install Coffer. A time-boxed spike (about 2–3 sessions) on the public FCMP++ test network finds what has to change. It ships nothing.
Spec says: Bridge service, First run (the view key × base point check against the address's public view key; `generate_from_keys` with no spend key); Pool top-up (`create_address`, account 0); Sync loop (`get_transfers` incoming and pool by `subaddr_indices`; non-zero `unlockTime` or `doubleSpendSeen` never counted; open question 11); Updates (daily checks, `monero-wallet-rpc` only from getmonero.org against the GPG-signed hash list); the cross-check's built-in second nodes per network. Spec change 25: "a Monero network upgrade would make an old wallet-rpc stop seeing payments."
Evidence (Wyatt's note, from the sources below):
1. **The test network is live:** beta stressnet v3.0 (`v0.19.0.0-beta.3.0`, `seraphis-migration/monero`, 2026-09-25) forked from testnet on 2026-10-05 at block 3,102,800 (`--testnet`, daemon port 28081). No reuse of older stressnet databases or wallet caches; the first migration can take hours. FCMP++ wallets need an FCMP++ daemon. v3.0 adds hot-cold wallets (PR #52), which reworks wallets without a spend key.
2. **No mainnet date;** the launch list (#53) still has audits, hot/cold and hardware wallets, multisig, proofs, LWS and "Carrot integration documentation" (including the view-balance key) open.
3. **Carrot changes keys for new wallets** (`carrot.md` 5.2–5.4, 6.1): existing addresses keep working with no key migration. The new tree: `sm` → `kps` and `svb`; `svb` → `kv`, `sga` and the generate-image preimage. Tiers: Generate-Address (`sga`), View-Received (`kv`), View-All (`svb`, sees spends too), Master. For legacy wallets `Kv0 = kv·G`, so today's check holds; for new-hierarchy wallets 5.3 says `Kv = kv·Ks` while 6.1.1 says `Kv0 = kv·G`, so the check may refuse valid new wallets. **6.1.3: subaddresses need `sga`, not `kv`,** so a `kv`-only bridge probably can't top up the pool for a new-style shop wallet: the biggest risk. Detecting payments still needs only `kv`.
4. **Custom unlock time is being removed at consensus with FCMP++** (getmonero.org, 2026-05-10; research-lab #125). Locks made before June 1, 2026 keep their unlock time, even years out, so "never count locked funds" must keep working. The 10-block lock stays. Open launch bug: CLI/RPC display of `locked` for time-locked outputs after the fork, so the bridge shouldn't trust `locked` alone.
5. **An upgraded wallet re-syncs from its restore height;** every bridge that updates wallet-rpc for the fork rescans, which can be slow on a remote node.
6. **Coffer's exposure is narrow:** no transactions built or signed, and the plugin never talks to a node. At risk: the key check, wallet creation, subaddress creation, transfer fields, upgrade timing, the second-node list.
Proposal:
- **Setup:** A1 a new Proxmox container `debian-monerod-fcmp` running a pruned `monerod --testnet` from the beta release, checked the way the bridge would (disk use and sync time recorded); A2 test coins by CPU mining or a faucet, the buyer wallet funded with several separate amounts (lesson of 3h); A3 three wallets with the beta CLI: W-buyer, W-legacy (from a v0.18 seed), W-carrot (fresh); A4 a dev-only bridge build tag (for example `coffer_dev`) to run a local wallet-rpc from a path pinned by SHA-256, refused in release builds (with a CI test); A5 testnet as a network in dev builds only, if plugin and bridge know only mainnet and stagenet; A6 the dev site paired with a bridge on `coffer-test` (rolled back to `blank`) pointed at the FCMP++ node.
- **Questions** (pass or fail plus raw JSON each): Q0 how the beta tools pick the hierarchy and whether it shows; Q1 the key check on both wallets, and a spend key still refused; Q2 `generate_from_keys` for both (parameters after PR #52); **Q3 which key a new-hierarchy shop wallet's bridge needs and what holding it exposes** (`kv`-only `create_address`; view-only from `svb` or `kv` + `sga`; payments seen; which wallets export each key), the options for decision C being `svb`, `kv` + `sga`, a pre-generated batch, or legacy wallets only; Q4 `get_transfers`' shape (fixtures); Q5 a new non-zero `unlock_time` refused, and what a pre-fork far-future lock reports; Q6 the 10-block lock and confirmation counting; Q7 a restore below the fork height finding payments both sides, and its time; Q8 what today's v0.18 wallet-rpc does against the upgraded chain (an error or silence); Q9 the fork and version facts the bridge can read; Q10 the cross-check's `get_block` shape and a second FCMP++ node; Q11 run A end to end on stressnet with both shop wallets; Q12 the beta wallets accepting Coffer's `monero:` URI and QR; Q13 the re-sync time of an in-place upgrade, staying in "catching up", and no false unpaid or reversed; Q14 desk research on the plugin making addresses itself from `sga` (what a leak reveals, how much curve code, legacy wallets).
- **Outputs:** `docs/spikes/fcmp-carrot.md` (results, versions, timings, disk); recorded RPC responses under `bridge/testdata/fcmp/` with keys and seeds removed; one follow-up spec change per real gap; a security-matrix note for anything touching the key check or wallet creation; a `docs/decisions.md` entry with the conclusion.
- **Likely follow-ups (not part of the spike):** a fork-readiness Health line (amber when the fork release is out and not installed; red close to the fork height or if an old wallet-rpc has gone quiet); a hierarchy-aware installer; bridge parsing for both shapes with the locked-funds rule; a bridge release with the fork's wallet-rpc well before the fork height, docs about the node migration, and refusing a node that isn't fork-ready; the second-node list refreshed; a manual or nightly stressnet CI lane; a release-watch checklist; a "Ready for FCMP++" line in the listing.
- **Set aside:** folding the bridge into the plugin. The sandbox has no long-running process (and spec change 35's 10-call limit on Cloudflare); it would put the view key in the site's database; it would carry Carrot scanning in JavaScript against the dependency rule; and the plugin would call a node, breaking the trust contract. Only Q14 is worth checking; the lighter-setup need is met by spec change 18 A and spec change 37.
Claude's notes (2026-10-18), conflicts with the ground rules for Wyatt to waive or adjust before the spike: CLAUDE.md allows stagenet (and regtest), not testnet or stressnet; every Monero binary must be verified against `hashes.txt` signed by fingerprint `81AC 591F E9C4 B65C 5806 AFC3 F0AF 4D46 2A0B DF92`, and the `seraphis-migration` beta releases probably aren't signed by that key, so the spike needs its own verification rule; the new container and `coffer-test`'s rollback are Wyatt's (outside the working areas). A5: the theme's `address.ts` already knows testnet's network bytes (53 and 63); the plugin knows no network at all (spec change 36).
When (recommended in the note): after phase 07b pass 1, before or alongside phase 09; it doesn't block release 1. Moved earlier if a mainnet date firms up.
Decisions for Wyatt: A, when; B, the container's disk and RAM (reported after A1); C, after Q3, which key the bridge holds for new-hierarchy wallets (decided on the results); D, testnet in dev builds only (recommended) or not at all in release 1.
Effect on the admin budget: none for the spike. A follow-up that needs a second key from the owner (decision C) would add a typed value.
Effect on the trust contract: none for the spike (dev-only build tag, nothing shipped). Follow-ups state their own.
Sources: https://github.com/seraphis-migration/monero/releases/tag/v0.19.0.0-beta.3.0, https://github.com/seraphis-migration/monero/pull/52, https://github.com/jeffro256/carrot/blob/master/carrot.md, https://github.com/seraphis-migration/monero/issues/53, https://www.getmonero.org/2026/05/10/deprecating-unlock-time.html, https://github.com/monero-project/research-lab/issues/125, https://cryptoticker.io/en/monero-fcmp-stressnet-fork-october-2026/, https://docs.getmonero.org/rpc-library/wallet-rpc/

## 39. A way back from the pay page  (status: accepted, 2026-10-18, with Wyatt's choices below; for release 1, before 07b)
Found in: Wyatt's look at the dev site after session 7e, 2026-10-18 (note `spec-change-pay-page-return-link.md`).
Spec says: Theme integration, the `/pay/[token]` page (now `/pay/coffer/[token]`, spec change 36): amount, address, QR, countdown, confirmations, the success state. Nothing about leaving the page.
Evidence: after the tip button, the pay page has no link back to the post or the site. The only way out is the browser's back button. After paying, that can land on the tip form's POST result instead of the post. It's worst on the "Tip received" card, exactly when the buyer wants to leave.
Proposal (Wyatt's note; theme only):
1. **TipButton carries the return path:** a hidden field with the current page's path and query. No script and no global style, so R5 holds.
2. **The tip endpoint passes it on:** it validates the value (item 4) and, if valid, appends `?return=<encoded path>` to the 303 `Location` for `/pay/coffer/<token>`. Invalid or missing leaves it off. The raw value is never echoed.
3. **The pay page shows the link:** `preparePayPage` reads `return` from the URL, validates it again (never trusting the query), and gives PayPage a safe `backHref`, falling back to `/`.
   - A small "← Back" link at the top, in every state.
   - A button on the "Tip received" / "Paid" card: "Back to the page you came from", or "Back to the site" for the fallback.
   - A server-rendered plain `<a href>`, so it works without JavaScript and survives reloads. The polling script only reveals the already-rendered button on paid; it never builds an href.
4. **One validator in `theme/src`,** used by both the endpoint and the page:
   - **Refused:** anything not starting with exactly one `/`; `//…`, `/\…` and any `\`; any scheme; control characters; anything over 512 characters.
   - **Same origin only:** resolved with `new URL(value, siteOrigin)`, the origin must match.
   - **Output:** `pathname + search` only, with the fragment dropped.
   - **Refused targets:** paths under `/pay/coffer/` and `/_emdash/`.
   - Anything refused gives `/`.
5. **No Referer header:** Coffer's privacy headers suppress it, and it's unreliable.
6. **Order pay pages (release 2):** no `return` yet, so they link home. The phase 08 store adapter can pass one through the same validator.
7. **No change** to the plugin, routes, capabilities, collections, settings, CSP or dependencies. A same-origin `<a>` needs nothing new in the CSP.
Tests (the note's):
- **The validator:**
  - accepts `/`, `/posts/welcome` and `/posts/welcome?ref=x`
  - refuses `//evil.com`, `/\evil.com`, `\\evil.com`, `https://evil.com`, `javascript:alert(1)`, `/%2F%2Fevil.com` (checking what URL resolution does with it), `/pay/coffer/abc`, `/_emdash/admin`, a 513-character path, a newline or tab, and an empty string
  - strips `#frag`
- **TipButton** renders the hidden input with the page's path, and the R5 test still passes.
- **The endpoint:** a valid value appears encoded in `Location`; an invalid or missing one is left out; the body never contains the raw value.
- **The pay page:** a valid `?return=` renders that href, and an invalid or missing one renders `/`. The top link shows in waiting, paid and expired; the paid card has the button.
- **No-JS:** the link works with scripts disabled.
- **Live:** a tip from `/posts/welcome`, the link on the waiting page and on "Tip received", and a hand-edited `?return=//example.com` falling back to `/`.
07b and the security matrix: an open-redirect row (a crafted `return` on the form post or the pay URL; expected result: `/`). Pass 1's attack list gains the variants above, double encoding and Unicode look-alike slashes.
Docs: one README line (TipButton sends the buyer back to where they tipped from; order pay pages link home). Installation step 3 changes only if it fits under the registry limit (now 1,789 of 2,000).
Claude's notes (2026-10-18), checked against the code:
- **Item 1 exists in part:** `TipButton` already sends a hidden `returnTo` (`Astro.url.pathname`, no query). `tipEndpoint` checks it with `backPath()` (`/^\/(?![/\\])[^\s\\]*$/`) and uses it only for the "Back" link on its error and fallback pages.
- **Proposed:** keep the one field, adding the query to it rather than a second `return` field. `backPath()` gives way to the new validator, so the error pages get the same rules, including the refused `/pay/coffer/` and `/_emdash/` targets.
- **The query parameter on the pay URL** stays named `return`, as proposed.
- **The pay page's polling URL and headers don't change.** `Referrer-Policy: no-referrer` stays, so the return path in the URL isn't sent on anywhere.
Decisions for Wyatt: A, the wording ("← Back" at the top, "Back to the page you came from" on the paid card, proposed); B, an optional `siteName` prop on PayPage so the fallback reads "Back to <site name>" (proposed yes, default "Back to the site"); C, theme only with the path in the URL (proposed), or stored on the tip invoice in the plugin.
Effect on the admin budget: none (nothing to set up; it works from the existing snippets).
Effect on the trust contract: none.

Wyatt's decisions (2026-10-18):
- **A:** the top link only, in every state. No extra button on the paid card, so the polling script reveals nothing new.
- **B:** yes, an optional `siteName` prop; default "Back to the site".
- **C:** theme only, with the path in the URL.
- **The field:** reuse `returnTo` (now path and query). The shared validator replaces `backPath()`, so the endpoint's error and fallback pages follow the same rules.

Built (phase 07 session 7f, 2026-10-18):
- **The validator:** `safeReturn()` (`theme/src/back.ts`). It refuses other origins, schemes, `//`, backslashes, control characters, over 512 characters, and `/pay/coffer` or `/_emdash`, also through dot segments and percent-encoding.
- **TipButton's `returnTo`** carries path and query.
- **`tipEndpoint`** uses the validator in place of `backPath()` and adds `?return=` to the 303.
- **`preparePayPage`** checks it again, and PayPage renders a top link in every state: "← Back", or "← Back to {siteName}" (default "the site").
- **Live** on the dev site (`~/xmr-pay-dev-data/7f-live-back.txt`).
- **Spec text to fold in** (Wyatt): Theme integration, the pay page's way back and the `siteName` prop.

## 40. Tip in an overlay, with no scripts on site pages  (status: proposed, 2026-10-18; release 1.x or 2 only, nothing built in release 1)
Found in: Wyatt's planning notes, 2026-10-18 (note `spec-change-tip-modal.md`). Depends on spec change 39, which ships in release 1 and stays the fallback.
Spec says: Theme integration, the tip button and the `/pay` page (full-page flow). Spec change 36, R5: no global styles or scripts.
Goal: the pay page opens in an overlay on top of the post, so the buyer never leaves the page they tip from. Look and feel only; the full-page flow plus spec change 39's link is fine for release 1.
Hard constraints (Wyatt):
1. **TipButton ships no script.** R5 stays: no `<script>`, no global styles, only `.coffer-tip` selectors. "Coffer adds no scripts to your pages" stays a promise admins can check.
2. **The full-page flow keeps working** wherever the overlay isn't supported, and with JavaScript off.
3. **The payment details stay out of the host page's reach:** theme scripts, analytics and other plugins must not read or change the address, amount or QR. So drawing the pay UI on the post page is ruled out.
Approach to spike (no JavaScript on the post page):
- **A plain `<button popovertarget="coffer-tip-…">`** opens a popover with the tip form and a "Continue" button. It's two steps, because `popovertarget` is ignored on submit buttons inside a form.
- **The form posts with `target="coffer-pay-…"`** into a named `<iframe>` in the popover, so the endpoint's 303 lands the pay page in the frame.
- **Close:** `popovertargetaction="hide"`, light dismiss, and a `::backdrop`.
- **Fallback without popover support:** keep the plain form reachable (for example, outside the popover by default and moved in only under `@supports selector(:popover-open)`), or a `<details>` fallback.
- **Also check** `commandfor` / `command="show-modal"` on `<dialog>` (truly modal, page behind inert), if browser support is good enough at build time.
Isolation and framing (the security work):
- **Framing:** `frame-ancestors` goes from `'none'` to `'self'` on the pay page and the tip endpoint's responses, only when framed mode is asked for (for example `?frame=1` from the form). The full-page pay page stays unframeable.
- **A same-origin iframe isn't isolated,** so the frame needs `sandbox` without `allow-same-origin` (an opaque origin). The spike checks what that breaks:
  - **Status polling** from a null origin: (a) a CORS allowance for `Origin: null` on the status route only; (b) in framed mode, a `<meta http-equiv="refresh">` reload instead of the fetch; (c) whatever else the spike finds. Proposed: (b), no route change.
  - **The form post into a sandboxed frame:** does it still get the 303 and the page?
  - **Copy buttons:** possibly `allow="clipboard-write"`, with select-the-text as the fallback.
- **"Open in wallet":** a `monero:` link from a sandboxed frame is likely blocked without `allow-top-navigation-by-user-activation` (or `allow-popups`). Tested in Firefox, Chrome, Safari and a phone browser. If it can't work, the framed page shows the QR and copy fields with an "Open full page" link (`target="_top"`).
- **Clickjacking:** with `frame-ancestors 'self'` only the site can frame it. Acceptable, because the site already controls the post page.
Tests (when built):
- the R5 test still passes; the popover and iframe attributes (the `sandbox` value, no `allow-same-origin`)
- framed mode sends `frame-ancestors 'self'`, the full page today's value
- from the post page, `iframe.contentDocument` is null
- "Tip received" reached in framed mode with no reload by the buyer
- with popover off and with JS off, the full-page flow plus the back link still works
- live in Firefox, Chrome, Safari and a phone browser: open and close, the QR scans, copy, "Open in wallet" or its fallback
Security matrix (in the adversarial pass that covers it, 08b or a 1.x pass): framing and clickjacking per mode; host-page script against the framed page; any CORS allowance; sandbox escape by top navigation.
Recorded fallback, not preferred: a tiny inline script in TipButton to open a `<dialog>` (no network calls, no globals, a CSP hash or nonce on strict sites). **It breaks R5 and the no-scripts promise, so it needs Wyatt's explicit approval first.** Even then the payment details stay in the sandboxed frame.
Decisions for Wyatt (at spike time): A, popover or `commandfor`/`show-modal`, from browser support then; B, meta refresh (proposed) or a null-origin CORS allowance; C, if "Open in wallet" can't work framed, drop it there with an "Open full page" link (proposed) or allow top navigation on click; D, release 1.x or 2.
Effect on the admin budget: none.
Effect on the trust contract: none for the plugin's manifest unless option B (a CORS allowance on `status`) is chosen; the pay page's `frame-ancestors` changes in framed mode only.

## 41. Release readiness against EmDash's current plugin docs  (status: accepted, 2026-10-20, with Wyatt's decisions A–E below; item 10 built the same day; items 3, 4, 9 in 7g, the rest in phase 09)
Found in: Wyatt's claude.ai chat, 2026-10-20 (note `spec-change-release-readiness.md`), reading EmDash's updated plugin docs against the repo at `24a067e`. Not found by code or tests.
Spec says: Build plan step 9 and phase 09 step 4 (the registry: `emdash-plugin publish` or the delegated GitHub release flow; listing sections description, installation, FAQ, security); CLAUDE.md, dependency tier 3 (release builds in CI from a clean checkout with provenance); spec change 22 (release 1 tips only; a broadened contract is a major version); spec change 35 (release 1 is Node only).
Evidence (the note):
- EmDash's plugin docs changed after phase 09 was written: an automated release service from GitHub Actions, bundles hosted on the publisher's own account by default, a `security` listing section, and stated consent rules for public routes (an update that adds a public route, or makes a private route public, asks the admin to consent again).
- EmDash is at 1.3.1; Coffer is built and tested on 1.1.0. `@emdash-cms/plugin-cli` is at 0.13.4; Coffer pins 0.13.2.
- Checked and fine: the manifest has every publishing field (`slug`, `publisher` as a DID, `license`, `author`, `security`, `repo`, `sections.installation`); the trust contract is declared in full for release 1, and the three public routes each declare `methods`; the bundle is under its caps; the docs confirm the Cloudflare runner's 10 subrequests per call and the Node runner's 30-second wall time only, matching spec change 35.
Proposal:
1. **Automated releases, provenance required.** Phase 09 step 4 uses `emdash-plugin release setup`, not `publish` from the dev box. Provenance **required**; approval **for every release** (a passkey per version). GitHub Actions builds from a clean checkout and GitHub attests the bytes; the release service checks that before writing under Wyatt's account. No Atmosphere credential in the repo or on the dev box; installing sites verify the provenance. Needs: the repo stays public; `repo` is the canonical URL (item 10); a passkey-capable browser; package tags `coffer@<version>` as the trigger (no Changesets). The generated `.github/workflows/emdash-release.yml` is reviewed against the dependency tiers before committing; its plugin build uses the committed lockfile and CI's install-script allowlist.
2. **Plugin bundle hosting:** none of our own. `publish` and the release service upload the bundle and listing images to Wyatt's Atmosphere account and record checksums. The install host for the bridge and `install.sh` is unchanged (spec change 21). An Atmosphere login made before blob publishing fails with `MISSING_BLOB_SCOPE`: log out and back in.
3. **Supported versions in the manifest:** `"release": { "requires": { "env:emdash": ">=1.1.0 <2.0.0", "env:astro": ">=7.0.0 <8.0.0" } }`, and `plugin/package.json`'s `emdash` peer range (`>=0.12.0`) to match, using the lowest version actually tested (item 4). EmDash then refuses to install outside the range. Release metadata, not the trust contract.
4. **Test against current EmDash before 07b:** run `docs/emdash-upgrade-checklist.md` on the dev site against 1.3.1 (after the 7-day minimum age, or with a dated exclude Wyatt approves on provenance, as for 1.1.0); bump `@emdash-cms/plugin-cli` 0.13.2 → 0.13.4 in the same pass; read the 1.2.0, 1.3.0 and 1.3.1 changelogs for plugins, sandbox, routes, storage, Block Kit and the registry, findings in `docs/setup-friction.md`. Check in particular: the pay page's toolbar hiding (`36384b6`); the Plugins page's "Plugin pages" icon bug (400 `INVALID_PLUGIN_UI_CONTEXT`, 2026-10-07; if fixed, drop the drafted upstream issue); whether sandboxed plugins can read the site URL another way (spec change 23); Cloudflare per-call limits or new batch storage calls (spec change 35, option A); full suites and one live stagenet tip.
5. **The listing's `security` section:** `sections.security` from `./docs/security.md`, a plain-language summary of the security matrix for release 1 (attack, what Coffer does, the proving test, the result), linking the full matrix or published report on GitHub. 2,000 graphemes and 20,000 bytes at most. Written in phase 09 after the security review gate. Also `sections.description` and a short `faq` if room allows.
6. **Release 1's version, decided before the first publish** (versions can't be reused or edited; overwriting can be treated as a takedown): (a) 1.0.0, so release 2 is 1.x with the contract unchanged and 2.0.0 if broadened, the docs' rule (recommended); (b) stay at 0.1.0, where "major for a broadened contract" has no clear meaning.
7. **Listing approval time:** a release isn't on plugins.emdashcms.com until the registry's labeler approves it. Watch with `emdash-plugin info @<handle>/coffer --version <version> --watch`; announce (r/Monero, Discord, the Otta discussion) only once it shows publicly. A phase 09 step between publish and the registry setup test.
8. **Small manifest touch-ups (phase 09):** `"icon": "coins"` on the admin page (already in phase 09); no `group` unless a payments folder emerges; listing images under `release.artifacts` in `images/` (already in phase 09); `keywords`, up to five, for example `monero`, `xmr`, `payments`, `tips`, `privacy`.
9. **Say what setup needs before the Install click.** The short `description` (140 graphemes at most; today's mentions products, which release 1 doesn't take) becomes: "Accept Monero tips. Needs a separate Linux wallet host and a small edit to your site's code. Node-hosted sites only for now." `sections.description` opens with "What you'll need": EmDash 1.1 or later on Node (Cloudflare-hosted sites not yet); a separate, always-on Linux machine with systemd, such as a small VPS or a home server, where the wallet runs, never on the site; the shop wallet's address and view key (never the spend key); access to the site's code, to add the pay page and tip button and redeploy; about 15 minutes, ending with a test tip to your own wallet. Then a short "Why a separate machine" paragraph (the site never holds wallet keys, so a compromised site can't spend or see more than the view key allows). The EmDash line follows item 3. Optional, Wyatt's to post: an upstream suggestion that listings get a "needs setup outside EmDash" flag.
10. **Rename the GitHub repository before anything binds to it** (the EmDash profile and release setup, npm trusted publishing for `@cofferhq/astro`, the first tag, release or attestation, the first registry publish). Later renames work through redirects, but each of those would be set up again and published releases keep the old name. Proposed name `coffer`.
Proposed homes (the note's): item 10 first, its own commit, pushed and through CI before anything else; items 3 and 4 in one session, "7g: EmDash 1.3 check", before 07b; item 9's text in the same session, once the wording is approved; items 1, 2, 5, 6, 7, 8 as edits to `docs/phases/09-release.md`, built in phase 09.
Claude's notes (2026-10-20), checked against the code:
- **Versions** (npm registry's publish times): emdash 1.1.0 10-01, 1.2.0 10-06, 1.3.0 10-15, 1.3.1 10-18, so 1.3.1 passes the 7-day age on 2026-10-25. plugin-cli 0.13.2 10-01, 0.13.3 10-06, 0.13.4 10-15, so 0.13.4 passes on 2026-10-22 and needs no exclude if 7g runs after that. Pinned today: `emdash` 1.1.0 in the plugin, the theme and the dev site; plugin-cli 0.13.2; Astro 7.3.5 (theme and dev site).
- **Item 3:** the theme already declares peers `astro >=7 <8` and `emdash >=1.1.0 <2`; the plugin's `>=0.12.0` is the odd one. The only Astro tested is 7.3.5, so `>=7.0.0` names versions never tested; the note's own "lowest tested" rule gives `>=7.3.5`. Wyatt's choice under D.
- **Item 1 and the CI hardening decision (2026-10-03):** CI uses only GitHub's own actions, pinned to SHAs. The generated workflow pins third-party actions, so each is a dependency to approve (CLAUDE.md), recorded as a decided row when approved. Phase 09 step 4 already names the delegated flow as one of two options; item 1 picks it.
- **Item 2:** no phase plans separate hosting for the plugin tarball (phase 09 step 3's install host is for the bridge and `install.sh`). `emdash-plugin validate` (0.13.2) already prints "Default release hosting: publisher PDS blobs". A confirmation, not a change.
- **The manifest today:** `security` is the top-level advisory URL; item 5's `sections.security` is new. `description` is as quoted. No `release`, `keywords` or admin `icon` yet. `plugin/package.json` is version 0.1.0. Bundle: 58.3 KB across 3 files (`bundle --validate-only`, 2026-10-20).
- **Item 4's icon bug** (`INVALID_PLUGIN_UI_CONTEXT`) and its drafted upstream issue aren't recorded in the repo or in `~/xmr-pay-dev-data/`; a `docs/setup-friction.md` row may be owed, from Wyatt's details.
- **Item 5:** `docs/security-matrix.md` isn't in the repo yet (a 07b prerequisite, progress 2026-10-18).
- **Item 9:** the short description is 124 characters.
- **Item 10, as built (2026-10-20, `ddc05e2`):** GitHub's API resolves both names to the same repository, `dwightsabeast/coffer`. Changed: the manifest's `repo` and `security` URLs, the Go module paths (`github.com/dwightsabeast/coffer/bridge` and `…/bridge/oracle`, 50 files' imports, no `go.sum` change), `scripts/ci-status.py`, CLAUDE.md and the phase 00 links, and the systemd unit's `Documentation=` (not in the note's list). New guard: `scripts/repo-name.test.mjs`. `README.md`, `theme/` and `.github/` had no references. The dev box's remote stays on SSH (`git@github.com:dwightsabeast/coffer.git`; the note's https URL has no credentials here; the deploy key belongs to the repository and still works). The dev box's installed bridge unit keeps the old `Documentation=` URL until its next install or update, harmless through GitHub's redirect. `START-HERE.md` (local, gitignored) keeps the old name in its setup history.
Decisions for Wyatt: A, automated releases with required provenance and approval per release, or local `publish` (required provenance means every later release goes through the workflow); B, wait until 2026-10-25 for EmDash 1.3.1, or approve a dated exclude; C, release 1 as 1.0.0 (recommended) or 0.x; D, the short description and the "What you'll need" list as worded, or edited (with item 3's Astro floor). E, the repository name: decided, `coffer` (2026-10-20, built).
Effect on the admin budget: none. Item 9 states the existing setup needs before the Install click instead of after.
Effect on the trust contract: none. `release.requires`, `description`, `sections`, `keywords`, the admin page's `icon` and `repo` are listing and release metadata; capabilities, hosts, routes, storage and admin pages are unchanged.
References: https://docs.emdashcms.com/plugins/creating-plugins/publishing/, https://docs.emdashcms.com/plugins/creating-plugins/delegated-releases/, https://docs.emdashcms.com/plugins/creating-plugins/manifest/, https://docs.emdashcms.com/plugins/creating-plugins/capabilities/, https://docs.emdashcms.com/plugins/creating-plugins/api-routes/, https://docs.emdashcms.com/plugins/registry/

Wyatt's decisions (2026-10-20):
- **A:** automated releases, provenance required, a passkey approval for every release. The generated workflow and its third-party actions are reviewed and approved when generated in phase 09.
- **B:** wait for EmDash 1.3.1 to come of age on 2026-10-25; no exclude. 7g runs on or after that date.
- **C:** release 1 is 1.0.0.
- **D:** approved as written: the short description, the "What you'll need" list, and item 3's ranges, with Astro's floor at the version tested: `env:emdash >=1.1.0 <2.0.0`, `env:astro >=7.3.5 <8.0.0` (Wyatt chose `>=7.3.5` over the proposed `>=7.0.0` the same day).
- **E:** the repository is `dwightsabeast/coffer` (built in `ddc05e2`).
