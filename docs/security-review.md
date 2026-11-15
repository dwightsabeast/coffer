# Coffer — Security review, release 1 (tips)

Phase 09, step 1: the gate before anything is published. Written 2026-11-14 and 15 (UTC) by the phase 09 session; Wyatt rules on every item in "For Wyatt's ruling".

**The commit this review covers: `d83b273d43f66c4a44eb64a3f737d47fb8a515ab`** (branch `release-1`). The review read the code and ran the suites at that commit. Any code change after it (step 3's admin-page work, a fix from this review, a dependency change) gets a written delta review against the same checklist before anything is published (Wyatt, 2026-11-14). Delta reviews are appended at the end of this file.

**It starts from** `docs/redteam-findings.md` and `docs/security-matrix.md` as phase 07b left them, not from scratch. 07b attacked the code; this review walks the spec's Security model row by row and checks that each claim has code and a passing test behind it.

## Verdict

**Update, 2026-11-15:** Wyatt ruled on all six findings and all six are fixed; see "Delta reviews" at the end. Still not ready to publish: section 8's items 2 to 9 remain.

**As written on 2026-11-14: not ready to publish yet.** No threat row is uncovered, and nothing found is Critical or High. The review and the independent reading found six things to rule on, three of them proposed Medium, and the phase's own remaining work stands in front of a release as well.

| | Count |
| --- | --- |
| Threat rows in the spec's Security model | 16: 11 hold as the spec states them; 5 hold only with a limit or a wording change the report must carry (rows 2, 3, 10, 14, 16) |
| Uncovered threats (blockers by the phase file's rule) | 0 |
| New findings for Wyatt's ruling | 6: RT-36, RT-37 and RT-38 proposed Medium; RT-39, RT-40 and RT-41 proposed Low |
| Observations and wording items | 9 (REV-2 to REV-10) |
| Open before publishing | 9 items |

## What was run

| What | Result |
| --- | --- |
| Plugin suite, `pnpm test` (validate, then both vitest configs) | Passed. Default: 46 files, 532 passed, 7 expected fail, 1 skipped. Switch on: 6 files, 102 passed, 1 skipped. Run before this review's two test edits; with them the default run has one more expected fail (RT-36), checked on the two files touched (22 passed, 1 expected fail) |
| Plugin typecheck, validate, bundle check | Typecheck clean; manifest valid; bundle check passed (74.7 KB across 3 files; the runtime `plugin.mjs` 73.25 KB) |
| Theme suite and typecheck, zbar required | 11 files, 80 passed, 1 skipped; typecheck clean |
| Bridge: gofmt, vet, `go test ./...` (go1.27.3, `GOTOOLCHAIN=local`) | gofmt clean, vet clean, 21 packages ok (one has no tests) |
| CI on the last pushed commit | Run 43643905081 passed on `f2ab8ef` (plugin, theme, bridge with the race detector). The reviewed commit differs from it in docs, one test's name and one added expected-fail test (RT-36) |
| `pnpm audit`, production dependencies | `plugin/`: 0. `theme/`: 0. Neither package ships a runtime dependency |
| `pnpm audit`, dev dependencies included | `plugin/`: 69 advisories (0 critical, 21 high, 38 moderate, 10 low). `theme/`: 31 (0 critical, 6 high, 20 moderate, 5 low). All in dev tooling and EmDash's own tree; listed under "Dependency audits" |
| `govulncheck` on the bridge | **One finding, RT-39.** v1.9.0, built with go1.27.3 under `~/work/govulncheck/`. Source mode on `bridge/`: exit 3, GO-2026-6859 (net/http, fixed in go1.27.4). Binary mode on fresh static amd64 and arm64 builds: exit 3, the same one. Source mode with `-test` on `bridge/oracle/`: exit 0 |
| Secrets sweep of the repo and its whole git history | Nothing to rotate; three things to know (see "Secrets sweep") |
| Independent re-derivation by a fresh subagent | Done: 11 of 16 rows agreed, 5 disagreements, and it found RT-36 on its own. See section 11 |

**Not run in this review:** nothing live on stagenet; no install on a wallet host; the Cloudflare runner. Live evidence is 07b's and the EmDash 1.4.0 check's, cited by row.

## 1. Phase 07b's exit bar

Read from the summary table in `docs/redteam-findings.md` (35 findings).

- **Critical:** none filed.
- **High:** three filed. RT-11 and RT-31 are fixed (spec changes 45 and 47). RT-08 was ruled an accepted limit (Wyatt, 2026-11-08), with spec change 46's detection built and spec change 44's wording.
- **Medium:** eleven filed. Fixed: RT-05, RT-07, RT-20, RT-26, RT-27, RT-29, RT-30, RT-32, RT-34. Accepted limit: RT-12 (Wyatt, 2026-11-08). Lowered to Low and closed: RT-15 (Wyatt, 2026-11-13).
- **Low, open, each with Wyatt's ruling of 2026-11-08:** RT-01, RT-04, RT-06, RT-09, RT-13, RT-18, RT-19, RT-21 (left for release 1); RT-16, RT-17 (upstream list); RT-25 (release 2 list).
- **Expected-fail tests in CI:** seven `it.fails` (RT-01, RT-04, RT-06 three times, RT-09, RT-25) and one Go `t.Skip` (RT-21). Each matches an open Low above. None hides a fixed finding.

The bar is met: no Critical or High open, every Medium fixed or accepted in `docs/decisions.md`.

**Fixed in code but never seen live** (each finding says so): RT-05 (test host only), RT-23 (status lines on a wallet host with a remote node), RT-33 and RT-34, RT-35. Phase 09's install on a real wallet host is where RT-23 gets seen.

## 2. The Security model, row by row

Each row: the spec's threat, its matrix ID, where the code is, the tests, and the verdict. "Holds" means the mitigation is in the code as the spec states it and a tagged test passes.

| # | Threat (spec) | ID | Code | Tests and live evidence | Verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | Malicious or compromised plugin update | T01 | `plugin/emdash-plugin.jsonc` (capabilities, hosts, storage); routes in `plugin/src/plugin.ts`. No wallet call exists anywhere in `plugin/src` | `manifest.test.ts` "[T01][P02] the built manifest matches the spec's trust contract exactly"; CI `emdash-plugin validate`; the sandbox canary's 15 probes (07b, rerun on 1.4.0) | **Holds for what exists.** Provenance and the passkey approval don't exist until step 4, so the report can't claim them before the first release goes through that workflow. Other-host and undeclared-storage refusals are EmDash's, seen with the canary, not in CI |
| 2 | Database leak | T02, P01 | `store.ts` (what is kept, and where); `sync/pairing.ts:25` (the code is hashed, never stored); `checkout.ts:154` (`newIds`: 16 random bytes for the token) | "[T02][T13] Connect wallet host … storing only its hash"; the data-at-rest scanner on the dev database after real payments (07b I1): no view key, pairing code or IP | **Holds, with a wording limit.** The site stores the bridge's public key and the previous one, a code hash, a salt, invoices and pool rows. The spec calls tokens "short-lived"; they aren't (REV-8). The purge half is row P04 below, with RT-41 |
| 3 | Forged payment events (signing key stolen) | T03, T31 | `sync/protocol.ts:78` (Ed25519 over `ts + "\n" + body`); `sync/handle.ts:323` (stored key verifies the exact bytes before decoding or parsing) | `handle.test.ts` "[T03][T04][F01] forged, tampered, stale and badly encoded requests change nothing"; `redteam/stolen-key.test.ts` D1 to D6; live 2026-11-02 (forged rows reported bad within one sync, never handed out) | **Holds, with RT-08's accepted limit, and RT-36.** A key holder can also make the admin page fail (RT-36). The spec's sentence "the result is free goods, not lost funds" is too narrow for tips: a key thief who also stops the wallet host can route new tips to their own address until it's back. The report must use spec change 44's final wording |
| 4 | Replay of an old sync | T04 | `protocol.ts:64` (300 s window), `protocol.ts:75` (`seq` within 300 s of the signed time), `sync/merge.ts:15` (a snapshot not newer than the invoice's `seq` is ignored) | `redteam/sync.test.ts` C2 (299 s accepted, 302 s refused; the same request twice applies once; a re-signed stale `seq` is ignored) | **Holds for payments.** The wallet host's status record isn't replay-guarded inside the window: REV-2 |
| 5 | Address-pool exhaustion by spam checkouts | T05, T18 | `checkout.ts:26` (40 open site-wide, counted to `expiresAt` by the plugin's clock), `checkout.ts:157` (hashed per-client buckets, only with an IP), `checkout.ts:201` (one winner per row) | `redteam/checkout.test.ts` A7 and A8; `redteam/ipcap.test.ts` L2; live A8 on the Node runner (30 and 40 at once, no address reused) | **Holds.** The stated limit stands: without client IPs one sender can fill the cap for 30 minutes. The install docs must carry the rate-limit line (step 3) |
| 6 | Price manipulation | T06 | `checkout.ts:132` (unknown fields ignored); `rates.ts:70` (two fixed hosts, bounds, 60 s cache, never a stale price); rate stored on the invoice | `redteam/checkout.test.ts` A0 and A1; RT-02's test (a reply for another pair is no price) | **Holds for release 1.** A tip's amount is the tipper's own, and a tip settles at the dust floor whatever was asked, so a wrong price can't take anything. The store-order half is release 2 |
| 7 | Fulfillment before funds are final | T07, T11 | `core/invoice.ts:294` (`classify`: settled only at `depth >= required`); presets are never below 1; `admin.ts:954` raises, never lowers | "[T07][T11] the test tip needs 1 confirmation whatever the speed; still never 0"; D5 (a forged snapshot never lowers `required`) | **Holds.** RT-40 is a hardening gap that Coffer's own form can't reach |
| 8 | Injection through buyer fields | T08 | `checkout.ts:91` (`cleanNote`); Block Kit renders text as plain text (an EmDash behavior, on the upgrade checklist) | `redteam/checkout.test.ts` A3; Wyatt's manual admin-page check (2026-10-29) | **Holds for tips.** The spec says "validated with a schema"; the validation is hand-written (dependency tier 1). Email and refund address are release 2 |
| 9 | Token leakage through the pay page | T09 | `theme/src/headers.ts:22`; `plugin.ts` (`status` is `private, no-store`); `theme/src/status.ts` (the token is never logged) | `paypage.test.ts` "[T09] the privacy headers and meta, with a CSP whose hashes match …"; `redteam.test.ts` L6; `curl -I` on the built copy (1.4.0 check) | **Holds** |
| 10 | Wallet host exposure | T10 | `bridge/internal/supervise/supervise.go:261` (127.0.0.1, a login from a private file); `bridge/internal/installer/unit.go:8`; redirects off in `syncclient.go:273` | `supervise_test.go` "[T10] wallet-rpc listens on 127.0.0.1 with a login"; F1 on `coffer-test` (2026-10-30): no listener, 401 without the login, files 600 | **Holds for exposure** (loopback, a login, no inbound port). "Outbound HTTPS calls only" is stronger than the build: REV-10 |
| 11 | Time-locked or double-spent payment | T11 | `core/invoice.ts:188` (`counted`); `protocol.ts` keeps `unlockTime` a string | "[F01][T11] C3: a repeated key never makes a time-locked or flagged payment count"; scenarios | **Holds** at host level. Stagenet can't produce one on demand; the spike's time-locked payment (phase 01) is the live evidence |
| 12 | Reorg or double-spend after settlement | T12, R10 | `core/invoice.ts:334` (`evaluate`, the settled branch); `core/watch.ts:16` | `scenarios.test.ts` "[T12] …"; RT-33 and RT-34's tests | **Holds at host level; no live reorg** (regtest wasn't adopted). The report says so |
| 13 | Pairing code stolen or guessed | T13 | `sync/pairing.ts` (128 bits, hash only, 15 minutes); `handle.ts:279` (claimed with one conditional write before anything else); `plugin.ts` (the admin route needs `plugins:manage`) | `handle.test.ts` "[T13] …" (wrong, expired, used, replaced); RT-07's test; live `c6` three rounds on 1.3.1 and again on 1.4.0 | **Holds** |
| 14 | Dishonest remote node | T14 | `bridge/internal/crosscheck/crosscheck.go:183`; height bounds (spec change 47); the floor in `core/invoice.ts:229` | `crosscheck` tests; RT-26, RT-31 tests; live `TestLiveStagenet` (07b) | **Holds, with a new limit: RT-38.** The node's operator can switch the check off with a DNS answer at the bridge's start. Stated limits: with a remote node and no second node answering, payments are held; stagenet's second nodes are plain http; the second-node list is short (three mainnet operators) |
| 15 | Full break-in on the site's server | T15, P01 | The plugin has no field for a view key. `bridge/internal/installer/samemachine.go:35` refuses a wallet host on the site's machine | `samemachine_test.go`; the data-at-rest scan (P01); F4 live | **Holds.** RT-21 (open, Low) is the stagenet dev flag only |
| 16 | Tampered installer or downloads | T16, T26, T27 | `installer/install.sh:64` (SHA-256 written into the script); `bridge/internal/selfupdate/core.go:100` (Ed25519 over a prefix and the manifest, pinned keys), `core.go:61` (never older); `bridge/internal/hashsig/verify.go:111` and `monerodl` (Monero's signed hash list) | `selfupdate` and `monerodl` tests; F4 live (a one-byte-changed binary refused, the working install untouched); `TestLiveDownload` | **The Monero half holds. The update half is built and tested but off: no release key is pinned until step 2. The first-install half doesn't hold as the spec words it:** it checks a hash carried in the same script, not a signature (REV-5) |

**Privacy list**

| Claim | ID | Verdict |
| --- | --- | --- |
| The site never holds the view key | P01 | Holds: no code path takes one; the scanner found none (07b I1) |
| A fresh subaddress per invoice | P02 | Holds: unique indexes on `addrIndex` and `subaddress`; `claimAndStore`; A8 live |
| No IP addresses stored | P03 | Holds as written: `clientBucket` stores a salted hash of an IPv4 address or an IPv6 /64, 16 hex characters. Entries count for 30 minutes but aren't removed on a timer (REV-9) |
| Records readable by the operator; the 30-day purge limits that | P04 | Holds for final invoices. Two gaps: RT-25 (release 2 list) and RT-41 |
| What remote nodes learn | P05 | Partial by design: an observation in the findings, not a spec claim. The report lists it under Known limits |

**The sandbox paragraph.** The spec says the Node runner enforces only the 30 s wall. RT-12 measured it (30,051 ms on 1.4.0) and it's an accepted limit with a docs line (step 3).

## 3. Matrix rows not marked Covered (pass 1)

| Row | State | Class | What to do |
| --- | --- | --- | --- |
| T01 | Partial | Open before publishing | Provenance and passkey approval arrive with step 4's workflow. Claim them only after the first release has gone through it |
| T02 | Partial | Stated limit | The token's random source is code only; nothing more to test |
| T08 | Partial | Covered for release 1 | Email and refund address are "covered in release 2" |
| T15 | Partial | Covered for release 1, RT-21 open (Low) | Nothing |
| T21 | Partial | Covered for release 1 | Four passing tests and the switch test; RT-01 stays open (Low). The row's text was stale and is corrected |
| T23 | Partial | Stated limit | "Headers only on Coffer's responses" was read, not tested. Two tests cover the rest |
| T28 | Planned | **Open before publishing** | The CI steps decided on 2026-10-31 were never built. See "Open before publishing", item 3 |
| T30 | was Planned | Covered | The tests exist (A11, B2, and the totals test, which now carries the tag). Row corrected |
| T31 | was Planned | Covered | D6 exists and passes. Row corrected |
| P05 | Partial | Known limit | In the report as an observation |
| R05 | Partial | Covered for pass 1 | Row's own note |
| R11 | Partial | Closed by RT-15's ruling | Row's text was stale and is corrected |
| F01 | Partial | RT-06 open (Low, pass 2) | Three `it.fails` |
| F03 | Partial | Covered | A4's two tests name long tokens and the generic reply. Row corrected |
| F04 | Partial | **Open before publishing** | The user and header refusals are EmDash's and aren't in CI; `tips_page` isn't built or reviewed yet |
| F08 | Partial | Covered | RT-26 and RT-27 are fixed. Row's text was stale and is corrected |
| C05 (clock skew) | Deferred | Known limit | In the report |
| C07 (batch caps) | Open | After release 1 | The plugin's caps and the bridge's limits agree today (100, 100, 32) but share no constant |

## 4. The areas the phase file lists

**Signature and freshness order.** Headers and the 300 s window are checked first (`handle.ts:254`). The body is parsed before the signature only while a pairing code is active and the body is at most 4,096 bytes, as the spec allows. Otherwise the stored key verifies the exact bytes, then strict UTF-8, then the parser. A request refused before its signature verifies writes nothing. A bad signature costs at most two verifications (the current key, then the previous one).

**Pairing.** The code comparison runs over the hashes in constant time. Wrong, expired and used codes give the same answer. The claim is one conditional write; a failed write puts the code back. A new code replaces the old hash at once.

**Spam limits.** As row 5. The count and the claim aren't one transaction, but a burst can't pass the cap by much: each request reads at most five free rows old enough to hand out, and A8's tests and live runs stayed at or under the cap.

**Money math.** BigInt everywhere; no `Number` arithmetic on an amount in `plugin/src` or `theme/src`. `expectedAtomic` rounds up, the rate is floored to the cent, and amounts on the wire stay strings of at most 20 digits.

**State machine.** `evaluate` is pure. Settled needs the threshold and the depth. Expiry needs a sync from after the deadline. An admin decision is final. The floor (spec changes 47 and 48) keeps an old payment to a reused address out of the totals.

**Admin action validation.** An action's value must match `^(settle|expire|raise):inv_…` (`admin.ts:944`). The invoice is read with its revision, the verb is checked against what the page would offer for the invoice as stored now, and the write is conditional on that revision. A stale, forged or malformed value gets an error toast and changes nothing (`redteam/admin.test.ts`, 07b B2). Settings accept only the listed currencies and speeds. **`tips_page` doesn't exist yet**, so it isn't reviewed. One stored value can make the page fail to render: RT-36.

**Buyer-data purge.** `housekeeping.ts:16`: 25 invoices a batch, after each sync and hourly from the cron, by `finalAt + 30 days`. Tests P04. Gaps: RT-25 and RT-41. `finalAt` is the first time an invoice left the open states, so a tip paid days after it expired loses its note 30 days after the expiry, not the payment.

**Pay page headers.** Row 9. The tip endpoint's own pages carry the same headers.

**Installer prompts and file permissions.** The view key is asked on the terminal, never taken from the command line; the pairing code goes to the installer on stdin. Config, key, wallet files and logs are mode 600 under a 700 folder (F1 live). The admin's copy in `/usr/local/bin` is root-owned and separate from the service's copy, so root never runs a file the service account can write.

**systemd hardening.** `unit.go`: a dedicated user, `NoNewPrivileges`, `ProtectSystem=strict` with one writable path, an empty capability set, a syscall filter, `MemoryDenyWriteExecute`, no listener. F1 checked it on `coffer-test`.

**Download and update verification.** Row 16. The Monero download follows redirects only over https within its two hosts and caps sizes. The bridge updater checks the signed manifest and each file's hash, and never installs an older version (REV-6 is a note on its redirects).

**Dependency audits.** Production: nothing, in both packages. Dev trees: the advisories are in `undici`, `seroval`, `hono` and `@hono/node-server`, `@modelcontextprotocol/sdk`, `vite`, `@vitest/mocker`, `zod`, `body-parser`, `sharp`, `sanitize-html`, `source-map-js`, `fast-uri`, `ip-address`, `qs`, `deepmerge` and `astro`. None of it is in the plugin bundle or the theme package. Two concern a site, not Coffer: the `astro` advisories (GHSA-r3h5-4585-7x3w, up to 7.4.6; GHSA-mh32-jxcr-mh9f, up to 7.4.4) sit inside the theme's peer range (`>=7.3.5 <8`); see REV-7. Full output: `~/xmr-pay-dev-data/09-review-audit-*.json`.

## 5. Static confirmations

| Check | Result |
| --- | --- |
| The manifest's trust contract against the spec | Matches, in the source and in the built `dist/manifest.json`: the two capabilities, the two hosts, `pool` and `invoices` with the spec's indexes, the four routes with their methods and access, one page (`/payments`, spec change 6's accepted path) and one widget. `manifest.test.ts` pins it |
| Bundle caps (`backend.js` at most 128 KB, tarball at most 256 KB) | 74.7 KB across 3 files; `plugin.mjs` is 73.25 KB |
| `release.requires` names only tested versions | `env:emdash >=1.4.0 <2.0.0`, `env:astro >=7.3.5 <8.0.0`. 1.4.0 is the floor and the only EmDash version checked (2026-11-14). 1.5.0 is untested: see "Open before publishing", item 6 |
| The release-1 switch is off, in the source and in the built bundle | Source: `GOODS_ENABLED = false` (`core/constants.ts`), pinned by `release1.test.ts`. Built `dist/plugin.mjs` (SHA-256 starts `e0b4be2a4e868387`): the checkout validator compiles to "an object whose kind is `tip`, else refused", and the text "All invoices" isn't in the bundle. The product-invoice function is still in the file as unreachable code |
| The theme exports no PayButton, in the source and in the package | `npm pack --dry-run`: 18 files, no PayButton file, and the word doesn't occur in `theme/src`, `package.json` or the README. `exports` lists PayPage, page, TipButton, tip, isPaid, messages and qr |
| No third-party runtime code is shipped | `plugin/package.json` and `theme/package.json` have no `dependencies`; `bridge/go.mod` has no `require`; the QR encoder is vendored and hash-checked (T24) |
| Release builds hold no dev key, dev URL or test key | `TestReleaseBuildHasNoDevValues` passes. The real key isn't pinned yet (`releaseKeys()` returns nil; `releaseBase()` is a placeholder), which is step 2's work |

## 6. The txid lookup (spec change 49, item 4)

**Can EmDash index a value inside an array? No.**
- EmDash's storage docs: index field names "start with a letter and contain letters, digits, or underscores", and "declared fields become expression indexes".
- The installed `emdash` 1.4.0 builds each index as `json_extract(data, '$.<field>')` on a validated identifier: one top-level field. A txid sits inside `transfers[]`, which that can't reach.
- So an index would need a new top-level field. One field holds one value, and an invoice can have up to 32 transfers, so it would find an invoice by one of its txids only.

**A bounded scan, measured.** The built copy on the dev box (EmDash 1.4.0, Node), a flood seed of 20,100 expired tips plus the dev data, a temporary build that scanned for a txid that isn't there after each sync. Three runs of three syncs and the sync before each: twelve readings per scan.

| Scan, 200 pages of 100 (20,000 rows) | Time |
| --- | --- |
| In storage's own order (no filter, no `orderBy`) | 574 to 628 ms |
| Tips, newest first (`where: { kind: "tip" }, orderBy: { createdAt: "desc" }`) | 6,909 to 7,056 ms |

- **Limits of the measurement:** the seeded rows have no transfers, so the per-row check is cheaper than on paid invoices; the row read dominates. One machine, one database (SQLite). Nothing was timed past 20,000 rows.
- The ordered scan is twelve times slower per page: about 35 ms a page against 3 ms. That's fine for `tips_page`, which reads one page at a time, and it's the same paging cost RT-15 found.
- The database was backed up with `VACUUM INTO` first and restored after; the counts match the backup (64 invoices, 366 pool rows, bridge key present). The throwaway branch is deleted, and the plugin and the dev site are rebuilt from `release-1`.
- Evidence: `~/xmr-pay-dev-data/redteam/h1-2026-11-15T023144420Z.txt`, `…T023231328Z.txt`, `…T023314815Z.txt`.

**Recommendation: a bounded scan; 1.0.0's storage contract doesn't change.** A lookup by txid is an admin pressing a button now and then, and 0.6 s for 20,000 rows in storage order is well inside the 30 s wall. Past the cap it must say so ("not found in the newest 20,000"), never just "not found". Proposed as spec change 56 for Wyatt's decision.

## 7. For Wyatt's ruling

New findings are filed in `docs/redteam-findings.md` with the next RT numbers. The severities are proposals; Wyatt rules.

### Findings

**RT-36 (proposed Medium; rows F04, T11, T03). A transfer's time lock too large to be a date makes the admin page fail.**
- `admin.ts:575` formats an `unlockTime` of 500,000,000 or more as a date. Above 8,640,000,000,000 the date is invalid and the conversion throws. The sync parser accepts up to 20 digits.
- **Reproduced** on the test host: a settled tip whose payment is then reported with `unlockTime` 2^64 − 1 goes to review (reversed), and every load of the payments page answers `ROUTE_ERROR: Invalid time value`. Test: `redteam/admin.test.ts`, "[F04][T11] [RT-36] …", committed as `it.fails`.
- **Who can do it:** whoever holds the bridge key, or (rarely) a miner who includes such a transfer to a tip address whose counted payment later stops counting.
- **Why it matters:** the page that fails is the one with "Connect a new wallet host", the recovery step for a stolen key. Read in the code, not run: that action also renders the page, so the admin would never see the new code. The dashboard widget still loads.
- **Fix (small):** format the lock without `Date` when it's out of range ("time-locked far in the future"), and never let one row's text take the page down. A code change, so a delta review.
- **Recommended:** fix before release 1.

**RT-37 (proposed Medium; no matrix row yet). `isPaid` says yes to any settled invoice.**
- `theme/src/isPaid.ts` checks only `status === "settled"`. The README shows it as the whole gate.
- In release 1 the only invoices are tips, and a tip settles at 0.0001 XMR. So on a site gated the README's way, one dust tip opens the page, and the same token opens every gated page for as long as the invoice exists.
- Read in the code; no test, because the matrix has no row for gating yet.
- **Proposed in spec change 55:** take `isPaid` and its README section out of release 1's theme package; design the real check (kind, reference, paid in full) in phase 08.
- **Recommended:** accept item 1 of spec change 55 before the theme package is published.

**RT-38 (proposed Medium; row T14). The remote node's operator can switch the cross-check off with a DNS answer.**
- `bridge/cmd/xmr-bridge/bridge.go:84` decides once, at start, whether the node is "the shop's own": `IsOwnNode` looks the name up, and if every address is loopback, private or link-local, no cross-checker is made for the life of the process (`crosscheck.go:78`). wallet-rpc looks the same name up on its own.
- So an operator who answers the bridge's start-up lookup with a private address and later lookups with the real one gets a wallet host that reports the node check as "off (your own node)" and never cross-checks. Fabricated confirmations then pass.
- Found by the independent reviewer; I read the two functions and agree with the reading. **Not run.** It needs the operator to win the lookup at the bridge's start.
- **Options:** (a) treat a node given by name as remote unless the name is `localhost`, so "own node" means an address typed as an address; (b) re-check on every sync.
- **Recommended:** (a), before release 1. It's a small bridge change with a test in `crosscheck`, and a delta review.

**RT-39 (proposed Low; row T28). go1.27.3 carries GO-2026-6859; go1.27.4 fixes it.**
- `govulncheck` v1.9.0 reports it as called, in source mode and in both binaries: "HTTP/1 server crash due to MaxBytesReader header race in net/http".
- It's a server bug. The shipped bridge runs no HTTP server; the only one in the module is the test-only `hostile` package. The tool counts the package's shared symbols.
- The bar for release is "nothing called" (07b F5). go1.27.4 was published on 2026-11-02, so it's past the 7-day age.
- **Recommended:** move to go1.27.4 the way RT-28 moved to 1.27.3 (`bridge/go.mod`, which CI reads, and the dev box; the install is Wyatt's sudo step), raise the `[T28]` floor test, rerun. A toolchain upgrade, so Wyatt approves first.

**RT-40 (proposed Low, hardening; row T07). Checkout reads the speed setting with `in`, which also matches inherited names.**
- `checkout.ts` takes the stored speed if `speedSetting in PRESETS`. A value such as `toString` passes, the confirmation target comes out undefined, and `classify` then settles at any depth, zero included.
- **Not reachable through Coffer:** the settings form accepts only the three listed speeds (`Object.hasOwn`). It would take another way to write the plugin's `speed` setting; whether EmDash has one wasn't determined.
- Found by the independent reviewer; I checked the line. Not run.
- **Recommended:** use the same `isSpeed` check as the form, with a test, before release 1. "Never at zero confirmations" shouldn't rest on a setting's value.

**RT-41 (proposed Low, privacy; rows P04, T02). An invoice that never becomes final keeps its note for good.**
- The purge counts from `finalAt`, which an invoice gets only when a sync moves it out of the open states.
- **Cases:** a wallet host removed and never replaced (the tips open then, and the free addresses still handed out: about 90); a tip held at `confirming` because a remote node's payments can't be cross-checked (not bounded by the pool); a site waiting for a probe answer that never comes; rows past the 200-page scan cap. The last three are the independent reviewer's additions.
- Read in the code; not tested.
- **Options:** (a) the purge also clears buyer data from any invoice whose `expiresAt` is more than 30 days past, whatever its status (the query already reads those rows); (b) a stated limit.
- **Recommended:** (a).

### Observations

**REV-2 (Low; row T04). A captured sync can be replayed for up to 300 s and refreshes the wallet host's status.** Per-invoice `seq` stops a replay from changing an invoice, but the bridge record (`lastSyncAt`, `checks`, `version`), the pool check's last "ok" and the "site is refusing updates" record are rewritten. It takes the signed bytes, so a position inside the site's TLS. It gives up to five more minutes of looking alive. Recommended: a line in the report.

**REV-3 (Low; row T30). A tip's `contentRef` gives back the title of any published entry in any collection,** in the `monero:` URI's description. A miss answers before any limit applies, so it's also an unmetered check of whether an entry ID is published; the title stays on the invoice after the entry is unpublished. Recommended: accept (published means public), with a line in the report.

**REV-4 (process; row T28). The dependency checks decided on 2026-10-31 aren't in CI:** `govulncheck@v1.9.0` on `bridge/` failing on exit 3, and `pnpm audit --prod --audit-level high` in `plugin/` and `theme/`. Recommended: build both before the first release, with RT-39 fixed first or the new step fails.

**REV-5 (wording, for a ruling; row T16). The spec says the install command checks "the bridge's signature"; it checks a SHA-256 written into the same script.** That is the decision of 2026-10-04, so the build is as decided. But a changed `install.sh` passes its own check, and the installer then runs as root: a first install trusts the install host and its TLS. The independent reviewer reads this half of row 16 as "does not hold as the spec states it", and I agree the label matters. Recommended: change the spec's sentence to "checks the download against this release's checksum", say so in the report, and give the by-hand check of `release.json`'s signature in the install docs.

**REV-6 (row T27). The bridge's updater follows redirects, including to plain http,** and nothing requires its base address to be https. Integrity doesn't depend on either (signed manifest, hashed files). Recommended: refuse both when step 2 touches the updater.

**REV-7. Astro's floor.** The theme's peer range starts at 7.3.5; two Astro advisories cover versions up to 7.4.6. They affect a site's own pages. Decide with the EmDash 1.5.0 check.

**REV-8 (wording; row T02). The spec calls invoice tokens "short-lived"; they work for as long as the invoice row exists.** `status` has no age check and invoices are deleted only on uninstall. In release 1 a token shows only that tip's own status. Recommended: drop "short-lived" from the spec's row, or decide an age after which `status` answers not found.

**REV-9 (Low; row P03). Rate-limit hashes aren't removed on a timer.** Old entries are dropped only when a later checkout with an IP succeeds, so the last ones stay in KV. The salt is stored beside them, so an IPv4 address behind a leaked hash could be found by trying all 2^32. "No IP addresses stored" holds as written. Recommended: prune in the purge batch too; after release 1 is fine.

**REV-10 (wording; row T10). "Outbound HTTPS calls only" isn't what the bridge enforces:** a node address may be plain http, on mainnet too, and the built-in stagenet second nodes are http. The site address must be https. Recommended: word the report as "to the site, https only; to a node, whatever its address says", and consider refusing an http node that isn't the shop's own on mainnet.

**Smaller notes from the independent reviewer, not checked beyond a reading:** a sync's purge or alert write that throws would answer an error for a sync already applied, a pairing included; the bridge's `detail` strings aren't cleaned the way notes are (key holder only, and Block Kit shows text as text); the install command puts the site address in unquoted (the address comes from EmDash or the admin's own browser); "Get a test address" looks for an open test tip among the newest 100 tips only. The sync and the purge write invoices without a version check, so they can overwrite an admin's decision made at the same moment: the matrix's R05 already records this as "a guard, not a proof".

## 8. Open before publishing

1. **Rulings on RT-36 to RT-41** and on spec changes 55 and 56. Each fix is a code change with a delta review. I recommend fixing RT-36, RT-37 (spec change 55, item 1), RT-38, RT-39 and RT-40 before release 1.
2. **`tips_page` and spec change 49 items 1 to 3** (step 3): build, then review the action the way 07b's B2 reviewed row actions. Rows F04, T30, T09. Tip rows will then show transfers, which is RT-36's code path.
3. **T28's CI steps** (REV-4).
4. **The release key and addresses** (steps 2 and 3): the real public key pinned, `releaseBase()` and the plugin's install URL replaced, and the tests that prove a release build holds no placeholder, dev key, dev option or test key.
5. **The install docs' lines:** RT-12, RT-13, RT-19, the dedicated wallet, the proxy's public address (RT-20), the rate-limit rule for checkout, the by-hand signature check (REV-5).
6. **EmDash 1.5.0** (after 2026-11-18, about 18:20 UTC): the upgrade checklist, and a re-check of every row in section 9. Until then `release.requires` admits 1.5.0 untested; either the check is done before the first publish or the range is capped below 1.5.0.
7. **The public report and `docs/security.md`** (step 4), from tagged CI output, with T03 in spec change 44's wording and rows 2, 3, 10, 12 and 16 worded as above.
8. **`govulncheck -mode binary` on the release binaries and `pnpm audit` on the release packages**, just before publishing.
9. **A delta review** for every code change after the reviewed commit.

**Carried, not blocking:** RT-23's status lines on a wallet host with a remote node, and Ctrl-C after the installer has started changing the machine (both for step 6's install); growing the second-node list; the self-update admin-copy question.

## 9. Rows that rely on EmDash internals

Re-check each on EmDash 1.5.0 before the first publish (Wyatt, 2026-11-14). `docs/emdash-upgrade-checklist.md` has the check for each.

| Review row | Relies on |
| --- | --- |
| 1 (T01), F04 | The sandbox's capability, host and storage gating; the private route's `plugins:manage` check; `X-EmDash-Request` |
| 5 (T05, T18), P03 | `requestMeta.ip` comes only from the platform, never from a visitor's headers |
| 8 (T08) | Block Kit renders every text as plain text |
| 9 (T09) | Headers set in the page file are sent; EmDash's toolbar stays off a page that has the placeholder; `cacheControl` on a plugin route |
| 13 (T13) | `ctx.kv.getVersioned` and `compareAndSet` |
| T17 | `getPublicOrigin`, the same function EmDash's own CSRF check uses |
| T19 | `requestMeta.geo` is null off Cloudflare Workers |
| T25 | `ctx.site.url`'s order of sources |
| P04 | A stored storage cursor still decodes after an upgrade |
| R11 | Storage paging by `(created_at, id)` stays cheap |
| Pay page, `isPaid` | `getPublicPluginApiRouteHandler` |
| Admin action writes | `getVersioned` and `compareAndSet` on storage; `updateIf` |

## 10. Secrets sweep

Searched: the working tree and the patch text of all 421 commits on every ref (7.2 MB), plus every file name ever added. Patterns: private key blocks, token prefixes (GitHub, npm, Cloudflare, JWT), secret-named assignments, credentials in URLs, pairing codes and pay tokens, Monero addresses, 64-hex strings, IPv4 and IPv6 addresses, emails, host names, home paths, env and key files.

**Nothing to rotate.** No private key, API token, view key, seed, pairing code, real pay token, wallet-rpc login or env file is in the repo or its history. The `.asc` files are public keys. The 64-hex strings are hashes, RFC 8032 test keys, made-up scalars and stagenet transaction IDs. The one Monero address is a made-up test vector.

**Three things to know** (the repository is public):
1. **The dev box's LAN address** is in `docs/progress.md` (three lines, 2026-10-14) and in three commits. It's a private-range address, so it can't be reached from outside and can't be rotated, but the ground rules say to redact it. Replacing it in the working tree is a docs edit; removing it from history means rewriting pushed history, which is Wyatt's call.
2. **The first commit** (2026-10-01, "Initial commit") carries Wyatt's personal email as its author. Every later commit uses the GitHub no-reply address.
3. **The public test hostname** (`dev.wyattdilley.com`) appears 64 times, `CLAUDE.md` included. It's behind Cloudflare Access.

## 11. Independent re-derivation

A fresh subagent that hadn't seen this session read only `docs/spec.md`, the code and tests, and this file's first draft (which then held REV-1 to REV-7 and none of RT-36 to RT-40). It ran nothing: tests were found by name, not executed. Its full report is in the session; what it changed here:

**Agreed: 11 of the 16 rows** (1, 3 to 9, 11 to 13, 15), and P01, P02 and P04.

**Disagreed, and what was done:**

| Row | Its reading | Outcome |
| --- | --- | --- |
| 2 | "Short-lived" tokens are permanent | Agreed. Row 2 reworded; REV-8 |
| 10 | "Outbound HTTPS only" isn't enforced: an http node is accepted, mainnet included | Agreed. Row 10 reworded; REV-10 |
| 14 | A DNS answer at start can switch the cross-check off | Agreed on reading the code; not run. Filed as RT-38 |
| 16 | The first-install half doesn't hold as the spec states it, and it should be a ruling item, not a note | Agreed. Row 16 relabelled; REV-5 is now for a ruling |
| P03 | The hashes aren't time-bounded and an IPv4 one can be reversed with the salt | Agreed. REV-9 |
| Code pointers | Five bridge paths lacked `bridge/internal/` | Fixed |

**Found on its own, also found by this review:** the admin page failing on a large time lock (RT-36), from the code alone.

**Found only by it:** RT-38, RT-40, three more cases for RT-41, the wider reach of REV-2 and REV-3, and the smaller notes at the end of section 7.

**Where it and this review still differ:** nothing open. It couldn't check REV-4 or REV-7 (CI and `package.json` were outside what it was given).

## Delta reviews

Each change after the reviewed commit, against the same checklist: the threat rows it touches, the listed areas, the trust contract, the bundle caps and the release-1 switch, and its tests. Wyatt's rulings of 2026-11-15 are in `docs/decisions.md`.

**What was run after all six** (2026-11-15 UTC, at `7aff94e`): the full plugin suite, 536 passed, 7 expected fail, 1 skipped (default) and 102 passed, 1 skipped (switch on); plugin typecheck, validate and bundle check (74.8 KB; the built manifest unchanged); theme, 79 passed, 1 skipped with zbar required, and its typecheck; bridge on go1.27.4, gofmt, vet and 21 packages ok, `bridge/oracle` ok; govulncheck v1.9.0, exit 0 in source mode and on fresh amd64 and arm64 builds. **Not run:** CI (the commits aren't pushed yet); nothing live.

| Fix | Commit | What changed | Checked | Result |
| --- | --- | --- | --- | --- |
| RT-39 | `a310d2c` | `go 1.27.4` in `bridge/go.mod` and `bridge/oracle/go.mod`; the floor test asks for 1.27.4 | Rows 16 (T16, T27) and T28: a toolchain change only, no source line. Reproducible-build inputs: the version comes from `go.mod`, which CI reads. The floor test was red on go1.27.3 first | Holds. govulncheck reports nothing. **Open:** the dev box's own Go is still 1.27.3 until Wyatt's sudo step, so with `GOTOOLCHAIN=local` the bridge doesn't build with the system Go until then; this session used a private copy under `~/work/go1.27.4/` |
| RT-38 | `66805cd` | `crosscheck.IsOwnNode`: no DNS lookup; own node is `localhost` or a literal loopback, private or link-local address | Row 14 (T14): both callers read (`bridge.go:84`, the cross-checker; `BoundedHeight`, the pairing height). A name now always gets the checker and the bounded height. P05: a node on the shop's network given by name is now shown to the second nodes (block heights only). No new outbound host beyond the built-in list; no listener; no secret handled. `ctx` is unused but kept, so no caller changed | Holds. Test red first (`ip6-localhost` had counted as the shop's own). **Not live.** The install docs should say: give your own node by address |
| RT-37 | `554ab0c` | `theme/src/isPaid.ts`, its export, tests and README section removed | Rows 9 (T09) and T21: nothing else imported it (`page.ts` uses `fetchStatus` directly). The package's exports are pinned by a new test. No runtime dependency; the pack list loses one file | Holds. F03 keeps its other four tests |
| RT-41 | `9a6af0e` | `purgeBatch` also clears buyer data when `finalAt` is missing | Row 2 and P04: the query is unchanged (`expiresAt` more than 30 days past, by the declared index), so an invoice inside 30 days is never touched (tested). A final invoice still waits for `finalAt + 30 days` (tested: a review entered yesterday keeps its note), so RT-25's ruling for release 2 isn't made worse. The write is still an unconditional `put` of the row as read, as before (R05's note). Status, transfers and amounts are copied unchanged | Holds. One more write per never-final old invoice, once |
| RT-36 | `7aff94e` | `notCountedReasons`: three cases, the last without a `Date` | Rows 3, 8 and F04: the text is still a plain string built from digits the parser already limited to 20; `Number(u)` is used only at or below 8.64e12, which is exact. Edges tested: 499,999,999 (a block), 500,000,000 and 8,640,000,000,000 (dates), one more and 20 nines (locked). Other date conversions on the page take the plugin's own clock values or `seq`, which is bounded to 300 s from a fresh timestamp; `shortDate` doesn't throw on a bad value | Holds. The page loads with the reversed tip on it |
| RT-40 | `7aff94e` | `isSpeed` moved to `core/constants.ts`; checkout uses it | Row 7 (T07): the only two readers of the stored speed (checkout, and the admin's test tip) now use the same own-name check, and the form already did. `currency` is read with `isCurrency`, an array `includes` | Holds. Before the fix the test showed `required` undefined for `toString` |

**Trust contract after the six:** unchanged. The built manifest still matches the spec (`manifest.test.ts` in the full run); no route, collection, index, capability, host, page, widget or setting was added.

**Still open from section 8:** items 2 to 9. Item 1 is done except Wyatt's ruling on spec change 56, which now says the lookup is on the private admin route and uses the 0.6 s scan.

### Step 3: the admin page and the install guide (2026-11-15)

Commits `62855dd` (tip rows and `tips_page`), `7c4e2d4` (spec change 42's text) and the install guide's commit. Reviewed the way 07b's B2 reviewed the row actions.

| Change | Checked | Result |
| --- | --- | --- |
| **`tips_page`**, a new action on the private `admin` route | **Trust contract:** no route, collection, index, capability, host, page or widget added; the built manifest is unchanged (`manifest.test.ts`). The list's query is `where: { kind: "tip" }, orderBy: { createdAt: "desc" }`, the declared `[kind, createdAt]` index, 10 rows a page. **Input:** the value must be absent, `{ newest: true }`, or `{ cursor }` with a string of 1 to 1,000 base64 characters; the cursor is then tried against the same query inside a try, and anything that throws is refused. Tested: wrong types, empty, blank, oversized, not base64, cut short, valid base64 of the wrong shape, a bare string, a number, an array, another action's value. Each gets the error toast and the newest page. **Writes:** none. The handler reads only; the stored invoices are byte-identical before and after (tested). **Crash:** every refused case renders the page (tested). **Cost:** one extra one-row query per press, then one page of 10 | Holds. Rows F04 and T30 |
| **A well-formed cursor that isn't from this list** | The phase file asked for a refusal. EmDash refused the hand-built ones tried (its cursor carries more than a position), so they got the toast. One that did decode would be a position in the same query: it can only show visitor tips, 10 at a time, read-only, to an admin. The test asserts that no other kind is ever listed | Holds. **RT-42, Low, accepted** (Wyatt, 2026-11-15): admin-only, read-only, data the admin can already see; the phase file's wording now matches |
| **Non-admin refusals** (anonymous, a signed-in non-admin, no `X-EmDash-Request`) | EmDash's, before the plugin runs, and the same for every action on the route. The test host can't make them. `scripts/dev-e2e.mjs` checks the anonymous and bad-token cases on a dev site; Wyatt checked a Subscriber by hand in 07b | **Not run this session** |
| **Tip rows** (spec change 49, items 1 to 3) | **T09:** the pay token and the full address are on no page (tested across every page, and in the paging buttons' values). The ID is 64 random bits and no public route takes it. The address shows as its first and last six characters. **T08:** the new text is built from the stored ID, digits, heights and the txid, which the sync parser limits to 64 hex characters; nothing from a visitor is added. **RT-36's path:** the payments box uses `notCountedReasons`, so an over-range time lock reads "time-locked" (tested on a tip row). **Block Kit size:** the worst-case test (1,000 tips, 30 entries, 140-character notes) still passes | Holds |
| **Test tips** | Filtered after the query on every page, the first included, so a page can hold fewer than 10; they're in no total (tested) | Holds. A change from before: the first page used to show the newest 10 visitor tips even with test tips among them |
| **Spec change 42's text** | Wording only; `walletHostSite` and the conditions for the red banners are untouched (T25's tests pass with the new text). The banner's link is plain text in a Block Kit description | Holds |
| **`docs/install.md` and the listing's link** | No secret, address or placeholder that would run as typed; each command says which machine. The by-hand signature check names a public key file on the release page, **which doesn't exist until step 2** | Holds as a document. Not yet tested against a real release |

**Run after step 3** (2026-11-15, at `af306e2`'s code): the full plugin suite, 47 files, 542 passed, 7 expected fail, 1 skipped (default) and 102 passed, 1 skipped (switch on); typecheck; bundle check 76.7 KB; theme 79 passed, 1 skipped, and its typecheck; bridge on the system go1.27.4, gofmt, vet, 21 packages ok. **Not run:** CI (it runs on `main` and on pull requests only, and `release-1` has neither); `scripts/dev-e2e.mjs`; nothing live.

**The listing's installation text, trimmed** (2026-11-15, Wyatt): 1,985 to 1,841 graphemes, wording only, no code. Shortened: the pay page's list of privacy headers, the line before the tip button's example, the install guide's line, and two phrases ("walks you through the rest", "buyers' pay pages"). Kept: "never the spend key", the `/_emdash/api/plugins/coffer/*` line and the guide's link at the `coffer@1.0.0` tag. A new test in `manifest.test.ts` caps the text at 1,850 graphemes and checks those three (red at 1,985 first). Run after: typecheck; validate; bundle check 76.7 KB; the full plugin suite, 47 files, 543 passed, 7 expected fail, 1 skipped (default) and 102 passed, 1 skipped (switch on).
