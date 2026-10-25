# Coffer — Security Traceability Matrix

As of 2026-10-25 · Wyatt Dilley

## How to use this matrix

Every security claim Coffer makes gets an ID, a pass condition and at least one tagged test. A claim with no passing test stays out of the public report, or goes in as a stated limit.

**Audit of 2026-10-25.** Every row was checked against the repo at `37b046b` (main) by reading the test names and the code they cover. Of 49 T, P, R and F rows: 31 Covered, 16 Partial, 1 Planned and 1 Gap; 5 candidates await a decision. Eleven rows are new since Oct 6 (T17–T21, T23–T25, R12–R13, F07), and C01 became T22. The "Tests found" column names them by test file (without `.test.ts`) and test name, Go tests by function.

**Tagged on 2026-10-25** (the tagging session, at `eb63872`). Every test in a "Tests found" column carries its row's tag, and so do other tests found to cover a row. The column names the main tests; `grep -rn '\[T05\]' plugin/tests theme/tests bridge` lists them all. The session corrected T01, T02, T03, T04, T10, T15, T20 and R09 (T03 is now Covered), so the count is 32 Covered, 15 Partial, 1 Planned and 1 Gap. The same day Wyatt accepted spec change 43's suggested decisions: C02, C03, C04 and C06 became T26–T29, and C05 is deferred to release 1.x. With those rows the count is 33 Covered, 17 Partial, 2 Planned and 1 Gap, across 53 rows.

**ID prefixes**

| Prefix | Covers | Source |
| --- | --- | --- |
| T | Threats | The spec's security model table, plus threats from spec changes since |
| P | Privacy claims | The spec's Privacy list |
| R | Resilience: what happens when a part fails | The phase 03 stagenet end-to-end plan, plus later spec changes |
| F | Hostile input | The parsers and public routes |
| C | Candidates not in the spec | Need a spec-change decision before any test |

**Pass scope.** Each row says which adversarial pass covers it: **1** (phase 07b, tips, before release 1), **2** (phase 08b, orders, before release 2) or **1+2**.

**Tagging tests.** Put the ID in square brackets at the start of the test name, for example `it("[T04] ignores a sync older than 300 s", …)` in vitest or `t.Run("[T04] replay window", …)` in Go. A Go test function's name can't hold brackets, so its body goes inside one tagged `t.Run`; the top-level name stays, so `-run TestName` still works. A test can carry several IDs, each in its own brackets: `[T03][F01]`. Only tests that cover a row carry an ID; layout and wording tests need none. A new test of security behavior with no row gets its row here first (Wyatt, 2026-10-25). Stagenet scripts print one `[T11] PASS` or `[T11] FAIL` line per check, so CI logs and `docs/progress.md` can be searched the same way.

**Test layers**

| Layer | Means |
| --- | --- |
| Host | `createPluginTestHost()`: route logic, storage, capability enforcement |
| Runtime | `createPluginRuntimeTestHost()`: activation, scheduled tasks, signed raw-body requests |
| Theme | The `@cofferhq/astro` package's vitest suite: pay page, tip endpoint, TipButton, QR |
| Go | Bridge unit and integration tests |
| E2E | Stagenet end to end on the dev site |
| Install | The installer on a clean container |
| Manual | A check a person runs and records, such as `ss -tlnp` |
| CI | A static check in the pipeline |

**Coverage states**

| State | Meaning |
| --- | --- |
| Covered | Every pass condition has a passing test in CI or a recorded stagenet run |
| Partial | Some pass conditions are tested; the note says which aren't |
| Planned | The test is in a phase file but not written yet |
| Gap | No test exists or is planned |
| Doc only | Can't be tested; the report states it as a design limit |

**Evidence each result carries:** commit hash, test layer, runner (Node workerd or Cloudflare Worker Loader), network (stagenet or mainnet), and the CI run ID or the dated `docs/progress.md` entry.

## Threats (T)

16 threats come from the spec's security model, 9 from spec changes since, and 4 from the candidates (spec change 43). 17 are Covered, 10 Partial and 1 Planned (T28); T18 is the one Gap.

| ID | Threat | Must hold (pass conditions) | Layer | Pass | Coverage | Tests found (37b046b; corrected at eb63872) |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | Malicious or compromised plugin update | Manifest declares only `content:read` and `network:request` and only the two price hosts; a request to any other host fails; undeclared storage access throws; CI fails if capabilities, hosts or public routes change without a matching spec entry; releases publish only through EmDash automated releases with provenance required and a passkey approval per release (spec change 41); `release.requires` refuses EmDash and Astro outside the tested range | Host, CI, Manual | 1+2 | Partial: other-host and undeclared-storage refusals untested; provenance comes in phase 09 | manifest: "the built manifest matches the spec's trust contract exactly", "the source manifest declares the supported EmDash and Astro versions" (`release.requires`, added in `4db9a53`); CI `emdash-plugin validate` |
| T02 | Database leak | After a full payment, storage, KV and settings hold no private key, view key, wallet-rpc login or plaintext pairing code; invoice tokens are 128-bit from a cryptographic RNG; contact data purge per P04 | Host, Runtime | 1+2 | Partial: the pairing code hash is tested; the token's shape is tested (22 base64url characters, 128 bits) but its random source is in code only (`newIds`, 16 bytes from `crypto.getRandomValues`); the 07b data-at-rest scanner checks the rest | admin-route: "Connect wallet host … storing only its hash"; checkout-route: "creates an invoice from the product's price and the Kraken rate" (the token's shape) |
| T03 | Forged payment events | A sync with no signature, a bad signature, or a valid signature from an unpaired key changes nothing and is refused; the signature is checked on raw bytes before decoding; after re-pairing, the old key's syncs are refused. Stolen key: free goods, not lost funds (design limit) | Host, Runtime, E2E | 1+2 | Covered: "a new pairing replaces the old key" checks the old key's next sync gets `BAD_SIGNATURE` | handle: "forged, tampered, stale and badly encoded requests change nothing", "rejects a body signed by a key other than the one it carries", "a new pairing replaces the old key"; sync-route: "forged requests change nothing"; Go `TestSharedVectors` |
| T04 | Replay of an old sync | A sync outside the 300 s window, past or future, is ignored; a snapshot with `seq` at or below the last accepted is ignored; the same signed body sent twice applies once; boundaries at 300 s (accepted) and 301 s (refused), both ways | Host, Runtime | 1+2 | Covered | protocol: "accepts both headers within 300 seconds either way", "rejects stale and future timestamps"; handle: "a replayed snapshot (seq not newer) is ignored, even re-signed with a fresh timestamp; retries are idempotent" |
| T05 | Address-pool exhaustion by spam checkouts | Checkouts past the open-invoice cap are refused with no pool claim; per-IP limits apply only when `requestMeta.ip` is set; an empty pool refuses checkout cleanly and never reuses an address; no two invoices share a subaddress; the bridge refills to the pool target | Host, E2E | 1+2 | Covered | checkout: "site-wide cap: TOO_MANY_OPEN at the cap", "per-client cap only when the IP is known", "NO_ADDRESS_AVAILABLE when the pool is empty"; claim: "an address already on an invoice is refused"; tip-checkout: "the same spam cap as products"; handle: "tops up the pool with new indexes only" |
| T06 | Price manipulation | Checkout ignores any amount, rate or currency the client sends; price comes from the product entry or the tip form's amount; the rate is locked at checkout; a malformed, zero, extreme or failed price response refuses checkout (a fiat tip falls back to an open tip); store orders checked by the store (08) | Host | 1+2 | Covered for release 1; store orders in pass 2 | checkout: "ignores a client-sent price", "RATE_UNAVAILABLE when neither source answers sensibly"; tip-checkout: "unknown fields are ignored, never trusted", "converted at the locked rate (ceiling)", "no price from either service: the fiat tip becomes an open tip" |
| T07 | Fulfillment before funds are final | Zero confirmations never settle; each value tier settles only at its preset; `required` is locked at checkout and a later settings change doesn't lower it; tips use the lowest tier; the test tip needs 1, never 0 | Host, E2E | 1+2 | Covered | scenarios: "pay in full: … settled at the required depth, never before", "speed changed mid-invoice: the target stays locked"; presets: "refuses lowering, equal, above 10, and closed invoices"; admin-setup: "the test tip needs 1 confirmation whatever the speed; still never 0" |
| T08 | Injection through buyer fields | Tip note, email and refund address are schema-checked with length limits; HTML, script, control and bidi characters are stored as plain text and render escaped in Block Kit | Host, Manual | 1+2 | Partial: the tip note is covered (pass 1); email and refund address escaping in pass 2; the manual admin-page injection check is in 07b | tip-checkout: "a note: control and format characters out, whitespace collapsed, at most 140 characters"; admin-tips: "each note as literal text, whatever it contains" |
| T09 | Token leakage through the pay page | Pay page and `status` carry `noindex`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`; a CSP with hashes for the inline script and style; no third-party assets; the QR renders locally; the token appears once, in a same-origin status URL; the page fails closed without its headers | Theme, Host | 1+2 | Covered | paypage: "the privacy headers and meta, with a CSP whose hashes match", "nothing from anywhere else", "the token appears once", "fails closed without preparePayPage"; qr: "… nothing external"; checkout-route: "private and uncached" |
| T10 | Wallet host exposure | wallet-rpc listens only on 127.0.0.1 and refuses requests without its login; the bridge opens no listening port; config and key files are unreadable by others; outbound connections go only to the site, the node(s) and the release and download hosts | Go, Install, Manual | 1 | Partial: the listening-port and outbound checks are Manual and not yet recorded | Go `TestStartsAndBecomesReady` (wallet-rpc gets `--rpc-bind-ip 127.0.0.1`), `TestRestartsAfterCrashWithNewLogin`, `TestCredential`, `TestLoadRefusesReadableByOthers`, `TestWrongPassword` |
| T11 | Time-locked or double-spent payment | A transfer with non-zero `unlock_time` or the double-spend flag never moves an invoice toward settled and shows as not counted; the `locked` flag is never used; `amount` and `unlock_time` parse as uint64 up to 2^64−1 | Host, Go | 1+2 | Covered | scenarios: "time-locked funds are not counted (unlock_time, never `locked`)", "double-spend-flagged funds are not counted"; protocol: "amounts and unlock times up to 20 digits stay strings"; Go `TestGetTransfersRefusesBadValues` |
| T12 | Reorg or double-spend after settlement | Settled invoices stay watched to 10 confirmations; a re-mined payment re-confirms with no review; a vanished payment goes to review with an alert at once; fulfillment is never reversed automatically | Host, Go | 1+2 | Covered at host level; no live reorg (regtest skipped) | scenarios: "reorg after settling: stays settled, re-confirming, no alert", "not mined again within 5 blocks after a reorg: review (reorg)", "payment reversed: review (reversed) with an alert at once"; scenarios: "… settled ones until 10 deep" |
| T13 | Pairing code stolen or guessed | Code is 128-bit and shown only to `plugins:manage`; storage holds only its hash; a second use fails; use after 15 minutes fails; a new code cancels the old; a new pairing replaces the old key and shows on the admin page | Host, Runtime, E2E | 1+2 | Covered | handle: "a used code can't pair a second bridge", "an expired code is not active"; admin-route: "a new code cancels the old one at once", "storing only its hash"; admin-setup: "one that replaced a key says so"; Go `TestFailedPairingKeepsTheOldKey` |
| T14 | Dishonest remote node | When a second node reports a different block hash at a payment height, the bridge withholds confirmations; the admin sees a red line; large orders use Strict | Go, Host | 1+2 | Covered; Strict for large orders in pass 2 | Go `TestFabricatedBlock`, `TestTransactionNotInBlock`, `TestNeverItsOwnSecondNode`, `TestSameHostIsNotASecondNode`; admin-health: "the remote-node cross-check: mismatch red" |
| T15 | Full break-in on the site's server | The attack itself is a design limit. Testable parts: the installer stops on the site's own machine before asking for keys; the dev same-machine flag is stagenet only; no spend or view key reaches the site; expired unpaid invoices show on the admin page. Spec change 37 (release 1.x) will add an opt-in same-server install | Install, Host | 1 | Partial: "no view key reaches the site" waits on the 07b scanner (P01) | Go `TestSameMachine` (the dev flag refused on mainnet), `TestLoopbackSite`, `TestSameMachineSignals`, `TestSameMachineConfigFile`, `TestSameMachineSiteAddress`, `TestInstallRefusesEarly`, config `TestValidate`; admin-health: "a run of unpaid expired checkouts: amber …" |
| T16 | Tampered installer or downloads | A bridge build or update with a bad signature is refused and the running version stays; a `monero-wallet-rpc` not matching the GPG-signed hash list is refused; a hash list with a bad GPG signature is refused; plain http is refused; manual install reaches the same state | Install, Go | 1+2 | Covered; manual-install parity checked in phase 09 | Go `TestTamperedRealFile`, `TestBadTestFiles`, `TestPinnedKeyMatchesPublishedKey`, `TestBridgeRefuses`, `TestFailedInstallKeepsPrevious`, `TestPlainHTTPRefused`, `TestInstallShRefuses` |
| T17 | Cross-site tip post (new) | A POST to the tip endpoint from another site's page is refused before checkout, as EmDash refuses a cross-site Origin on the route itself | Theme | 1 | Covered | tip: "a post from another site is refused before checkout" |
| T18 | Client-IP header spoofing (new) | A visitor who sends `X-Forwarded-For`, `CF-Connecting-IP` or similar can neither dodge nor poison the per-client cap; the tip endpoint forwards the visitor's headers except cookies, credentials and Origin, so this needs an attack | Host, Theme | 1 | Gap: on the 07b attack list | tip: "passes the visitor's own request headers on, except cookies, credentials and Origin" (shows the exposure, not the defence) |
| T19 | Unsupported platform (new, spec change 35) | On Cloudflare Workers, pairing and checkout answer `UNSUPPORTED_PLATFORM` before any storage read or write, and the admin page says so; a Node site behind Cloudflare's proxy is not refused | Host | 1 | Covered | platform: "bridge/sync answers UNSUPPORTED_PLATFORM before reading or writing anything", "nor with the CF-* headers a Node site behind Cloudflare's proxy … receives" |
| T20 | Wrong-network addresses (new, spec change 36) | Pool addresses whose network can't be read are dropped at sync; each invoice stores its network; the fallback tip address must match the site's network; a mainnet address in a stagenet site's pool, or the reverse, is refused | Host, Theme | 1 | Partial: the mixed-network pool isn't refused yet (recorded in 7e for 07b) | protocol: "skips a pool address whose network can't be read"; address: the four `subaddressNetwork` tests; claim: "a row whose network can't be read … is claimed with no invoice and skipped"; coin: "newInvoice stores asset, chain and the network"; theme address: "another network's address is refused"; tip: "an address for another network: logged once at start …" |
| T21 | An order path reachable in release 1 (new, spec change 22) | With the release-1 switch off, no product checkout, order page or invoice list is reachable | Host, CI | 1 | Partial: 07b must prove no route reaches orders | release1: "the committed value is off for release 1", "the admin page has All invoices only with the switch on"; CI runs both builds |
| T22 | Open redirect through the way back (was C01; spec change 39) | The pay page's way back accepts only same-origin paths and queries; refuses other sites, schemes, backslashes, the pay pages and the admin, also through dot segments and percent-encoding; refuses over 512 characters and control characters | Theme | 1 | Covered | back: all five safeReturn tests; paypage: "a way back in every state" |
| T23 | Coffer's code on the site's own pages (new, spec change 36 R4/R5) | TipButton renders no script and only scoped `coffer-tip` styles; CSP and privacy headers are set only on Coffer's own responses; no middleware | Theme | 1 | Partial: headers-only-on-Coffer's-responses was checked by reading, not by a test | tipbutton: "leaves the rest of the site alone (spec change 36, R5)" |
| T24 | Tampered vendored code (new) | The vendored qrcodegen matches its recorded SHA-256 and upstream commit; every QR decodes, through the independent `zbarimg`, to the exact `monero:` URI | Theme, CI | 1+2 | Covered | vendor: "matches the hash recorded in SOURCE.md", "is upstream's file once the three recorded edits are undone"; qr-decode (CI requires zbar) |
| T25 | Install command pointed at the wrong site (new, spec changes 23 and 42) | The install command uses the saved https site address, never the request's host; a loopback, plain-http or missing address falls back to an https browser origin; with no usable address there's no command and no code | Host | 1 | Covered; spec change 42 (EmDash 1.2+ site URL) still to decide | admin-site: all `walletHostSite` tests and "the admin page with EmDash's saved address on localhost" |
| T26 | Downgrade to an older signed bridge (was C02; spec change 43) | Self-update never installs a bridge version lower than or equal to the running one, even when the release is validly signed | Go | 1+2 | Covered for the bridge; the `monero-wallet-rpc` update path's downgrade case isn't checked | Go `TestBridgeNothingToDo` ("older version": a signed 0.0.9 offered to 0.1.0 is not downloaded), `TestNewer` |
| T27 | Bridge TLS checks (was C03; spec change 43) | The bridge refuses an untrusted or self-signed certificate from the site and from the release and download hosts; no build can skip the check; plain http is refused for downloads | Go | 1+2 | Partial: plain http is tested; the certificate refusal test is planned (07b): the sync client and the downloader each against an `httptest` TLS server whose certificate isn't trusted | Go `TestPlainHTTPRefused`; no `InsecureSkipVerify` in the bridge (outside `bridge/oracle/`) |
| T28 | Dependency drift (was C04; spec change 43) | CI runs `govulncheck` on the bridge and `pnpm audit` on the plugin, and fails when a dependency is added outside the tiers; lockfiles are frozen; the 7-day release-age rule stays on | CI | 1+2 | Planned: `govulncheck` needs the dependency ask; `pnpm audit`'s scope and level are still to set | CI installs with `--frozen-lockfile`; strict 7-day release age in each `pnpm-workspace.yaml` |
| T29 | Secrets in logs and shell history (was C06; spec change 43) | Bridge logs, the systemd journal and saved install transcripts never hold the view key, the wallet-rpc login or the pairing code; a pairing code left in shell history is limited by single use and the 15-minute expiry (T13), and the report says so | Go, Manual | 1 | Partial: the journal and transcript scan is in 07b | Go `TestNeverPrinted`, `TestWalletErrorsDontLeakSecrets`, `TestInstallLog` (the install log holds no answer or code) |

## Privacy claims (P)

Two privacy claims are Covered and two wait on the 07b data-at-rest scanner, which reads everything Coffer stores after a full run.

| ID | Claim | Must hold (pass conditions) | Layer | Pass | Coverage | Tests found (37b046b; corrected at eb63872) |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | The site never holds the view key | After setup and a full payment, no view key appears in plugin storage, KV, settings, logs or the site's database | Host, E2E | 1+2 | Planned: the 07b data-at-rest scanner | None yet; the sync protocol has no field for a key |
| P02 | A fresh subaddress per invoice | Every invoice gets an address no other invoice has used; a duplicate insert fails on the unique `subaddress` index | Host | 1+2 | Covered | manifest: trust contract includes the unique index; claim: "an address already on an invoice is refused; the row stays claimed" |
| P03 | No IP addresses stored | With `requestMeta.ip` set, storage and KV hold only salted, hashed buckets, which expire after 30 minutes; no raw IP in logs | Host, Runtime | 1+2 | Partial: hashing is in code (`clientBucket`); "no raw IP stored" waits on the scanner | checkout: "per-client cap only when the IP is known"; admin-health: "spam limits: an information line" |
| P04 | Buyer data purged 30 days after an invoice is final | Email, note and refund address are gone 30 days after the invoice is settled, expired or decided; the purge runs from `bridge/sync` and from the backup cron; a purged tip still counts | Runtime | 1+2 | Covered | sync-route: "each sync purges buyer data from invoices final for 30 days, and only those", "the backup cron … purges too"; admin-tips: "notes are gone after the 30-day purge, and the tip still counts" |

The Oct 5 open question for P04 is answered by the code: the 30 days run from when the invoice became final.

## Resilience (R)

Every scenario has a host or Go test. R06–R09 still need their 3h stagenet evidence attached from `docs/progress.md`, and R05 and R10 have no live run yet.

| ID | Scenario | Must hold (pass conditions) | Layer | Pass | Coverage | Tests found (37b046b; corrected at eb63872) |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Normal payment | Checkout, payment, confirmation and settlement complete with the expected amount and confirmations | Host, E2E | 1+2 | Covered: live in 3h, run A attempt 3, 6c (p6) and 7c tips | handle: "from pairing to a settled invoice"; sync-route: "settles an invoice from signed snapshots" |
| R02 | Expiry with no payment | The invoice expires at `expiresAt` and never settles; no expiry from the clock alone | Host, E2E | 1+2 | Covered: live in 7c (#276, #278) | scenarios: "no expiry from the clock alone: the backup cron only marks pendingExpiry" |
| R03 | Late payment | A payment mined by `expiresHeight` counts as on time however it was first reported; one mined later goes to review as `late` (products); tips are never late (spec change 33) | Host, E2E | 1+2 | Covered at host level; live late order in pass 2 | scenarios: "inclusive boundaries", "an unmined transfer becomes late only once it can't be mined by expiresHeight", "a tip paid after its window settles, never going to review as late" |
| R04 | Underpayment and two-part payment | A short payment doesn't settle and goes to review as `underpaid`; two transfers that reach the amount in time settle; a short tip above the floor settles at the floor | Host, E2E | 1+2 | Partial: host covered; 3h's live two-part run ran out of time | scenarios: "pay in two parts", "underpay and leave", "exactly 99.5% settles", "a set amount … paid short but above the floor settles at the floor" |
| R05 | Restart mid-payment | Restarting the site or the bridge between payment and settlement loses no payment and counts none twice | Host, Go, E2E | 1+2 | Partial: no recorded live restart | sync-route: "… and survives a restart"; Go `TestPendingSurvivesFailureAndRestart`, `TestReconcileOnStart` |
| R06 | Bridge outage across expiry | With the bridge stopped across an invoice's expiry, a payment mined in time still counts once the bridge returns | Host, E2E | 1+2 | Covered: ran in 3h; attach evidence | scenarios: "bridge outage across expiry: pendingExpiry instead of expiring, then settles on time" |
| R07 | wallet-rpc crash | When wallet-rpc is killed, the supervisor restarts it and no payment is missed | Go, E2E | 1+2 | Covered: ran in 3h; attach evidence | Go `TestRestartsAfterCrashWithNewLogin`, `TestNeverReadyIsRestarted`, `TestChildDiesWithTheBridge` |
| R08 | Lost bridge key | After deleting the bridge key, re-pairing restores syncing (see T03, T13) | Go, E2E | 1+2 | Covered: ran in 3h; attach evidence | Go `TestPair`, `TestFailedPairingKeepsTheOldKey` |
| R09 | Reinstall with a restore height | A reinstall finds past payments again and duplicates none | Install, Go, E2E | 1+2 | Covered: ran in 3h; attach evidence | Go installer `TestRestoreHeight` and `TestRestoreHeightKeptWallet`, syncclient `TestRestoreHeight`, `TestCatchUpAfterReinstall`, `TestCatchUpIsRedoneAfterAFailedRescan`; handle: "the pairing response suggests a restore height" |
| R10 | Reversed payment | A payment that disappears before settlement goes to review as `reversed` and never settles | Host | 1+2 | Covered at host level; no live run | scenarios: "payment reversed: review (reversed) with an alert at once" |
| R11 | Large backlog | With thousands of open and expired invoices, each sync finishes inside the Node runner's 30 s wall limit and the backlog drains over several syncs; scans read past 1,000 rows up to a 20,000-row safety cap | Host, Runtime, Go | 1+2 | Partial: the 30 s wall time isn't measured | store: "reads every page to the end, well past the old 1,000", "stops at the safety cap and says so"; Go `TestAtMost100AddressesPerSync`, `TestTooLargeSendsFewerSnapshots` |
| R12 | Wallet host silent or node syncing (new, spec change 20) | Tips stay open at the last sync's height; product checkout refuses with `WALLET_HOST_SILENT` or `WALLET_HOST_SYNCING` and claims nothing | Host | 1+2 | Covered | tip-checkout: "taken while the wallet host is silent or its node syncs"; checkout: "WALLET_HOST_SILENT …", "WALLET_HOST_SYNCING …" |
| R13 | The admin can see a failing part (new, spec change 29) | A silent wallet host turns red after 5 minutes with the fix named; a node catching up, a wallet behind its node, a failed cross-check and an empty pool each show their line; the widget names the worst problem first | Host | 1+2 | Covered | admin-health: "a silent wallet host: a red line that names the fix", "a node still catching up … red", "no payment addresses ready: red", "the widget names the worst problem first" |

## Hostile input (F)

Every public route and every parser that reads outside data should refuse bad input with no state change and no crash. Go's built-in `go test -fuzz` covers the bridge with no new dependency; on the plugin side, use a seeded random generator in the tests unless the dependency tiers allow a dev-only fuzz library. No fuzzing has run yet; 07b brings it.

| ID | Target | Must hold (pass conditions) | Layer | Pass | Coverage | Tests found (37b046b; corrected at eb63872) |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | `bridge/sync` body | Random bytes, invalid UTF-8, a BOM, a body over `maxBytes`, truncated JSON, a wrong protocol version, unknown fields, duplicate keys, and amounts that are negative, decimal, exponent or above 2^64−1 are all refused, with no state change | Host, Runtime | 1+2 | Partial: duplicate keys and random bytes aren't named; fuzzing in 07b | protocol: "refuses a leading BOM and invalid UTF-8", "rejects malformed bodies", "enforces the caps", "a malformed transfer rejects the whole body"; sync-route: "the host refuses a body over the declared 256 KiB" |
| F02 | `checkout` (products and tips) | Unknown fields, wrong types, very long strings, a missing or unpublished product, a product with no price, and zero or negative amounts are refused with no pool claim; tips below the dust floor still ask for the floor | Host | 1+2 | Covered | checkout: "PRODUCT_NOT_FOUND for unknown, draft, zero-priced, or over-precise products", "INVALID_REQUEST for anything but a well-formed product checkout"; tip-checkout: "INVALID_REQUEST for a malformed amount, entry or note; nothing claimed", "a tiny fiat amount still asks for at least the floor" |
| F03 | `status` | Empty, malformed, very long and unknown tokens get the same generic not-found reply, with no stack trace or internal ID | Host, Theme | 1+2 | Partial: very long tokens and "no stack trace" aren't named | checkout-route: "INVOICE_NOT_FOUND otherwise"; paypage: "a malformed token never reaches the plugin"; ispaid: "false for an unknown or malformed token" |
| F04 | `admin` route | Anonymous users, non-admin users and requests without `X-EmDash-Request` are refused; row actions on unknown invoices, or with out-of-range values, are refused | Host, Runtime | 1+2 | Partial: the user and header refusals are EmDash's and untested here | admin-invoices: "unknown invoices and malformed values: an error toast, nothing changes", "stale state … is refused"; admin-route: "an unknown action gets an error toast" |
| F05 | Bridge reading wallet-rpc and node replies | Malformed JSON, huge numbers and unexpected fields are logged and skipped; the bridge never reports a payment from a reply it couldn't parse | Go | 1+2 | Covered | Go `TestHTTPStatusAndBadBodies`, `TestResponseSizeCap`, `TestGetTransfersRefusesBadValues`, `TestBlockRefuses`, `TestGetInfoRefuses` |
| F06 | Host header and URLs | A spoofed `Host`, `X-Forwarded-Host` or `Origin` on any public route doesn't change a URL the plugin builds | Host, Runtime | 1+2 | Covered | admin-site: "F06: spoofed Origin, Host and X-Forwarded-Host change nothing on the public routes" |
| F07 | Tip endpoint form and TipButton props (new) | A malformed form gets an error page and checkout is never called; amounts become minor or atomic units, never floats; bad TipButton props are tidied, not passed on | Theme | 1 | Covered | tip: "a malformed form: an error page, and checkout is never called", "custom amounts: … never floats"; tipbutton: "bad props are tidied, not passed on" |

## Candidates not in the spec (C)

C01 has since been decided and built through spec change 39, so it moved to T22. Wyatt decided the other five on 2026-10-25 as suggested (spec change 43): C02, C03, C04 and C06 moved to T26–T29, and C05 is deferred to release 1.x and reported as a known limit.

| ID | Risk | Proposed rule | Found on Oct 25 | Suggested decision |
| --- | --- | --- | --- | --- |
| C01 | Open redirect through `returnUrl` | Accept only paths on the site's own origin | Built as spec change 39 with tests | Done: now T22 |
| C02 | Downgrade to an older signed bridge | Refuse any update with a lower version than the one installed | Self-update only installs a newer version (`Newer`, `TestNewer`); `TestBridgeNothingToDo`'s "older version" case already names the downgrade: a signed 0.0.9 offered to 0.1.0 is not downloaded | Done: now T26 |
| C03 | Bridge TLS checks | The bridge refuses invalid or self-signed certificates for the site and the release host; no user build can skip the check | Go's default verification; no `InsecureSkipVerify` in the bridge; plain http refused for downloads | Done: now T27 (the test is planned for 07b) |
| C04 | Dependency drift | CI runs `govulncheck` on the bridge and `pnpm audit` on the plugin, and fails when a dependency is added outside the tiers; the release-age rule stays on | Release-age rule on (strict, 7 days) and frozen lockfiles in CI; no `govulncheck` or `pnpm audit` in CI | Done: now T28 (the steps are planned; `govulncheck` needs the dependency ask) |
| C05 | Clock skew | A bridge clock more than 300 s off drops every sync without saying why; Health shows the skew and turns red before it reaches the window | Not built | Deferred to release 1.x (Wyatt, 2026-10-25); the report lists it under Known limits |
| C06 | Secrets in logs and shell history | Bridge logs, the systemd journal and saved install transcripts never contain the view key, wallet-rpc login or pairing code; the pairing code in shell history is limited by single use and the 15-minute expiry, and the report says so | Secrets wrapped so they can't print (`TestNeverPrinted`, `TestWalletErrorsDontLeakSecrets`) | Done: now T29 (07b's journal scan checks the rest) |

## Instructions for Claude Code

The repo copy, `docs/security-matrix.md`, is the live one from now on. The tagging session comes before the 07b setup session.

1. Copy this file to `~/xmr-pay/docs/security-matrix.md`.
2. Start a fresh session with the tagging line below.
3. Add one rule to `CLAUDE.md`: every new test carries a matrix ID, and a phase closes only after its rows are updated.
4. Wyatt decides C02–C06 alongside the other open spec changes, or accepts probe-and-report for 07b.

The tagging line:

```
Read docs/security-matrix.md. Tagging only, no new features: for each row,
add the [ID] tag to the names of the tests in its "Tests found" column, and
to any other test you find that covers it. Correct any row where the code or
tests disagree with the audit, and say what you changed. Log C02-C06 in
docs/spec-changes.md as proposals with the suggested decisions; don't
implement them. List every row still Partial, Planned or Gap in
docs/progress.md with the smallest test that would close it. Run typecheck,
plugin tests (both configs), theme tests and go test before you finish, and
show me the diff before committing.
```

## From matrix to public report (phase 09)

The public report is generated from tagged CI output at each release tag, so it can't drift from the tests. The registry listing's `security` section is its plain-language summary (spec change 41, item 5).

- **Generation.** CI saves results as `vitest --reporter=junit` and `go test -json`. A small script using Node built-ins only groups them by ID, adds the commit, CI run and network, and writes `docs/security-report.md`.
- **Per-ID layout.** A plain-language summary first: what could happen, what happens to your money, and what you'd see on the admin page. Then the result and its evidence. Raw results go in an appendix.
- **Untested rows.** A row that isn't Covered at release isn't claimed as a protection. It's listed under Known limits or Not yet tested.
- **Outside review.** Findings go in with the date, and the reviewer's name if they agree.
- **Links.** `SECURITY.md` (security contact and response time) and the steps to verify the bridge signature and build provenance by hand.
- **Freshness.** Each release regenerates the report; a report older than the release it describes is pulled.
