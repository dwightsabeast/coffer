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

## 13. The remote-node cross-check: what is compared, when, with whom, and how the site hears of it  (status: accepted, 2026-10-04; item 4 amended 2026-11-02, see below)
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

**Item 4 amended (Wyatt, 2026-11-02, with spec change 47 and RT-26; built in `4615ceb`):**
- **The change:** with a remote node, while no second node answers, mined transfers are held at 0 confirmations, instead of passing the configured node's counts through. The same holds when a block can't be fetched from either node.
- **Why:** the reported height now fails closed (spec change 47), so confirmations do too. Otherwise a dishonest remote node with no second node reachable could claim any depth.
- **Unchanged:** the shop's own node.
- **The check:** still "unavailable", but no longer amber in effect. Payments don't settle until a second node answers, and the detail now says so.
- **Mainnet:** the built-in mainnet list is still empty, so a remote mainnet node holds every payment until it's chosen. That makes the list a release-1 blocker, as recorded on the before-phase-09 list.
- **Spec text to fold in (Wyatt):** duty 6's second sentence, "… A mismatch, or no second node answering, holds the transfer at 0 confirmations and turns a health check red."

**Items 3 and 4 amended again (Wyatt, 2026-11-02; built in `1162b8f`):**
- **Mainnet's list is https only:** the certificate is checked, no redirect is followed, and a plain-http entry is never used.
  - The list: `node.monerodevs.org:18089`, `xmr-node.cakewallet.com:18081`, `ravfx.its-a-node.org:18081`. These are the three of Wyatt's seven candidates whose certificates verified in the read-only probe, and all seven agreed on height and block hash (`~/xmr-pay-dev-data/mainnet-second-nodes-probe-2026-11-02.txt`).
  - Growing the list is on phase 09's checklist.
- **Stagenet keeps its http list:** only `stagenet.xmr.kernal.eu` has a certificate that verifies (`~/xmr-pay-dev-data/stagenet-second-nodes-https-probe-2026-11-02.txt`). It's the public-node live step's configured node, so an https-only list would leave that step with no second node.
- **Skipped by operator, not only by host:** a second node is skipped when it shares the configured node's operator. The operator is the host's last two labels; an IP address or a single label is its own. So `node2.monerodevs.org` no longer vouches for `node.monerodevs.org`.
- **A second opinion before holding:** on a mismatch, one more second node from a different operator is asked, once per check. If it agrees with the configured node, the payment counts, on that node's confirmations. If it disagrees, or there's none to ask, the payment is held as before, and the detail names both.
- **Spec text to fold in (Wyatt):**
  - duty 6: "… with a second node from a built-in list (https only on mainnet), never one run by the configured node's operator. A mismatch is checked with one more node from another operator before the transfer is held";
  - open question 12: the mainnet list above.

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

## 37. Same-machine wallet host: an "easy install" option  (status: proposed, 2026-10-16; A decided 2026-10-25: release 1.x, not release 1; B and C open)
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

Wyatt's decision (2026-10-25, in session 7g):
- **A:** release 1.x, not release 1. Release 1 keeps the separate-machine rule and the installer's refusal. The listing's description (`plugin/docs/description.md`, spec change 41 item 9) says: "An option to run the wallet host on the same server, for an easier setup, is planned for an upcoming release."
- **B and C:** still open.

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

## 41. Release readiness against EmDash's current plugin docs  (status: accepted, 2026-10-20, with Wyatt's decisions A–E below; item 10 built the same day; D amended and items 3, 4, 9 built 2026-10-25 in 7g; the rest in phase 09)
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

Wyatt's amendment to D (2026-10-25, at the start of 7g): EmDash's floor is **1.3.1**, since nothing will keep testing 1.1: `env:emdash >=1.3.1 <2.0.0`, the plugin's `emdash` peer `>=1.3.1 <2.0.0`, the theme's `>=1.3.1 <2` (its astro peer `>=7.3.5 <8`), and "EmDash 1.3.1 or later" in the "What you'll need" list. Astro's floor stays 7.3.5. The dev site stays on 1.3.1.

Built in 7g (2026-10-25):
- **Item 4:** `plugin/` on `emdash` 1.3.1, plugin-cli 0.13.4 and plugin-test 0.2.10 (`80309b8`); `theme/` on `emdash` 1.3.1 (`b404907`); the dev site on `emdash` 1.3.1 and `@emdash-cms/sandbox-workerd` 0.9.5. No exclude: installed after 1.3.1 came of age (19:20 UTC). Every row of `docs/emdash-upgrade-checklist.md` checked; results there, under "Checked against". Two rows changed upstream (the site address, spec change 42; `getMany`'s id limit, lifted); one row added (stored cursors). The Plugins page's icon bug is still there on 1.3.1, so the drafted upstream issue stays. One live stagenet tip settled (#288).
- **Item 3:** `release.requires` and the peer ranges as amended above (`4db9a53`, `b404907`).
- **Item 9:** the short description as worded, and `sections.description` from `plugin/docs/description.md`, Wyatt's approved text with his added last line on the planned same-machine option (`4db9a53`). Guarded by `plugin/tests/manifest.test.ts`.

## 42. Since EmDash 1.2.0, a sandboxed plugin's site address follows `siteUrl` and the Site URL setting  (status: proposed, 2026-10-25; the wording change goes to phase 09, Wyatt the same day; items 2 and 4 built in 7g)
Found in: session 7g (EmDash 1.3 check, spec change 41 item 4), reading the 1.2.0 to 1.3.1 changelogs and the 1.3.1 source.
Spec says: spec change 23 (accepted 2026-10-13): "A sandboxed plugin's `ctx.site.url` is the `emdash:site_url` option and nothing else", written once at setup; `siteUrl` and `EMDASH_SITE_URL` never change it. The upgrade checklist's row "`ctx.site.url` comes only from the `emdash:site_url` option" and the comment on `walletHostSite` (`plugin/src/admin.ts`) say the same.
Evidence:
- EmDash 1.2.0's changelog, #3744 (`1e275ae`): "Fixes plugins seeing an outdated site address in `ctx.site.url` and `ctx.url()`. They now use the same origin as links in emails: the configured `siteUrl`, `EMDASH_SITE_URL`, or `SITE_URL`, then the **Site URL** from **Settings > General**, then the address the site was set up on." A changed Site URL reaches plugins after a server restart (on Workers, as new isolates start).
- The 1.3.1 source agrees: `readSiteInfo` (`emdash-runtime`) passes `resolveSiteOrigin(config, site:url, emdash:site_url)` to the sandbox runners. `resolveSiteOrigin` (`site-url` module) takes `config.siteUrl || EMDASH_SITE_URL/SITE_URL`, then the `site:url` setting's origin when it is https (or http on a loopback host), then the stored setup address as is.
- 1.2.0 also adds a **Change domain** dialog to Settings › General, which checks the new domain before it changes the Site URL, and makes the field read-only.
- The dev site has `emdash:site_url` = `http://localhost:4321`, no `site:url`, and no `siteUrl` in `astro.config.mjs`. On 1.3.1 Coffer should still see localhost there and use the browser's origin, as on 1.1.0 (live check in 7g, step 8).
What it changes for Coffer (the floor is now EmDash 1.3.1, Wyatt 2026-10-25, so 1.1.0's behavior no longer needs supporting):
- The cause spec change 23 was written for (a site set up under `npm run dev` is stuck on localhost for good) now has an admin-side fix: set `siteUrl` / `EMDASH_SITE_URL`, or the Site URL through Change domain, and restart.
- The browser-origin fallback is still needed: a site with none of those set still hands plugins its setup address, which is loopback when the site was first set up under `npm run dev`.
- Spec change 23's rules all still hold as written. Rule 1 ("a saved public https address is always used") now covers a configured or Site URL address too, so the alert after a domain move appears less often, because the address follows the move.
- The page's wording "EmDash's saved address" is now loose: it may be a configured address, not one saved at setup.
Proposal:
1. Keep `walletHostSite`'s logic and spec change 23's five conditions unchanged.
2. Correct the comment on `walletHostSite` to the 1.3.1 order.
3. Change the page's wording from "EmDash's saved address" to "EmDash's address for this site". In the red line for a loopback or missing address, add the fix: "Set your site's public address in Settings › General (Change domain), or `siteUrl` in astro.config.mjs, then restart the site." Tests in `admin-site.test.ts` change to match. Wyatt approves the exact text before it's built.
4. Rewrite the checklist's row 5 to the 1.3.1 order, guarded by `admin-site.test.ts` and a live check of the dev site's admin page.
Effect on the admin budget: better. An admin whose site is stuck on localhost gets a fix in the admin, not only "open this page at your public address".
Effect on the trust contract: none. The `Origin` header is still read only on the private admin route (matrix row F06).
Decisions for Wyatt: whether to change the wording (item 3) now, before 07b, or leave it for phase 09; and the exact text.
Wyatt's decision (2026-10-25): item 3 in **phase 09**, not before 07b. In 7g, only items 2 and 4 (the code comment and the checklist row). The exact text is still to approve when phase 09 builds it.
Built in 7g (2026-10-25): items 2 and 4. Live on 1.3.1, the dev site (no `siteUrl`, no Site URL, setup address `http://localhost:4321`) still hands Coffer localhost, and the admin page shows the red banner, or the browser's https origin when there is one, as on 1.1.0.
Wyatt's decision (2026-11-06, RT-20's known limit): item 3's proposed text is replaced. The banner no longer tells admins to change EmDash's address settings, because of the lockout risk. **Build in phase 09, with this exact text;** the two titles don't change.
- Saved address unusable: "EmDash's address for this site is `${site.saved}`, not a public https address, so a wallet host on another machine can't use it. If this site is behind a proxy that ends https, visitors' tips are also refused until EmDash knows its public address. See EmDash's guide for sites behind a proxy: https://docs.emdashcms.com/reference/configuration/#reverse-proxy-setup. Before changing anything, make sure you'll still be able to sign in afterward: a passkey only works at the address where it was made. If you can already sign in at your public https address, open this page there and Coffer uses it."
- No saved address: "EmDash has no address for this site, so a wallet host on another machine can't connect to it. If this site is behind a proxy that ends https, visitors' tips are also refused until EmDash knows its public address. See EmDash's guide for sites behind a proxy: https://docs.emdashcms.com/reference/configuration/#reverse-proxy-setup. Before changing anything, make sure you'll still be able to sign in afterward: a passkey only works at the address where it was made. If you can already sign in at your public https address, open this page there and Coffer uses it."
- The toast at `admin.ts:1071`: "This site has no public https address"

## 43. Five security candidates from the matrix (C02–C06)  (status: accepted, 2026-10-25, as suggested)
Found in: `docs/security-matrix.md`, "Candidates not in the spec" (Wyatt's audit, 2026-10-25), checked against the code in the tagging session at `eb63872`.
Spec says: nothing. None of the five is in the spec's security model or Privacy list; each needs a decision before it becomes a T row with tests, or 07b only probes it and reports.
Evidence and proposals, one per candidate (the suggested decision is the matrix's):
- **C02, downgrade to an older signed bridge.** Rule: refuse any update with a lower version than the one installed. Code: `selfupdate.Newer` decides; `TestNewer` checks the order (`0.1.0` against `0.1.1` is not newer, dev versions too), and `TestBridgeNothingToDo`'s "older version" case offers a signed 0.0.9 to a running 0.1.0 and checks nothing is downloaded. Suggested: accept as built and promote to a T row. The test that names the case exists, so promotion needs only the row and a `[T26]` tag on that case. Not checked: the `monero-wallet-rpc` update path's downgrade case.
- **C03, the bridge's TLS checks.** Rule: the bridge refuses invalid or self-signed certificates for the site and the release host, and no user build can skip the check. Code: no `InsecureSkipVerify` anywhere in the bridge (grep, outside `bridge/oracle/`), so Go's default verification applies; plain http is refused for downloads (`TestPlainHTTPRefused`), and the installer refuses a non-loopback http site (`TestInstallRefusesEarly`, "bad site"). `monerodl`'s tests already use `httptest.NewTLSServer`, so a refusal test needs no new tooling. Suggested: accept for release 1 with one test: the sync client and the downloader each refuse an `httptest` TLS server whose certificate isn't trusted.
- **C04, dependency drift.** Rule: CI runs `govulncheck` on the bridge and `pnpm audit` on the plugin, and fails when a dependency is added outside the tiers; the release-age rule stays on. Code: `.github/workflows/ci.yml` installs with `--frozen-lockfile`, and the 7-day strict release age is on; neither `govulncheck` nor `pnpm audit` runs. Suggested: add both CI steps (CI tooling only, never shipped). `govulncheck` is a new tool and a Go module, so it needs the dependency ask (CLAUDE.md, "Dependencies").
- **C05, clock skew.** Rule: a bridge clock more than 300 s off drops every sync without saying why; Health shows the skew and turns red before it reaches the window. Code: no skew handling in the plugin or the bridge (no match for "skew"); the site answers `STALE_TIMESTAMP` and the bridge records the error. Suggested: defer to release 1.x and report it as a known limit.
- **C06, secrets in logs and shell history.** Rule: bridge logs, the systemd journal and saved install transcripts never hold the view key, wallet-rpc login or pairing code; the pairing code in shell history is limited by single use and the 15-minute expiry, and the report says so. Code: secrets are a type that can't print (`secret.TestNeverPrinted`), and wallet-rpc errors don't carry them (`TestWalletErrorsDontLeakSecrets`). Suggested: accept; 07b's journal scan checks the rest.
Proposal: Wyatt decides each candidate as suggested, or accepts probe-and-report for 07b. An accepted one becomes a T or P row in the matrix, with its tests tagged.
Effect on the admin budget: none for C02, C03, C04 and C06. C05's Health line would be a new admin-page line, not a new step.
Effect on the trust contract: none. C04 adds CI steps only; nothing in the plugin bundle or the bridge changes.
Wyatt's decision (2026-10-25): go with the suggested decision for each.
- C02: accepted as built; now matrix row T26, with `TestBridgeNothingToDo`'s "older version" case and `TestNewer` tagged.
- C03: accepted for release 1; now T27. The certificate refusal test is written in 07b; `TestPlainHTTPRefused` is tagged for the plain-http part.
- C04: accepted; now T28. Both CI steps still to build: `govulncheck` goes through the dependency ask first (CLAUDE.md, "Dependencies"), and `pnpm audit`'s scope and level are set then.
- C05: deferred to release 1.x; stays a candidate, and the report lists it under Known limits.
- C06: accepted; now T29, with `TestNeverPrinted`, `TestWalletErrorsDontLeakSecrets` and `TestInstallLog` tagged; 07b's journal scan checks the rest.

## 44. What a stolen bridge key reaches (RT-08)  (status: accepted as a draft, 2026-10-31; final wording after the fix sessions)
Found in: 07b pass 1, round 1, group D (`docs/redteam-findings.md`, RT-08; `plugin/tests/redteam/stolen-key.test.ts`, D2).
Spec says: Security model, "Forged payment events (signing key stolen)": "Every sync is Ed25519-signed. The result is free goods, not lost funds."
Evidence: holding the paired key, a forged sync added a pool address the attacker chose, and the next tipper's checkout was handed it. So a stolen key doesn't only forge a received tip; it can route real tippers' money to the thief, on an intact site, with no control of the pay page.
Proposal (Wyatt's draft, for the spec's row, matrix T03 and the public report): "A stolen bridge key can't spend from or read your wallet, but until you re-pair it can send new tips to the thief's wallet, and your Tips page may still show them as received. If tips listed there are missing from your wallet app, re-pair."
Effect on the admin budget: none for the wording. A detection feature from the fix sessions might add a Health line, which would come back here first.
Effect on the trust contract: none for the wording.
Wyatt's decision (2026-10-31): RT-08 is High. The fix sessions look for detection (for example the honest bridge checking the site's pool against its own wallet) and fast re-pairing. If nothing holds, it becomes an accepted limit with this wording. Wyatt applies the wording to the live spec. `docs/spec.md` stays a snapshot until then.

## 45. One network per pairing, and a pairing starts the pool afresh (RT-11, RT-29)  (status: accepted, 2026-10-31, with Wyatt's changes below; built 2026-10-31 on `redteam-1`, live re-pair check pending)
Found in: 07b pass 1. RT-11 (round 1, group L5: a signed sync adds a wrong-network subaddress to the pool). RT-29 (fix planning, 2026-10-31, from the code: a re-pair keeps the previous wallet host's unused pool addresses).
Spec says:
- Spec change 36: "The plugin never learns the network … neither pairing nor sync carries it".
- T20: "a mainnet address in a stagenet site's pool, or the reverse, is refused".
- The wallet-host failure table, "View key leaked": "Create a new shop wallet, run the installer with it … New payments go to the new wallet."
- Pairing "forgets the previous host's sync and checks" (spec change 29).
Evidence:
- **RT-11:** `protocol.ts:181` admits any address whose network byte it can read; nothing compares it with the site's network, which the plugin doesn't have.
- **RT-29:** pairing (`handle.ts:96–110`) doesn't touch the pool, and the sync adds an address only if its index isn't there yet (`handle.ts:146`). So after a re-pair with another shop wallet, the old wallet's unused addresses stay and are handed out first.
  - The bridge tops up from the site's `poolTop`, so the new wallet's addresses go above them. Stagenet followed by mainnet gives a mixed pool with no attacker at all.
  - With the same network, new payments go to the old wallet until its unused addresses run out, which contradicts the spec's "new payments go to the new wallet".
  - A thief's unused addresses (RT-08) also survive a re-pair, which contradicts RT-08's "until you re-pair".
  - Not yet shown by a test. The fix session writes it first.
Proposal (plugin only; no change to what the bridge sends, and no bridge rebuild):
1. **Every new pairing drops all unused pool addresses**, whatever their network, and clears the stored network. It happens in the same request that stores the new key.
   - **Order (Wyatt):** only after the code and the new key's signature have both checked out. Then drop the unused pool and clear the network, and only then store the new key and burn the code.
   - A failure partway therefore leaves the old pairing working, with the code still usable for a retry. It never leaves a new pairing with the old pool. The old bridge refills the pool on its next sync, which can skip up to 50 numbers for that wallet, the same cost as below.
   - A test makes a pairing fail after the drops and checks that the old key still syncs and the new key is refused.
   - Claimed addresses stay, with their invoices. An open invoice from another shop wallet can't be watched by the new host and expires as today. That's unchanged and already stated.
2. **The site's network** is the network of the first readable address the plugin accepts after a pairing, signed by the newly paired bridge. It's stored in KV next to the bridge key (KV isn't a storage collection, so the trust contract is unchanged). An install with no stored network is treated like a fresh pairing. There's no migration: nobody runs Coffer yet (Wyatt, 2026-10-31).
3. **A sync address on another network is dropped**, like one whose network can't be read today. Within one sync, the first readable address in the body's order sets the network when none is stored.
4. **Checkout never hands out a pool address whose network differs from the stored one** (defence in depth). A row like that is skipped like an unreadable one (spec change 36's "claimed with no invoice and skipped").
5. **The admin page shows the stored network next to the pairing status.** For example "Paired · stagenet", or "Paired · network not known yet (set by the wallet host's first addresses)". The exact text goes in the plan for Wyatt.
6. **Refused addresses aren't reported on their own.** Reporting them is folded into RT-08's Health line (spec change 46, to come; Wyatt, 2026-10-31).
Costs checked (2026-10-31, from the code):
- **The empty pool after a re-pair costs a few seconds, at most.**
  - Pairing clears `lastSyncAt`, so checkout already answers `WALLET_HOST_SILENT` from the pairing until the new host's first full sync (`checkout.ts:37–40`). It answers `WALLET_HOST_SYNCING` while that host's wallet scans.
  - A reinstall from keys catches up and rescans before it reports anything (spec change 15), so the site stays silent through that too.
  - The first full sync gets `poolFree: 0` back. The bridge creates the missing addresses and, with `Soon()` true, sends them on an immediate next sync (`bridgeloop.go:255`, `:490`).
  - So the only new window is that one round trip, when the wallet was already caught up. A checkout in it gets `NO_ADDRESS_AVAILABLE`, as on any empty pool.
- **Gaps in the address numbers** (spec change 9: a wallet app looks 200 past the last paid address, and the Health page warns when the highest claimed index minus the highest paid one passes 150):
  - **Reinstall on a new wallet host** (the common re-pair, a wallet restored from keys): **no gap is added.** `poolTop` is the highest remaining row, a claimed one, so the bridge catches up only to it and then creates from the next number, reusing the dropped ones. It's less work than today's catch-up to the old top.
  - **Re-pairing a host that keeps its wallet** (`xmr-bridge pair` after a lost key, R08, or re-running the installer with the wallet kept): **up to 50 numbers are skipped each time** (`POOL_TARGET`).
    - The bridge only ever creates new subaddresses (`create_address`) and never re-sends ones its wallet already has, so the dropped numbers are never offered again.
    - The new pool starts above the wallet's highest. That's at most the old pool's top plus up to 100 pending addresses, but pending ones are still sent, so only the dropped free rows become a gap.
    - The spec change 9 warning counts claimed indices, so it sees the gap once those addresses are used. Starting from no gap and with nothing paid in between, three such re-pairs reach the warning (150), and the fourth reaches the wallet app's 200.
  - **Re-pairing to a different wallet, RT-29's own case: a gap the size of the old shop's history. Confirmed from the code, 2026-10-31.**
    - Pool rows only ever go from free to claimed (`store.ts:22`, `checkout.ts:193–198`). So every checkout's number stays used, expired ones included, and after the drop `poolTop` is the old wallet's highest claimed index.
    - The new wallet is fresh. The bridge probes that index (`HasSubaddress`, `get_address` out of bounds), catches up to it without sending anything (`bridgeloop.go:443–455`, `catchUp` at `:497`), and tops up from the next number.
    - So the new wallet's first pool address comes after the old shop's whole history. Past 200 checkouts, it's beyond a wallet app's lookahead for a wallet that has received nothing, and its tips wouldn't show in the wallet app. The bridge itself sees them, because it created the addresses.
    - The Health warning is blind to it: it measures from `state:paidTop`, the old wallet's last paid number, which pairing doesn't reset (`store.ts:73–75`, `admin.ts:114–115`).
    - Today's code has the same gap, from the old top instead, so 45 doesn't cause it. 45 alone doesn't fix it either.
  - **Fixed in spec change 46 (Wyatt, 2026-10-31), which changes the bridge anyway:**
    - The bridge tells the site at pairing whether it's the same wallet as before.
    - A different wallet doesn't inherit the old numbering, and the warning's baseline resets with it.
    - The same wallet re-offers its own unused subaddresses above `poolTop` (`get_address` by index; Wyatt takes this option), so a re-pair that keeps the wallet skips no numbers either.
  - **Until 46 lands:** the switch-wallets steps say to raise the wallet app's subaddress lookahead. No such steps exist in the repo's user-facing docs yet. The places are the spec's "View key leaked" row (the live spec, Wyatt's) and phase 09's install docs.
Tests (fix session, failing first):
- The two RT-11 expected-fail tests become passing tests.
- A pairing that fails after the drops: the old key still syncs, the new key is refused, and the code still works for a retry.
- An RT-29 test: a re-pair to another wallet of the same network gets only the new wallet's addresses, and no old unused one is handed out.
- A stagenet-to-mainnet re-pair: the old unused addresses are gone, checkout hands out mainnet, and claimed rows and invoices are untouched.
- No stored network: the next address sets it.
- A mixed first batch: only the first address's network is kept.
- Checkout skips a row on another network.
- The admin page shows the network.
- A re-pair keeps claimed rows, and `poolTop` falls to the highest claimed one.
- Matrix rows T20, P02, T03 and R08 get the tags.
Effect on the admin budget: none (no setting, step or upkeep). The admin page gains the network on the pairing line (Wyatt asked for it).
Effect on the trust contract: none. Same capabilities, hosts, routes and collections. A KV key and an admin-page text change.
Related, for spec change 46 (RT-08, next; Wyatt, 2026-10-31):
- At pairing, the bridge says whether it's the same wallet. A different wallet gets fresh numbering and a reset gap baseline; the same wallet re-offers its own unused subaddresses (above).
- The bridge checks the site's pool against its own wallet.
- A stolen key mustn't be able to lock the honest bridge out with far-future sequence numbers, or the check never runs (RT-24's `seq` reach applies here).
- A refused sync from the honest bridge itself raises the red Health line.
- Refused wrong-network addresses are reported in that same line.
- **A stdin option for `xmr-bridge pair`** (Wyatt, 2026-10-31, T29/C06). Today it takes the code only as `--code` on the command line, where other processes on the wallet host can see it while it runs. It's one-time and expires in 15 minutes, but real admins hit the same thing. Accepted for the dev box's stagenet re-pair only.
Wyatt's decision (2026-10-31): accepted, with three changes:
1. Keep item 4.
2. The order inside the pairing request, plus a test for a pairing that fails after the drops (item 1).
3. Record the different-wallet gap and fix it in spec change 46, with the doc note until then (Costs checked).

Decided while building (Wyatt, 2026-10-31):
1. **The stored network carries the key's ID:** `state:network` is `{ network, keyId }`, and a record from another key counts as not known. A key ID is the base64 key's first 16 characters.
2. **The window a running sync leaves is closed, not filed.** A sync already past its signature check when a re-pairing lands can still write after the drop, and a thief can send syncs in bursts through a re-pair on purpose. Every pool row carries the ID of the key whose sync added it, and checkout skips a row from another pairing (claimed with no invoice), like item 4. Also kept: a sync whose key was replaced while it ran is refused (`BAD_SIGNATURE`) before it writes.
3. **The drop is mark, then delete, not `compareAndDelete`.**
   - Found while building: checkout claims with `updateIf`, which doesn't change a row's revision (EmDash 1.3.1). So a `compareAndDelete` on a revision read earlier would delete a row claimed in between, leaving its invoice with no pool row and never watched.
   - The drop marks each free row `status: "dropped"` with an `updateIf` guarded on `status: "free"`, so exactly one of a claim and the drop wins. Then it deletes the marked rows.
   - A row left "dropped" by a failed pairing is never counted as free or claimed, never handed out, not in `poolTop` or the gap warning, and deleted by the next pairing. Uninstall deletes it like any row.
   - It's a new value in an existing field; the trust contract's collections and indexes are unchanged.
   - `compareAndDelete` is reachable from the sandbox (sandbox-workerd 0.9.5 bridges `storage/compareAndDelete`) but isn't used.
4. **Admin wording:** "Paired · stagenet" (or mainnet, testnet), "Paired · network not known yet", "Not paired". No bracket.

## 46. The honest bridge checks the site's pool, and a re-pair knows whether the wallet changed (RT-08, the rest of RT-29)  (status: accepted, 2026-11-01, with Wyatt's decisions below; the proposal text already includes them; plugin and bridge sides built 2026-11-01 on `redteam-1`, with Wyatt's review of the bridge plan below; live check 2026-11-02: steps 1–5 and 7 pass, step 6's switch passes but its payment proof waits for RT-30 and RT-31, found there; RT-30 and step 5b's race fixed in code 2026-11-02, D4 amended with a 60 s grace, see "Fix sessions" below)
Found in: 07b pass 1.
- **RT-08 (High):** a stolen bridge key adds pool addresses that tippers then pay.
- **RT-24 (Low):** a far-future `seq` freezes an invoice.
- **Spec change 45's "Costs checked":** a different wallet inherits the old numbering; a host that keeps its wallet skips up to 50 numbers per re-pair.
- **T29/C06:** the pairing code on `xmr-bridge pair`'s command line.

Spec says:
- Security model, "Forged payment events (signing key stolen)": "The result is free goods, not lost funds." Spec change 44 drafts the honest wording if nothing better holds.
- The wallet-host failure table, "View key leaked": "Create a new shop wallet, run the installer with it … New payments go to the new wallet."
- Spec change 9: a wallet app looks 200 subaddresses past the last one used, and Health warns at a gap of 150.

Evidence:
- **RT-08:** `plugin/tests/redteam/stolen-key.test.ts`, D2.
- **The different-wallet gap, on the dev site today:**
  - The dev site holds 306 claimed rows (indexes 1–305 and 356). After spec change 45's live re-pair, its free rows are 357–405.
  - A re-pair to a different, fresh stagenet wallet would drop the free rows, and the bridge would catch the new wallet up to `poolTop` 356 (`bridgeloop.go:443–447`). So its first pool address would be index 357.
  - A wallet app that has seen nothing on that wallet looks only at indexes 1–200, so tips to it wouldn't show in the app. Health measures from the old wallet's `state:paidTop` and wouldn't warn.
  - This is the test case for the same-wallet check below.
- **The same-wallet skip:** measured live on 2026-11-01. Numbers 306–355 were skipped by spec change 45's re-pair of the dev box's bridge, which keeps its wallet (progress, "Live re-pair").
- **What the bridge can already ask its wallet:** `get_address` with an `address_index` list (`walletrpc/wallet.go:81`, `HasSubaddress`). So the bridge can read its own address at any index it has created, and compare it with what the site holds. The site stores nothing new about the wallet.

### Proposal

**1. The honest bridge checks the site's pool (RT-08 detection).**
- **The site sends the rows to check, as digests (D3).** Every sync response carries `check`, a list of `{ index, digest }`. The digest is the first 16 bytes of SHA-256 of the address string (WebCrypto). Today's response carries indexes only (`handle.ts:208–209`). Sending addresses would let a thief holding the key collect every subaddress the shop ever handed out and link them to one wallet; digests tell it nothing it doesn't already have.
  - **Only the current wallet's rows**, so a different-wallet re-pair doesn't flag the old wallet's open invoices as foreign.
  - **Order, at most 150 entries:**
    1. every free row (at most 50, below);
    2. every row added in the last 24 hours, any status, settled included, newest first;
    3. the rows of open invoices;
    4. a rotation through the rest.
  - **The rotation moves by the clock:** the next chunk comes every 30 s, not once per response. So a thief that syncs often can't move it along before the honest bridge gets its turn.
  - **Why the 24 hours:** no row can be marked "checked" on an "ok" report, because a thief holding the key can send "ok" too. A time window keeps each new row in the list for about 5,000 honest syncs. That includes a tip the thief settles with a forged snapshot within seconds.
  - **Pool rows gain `addedAt`** (site clock, ms). It's a new field with no index, so the trust contract's storage is unchanged.
- **Free rows are capped at `POOL_TARGET` (50):** once 50 rows are free, further addresses from a sync are ignored. Today each sync can add up to 100 (`MAX_ADDRESSES`) with no total cap, so a thief could push rows past the list's cap.
- **A wait before hand-out:** checkout takes only free rows whose `addedAt` is at least 45 s old. Every free row is in every check list, so the honest bridge checks each row before any tipper sees it. This prevents RT-08 while the wallet host runs, rather than only detecting it.
- **The bridge checks them** against its wallet, from an in-memory copy of its own address table (subaddresses never change, so only new indexes are read). It reports in its next sync: `checks.pool = { state: "ok" | "mismatch", bad: [index…] }` (at most 20 indexes).
  - An index the wallet doesn't hold, or holds with another address, is bad.
  - On a mismatch the bridge syncs again at once, rather than after its usual 12–15 s.
- **The site acts on a mismatch:**
  - **A red Health banner,** sticky until the next pairing (D3): "Coffer found addresses on this site that aren't from your wallet. Someone may have your wallet host's key. Payments to those addresses don't reach you, so Coffer has stopped handing them out. Connect a new wallet host now (in Settings), on a machine you trust, then check Needs a decision." "On a machine you trust" is there because the key most likely came off the wallet host itself. Re-pairing a broken-into machine hands the thief the new key.
  - **Bad rows get their own status, `bad`.** It's never handed out and never deleted. `poolTop` and the free count ignore it, as they do "dropped".
    - It isn't "claimed with no invoice": one forged row at index 4,000,000,000 would then lift `poolTop` and start RT-27's catch-up on the honest bridge.
    - It's a new value in an existing field.
  - **Every invoice on a bad row goes to `review`**, closed ones included, with a new reason, `not_your_wallet`. So the admin sees which tippers paid an address the wallet doesn't hold, including a tip a thief marked settled within seconds.
  - **An "ok" report never clears a mismatch.** A thief holding the key could send "ok", but can't stop the honest bridge sending "mismatch".
- **Health shows when the pool check last reported "ok"** ("never" for a bridge without the check). A thief's forged "ok" refreshes it too, so it shows only that a check is running. A mismatch always wins.
- **The new review reasons get display text** in the invoice list. Without it, `STATUS_TEXT`'s caller (`admin.ts:452–454`) would show "Needs decision: not_your_wallet" raw. The same goes for `wallet_changed`. The wording is in the build plan, for Wyatt.
- **Nothing gates the check.** It travels in `checks`, which no `seq` or snapshot rule touches, so a thief can't lock the honest bridge's report out.
- **What's left:**
  - While the honest bridge runs, the 45 s wait keeps a thief's row from being handed out before the check reaches it.
  - While it's stopped, nothing checks. A thief's rows wait in the pool and are caught on the honest bridge's first sync after it's back. They're handed out in the meantime, and the 24-hour window and `not_your_wallet` review list the affected tips.
- **Spec change 44's wording** is finalised from this after the build. For example: "…while your wallet host is running, Coffer refuses addresses that aren't from your wallet; if it's stopped, tips can go to the thief until it's back, and Coffer then lists them".

**2. Refused syncs from the wallet host are shown, not silent.**
- **The current key:** a request whose signature verifies with the current key but is refused afterwards (`INVALID_BODY`, `UNSUPPORTED_VERSION`, or the `seq` bound in item 5) is recorded with its code and time. Health shows it as red: "The site is refusing your wallet host's updates (<code>) since <time>." Today such a sync fails silently on the site's side.
- **The previous key:** after a re-pair, a request signed by the previous key is recorded as "the previous wallet host is still running". This needs the previous public key kept (D4).
  - The record is rate-limited (at most one KV write a minute), so an old key can't drive writes.
  - Health shows a plain line, with the pairing time (D4): "Your previous wallet host is still contacting this site; its updates are refused. If you moved to a new wallet host at <time>, shut the old one down (on it: sudo systemctl disable --now xmr-bridge). If you re-paired the same one, leave it running: someone else has the old key, and the re-pair already locked them out. If you didn't connect a wallet host at <time>, someone else did: connect yours again now."
  - After item 1's banner, the likeliest re-pair is on the same machine, hence the middle case.
- **Other networks:** addresses refused for another network (spec change 45, item 6) count as a pool mismatch, with the same banner. An honest bridge never sends one, because its own first address set the network.

**3. At pairing, the bridge says whether it's the same wallet.**
- **The probes:** the pairing response, and every response until the bridge has answered, carries `probes`, one `{ wallet, index, digest }` per wallet the site has used (the digest as in item 1). At most 10 wallets, most recent first.
  - Each wallet's probe is its lowest-index row, stored in `state:wallets` when the wallet is first seen, not read from the rows later.
- **The check:** the bridge creates subaddresses up to each probe's index if it lacks them. That's normally index 1, which costs nothing, because either wallet uses index 1 anyway. It then compares its address's digest at that index.
- **The answer:** its next sync carries `wallet: { match: <wallet> | null, receivedTop: <index> }`. `receivedTop` is the wallet's highest index with a transfer, from the `get_transfers` read the re-offer needs anyway (item 4).
- **Until the answer arrives,** for the new key the site:
  - accepts no addresses. The pool is empty after spec change 45's drop, so checkout has nothing to hand out in that time (`NO_ADDRESS_AVAILABLE`, as on any empty pool);
  - sends an empty watch list and applies no snapshots. Today a re-pair to a different wallet gets the old wallet's watch list. The new wallet host reports those indexes empty, so `mergeSnapshot` sends a settled tip still under `FINAL_DEPTH` to review "reversed", with an alert;
  - keeps the restore-height suggestion, worked out across all wallets' watched invoices.

  That's one round trip after the wallet is ready.
- **A bridge that never answers** gets no addresses. There's no fallback: with no version bump (D5), it only matters when an older bridge pairs to a site with history, and live step 2 updates the dev box's bridge before any re-pair.

**4. Each wallet keeps its own numbering.**
- **Site-side numbers:** the site numbers a wallet's rows `wallet × 2³² + its own index` (wallet 0 is every row stored so far, so there's no migration), kept in `state:wallets` (KV). On the wire the bridge and the site speak only the wallet's own indexes:
  - addresses and snapshots are the wallet's indexes;
  - `poolTop` and `watch` count only the current wallet's rows, translated back.
  - `addrIndex` stays unique and keeps its index, so the trust contract's storage is unchanged. 2³² is past Monero's subaddress index range, so no two wallets collide, and the site numbers stay below 2⁵³.
  - **One helper** joins and splits the number, with an assert that the result is a safe integer (D1). Every reader of `addrIndex` uses it:
    - `poolTop` (`store.ts:127`), `poolHas` and `poolAdd`, and `invoiceForIndex` (`store.ts:130`);
    - the sync's address step (`handle.ts:191`), `notePaid` with `state:paidTop` (`handle.ts:194`, which becomes per wallet), the snapshot step (`handle.ts:198`) and the watch list (`handle.ts:208`);
    - checkout's free query (`checkout.ts:197`);
    - the gap warning's numbers (`admin.ts:88`, `:118`) and its text's two "#" numbers (`admin.ts:174`);
    - the invoice's "#index" (`admin.ts:600`);
    - the dev scripts that read `addrIndex` (`scripts/dev-invoices.mjs`, `scripts/redteam/scan-at-rest.mjs`, and the dev-only counts tool), where they need it.
  - **`parseSyncBody` bounds indexes (D1):** address and snapshot indexes must be in 1..2³²−1, or the body is `INVALID_BODY`. Otherwise a stolen key's index 2³²+k would land in the next wallet's range. It would be outside the current wallet's check list, yet tagged with the current key, so checkout could hand it out.
  - The admin page shows the wallet's own index (`addrIndex mod 2³²`), so "#356" stays what the wallet app calls it.
- **No match:** a new wallet number.
  - The bridge starts above max(the highest index its wallet has created, `receivedTop`). For a fresh wallet that's index 1, within any wallet app's lookahead.
  - Its gap baseline (`paidTop`) starts at `receivedTop`, not 0. Otherwise a returning wallet that starts at 406 would show a false 406-address gap.
- **A match:** that wallet's numbering and baseline resume. So switching back to an earlier wallet reuses nothing.
- **The same wallet re-offers its own unused subaddresses** (Wyatt, 2026-10-31), **only after it answered "match"**:
  - **Which:** the indexes above that wallet's `poolTop` on the site that the wallet already created and that have no transfers. It reads them with `get_address` and checks them with `get_transfers`.
  - **Order:** they go in before any new one, so a re-pair that keeps the wallet skips no numbers.
  - **How it ends:** the bridge's pending list and `l.known` keep it from offering one twice. The site skips an index it already holds (`poolHas`), as today.
  - **Why only on a match:** with no match, the site doesn't know the wallet's history. Unused below the bridge's start could mean "handed out and never paid".
- **When a wallet's rows can all disappear:** only on uninstall with "delete data", which also clears every KV key, `state:wallets` included (`store.ts:153–163`). The 30-day purge clears buyer data only (`housekeeping.ts:28`). A returning wallet then looks new, and the no-match rule above applies.
- **Known limit for release 1** (corrected 2026-11-01 from `TestLiveShopWallet`, Wyatt):
  - **What a restore finds:** a wallet restored from keys stops at the first gap of 200 unused subaddresses (wallet2's lookahead). In the live test, the restored shop wallet's next index was 10 while it held payments up to index 305. It found 261–305 only after creating up to 1110 and rescanning.
  - **The consequence on a "no match" for a wallet with history** (both sides rebuilt, or a reused wallet paired as new):
    - `create_address` can hand out addresses that **already received payments**, not only unpaid ones;
    - and `receivedTop` can be far too low (9 instead of 305 in the live test), so the gap baseline is too.
    - A payment to such an address, late or not, is credited to the new invoice. For tips that's a misattributed tip; for orders (release 2) it means free goods.
  - **A match is fine:** the catch-up creates up to `claimedTop` and rescans, so the wallet's own history is found before anything new is handed out.
  - **The docs say to use a wallet made for this shop,** not one with history (phase 09's install docs).
  - On pass 2's list.
- **Open invoices of another wallet** can't get evidence from the new host (decision D2):
  - those with something received go to `review` with reason `wallet_changed`;
  - those with nothing received expire at their deadline with reason `wallet_changed`. This is a stated exception to "expire on evidence": no evidence can come from a wallet that isn't connected.
  - Resuming that wallet later doesn't reopen them. An admin sees them in the lists as today.
  - **For release 2 (pass 2):** a buyer who pays an old wallet's address after a switch gets an expired order, so orders need a "paid to a previous wallet" path (D2).

**5. A `seq` bound (RT-24, defence in depth).** A sync whose `seq` is more than 300 s from `x-xmr-ts` × 1000 is refused (`SEQ_OUT_OF_RANGE`).
- **An honest bridge passes:** both come from its clock.
- **Its cost:** if the wallet host's clock is stepped back more than 5 minutes after a run, its syncs are refused until the clock catches up. The bridge logs it, `xmr-bridge status` shows it, and item 2 shows it in red on the site.
- **It's no defence against a stolen key,** which can keep `seq` at the edge of the window and still freeze an invoice's snapshots. That stays inside the stolen-key limit. The pool check (item 1) doesn't depend on `seq`.

**6. `xmr-bridge pair --code -`** reads the code from stdin, one line, so it isn't on the command line while pair runs (T29/C06; Wyatt, 2026-10-31).
- **The installer's own `xmr-bridge install`** gets the same `--pair -`. `install.sh` passes the code on stdin, so it's out of the bridge's process list.
- **Still visible:** the code in `curl … | sh -s -- --pair <code>`, and so in the shell's history, as T29 states (single use, 15 minutes).
- **Not proposed:** an install.sh that prompts for the code. It would add a paste to the admin's steps.

**7. The protocol version.** Recommended: no bump. Nothing is released, the new fields are optional to parse, and the dev box's bridge is replaced in the live check. The alternative is v2 with v1 still accepted (the update banner), plus a bridge that falls back to v1 when an older plugin answers `UNSUPPORTED_VERSION` (decision D5).

### Tests (failing first; the build is plugin, then bridge, then the dev release)
- **Plugin:**
  - the `check` list: digests, never addresses; current wallet only; its order, cap, and the clock-driven rotation (a thief syncing often doesn't move it);
  - the 24-hour window: a row a thief settles within seconds is still in the list;
  - the free cap: a sync past 50 free rows adds nothing;
  - **the 45 s wait:** a forged row is never handed out when the honest bridge reports within the window;
  - a mismatch report: a sticky banner, bad rows to status `bad` (out of `poolTop` and the free count, never deleted), every invoice on a bad row to `not_your_wallet` review, closed ones included, and "ok" never clearing it;
  - the Health line for the last "ok", and "never";
  - the display text for `not_your_wallet` and `wallet_changed`;
  - the refused-sync records, for the current and the previous key, and the previous key's write limit;
  - the probes, stored in `state:wallets`;
  - **before the answer:** no addresses accepted, an empty watch list, no snapshots applied (a settled tip under `FINAL_DEPTH` stays settled), and the restore height across all wallets;
  - `wallet: { match, receivedTop }`: a new wallet numbers from the bridge's start with the baseline at `receivedTop`, a matched wallet resumes, and a bridge that never answers gets no addresses;
  - the index bound in `parseSyncBody`: 0, 2³²−1, 2³² and above;
  - the translation of `poolTop`, `watch`, `paidTop`, addresses and snapshots;
  - **the dev site's shape as a fixture:** 306 claimed rows, then a different-wallet re-pair. Its first pool address is its own index 1, and the gap warning measures from its `receivedTop`;
  - old-wallet open invoices, received and not received;
  - the `seq` bound, both directions and the edge;
  - the admin page's wallet index display.
- **Bridge (Go):**
  - the pool check by digest: match, wrong address, missing index, the cap, and the immediate re-sync on a mismatch;
  - the probe: creating up to the index, then match or no match, with `receivedTop`;
  - re-offering unused subaddresses after a match, skipping one with transfers; none re-offered without a match; the no-match start above max(created, `receivedTop`);
  - `--code -` for pair and install;
  - the `seq` and timestamp agreement.
  - All against the existing fake wallet, then `TestLiveShopWallet` against stagenet wallet-rpc. The new live part: `get_address` by index on a view-only wallet.
- **Contract:** `contract/` documents the new fields. Signing is unchanged, so the shared vectors don't change.
- **Matrix rows:** T03, T04, P02, T20, T29, R08. The pool check folds into T03 and R08, with no new row (D6).

### Live check (after the build; Wyatt's steps marked)
1. **A dev release on go1.27.3:** `scripts/build-dev-release.sh`; **Wyatt signs** it (`scripts/sign-dev-release.sh`); it's served on 127.0.0.1:8099. It replaces the 30 October release in `~/xmr-pay-dev-data/dev-release/`.
2. **The upgrade:** **Wyatt runs `sudo xmr-bridge update`**, the installed 8 October build updating itself through the dev key it pins. That also exercises the update path.
   - Checked: the version, the service is active, syncs carry the new fields, and `status` prints the bridge key (the line the 8 October build probably lacks).
   - Fallback if the old build can't take the new release: re-run `install.sh`, which keeps the config.
3. **The pool check, honest:** Health has no pool banner, and the bridge's status shows "ok".
4. **RT-08, live:**
   - Claude writes one forged free row, tagged with the current key, into the dev database (the KV shortcut's method, loopback only), as a thief with the key could.
   - Measured: the time until the honest bridge reports it. Expected within 30 s, inside the 45 s wait.
   - Then checked: the banner, the row's status `bad`, `poolTop` unchanged, and a checkout never handed it.
5. **A same-wallet re-pair with the code on stdin:**
   - **Wyatt runs a script** that pipes the code into `sudo xmr-bridge pair --config /etc/xmr-bridge/config --code -`.
   - Expected: the answer "match"; the free rows dropped at pairing (357–405 today) re-offered; no numbers skipped.
6. **A different wallet: Wyatt's test case.**
   - **The setup:** **Wyatt** re-runs the installer on the dev box with a second stagenet wallet he controls (D7: a new Feather wallet, his seed, its restore height set by hand to the current height; the installer's `--restore-height` defaults to today, `install.go:34`). He types its address and view key at the installer's prompts; they're never in a file Claude reads. Claude issues the code when he's at the terminal.
   - **Just before it:** Claude opens a fresh unpaid tip on the shop wallet. `inv_e266ef9e2e436bd0` expired at 01:22 UTC on 2026-11-01, so it gives D2 nothing to act on. The "something received" case stays in the tests.
   - **Expected:**
     - the answer "no match", so a new wallet number;
     - its first pool address is its own index 1, not 357;
     - Health's gap reads 0;
     - the fresh unpaid tip expires at its deadline with reason `wallet_changed` (D2).
   - **The proof:** Wyatt pays a small stagenet tip from his Feather buyer wallet to the new wallet's first address, using `pay-script` as in 3h. It settles in Coffer, and it shows in the second wallet's own app with no lookahead change.
7. **Back to the shop wallet:**
   - **Wyatt** re-runs the installer with the shop wallet.
   - Expected: the answer "match wallet 0"; the first pool address is 357, because wallet 0's 357–405, dropped in step 6, are re-offered; the baseline is wallet 0's again.
8. **The record:** evidence to `~/xmr-pay-dev-data/46-*.txt`, and a bundle at the end.

**Live check, as run (2026-11-02; details in `docs/progress.md`):**
- **Step 2 had no `xmr-bridge update` command.** The dev build updated itself from the served release in a minute, which also showed that a self-update never refreshes the root-owned admin copy (the open admin-copy question).
- **Steps 6 and 7 needed `uninstall --delete-data` first:** the installer refuses another address on a machine that hosts one.
- **Step 4 used two forged rows (Wyatt):** a held index the site lacked, and `claimedTop` + 100,000. Both were bad within one sync, and a checkout got neither.
- **Step 5 ran twice:** by installer (5a) and by `pair --code -` with the service running (5b).
- **Step 6's second wallet had history:** RT-30 (the probe answered before the scan) and RT-31 (old transfers count toward a new invoice). D2's `wallet_changed` expiry passed; the payment proof waits for the fixes and a truly new wallet.
- **Step 7 expected `claimedTop` + 1 (359)**, not a fixed 357: earlier steps claimed rows.

**Fix sessions (2026-11-02, after the live check; Wyatt's rules):**
- **RT-30 (`73781ec`):** item 3's probe is answered only once the wallet has scanned to its node's height. The node must also be synchronized and online, and is read fresh. Until then the site keeps waiting. Answering drops pending addresses that have received, and index 1, created to answer, is one of them.
- **D4 amended, step 5b's race (`307c104`):** the test was red. A sync the previous key signed just before a same-machine re-pair, arriving just after it, raised "Your previous wallet host is still running".
  - Now the previous key's requests in the first 60 s after a pairing are refused but not recorded. An old host still running is recorded at its first sync after that.
  - `state:previousKey` holds `{ publicKey, pairedAt }` in one write. A string from before reads as `pairedAt` 0, so it gets no grace.
- **The bridge side of 5b (`b33fc21`):** a body built under the old pairing is never sent, under either key.
  - A key changed mid-sync drops the body, and a fresh sync follows under the new key.
  - The old pairing's pool report, probe answer, re-offer and watch list are dropped at a new key. Pending addresses stay.
  - That state is tagged with its key and dropped on any key change, mid-sync or between syncs (Wyatt confirmed, 2026-11-02).
  - Otherwise a stale "mismatch" would raise item 1's sticky banner on the new pairing.
- **Spec text to fold in (Wyatt):** item 2's previous-key line: "… is recorded as 'the previous wallet host is still running', except in the first minute after a pairing, when a sync already on its way from the same machine can still arrive."

Effect on the admin budget: none for setup. The new Health lines appear only when something is wrong, and no setting, step or upkeep is added. Switching wallets needs no lookahead change any more, so the doc note planned in spec change 45 isn't needed.

Effect on the trust contract:
- **No change** to capabilities, hosts, routes, collections or indexes.
- **New KV state:** `state:wallets` (with each wallet's probe), the pool check's state, the refused-sync records, and the previous public key (D4).
- **Pool rows:** a new field, `addedAt`, and two new values of `status`, `bad` and (from 45) `dropped`. No new collection or index.
- **Wording:** CLAUDE.md's list of what the plugin stores ("only the bridge's public key, a hash of the pairing code, and a salt") gains "and the previous bridge's public key" (D4), updated at build time with Wyatt's OK.
- **The probes and the `check` list** send digests, not addresses (D3). A key holder learns no address it didn't already have, and no wallet material.

### Decisions for Wyatt
- **D1. Numbering per wallet as `wallet × 2³² + index`** (item 4), which keeps the storage indexes as they are. The alternative is a new unique index on (wallet, index), which changes the trust contract. Recommended: 2³².
- **D2. Open invoices of a wallet that's no longer connected.** Something received → `review` (`wallet_changed`); nothing received → expired at their deadline (`wallet_changed`), an exception to "expire on evidence". The alternative is all of them to review, which can be many unpaid tips. Recommended: the split.
- **D3. The pool check's actions:** the sticky banner, quarantined free rows, and `not_your_wallet` review for open invoices. Plus the banner's exact wording.
- **D4. Keep the previous public key** for item 2's "previous wallet host still running" line, which changes the trust contract's wording; or drop that line. Recommended: keep it.
- **D5. The protocol version:** no bump (recommended) or v2 with a fallback.
- **D6. A new matrix row for the pool check**, or fold it into T03. Recommended: fold into T03 and R08.
- **D7. The second stagenet wallet** for live step 6: a new one Wyatt makes, holding its seed himself, or an existing one of his. Not the buyer wallet, which pays the test tip.

Wyatt's decisions (2026-11-01; his draft answers, reviewed with Claude against the code in the same session, then amended by him). The proposal above is written to match:
- **D1.** `wallet × 2³² + index`, split and joined by one helper that every reader uses, with a safe-integer assert (the list is under item 4). `parseSyncBody` bounds address and snapshot indexes to 1..2³²−1.
- **D2.** The split, for release 1. For release 2 (pass 2): a "paid to a previous wallet" path for orders.
- **D3.** Accepted, with these additions:
  - only the current wallet's rows;
  - digests, not addresses (also for item 3's probes);
  - the 24-hour window, any status, with `addedAt`;
  - the rotation by the clock, every 30 s;
  - free rows capped at `POOL_TARGET`;
  - the 45 s wait before hand-out;
  - quarantine as status `bad`, never deleted and out of `poolTop`;
  - every invoice on a bad row to `not_your_wallet` review, closed ones included;
  - Health's last "ok" ("never" without the check);
  - display text for the new review reasons;
  - the banner's wording, with "on a machine you trust".
- **D4.** Keep the previous key, with the three-case wording under item 2, and the write limit.
- **D5.** No bump.
- **D6.** Fold into T03 and R08.
- **D7.** A new Feather stagenet wallet Wyatt makes and holds the seed for, with its restore height set by hand to the current height.
- **Item 3 (Wyatt):**
  - Until the answer: no addresses, an empty watch list, no snapshots applied; the restore height across all wallets.
  - No fallback for a bridge that never answers.
- **Open check (Wyatt):**
  - Rows vanish only on uninstall with "delete data".
  - Re-offer only on a match; a no-match start above max(created, `receivedTop`); the baseline from `receivedTop`; probes kept in `state:wallets`.
  - The reuse on a "no match" for a wallet with history (both sides rebuilt, or a reused wallet) is a known limit for release 1, on pass 2's list. Corrected 2026-11-01: a restored wallet stops at the first 200-address gap, so already-paid addresses can be handed out again and `receivedTop` can be far too low (item 4's known limit).
- **Live check (Wyatt):**
  - Step 6 opens a fresh unpaid tip, since `inv_e266ef9e2e436bd0` expired at 01:22 UTC.
  - Step 7 expects 357 first.

Wyatt's review of the bridge plan (2026-11-01), built the same day:
1. **Numbering cues come only from rows the site has handed out.**
   - Why: `poolTop` counts free rows, which a key thief can add. One forged free row 99,999 above the wallet's highest would have made the honest bridge create ~100,000 subaddresses, repeatably. And holding a report back during a catch-up would have let a forged row outlast the 45 s wait.
   - **The plugin** sends `claimedTop`: the current wallet's highest claimed row, in its own numbering. Free, `bad` and `dropped` rows don't count, and it's 0 while the site waits for the probe answer.
   - **The bridge:** `claimedTop`, never `poolTop`, drives the catch-up, the "behind" check and the re-offer floor. It catches up no further than `claimedTop + 50` (POOL_TARGET), which replaces the 100,000 gap first planned as RT-27's bound. A check-list index the wallet doesn't hold above that limit is bad at once, with nothing created.
   - **A mismatch is reported as soon as it's found,** even mid catch-up. Only "ok" waits for a catch-up to finish.
   - **The re-offer floor** is the `claimedTop` of the first response after the answer, not the 0 sent while waiting.
2. **Probes are always index 1.**
   - **The bridge** sends the digest of its own index-1 address (`probeDigest`) with its answer, and with every sync until one carrying it succeeds (not one attempt). The site keeps the first as the wallet's probe. Wallet 0 on an existing site uses its row at index 1, read at pairing before the drop.
   - **To answer a probe,** the bridge creates at most index 1. A probe at any other index is a malformed response.
   - Why: a wallet's first-seen row is index 1 only for a fresh wallet. A reused wallet might first appear at 301, and a later switch to a fresh wallet would create 301 subaddresses to answer, starting it past its wallet app's lookahead. "Create up to it" also had no bound.
   - **Found while building:** a site with claimed rows but no row 1 (so no probe for wallet 0) still waits, with `probes: []`, and the bridge's "no match" starts a new wallet: the safe start.
3. **A digest test value:** `contract/test-vectors/address-digest.json` (made by `make-address-digest.mjs` with `node:crypto`), checked by the plugin's, the bridge's and the scripts' tests.
4. **RT-27 folded in:** the bound above, plus `poolTarget` counting for at most 50.

Also found while building the bridge:
- **A response that says the site is waiting** took no addresses, so the bridge keeps the addresses it carried pending, rather than dropping them as delivered.
- **The bridge sends `probeDigest` only once its wallet has index 1.** It creates index 1 only to answer a probe; a fresh wallet's first top-up creates it, and the next sync carries the digest.

## 47. A chain height a remote node can't inflate, and payments older than the invoice don't count (RT-26, RT-31)  (status: accepted, 2026-11-02, with Wyatt's decisions below; the proposal text includes them; built 2026-11-02 on `redteam-1`, see "Built"; live check at the combined session)
Found in: 07b pass 1. RT-26 came from round 2's white box (Step 3); RT-31 from the fix sessions, in 46's live step 6.

Spec says:
- **Invoice lifecycle:**
  - Only counted transfers move an invoice: `unlockTime` "0" and not `doubleSpendSeen`.
  - A transfer is on time if it's mined at or below `expiresHeight` (spec change 5).
  - Expire on evidence.
- **P02:** a fresh subaddress per invoice.
- **Spec change 16:** the site keeps the highest height it has been sent.
- **Spec change 17:** a re-pair's suggested restore height is the lowest watched `createdHeight` minus `RESTORE_MARGIN_BLOCKS` (720).
- **Spec change 13:** with a remote node, the bridge cross-checks payment blocks against a second node from a built-in list. With the shop's own node, it doesn't.

Evidence:
- **RT-26** (`docs/redteam-findings.md`):
  - The bridge reports wallet-rpc's `get_height` unchecked.
  - wallet-rpc's height is the length of the chain its node served, and `wallet2` appends blocks without checking proof of work. So a dishonest remote node can raise the reported height at will.
  - The site keeps it for good (`handle.ts:312`, `Math.max`), so every later invoice gets a future `createdHeight` and `expiresHeight`.
  - A re-pair's suggested restore height can then be in the future. The installer uses it as given (`install.go:342–343`).
  - Test: Go `[T14][R09] [RT-26]`, skipped while open.
- **RT-31:**
  - `counted` (`plugin/src/core/invoice.ts:182`) never looks at a transfer's height.
  - Live: tip `createdHeight` 2,242,155 settled on three transfers mined at 2,230,085 to 2,240,100, before the tip existed.
- **Why the two go together:** `createdHeight` is the site's stored height at checkout (`checkout.ts:49`), the value RT-26 inflates. A floor taken from an inflated height would ignore honest payments to new invoices: a remote denial of sales, with the money still in the shop's wallet.
- **RT-30's fix (2026-11-02) closes the path seen live,** an honest admin switching to a used wallet, but not every path to an address that has received before:
  - payments past a restored wallet's 200-address gap (46's known limit);
  - a wallet used by another site or app at the same indexes;
  - old payments a later catch-up rescan finds.

  The floor is the backstop for these.

Constraints the design must keep:
1. **An honest payment is mined at or above `createdHeight`.**
   - `createdHeight` is the last height the wallet reported, which trails the real chain: a sync every 12–15 s, and checkout refuses while the host is silent or its node is syncing.
   - So a payment made after checkout is mined at or above it.
   - The only exception is a reorg whose fork point lies below `createdHeight`. A reorg deeper than the invoice's `required` confirmations (at most 10, the Strict preset) already breaks fulfilment, whatever the floor.
2. **Honest heights can rise fast:**
   - a fresh restore climbing from its restore height;
   - a bridge back after hours of silence;
   - a wallet that was behind catching up.
3. **A stored height that lags the real one is harmful too.** `expiresHeight` comes from it, and `onTime` (`invoice.ts:189`) judges a payment late when it's mined above `expiresHeight`. So a cap that makes the site's height trail the chain would send honest payments to review as late, spec change 20 item 5's problem again.
4. **The trust contract stays frozen:** the plugin calls no node. Any check against a second node is the bridge's.

Proposal: three parts. Each choice is in the decisions below, with my recommendation.
1. **RT-26: a height a single node can't inflate.**
   - **The bridge, with a remote node:** before reporting, it compares the wallet's height with the cross-check's second node (`pickSecond` already reads a synchronized second node's height, `crosscheck.go:204–212`).
     - A wallet height more than a few blocks above the second node's isn't reported as is: the bridge sends the second node's height instead.
     - The node check turns "mismatch" with a plain detail, so Health says to use the shop's own node or one the admin trusts.
     - If no second node answers, the bridge keeps the last height it reported, and the node check says "unavailable".
   - **With the shop's own node:** unchanged. It's trusted, as in spec change 13.
   - **The plugin:** no rise limit (D1). It would guard only against a stolen key or a bridge bug, and with D4's reset it could pin the site's height far below the chain.
   - **Tolerance and persistence (D2):**
     - "A few blocks" is 10, which must stay below D5's margin.
     - **The clamp is immediate:** it applies from the first sync where the wallet is more than 10 blocks ahead of the second node (Wyatt, 2026-11-02).
     - **Only Health's "mismatch" waits:** the node check turns "mismatch" after the disagreement has lasted 5 minutes, so a briefly lagging public node doesn't make Health flap.
2. **The restore height:**
   - The installer never takes a suggested restore height above its node's height (or a second node's, with a remote node). Above it, it uses the node's height minus spec change 17's margin, and says so in one line.
   - The plugin never suggests a restore height above its own stored height.
3. **RT-31's floor:**
   - **The rule:** a confirmed transfer (`height > 0`) mined below `createdHeight − margin` doesn't count toward that invoice. An unconfirmed one counts as today, until it's mined.
   - **The formula (D4):** the floor is `min(createdHeight, the site's current height) − 30`. So an open invoice created under an inflated height heals when a pairing heals the site's height.
   - **Where:** applied to an invoice's sums and settlement only.
     - **Not to the paid-top** behind the gap warning (D6): the wallet app sees old payments too.
     - `counted` itself stays as it is, since it describes money, not invoices.
   - **The ignored transfer is kept on the invoice,** marked, so the record is complete. The admin page shows it in one line, with the amount (D6).
4. **Healing at a pairing (D4):**
   - **What a pairing sets:** the site's stored height becomes the pairing request's height, but only if that's the node's bounded height. It's never set from a wallet still scanning. Between pairings, `Math.max` stays.
   - **Today's pairing height:** `install.go:84–88` and `pairstatus.go:74–79` send the node's `get_info` height. That reading isn't checked for being synchronized or against a second node, and it's 0 when the node doesn't answer.
   - **So the build has to:**
     - bound that reading as in part 1;
     - send it only from a synchronized, online node;
     - leave the site's height unchanged when the request carries none (0) or an unbounded one.

### Decisions for Wyatt
- **D1. Where the height is bounded (RT-26).**
  - **(a)** The bridge, against the second node, with a remote node only.
  - **(b)** The plugin, by elapsed time.
  - **(c)** Both.
  - Recommended: **(c), with (a) carrying the defence and (b) only as a loose backstop.** For example, at most twice the time-implied block count plus 30 blocks since the last stored height, and never below the reported height on a first sync. (b) alone has no baseline on a first pairing, and if it were tight it would break constraints 2 and 3.
- **D2. What the bridge does when its wallet runs ahead of the second node:**
  - send the second node's height;
  - send its last reported height;
  - or send no height until they agree.
  - Recommended: **the second node's height**, with the node check "mismatch". The site's height stays current, and the admin is told.
- **D3. The restore-height clamp (part 2).** Recommended: **yes, both sides.**
- **D4. Healing a site already holding an inflated height:**
  - **(a)** A pairing resets the stored height to the new bridge's first (bounded) report. Today's `Math.max` stays between pairings.
  - **(b)** Leave it as it is.
  - Recommended: **(a).** It matches spec change 45's "a pairing starts afresh". The only thing lowered is the base for new invoices; open invoices keep their own heights.
- **D5. The floor's margin (RT-31).**
  - **10 blocks:** equal to the deepest `required` preset (Strict). Any reorg deeper than that already breaks fulfilment.
  - **30 blocks (about an hour):** recommended, three times the deepest preset. It still refuses anything older than about an hour, which would have refused all three of step 6's transfers (the newest was 2,055 blocks old).
  - **720 blocks (a day, spec change 17's margin):** a day-old payment to a reused address would still count.
- **D6. Showing ignored old transfers:**
  - **(a)** One line on the invoice in the admin page: "An older payment to this address was ignored: it was mined before this invoice." This is a wording addition to an existing page; no new page or widget.
  - **(b)** Not shown: the ignored transfer stays on the invoice record only. The floor runs in the plugin, so the bridge doesn't know.
  - Never to the buyer: the status route and pay page are unchanged.
  - Recommended: **(a).**
- **D7. Order and tests (Wyatt's option A: both in release 1).** RT-26's bound lands first or in the same build as the floor.
  - **Tests first:**
    - unskip `[T14][R09] [RT-26]`;
    - plugin: the floor at the margin's edge, an unconfirmed transfer counted, the RT-31 live shape as a test, and an inflated `createdHeight` with RT-26's bound in place;
    - installer: the clamp;
    - live: step 6's rerun covers the floor too.

Wyatt's decisions (2026-11-02):
- **D1: (a) only, the bridge against the second node. No plugin rise limit.**
  - A rise limit only guards against a stolen key or a bridge bug, and with D4's reset it could pin the site's height far below the chain.
  - A just-created wallet reports about 579,994 and climbs while it scans. A rise limit would take months to recover, sending every order's payment to review as late (constraint 3).
- **D2: the second node's height, with a tolerance of 10 blocks.** It must stay below D5's margin.
  - "Mismatch" only if the disagreement lasts a few minutes, so a briefly lagging public node doesn't make Health flap.
  - **Release-2 note (pass 2):** while the height is held because no second node answers, product checkout refuses, as when the node is syncing.
  - **The span (Wyatt, later the same day):** 5 minutes, for Health's "mismatch" only. The clamp itself applies from the first sync more than 10 blocks ahead.
- **D3: yes, both sides.**
- **D4: (a), a pairing resets the site's height**, but only to the pairing request's height, and only if that's the node's bounded height, never a wallet still scanning.
  - Also: the floor uses `min(createdHeight, the site's current height) − margin`, so open invoices created under an inflated height heal with the site.
- **D5: 30 blocks.**
- **D6: (a), with the amount in the line.** The floor applies to an invoice's sums and settlement, not to the paid-top the gap warning uses: the wallet app sees old payments too.
- **D7: as drafted, plus these tests:**
  - a re-pair with a wallet still scanning doesn't lower the site's height;
  - a payment at the edge of D2's tolerance and D5's margin still counts;
  - an open invoice created under an inflated height counts honest payments once a pairing has healed the height.

Effect on the admin budget:
- No new setting, prompt or upkeep.
- One installer line, only when it clamps.
- Health lines only when a node disagrees for a few minutes.

Effect on the trust contract:
- **None** to capabilities, hosts, routes, collections or indexes.
- **The plugin:** a mark on an ignored transfer inside an invoice row (no new index).
- **The bridge:** already reads the second node's `get_info`.

**Built (2026-11-02, tests first; Wyatt's answers to the build plan: (a) for settled invoices, fail closed with no second node, the pairing height bounded both ways):**
- **`4615ceb`, the bridge:**
  - The height bound: the second node's height beyond 10 blocks, from the first sync, and "mismatch" after 5 minutes. With no second node, height 0 and "unavailable".
  - Spec change 13 amended: with no second node, or a block that can't be fetched, mined transfers are held at 0.
  - `BoundedHeight` for both pairing paths.
- **`889d652`, the installer:** a suggestion above the bounded height becomes that height − 720, with one line. With nothing suggested, the wallet starts at the bounded height.
- **`300fa80`, the plugin:**
  - **The floor** (`FLOOR_MARGIN_BLOCKS` 30), through `totals(inv, siteHeight)`.
  - **D6's line:** derived when shown, so settled invoices from before the floor show it too.
  - **The reset at a pairing,** and the restore suggestion from the healed height.
  - **Checkout at height 0:** refused, tips included when the host has reported without a height. A site that never synced still answers `NO_ADDRESS_AVAILABLE`.
- **Found while building:**
  - **Part 4:** both pairing paths sent the node's raw `get_info` height, and the bounded height now replaces it. The pair command's test was red on 94,954 from a node still catching up.
  - **The installer's no-suggestion path** also took the node's raw height, so a dishonest remote node could start a new wallet in the future. It now takes the bounded height.
  - **Visitor tips** never used checkout's height rule (spec change 33 takes them whatever the host's state). Height 0 is now their one exception.
- **Live check, at the combined session** (one dev release with RT-20):
  - step 6's rerun, with the old tip `inv_f7ea94de1471f114` as the live view of D6's line, and a fresh tip that shows nothing received until Wyatt pays;
  - the installer's clamp.

