# Coffer — Red-team findings

Filed by the attacker sessions of phases 07b and 08b (`docs/phases/07b-adversarial-testing.md`), against the plan in `docs/redteam-plan.md`. IDs run on across both passes and are never reused. Each finding's test is committed as `it.fails("[Txx] [RT-nn] …")` (vitest) or with `t.Skip("RT-nn open")` (Go) until a fix session flips it.

Severity is by what happens to people (the brief's table): Critical, High, Medium, Low, or Accepted limit. Wyatt rules on every Medium and every Accepted limit.

## Summary

| ID | Severity | Rows | Pass, round | Title | Status |
| --- | --- | --- | --- | --- | --- |
| RT-01 | Low | T21 | 1, 1 | Product-only link and order wording on the admin page for a product invoice already in storage | open |
| RT-02 | Low | T06 | 1, 1 | A Kraken reply for a different pair is taken as the price | open |
| RT-03 | Low | T08, F02 | 1, 1 | A tip note with a lone surrogate is stored as is | open |
| RT-04 | Low | T05 | 1, 1 | Concurrent tips are told "no address" while free addresses remain | open |
| RT-05 | Medium | T18, T05 | 1, 1 | An IPv6 visitor dodges the per-client cap by changing address inside their /64 | open |
| RT-06 | Low | F01 | 1, 1 | The sync parser accepts unknown fields, duplicate keys and out-of-range numbers behind the signature | open |
| RT-07 | Medium | T13 | 1, 1 | Two pair requests with one code at the same moment both succeed; the loser is told it paired | open |
| RT-08 | High | T03, P02 | 1, 1 | A forged sync adds a pool address a tipper then pays, widening the stated "free goods / fake tip" limit | open; spec change 46 built 2026-11-01 (plugin and bridge); live 2026-11-02: forged rows reported bad within one sync and never handed out |
| RT-09 | Low | P02 | 1, 1 | A forged sync adds a pool row duplicating an address already held | open |
| RT-10 | Low | T22 | 1, 1 | The way-back validator matches its refused prefixes case-sensitively | open |
| RT-11 | High | T20, P02 | 1, 1 | A sync adds a wrong-network subaddress to the pool (the pre-agreed mixed-network finding) | fixed 2026-10-31 (spec change 45) |
| RT-12 | Medium | T01, R11 | 1, 1 | One expensive plugin request blocks all others on the Node runner for the full 30 s wall | open |
| RT-13 | Low | F01 | 1, 1 | A slow request body isn't bounded by the 30 s wall; a connection can be held open past it | open |
| RT-14 | Low | F04 | 1, 1 | The admin handler settles or expires an open tip the release-1 page offers no action for | open |
| RT-15 | Medium | R11, R13 | 1, 1 | At a spam-cap-sized backlog each sync's watch scan takes ~28 s, within ~2 s of the 30 s wall | open |
| RT-16 | Low | F04 | 1, 1 | Coffer's sidebar link and dashboard widget show to roles that can't use them | open |
| RT-17 | Low | F04 | 1, 1 | A non-admin's refusal shows raw JSON in the "Plugin Error" banner | open |
| RT-18 | Low | T08 | 1, 1 | A tip note's stacked combining marks spill above and below its line on the admin page | open |
| RT-19 | Low | T13 (setup) | 1, 2 | The installer checks the pairing code last, so an expired code fails only after the keys are typed and wallet-rpc is downloaded | open |
| RT-20 | Medium | T17 | 1, 2 | Behind a proxy that ends https, the tip endpoint refuses every visitor's tip as cross-site | fixed in code 2026-11-02 (`de558a1`); live check passed 2026-11-06 (Wyatt); known limit recorded in its section |
| RT-21 | Low | T15 | 1, 2 | With the stagenet-only flag, a mainnet shop is refused only after its view key has been asked for | open |
| RT-22 | Low | T15 (setup) | 1, 2 | Ctrl-C at an installer prompt is ignored; after it, the install goes on and then fails with a misleading node error | open |
| RT-23 | Low | R13, T14 | 1, 2 | `Node check: ok` shows when nothing was checked, and keeps showing an old result | open |
| RT-24 | Low | T04 | 1, 2 | One snapshot with a far-future `seq` freezes its invoice: every later honest snapshot is ignored | fixed 2026-11-01 (spec change 46, item 5) |
| RT-25 | Low | P04 | 1, 2 | An invoice waiting in review loses its buyer data 30 days after review began, before the admin decides | open |
| RT-26 | Medium | T14, R09 | 1, 2 | A dishonest remote node can push the reported chain height, which sticks on the site and puts a re-pair's restore height in the future | fixed in code 2026-11-02 (spec change 47); live at the combined session; **release 1** |
| RT-27 | Medium | T15, F08 | 1, 2 | The bridge takes the site's `poolTop` and `poolTarget` unbounded: one reply can start a catch-up of billions of subaddresses | fixed 2026-11-01 (spec change 46, bridge side) |
| RT-28 | Low | T28, T27 | 1, 2 | The bridge is built with go1.27.1, which lacks the fixes for two standard-library vulnerabilities that reach it | fixed 2026-10-31 |
| RT-29 | Medium | T20, T03, R08 | 1, fix planning | A re-pair keeps the previous wallet host's unused pool addresses, so new tips go to the old wallet (or another network) first | fixed 2026-10-31 with RT-11 (spec change 45) |
| RT-30 | Medium (Wyatt, 2026-11-02) | P02, R09 | 1, fix sessions (46 live) | The bridge answers the wallet probe before its wallet has scanned, so `receivedTop` is 0 and an already-paid index 1 goes into the pool | fixed 2026-11-02 (`73781ec`); live check passed at the combined session's step 2 (2026-11-02) |
| RT-31 | High (Wyatt, 2026-11-02) | P02, T14 | 1, fix sessions (46 live) | A transfer mined before the invoice existed is counted toward it, so an old payment settles a new invoice | fixed in code 2026-11-02 (spec change 47); live at the combined session; **release 1** |
| RT-32 | Medium, **blocks release 1** (Wyatt, 2026-11-06) | F08, R08 | 1, fix sessions (combined live, step 2) | A re-pair of a wallet paid above the site's `claimedTop` starts an endless address loop and a false "not from your wallet" warning | fixed 2026-11-06 (spec change 48); live passed 2026-11-07, step 2's rerun, dev release `82ac08d` |
| RT-33 | Low, doesn't block release 1 (Wyatt, 2026-11-06) | R10, T14 | 1, fix sessions (combined live, step 2) | The height floor moves a tip settled before the floor existed to review as "reversed", with an alert | fixed in code 2026-11-06 with RT-34 (spec change 48); unit-tested, its live window has ended |
| RT-34 | Medium, fix in release 1 (Wyatt, 2026-11-06) | R10, T14 | 1, fix sessions (found tracing RT-33, 2026-11-06) | After a height heal, the floor of an invoice with an inflated `createdHeight` follows the site's height, so an honest settled payment turns "reversed" 31 blocks after it's mined | fixed in code 2026-11-06 (spec change 48); unit-tested, not live (Wyatt) |

---

# Pass 1 (phase 07b), round 1 (black box)

Runner for every Host-layer finding: `createPluginRuntimeTestHost()` from `@emdash-cms/plugin-test` (workerd), through `plugin/tests/redteam/harness.ts`, on the dev box, network stagenet (fake addresses). Commit: the one that adds the test (see `git log -- plugin/tests/redteam/`).

## RT-01 — Product-only link and order wording on the admin page for a product invoice already in storage

- **Rows:** T21. **Severity:** Low. **Pass 1, round 1.**
- **What I did:** `plugin/tests/redteam/checkout.test.ts`, "[T21] [RT-01] A0: a product invoice already in storage gets no product link or order wording in release 1". A release-1 build (switch off) with one `kind: "product"` invoice in review (`underpaid`) in storage, then the admin page loaded.
- **What happened:** The review queue shows the invoice with an **Open product** link (to `products/01P`) and the advice "Recommended: expire it, don't fulfil the order, and refund the buyer from your wallet app." The products-filtered "All invoices" table, the "find it under All invoices" hint and the Raise action are absent, as they should be.
- **What the spec says:** catalog A0 and T21: in release 1 "the admin page must show no product-only part … and no row action that only products use".
- **Reach:** release 1 can't create a product invoice (A0's checkout attacks all refused), so a real release-1 install never has one. A database that already holds product invoices does: the dev site's (38 invoices from earlier phases) and any copy of it. Nothing is paid or released; it's admin wording.
- **Evidence:** the failing assertion's page JSON (vitest output, round 1).
- **Status:** open.

## RT-02 — A Kraken reply for a different pair is taken as the price

- **Rows:** T06. **Severity:** Low. **Pass 1, round 1.**
- **What I did:** `checkout.test.ts`, "[T06] [RT-02] A2: a Kraken reply for another pair than the one asked for is not taken as the price". Kraken's `Ticker?pair=XMRUSD` answered with a well-formed result keyed `XXMRZEUR` (`c: ["150.00", …]`), CoinGecko down, then a 5.00 USD tip.
- **What happened:** The tip was priced at 150.00 **USD** from that EUR entry (`rate: { minor: "15000", currency: "USD", source: "api.kraken.com" }`, `expectedAtomic: "33333333334"`).
- **What the spec says:** T06: "a malformed, zero, extreme or failed price response refuses checkout (a fiat tip falls back to an open tip)". A reply for another pair doesn't answer the question asked.
- **Reach:** only Kraken itself (a fixed, allowed host) can send this; a tip's amount only fills the payment link and a tip settles at the floor (spec change 33), so for tips the cost is a wrong suggested amount. It matters more for orders in release 2. Every other poisoned reply tried (zero, negative, `NaN`, `Infinity`, `1e308`, hex, 30 digits, `0.0000001`, HTML, empty, 500, an error list, no result) became an open tip, and CoinGecko's fallback refused the same set.
- **Evidence:** vitest output, round 1 ("wrong pair" was the only case of 21 that converted).
- **Root cause (round 2, white box):** `parseKraken` takes the result's only entry, whatever its key (`plugin/src/rates.ts:42–43`). The fix is to read the entry for the pair asked for (`XXMRZUSD`/`XXMRZEUR`, or the request's `XMRUSD`/`XMREUR` spelling) and refuse anything else.
- **Status:** open.

## RT-03 — A tip note with a lone surrogate is stored as is

- **Rows:** T08, F02. **Severity:** Low. **Pass 1, round 1.**
- **What I did:** `checkout.test.ts`, "[T08][F02] [RT-03] A3: a note with a lone surrogate (text that isn't valid Unicode) is refused or cleaned". Tips with notes `"lone" + U+D800 + "surrogate"` and `"lone" + U+DFFF + "high"` (JSON `\ud800` escapes, which `JSON.parse` accepts).
- **What happened:** Both were accepted and stored with the lone surrogate intact.
- **What the spec says:** "an optional short note, plain text only, length-limited"; T08: "control and format characters out". A lone surrogate isn't text: it can't be encoded as UTF-8, so what any later reader (the database, a log, an export, the admin page's renderer) does with it is undefined, usually a replacement character, sometimes an error.
- **Reach:** anyone who can tip. No markup or script results (Block Kit escapes; A3's markup payloads were stored literally). Also seen, and **not** filed: private-use characters (U+E000) and noncharacters (U+FFFE, U+FFFF) are kept; the spec promises nothing about them, and they render as boxes at worst. Every control, format, bidi, zero-width, tag and separator character tried was removed.
- **Evidence:** vitest output, round 1.
- **Status:** open.

## RT-04 — Concurrent tips are told "no address" while free addresses remain

- **Rows:** T05. **Severity:** Low. **Pass 1, round 1.**
- **What I did:** `checkout.test.ts`, "[T05] [RT-04] A8: 30 concurrent tips with 30 free addresses all get one; none is told there's no address". 30 tip checkouts sent at once (`Promise.all`) to a site with 30 free pool addresses and no other open invoices.
- **What happened:** In the round-1 probe, 12 got an address and 18 got `NO_ADDRESS_AVAILABLE`, with 18 addresses still free afterwards. 50 at once with 30 free: 20 and 30, 10 left free. The next single checkout after each burst succeeded. No address was ever reused, and no claim was left without an invoice (the companion A8 tests pass).
- **What the spec says:** API contracts, "Address claims and limits": the bounded `updateIf` loop "returns `NO_ADDRESS_AVAILABLE` when the loop runs out". The loop is bounded by design, but the code reads as "there is no address" and the tip button then says "Tips can't be taken right now".
- **Reach:** a burst of real tippers, or an attacker's burst landing beside them; the attacker gains nothing beyond the open-invoice cap they could fill anyway. The test host's interleaving may differ from the Node runner's; the live A8 run on the dev site measures the real figure.
- **Evidence:** vitest output, round 1; the live run's figures will be added here.
- **Live, round 2 (Node runner, 2026-10-29):** not reproduced. 30 tips at once with 30 free addresses all got one; 40 at once with 30 free got exactly 30, with 10 `NO_ADDRESS_AVAILABLE` and none left free. No address reused, no orphaned claim (`scripts/redteam/round2-live.mjs a8`, evidence `~/xmr-pay-dev-data/redteam/round2-a8-2026-10-29T025312088Z.txt`). The Node runner serves plugin requests one at a time (RT-12), so the claim loop never races there; the early refusals are the test host's interleaving. The finding stands for a runner that does run requests concurrently (Cloudflare's, release 1.x). Severity unchanged; the fix session decides whether it closes as not reproducible on release 1's platform.
- **Status:** open.

## RT-05 — An IPv6 visitor dodges the per-client cap by changing address inside their /64

- **Rows:** T18, T05. **Severity:** Medium (Wyatt rules). **Pass 1, round 1.**
- **What I did:** `plugin/tests/redteam/ipcap.test.ts`, "[T18][T05] [RT-05] L2: an IPv6 visitor can't dodge the cap by moving to another address in their own /64". With the client IP known (`requestMeta.ip`, as on a site that passes it), five tips from `2001:db8:1:2::1` … `::5`, then one from `2001:db8:1:2:ffff::9`.
- **What happened:** All six were taken. One IPv4 client is held to five open tips (the sixth gets `TOO_MANY_OPEN`), but each IPv6 address gets its own bucket, and an IPv6 customer is normally given at least a /64 (2^64 addresses) by their ISP.
- **What the spec says:** Security model, address-pool exhaustion: per-visitor hashed buckets apply when `requestMeta.ip` is set; "Without client IPs, one spammer can fill the cap". T18: a visitor "can neither dodge nor poison the per-client cap".
- **Reach:** on a site that does pass client IPs, one IPv6 visitor can still fill the site-wide cap (40 open tips per 30 minutes) and block tips until those windows close: the outage the spec states only for sites without client IPs. No money moves and no invoice is marked paid. Also checked, no finding: headers a visitor sets (`X-Forwarded-For`, `CF-Connecting-IP`, `X-Real-IP`, `True-Client-IP`, `Forwarded` and others) never became the client IP in the test host, so no bucket was made from them, and the buckets hold only salted hashes (no IPv4 or IPv6 text in KV, invoices or pool). The dev site's real header handling is in the live L2 run.
- **Evidence:** vitest output, round 1.
- **Status:** open.

## RT-06 — The sync parser accepts unknown fields, duplicate keys and out-of-range numbers behind the signature

- **Rows:** F01. **Severity:** Low. **Pass 1, round 1.**
- **What I did:** `plugin/tests/redteam/sync.test.ts`, the three "[F01] [RT-06]" tests. Signed with the paired key (RFC 8032 test key 1), so only the bridge, or someone holding its key, can send these: (a) an unknown field at the top level and inside a snapshot, a transfer and an address; (b) a transfer repeating `unlockTime` (`"0"` then `"99"`) or `doubleSpendSeen` (`false` then `true`), and a body repeating `v`; (c) `amount` `"18446744073709551616"` (2^64), `amount` `"0500000000"` (leading zero), `unlockTime` 2^64, and a snapshot `index` of 2^32.
- **What happened:** All of (a) were accepted. The two repeated transfer keys were accepted with JSON's last value winning; the repeated `v` was refused only because its last value was 99. All four of (c) were accepted.
- **What the spec says:** F01's pass conditions: "unknown fields, duplicate keys, and amounts that are negative, decimal, exponent or above 2^64−1 are all refused, with no state change". The spec's Transfer fields: the bridge reads `amount` and `unlock_time` as unsigned 64-bit integers.
- **Reach:** none without the bridge key. No payment counted wrongly: the repeated `unlockTime` and `doubleSpendSeen` both landed on their last values, so neither payment counted ("[F01][T11] C3: a repeated key never makes a time-locked or flagged payment count" passes). The risk is a reader that disagrees with `JSON.parse` about which value counts. A 2^64 amount does count as money. Everything else in C3's list of malformed bodies was refused, and nothing changed state: random bytes, invalid and overlong UTF-8, UTF-16, a BOM, truncation, `NaN`, comments, wrong types, negative, decimal, exponent, hex and empty amounts, bad txids, a 33rd transfer, a 101st address, a 201st snapshot, and 120 seeded random bodies signed and unsigned. The 256 KiB limit is exact: 262,144 bytes are read, and 262,145 get EmDash's 413 before the plugin runs. One part may be the matrix's wording rather than the code: refusing unknown fields stops a newer bridge from adding an optional field (spec change 13 added `checks` this way). Wyatt decides whether F01 says "refused" or "ignored" for unknown fields.
- **Evidence:** vitest output, round 1.
- **Status:** open.

## RT-07 — Two pair requests with one code at the same moment both succeed; the loser is told it paired

- **Rows:** T13. **Severity:** Medium (Wyatt rules). **Pass 1, round 1.**
- **What I did:** `sync.test.ts`, "[T13] [RT-07] C6: two pair requests with the same valid code at the same moment: exactly one wins, and its key is the one stored". An unpaired site, one code from Connect wallet host, then two pair bodies with that code at once (`Promise.all`), one naming and signed by test key 1, the other by test key 2.
- **What happened:** In 3 of 3 rounds of the probe, and again in the test, **both** got `{ ok: true, … }`. The second key was stored each time. The first key's next sync got `BAD_SIGNATURE`. The pairing state says `used: true`. The admin page reads only "Wallet host: Paired", with nothing saying another key took over.
- **What the spec says:** the code is "single-use" (Security model, pairing row; T13: "a second use fails"); the plugin "stores the key and burns the code". The attack catalog: "exactly one may win".
- **Reach:** whoever holds a live code (from a screenshot, a shared terminal, shell history; T29) and sends their pair request at the same moment as the real bridge. One-at-a-time, the attacker's pairing either fails or makes the real bridge's pairing fail loudly. In the race, the real bridge is told it paired and the attacker's key is the one kept. That's the stolen-key position (T03: forged settled tips, attacker pool addresses, D2). It shows only later, as the real bridge's syncs being refused. Without a code there's no way in: every guessed, near-miss, expired, used or malformed code was refused, and none burned the real code; a pair body signed by a key other than the one it names was refused, as were all-zero and identity-point keys, short or non-base64 keys, and pair bodies over 4 KiB; 60 seeded hostile bodies sent while a code was active never crashed the route or paired. The dev-site run (the real Node runner) is in the live group.
- **Evidence:** vitest output, round 1.
- **Live, round 2 (Node runner, 2026-10-29):** reproduced in 3 of 3 rounds (`scripts/redteam/round2-live.mjs c6`, evidence `~/xmr-pay-dev-data/redteam/round2-c6-2026-10-29T025321523Z.txt`): both simultaneous pair requests got `ok`, the second key was stored each time, and the first key's next sync got `BAD_SIGNATURE`.
- **Root cause (round 2, white box):** the pairing branch checks the code (`pairingCodeMatches`), then stores the key and marks the code used in two separate writes (`plugin/src/sync/handle.ts:102–107`). Nothing makes check-and-burn one step, so two requests that both check before either burns both win. On the Node runner, the live run shows the two requests do overlap, despite RT-12's one-at-a-time pattern for long requests. The fix needs a burn that only one request can win, for example a conditional write if the storage API offers one, or a per-code lock held across the check and the write.
- **Status:** open.

## Observations, round 1 (no finding)

- **The freshness window's future edge has a second of slack** (T04). The `x-xmr-ts` header is whole seconds and the server reads its clock a few hundred milliseconds after the sender, so a timestamp 301 s ahead was accepted once in round 1 (it landed 300.x s ahead); +301 s and beyond were refused in every later probe, as were −301 s and beyond. The exact edges are tested with a fixed clock in `protocol.test.ts`. The suite now checks ±299 s accepted and ±302 s refused.
- **A refused sync doesn't count as hearing from the bridge** (T03, R13). Unsigned, wrong-key and stale syncs left KV, including `state:bridge`, byte for byte unchanged, so they can't hide the silent-host alert.

## RT-08 — A forged sync adds a pool address a tipper then pays, widening the stated "free goods / fake tip" limit

- **Rows:** T03, P02. **Severity:** High (Wyatt, 2026-10-31; was Medium). **Pass 1, round 1.** Group D (stolen bridge key; `plugin/tests/redteam/stolen-key.test.ts`, "[T03][P02] [RT-08] D2: an address a forged sync adds to the pool is never handed to a tipper to pay").
- **What I did:** holding the paired key, a forged sync added one pool address the attacker chose (index 2). The one honest address (index 1) was then claimed by a checkout, and the next tipper's checkout was handed index 2.
- **What happened:** the second tipper's invoice address was the attacker's. So with the signing key, an attacker doesn't only forge a received tip (D1); they can make a real tipper's payment go to an address the shop's wallet isn't watching.
- **What the spec says:** Security model, "Forged payment events (signing key stolen)": "The result is free goods, not lost funds." The bridge's job includes supplying pool addresses (pool top-up), so a stolen key supplying addresses is within the mechanism — but the stated consequence (free goods / a fake tip shown received) doesn't name "new tips routed to the attacker", and that needs no control of the pay page.
- **Reach:** needs the bridge signing key (the stolen-key position, a stated design limit). Within that, it reaches real tipper money, not only a fake record. The pay-page-control caveat in the spec's wallet-host table (an attacker who controls the site "can show their own address on the pay page") covers a site break-in, not a stolen bridge key on an intact site. This is a report-completeness finding against the T03 wording: the public report must state that a stolen bridge key can route new tips to the attacker, not only mark invoices paid. Scope matches the plan's D2 break condition exactly; no probing beyond D2 (Wyatt, 2026-10-26).
- **Evidence:** vitest output, round 1.
- **Status:** open. For Wyatt: whether this is a wording fix to the report (the mechanism is the stated stolen-key limit) or a change (e.g. the plugin pinning pool addresses it can verify belong to the shop wallet — but the plugin holds no wallet material, so it can't verify an address; this likely stays a documented limit).
- **Live, spec change 46 (2026-11-02, dev site, stagenet, release `37742ab`):** two forged free rows, tagged with the current key as a thief's sync would add them: index 306 (held by the wallet, missing on the site, a made-up address) and `claimedTop` + 100,000. Both were `bad` 512 ms after the write. The honest bridge's next sync carried them in its `check` list, and its report-only sync followed 43 ms later; the worst case is one sync interval, about 15 s. The bridge created nothing for the far row. A checkout at +46 s got 357, neither row. The banner showed until the next pairing. Evidence: `~/xmr-pay-dev-data/46-live-step4*.txt`. RT-08 stays open for Wyatt's ruling.
- **Ruling (Wyatt, 2026-10-31): High.** It's gated only by a stolen bridge key, but the outcome is Critical-class.
  - **Fix sessions:** look for detection (for example the honest bridge checking the site's pool against its own wallet) and fast re-pairing.
  - **If nothing holds,** it becomes an accepted limit with honest wording. Draft for T03, the spec and the public report (spec change 44): "A stolen bridge key can't spend from or read your wallet, but until you re-pair it can send new tips to the thief's wallet, and your Tips page may still show them as received. If tips listed there are missing from your wallet app, re-pair."
- **Plugin side built (2026-11-01, spec change 46, `011f585` and the steps around it):**
  - **Prevention while the honest host runs:** a new free row waits 45 s before hand-out, and the honest bridge checks every free row in that time. Its mismatch report turns the row "bad", so it's never handed out. The D2 `it.fails` is replaced by a passing test of exactly that.
  - **The limit while it's stopped:** nothing reports, so after 45 s the thief's row is handed out. A passing test records it, and the 24-hour window and `not_your_wallet` review list the affected tips once the honest host is back.
  - **Bridge side built (2026-11-01):** the bridge checks each `check` list by digest and reports a mismatch at once, before any catch-up; numbering follows `claimedTop` only, so a thief's free rows can't move the honest bridge.
  - **Still to do:** the live check, then spec change 44's final wording.
- **46's step 5b's unproven case (2026-11-02, `307c104`, `b33fc21`):** a sync the previous key signed just before a same-machine re-pair, arriving just after it, *did* raise "Your previous wallet host is still running" (the test was red).
  - **The site:** the previous key's requests in the first 60 s after a pairing are refused but not recorded. An old host still running is recorded at its first sync after that.
  - **The bridge (Wyatt's rule):** a body built under the old pairing is never sent. A key changed mid-sync drops the body, and a fresh sync follows under the new key. The old pairing's report, answer, re-offer and watch list are dropped at a new key, so a stale "mismatch" can't raise the sticky banner on the new pairing.

## RT-09 — A forged sync adds a pool row duplicating an address already held

- **Rows:** P02. **Severity:** Low. **Pass 1, round 1.** Group D ("[P02] [RT-09] D2b: a forged sync can't add a pool address that duplicates one already held").
- **What I did:** holding the key, a forged sync added a free pool row (index 50) whose address equals the one already in use on the open invoice at index 1.
- **What happened:** the pool then held the same address on two rows (the claimed index 1 and the free index 50).
- **What the spec says:** "Pre-created address pool, one subaddress per invoice, never reused" (decisions); P02: "a duplicate insert fails on the unique `subaddress` index" — that index is on `invoices`, not on `pool`, so the pool itself accepts the duplicate.
- **Reach:** needs the key. No two invoices can still share an address: the unique index on `invoices` holds, so if index 50 is later claimed the insert fails and checkout tries the next free address (the companion D2b test confirms P02 holds at the invoice level). The harm is a corrupted pool row and a wasted address, not a shared payment. Matches the plan's D2 "a duplicate/reused index corrupting the pool is itself a finding".
- **Evidence:** vitest output, round 1.
- **Status:** open.

## Observations, group D (stated limits confirmed, no finding)

- **D1 — forging a settled tip works, and that is the stated limit.** A forged snapshot settles an open tip. For a tip this fulfils nothing: no order, download or email; it records a received amount and counts toward the admin-only per-entry total. That is the tips analogue of "free goods" the spec names.
- **D3 — the lifecycle holds under a forged key.** Dropping a settled tip's transfers moves it to `review (reversed)`, a real lifecycle state, with no counted amount left. A forged "paid in time" snapshot can reopen an expired tip (the stated limit) but never pushes it to a state the lifecycle forbids, and tips never reach `review (late)` (spec change 33).
- **D4 — watch-list manipulation is bounded.** Huge and far-apart indexes (up to 2^32−1) in a forged sync don't crash the route, don't lose the real invoice (it still settles from its own index), and the next sync still returns a bounded watch list.
- **D5 — a forged sync can't change an invoice's terms.** Terms smuggled into a snapshot, a snapshot entry or a transfer (`required: 0`, a new `expectedAtomic`, `minAtomic`, `fiat`, `rate`) left the invoice's locked `required`, expected amount, floor, fiat and rate unchanged. Snapshots carry only transfers.
- **D6 — forged-tip total inflation is bounded (T31).** With the key, a per-entry total can be inflated only through tips that already exist, by the amounts the attacker writes into the snapshot (three real tips forged to 9 XMR each read as 27 XMR on the admin page). It can't invent tips for an entry nobody tipped (a forged settled snapshot for a nonexistent index creates no invoice), nor touch another entry's total. The report states this reach.

## RT-10 — The way-back validator matches its refused prefixes case-sensitively

- **Rows:** T22. **Severity:** Low. **Pass 1, round 1.** Theme (`theme/tests/redteam.test.ts`, "[T22] [RT-10] A9: the refused prefixes are matched case-insensitively …").
- **What I did:** called `safeReturn` (spec change 39's shared validator) with `/PAY/coffer/tok`, `/Pay/Coffer/x`, `/_EMDASH/admin`, `/_Emdash/admin`.
- **What happened:** each is returned unchanged. The refused list (`/pay/coffer`, `/_emdash`) is matched with `startsWith` on the exact lower-case text, so any other casing passes. Lower-case `/pay/coffer…`, `/_emdash…`, their percent-encoded forms (`/pay%2Fcoffer`, `/%5f%65mdash`) and dot-segment forms (`/x/../_emdash`) are all refused.
- **What the spec says:** spec change 39 and decisions: the validator refuses "no `/pay/coffer/` or `/_emdash/`". T22: "refuses … the pay pages and the admin".
- **Reach:** not currently exploitable. Astro and EmDash route paths case-sensitively, so `/PAY/coffer/tok` and `/_EMDASH/admin` resolve to 404, not to the pay page or the admin. A redirect or a back-link to them lands a visitor on a 404 on the same origin, not in a loop and not on the admin. It is an incomplete promised check: the validator means to refuse those areas and does so only for one casing. The fix is a case-insensitive prefix match. Every genuinely dangerous vector held: off-site (`//evil`, `https://evil`, backslashes, `javascript:`, `data:`), CRLF and control characters, over-length, and encoded slashes stay a single same-origin path segment (spec change 39's intended behaviour).
- **Evidence:** vitest output, round 1.
- **Status:** open.

## RT-11 — A sync adds a wrong-network subaddress to the pool (the pre-agreed mixed-network finding)

- **Rows:** T20, P02. **Severity:** High. **Pass 1, round 1.** Group L5 (`plugin/tests/redteam/network.test.ts`, the two "[T20][P02] [RT-11]" tests).
- **Pre-agreed:** Wyatt, 2026-10-26 (`docs/decisions.md`, "A pool that mixes networks is fixed in 07b pass 1"): the attacker files it, a fix session writes the failing [T20] test first, then the fix, before release 1. The failing tests are written here.
- **What I did:** a paired stagenet site (its pool and invoices stagenet, as on the dev site) got a signed sync whose `addresses` carried a **mainnet** subaddress (network byte 42); and a mainnet site got a stagenet one. Both syncs are well-formed.
- **What happened:** the wrong-network address is added to the pool. The protocol parser (`src/sync/protocol.ts`) admits any `addresses` entry whose `subaddressNetwork` is non-null; it never compares the address's network with the site's. So a stagenet pool ends up with a mainnet address (and the reverse).
- **What the spec says:** spec change 36 and T20: "the fallback tip address must match the site's network; a mainnet address in a stagenet site's pool, or the reverse, is refused". Each invoice stores its network, and a sync drops an address whose network can't be read — but not one whose network is readable and wrong.
- **Reach:** a later checkout can claim that pool address, so a tipper on a stagenet site is handed a mainnet address (or the reverse). The shop's wallet watches only its own network, so it never sees the payment: the tip is lost to an address the shop can't spend from. On a real install this needs the bridge to send a wrong-network address, which the bridge (one wallet, one network) shouldn't do on its own; combined with RT-08 (a stolen key pushing attacker addresses), it lets the attacker's addresses be any network. Severity High: a tip can be recorded against an address the shop can't see, i.e. paid to nowhere the shop controls. Wyatt rules.
- **Also checked, holds:** an address whose network byte isn't any Monero subaddress byte is still dropped (the existing guard).
- **Evidence:** vitest output, round 1.
- **Status:** **fixed 2026-10-31** (spec change 45, fix session on `redteam-1`).
  - **The fix:** the site's network is stored with the paired key's ID, set by the first readable address that key's bridge sends. A sync drops an address on another network, and checkout skips a free row on another network (claimed with no invoice). The admin page's Health shows "Paired · stagenet" (or "network not known yet").
  - **Tests:** the two "[T20][P02] [RT-11] L5" tests are ordinary passing tests now; more in handle ("one network per pairing"), claim and repair.

## RT-12 — One expensive plugin request blocks all others on the Node runner for the full 30 s wall

- **Rows:** T01, R11. **Severity:** Medium (Wyatt rules; likely a Known/Accepted limit with a docs line). **Pass 1, round 1.** Group G2, the sandbox canary on the dev site (`spikes/sandbox-canary`, probe `spin`; `scripts/redteam/canary.mjs --spin 60`; evidence `~/xmr-pay-dev-data/redteam/canary-2026-10-26T185517885Z.txt`).
- **What I did:** a canary route span the CPU for 60 s while a Coffer `status` request was sent alongside it.
- **What happened:** the spin was stopped at **30045 ms** (the 30 s wall limit is enforced — good), but the concurrent `status` request did not answer until **30033 ms**, i.e. it was blocked for the whole wall period and only completed once the spin was killed. So requests into the plugin sandbox are served one at a time: one expensive request makes the plugin's routes unresponsive to everyone for up to 30 s.
- **What the spec says:** "What the sandbox does and does not guarantee": "on the Node runner only the 30-second wall limit is enforced, not CPU or memory." The 30 s cap holds. The spec does not state that one in-flight request blocks all others site-wide for that period.
- **Reach:** to spin on purpose needs a second, hostile plugin installed (Coffer ships no spin route and every Coffer route measured finishes well under 30 s — see H1). The measured fact that matters for Coffer is the serialization: a single slow Coffer request (a large sync, a big admin page) delays concurrent checkouts and status polls by its own duration, up to 30 s. This sets the real ceiling for the H2 flood number and the install-doc rate-limit guidance, and is the mechanism behind the pool-exhaustion outage the spec already states. It's within the sandbox's stated "no CPU cap on Node" limit, so it's likely a Known limit to name in the docs rather than a code change; Wyatt rules.
- **Also confirmed at G1 (no finding):** network isolation holds — a raw `fetch()` is blocked (403), and `ctx.http` to another host, through user-info, or to an `api.kraken.com.localhost` suffix is refused by the host check; `process`, `node:fs`, `ctx.content.create`, another plugin's storage/KV/settings are all refused. The exposed `ctx.media`/`ctx.taxonomies` **write** methods are gated at the call: `createTerm` under `content:read` returned `Missing capability: taxonomies:write`, so no write landed (one-write limit respected, nothing to report upstream for the write case).
- **Status:** open.

## Observation, group G (for Wyatt, possible upstream report)

- **Plain HTTP to an allowed host is accepted** (canary `http-plain-allowed-host`): `ctx.http.fetch("http://api.kraken.com/0/public/Time")` returned HTTP 200. EmDash's `allowedHosts` check is by host, not scheme, so a compromised plugin could reach an allowed host over plain http (MITM-able). Coffer's own code always builds `https://` URLs for the two price APIs, so Coffer as shipped isn't exploitable here; the gap is in EmDash's sandbox enforcement (the T01 "network limited to declared hosts" mitigation doesn't pin the scheme). Per the brief, this is an EmDash matter for Wyatt to report upstream, not a Coffer code change; recorded, not filed as a Coffer finding.

## RT-13 — A slow request body isn't bounded by the 30 s wall; a connection can be held open past it

- **Rows:** F01. **Severity:** Low. **Pass 1, round 1.** Group C5, live on the dev site (`scripts/redteam/round1-live.mjs`, "C5: the drip request ends at or before the 30 s wall").
- **What I did:** POSTed to `bridge/sync` with a request body that dripped one byte a second from a `ReadableStream` (duplex upload), while polling `status` alongside it.
- **What happened:** the request stayed open for the full ~41 s the test dripped (the 41 s is the test's own cap; the server imposed no limit before that), then the handler ran and returned `BAD_SIGNATURE`. So the 30 s plugin wall limit does not bound the time spent reading a slow request body: a client can hold a connection open well past 30 s. Important mitigation: the site stayed fully responsive throughout — `status` answered in at most 13 ms over eight polls during the drip — so a single slow body does **not** block other requests (unlike the CPU spin of RT-12, which serializes behind the event loop).
- **What the spec says:** the 30 s wall is the plugin handler's limit ("wall-time limit of 30000ms"), measured once the handler runs; EmDash reads the body before invoking the handler, so upload time isn't covered. `bridge/sync` enforces the 256 KiB `maxBytes` cap (a body one byte over gets 413), but there is no time bound on the upload.
- **Reach:** a slowloris — many slow-drip connections could tie up sockets or memory on the site's host. One connection is harmless and the event loop isn't blocked. This is normally handled at the reverse proxy or platform layer (Cloudflare, nginx), which the install docs already lean on for the checkout rate limit; the docs should name slow-connection limits in the same place. Not specific to Coffer's code (any EmDash public route reads its body the same way), so largely platform/proxy territory. Recorded as Low.
- **Also live, passed (no finding):** A6/F06 — a spoofed `Host`, `X-Forwarded-Host` and `X-Forwarded-Proto` on `checkout` and `status` are never reflected in any URL the plugin builds (no `evil.example` in the responses). Live L2 — eight tips from one spoofed `X-Forwarded-For`/`CF-Connecting-IP` all succeeded and **no** `state:buckets` row was written, so on a Node site with no trusted-proxy config the per-client cap never engages and a visitor's headers can't create or poison a bucket (only the site-wide open-invoice cap applies, exactly as the spec states). C4 (proxy-added `Origin`/`Authorization` on a signed sync) is covered live by `dev-e2e.mjs`: a cross-origin `Origin` gets 403 `CSRF_REJECTED` and an invalid `Authorization: Bearer` gets 401, before the plugin runs, paired or not.
- **Status:** open.

## Observation, group H2 (no finding)

- **The dev site sustained a capped status flood without an outage.** Up to 50 concurrent and 300 requests in a burst, `status` for an unknown token was served at roughly 250–320 requests/second with no memory pressure (`MemAvailable` stayed above 4 GB) and the site never stopped answering. A precise "rate it falls over" wasn't reached inside the brief's 50-concurrent cap. This is consistent with RT-12: the real protection is a rate limit at the proxy, which the install docs already call for. (The quick flood script's success-count classification was buggy; the throughput and no-outage result are what's recorded, not a pass/fail count. A clean H2, and H1's large-backlog sync timing, are left for a run with Wyatt.)

## RT-14 — The admin handler settles or expires an open tip the release-1 page offers no action for

- **Rows:** F04. **Severity:** Low (admin-only). **Pass 1, round 1.** Group B2, Host layer: `plugin/tests/redteam/admin.test.ts`, "[F04] [RT-14] B2: a forged Mark settled or Expire on an open tip, which the page doesn't offer, is refused" (`it.fails`).
- **What I did:** on a release-1 build I opened a tip through `checkout` (status `new`, not in review). The admin page shows no button or menu for it. I then sent the review queue's own action, `invoice_action`, with `settle:<id>` for one fresh open tip and `expire:<id>` for another.
- **What happened:** both got a success toast. The first tip was stored as `settled` and the second as `expired`, both final, even though nobody paid the settled one and the page offered neither action. In the same suite the handler correctly refuses actions the page doesn't offer in other states: a settled tip can't be expired, re-settled or raised, and a decided invoice can't be acted on again.
- **What the spec says:** F04 says row actions on unknown invoices, or with out-of-range values, are refused. Release 1 shows tips no per-invoice actions outside the review queue (spec change 22 keeps the product-only "All invoices" table and its menu out of release 1), so a tip action outside review is a value the page never hands out. The handler seems to follow the goods build's menu rules (Mark settled and Expire on an open invoice) whatever the build.
- **Reach:** only a signed-in admin can send it. B1 checks that no one else gets through. The effect stays in the admin's own records: a tip nobody paid shown as settled (the tip totals add only what was received, so they show 0 XMR for it), or an open tip closed before its time. No money moves, and no one outside the admin is affected. Recorded so the release-1 handler matches what the release-1 page offers.
- **Also in B2 (passed, no finding):**
  - About 45 forged, look-alike, oversized (1 MB) and wrong-typed invoice values were refused, and so were 14 action IDs, including `__proto__`, `constructor`, `toString` and `then`. In every case the review item didn't change.
  - Four settle and expire actions raced on one review item: exactly one won, and the stored state is the winner's.
  - Forged `raise` values carrying numbers (0, −1, `1e3`, `NaN`, 20 digits) never lowered `required`.
  - Saving a faster speed didn't lower `required` on an open tip (T07). Out-of-range settings values were refused.
  - Extra settings fields (`bridgePublicKey`, `required`, `minAtomic`, `poolTarget`, `__proto__`) didn't set anything.
  - After 200 Connect presses in a row there was still one pairing record, and only the newest code paired. When 20 presses came at once, at most one code paired (T13).
  - Hostile review-paging cursors still render a page.
  - Pressing Get a test address 30 times claims at most one address.
  - Text after `|` in an action value acts only on the named invoice: it's the goods build's page position, not a second ID.
  - Observation (T30): when an admin marks a reversed tip settled, the tip totals stay at 0 XMR, because its payment is no longer reported.
- **Status:** open.

## RT-15 — At a spam-cap-sized backlog each sync's watch scan takes ~28 s, within ~2 s of the 30 s wall

- **Rows:** R11, R13. **Severity:** Medium (Wyatt rules). **Pass 1, round 1.** Group H1/L7, live on the dev site: `scripts/redteam/backlog-live.mjs` (`seed --count 20100`, then `run`). Evidence `~/xmr-pay-dev-data/redteam/h1-2026-10-26T195804512Z.txt`.
- **What I did:** seeded 20,100 settled stagenet tips (each a watch candidate: one shallow transfer, 3 confirmations) plus one open probe, for ~20,139 invoice rows, then paired a fresh in-memory key and ran signed syncs, timing each. The dev site was in `astro dev`; `data.db` was backed up first and restored to baseline (38 invoices, 338 pool) afterward.
- **What happened:** every sync that returns a `watch` (which is every sync, including the empty-body pairing sync) took **~28 s**: pair 27.7 s, first backlog sync 27.9 s, the sync under the L7 flood 28.6 s. All three finished under the 30 s wall, but by less than ~2.1 s. The watch was bounded at **20,001** entries out of ~20,103 candidates (102 dropped), so the 200-page cap truncates the watch, and the admin Health banner fired: *"The watch list hit its safety cap — At 20:00 UTC, more recent invoices existed than Coffer reads in one sync (20,000), so some may not be checked for late payments…"* (R13 holds). A payment to a watched invoice settled exactly once, and a repeat sync didn't double-count.
- **What the spec says:** spec change 35, condition 2 sized the cap to "the most the spam cap allows (40 open invoices per 30 minutes, kept 8 days for tips: about 15,400 rows; cap 200 pages)" and estimated **"about 0.2 s a sync at 15,000 invoices (session 7a)."** R11's claim is that with thousands of open and expired invoices each sync finishes inside the 30 s wall and the backlog drains. The live measurement at 20,100 is ~28 s — about 140× the spec's estimate — leaving thin headroom under the wall.
- **Reach:** the backlog is reachable by an anonymous attacker within the spec's own limits — a flood of unpaid checkouts, bounded by the 40-open cap and the 8-day tip retention, is exactly the ~15,400 rows the cap was sized for (the Health banner even names "a flood of unpaid checkouts" as the usual cause). If the scan ever crosses 30 s — a modestly larger backlog, a busier or slower host, or contention — the sync hits the wall, fails, and settlement stalls for every invoice until the backlog is purged. So the measured headroom is the real safety margin, and it is small.
- **Caveats / likely cause:** measured in `astro dev` (dev mode, unoptimized) on the 8 GB dev box with this script's Node process running alongside; the built copy (workerd, port 4322) should be measured before the production number is trusted — left for round 2 or a run with Wyatt. The cost is likely dominated by building and bounds-checking a ~20,000-entry `watch` response (EmDash's `validateResponseBounds` counts every node) as much as by the storage paging; worth the builder's attention when sizing a fix.
- **Not truly exercised:** the past-cap probe (the highest index) landed *inside* the 20,001-entry watch, so the "a payment to an invoice past the cap waits for the backlog to drain" path wasn't produced — the 102 dropped candidates were others. What's proven is the cap bounds the watch, the Health warning fires, and the per-sync cost. A follow-up could force the probe past the cap to confirm the late-payment behaviour there.
- **Also in this run (passed, no finding):** L7 — during a 28.6 s sync the site kept answering: 35 of 40 capped checkouts (≤20 in flight) got an address, the slowest in 2.1 s (the 5 refusals are the site-wide 40-open cap, expected), so the async storage paging doesn't block the event loop the way the synchronous CPU spin of RT-12 did.
- **Round 2, the built copy (2026-10-30, Step 5):** the same run against the production build (Node, `node ./dist/server/entry.mjs` on loopback port 4322), with the probe made a *past-cap* case (`seed --count 20100 --past-cap`: an expired tip inside its late window, written last). Evidence: `~/xmr-pay-dev-data/redteam/h1-2026-10-30T213904728Z.txt`.
  - **Timing, no better than dev mode:**
    - pairing sync 27.4 s;
    - first backlog sync 27.1 s;
    - 40 drain syncs at 27.0–27.5 s (slowest 27,540 ms).

    The margin under the 30 s wall is still about 2.5 s, so the round 1 caveat ("measured in dev mode") no longer softens this finding.
  - **L7 holds:** during a 27.3 s sync, 40 of 40 checkouts got an address, the slowest in 2.0 s.
  - **The cap drops the newest invoices first.**
    - **Why:** the watch scans query with no order, and EmDash's plugin storage then reads oldest first, by `(created_at, id)` (`emdash/dist/context-ErV7UdQY.mjs:555–600`). So a truncated scan keeps the oldest 20,000 rows and drops the most recent.
    - **What the probe showed:** the expired tip written last was not in the 19,983-entry watch, and stayed out through all 40 drain syncs (the watch shrank to 15,983 as the seeded tips were reported 10 deep). The cap counts rows *scanned*, and those rows stay in the tips' 8-day lookback.
    - **Consequence:** in a real flood, the invoices made after the flood are the ones whose late payments go unreported. A tip's watch (7 days plus 24 hours) can end before the flood's rows age out of the lookback (8 days), so such a tip may never be checked. The Health warning still names this ("more recent invoices existed than Coffer reads in one sync"); the built copy has no dev sign-in, so the warning wasn't read this time.
  - **For the fix session:** ordering the scans newest first, or scanning open and recently final invoices before the long tip lookback, would keep the cap from dropping exactly the invoices most likely to be paid late.
- **Status:** open.

## Round 1, Manual layer: A3 and B1 (Wyatt, 2026-10-29 UTC)

Round 1's scripted A3 and B1 runs were stopped by a safety classifier and not retried (`docs/progress.md`, 2026-10-26). Wyatt ran both by hand on the dev site (`astro dev`, EmDash 1.3.1) and recorded the results in a local note; this is that evidence, at the Manual layer.

**A3 — hostile tip notes on the admin page (T08): PASS.** Tips to the Welcome post through the tip button, then viewed as admin under Monero payments → Tips. Each note rendered as plain text:

| Time (UTC) | Note | Result |
| --- | --- | --- |
| 01:00 | `<script>alert(1)</script>` | Plain text, no popup |
| 01:09 | `<img src=x onerror=alert(1)>` | Plain text, no popup |
| 01:11 | A long run of emoji | One line, layout intact; some glyphs are boxes (font fallback) |
| 01:12 | Zalgo text (stacked combining marks) | Plain text; the marks spill above and below the note's line → **RT-18** |
| 01:22 | `javascript:alert(1)` | Plain text, not a link |
| 01:24 | A right-to-left override (U+202E) followed by text | Reversed in the tip form's text box, in normal order in the Tips list: the override had no effect (round 1's Host test shows the note cleaner removes bidi characters) |

These seven tip invoices (01:00 to 01:24; the 01:22 and 01:24 ones were still confirming when the note was written) and the pool addresses they used stay in the dev database as A3's evidence.

**B1 — a signed-in non-admin calling `admin` (F04): PASS.** Wyatt invited a test user with the Subscriber role and signed in with a passkey in a private window.
- Opening Plugins → Monero payments: EmDash's "Plugin Error" banner, `403 FORBIDDEN` "Insufficient permissions". No Coffer data was shown.
- The dashboard showed Coffer's widget with no data in it; nothing past that was reachable.
- The test user and its passkey were removed afterwards.

The anonymous and missing-`X-EmDash-Request` cases are covered live by `dev-e2e.mjs` (401 and 403, before the plugin runs; round 1 live stretch).

## RT-16 — Coffer's sidebar link and dashboard widget show to roles that can't use them

- **Rows:** F04. **Severity:** Low. **Pass 1, round 1, Manual layer** (Wyatt, B1 above).
- **What happened:** signed in as a Subscriber, the sidebar still lists Plugins → Monero payments, and opening it gives the 403 banner (RT-17). The dashboard shows Coffer's "Monero Payments" widget, with no data in it.
- **What should happen:** F04's refusal holds (no data reached the Subscriber), but the admin shouldn't offer a page or a widget a role can't open: it reads as broken, and it tells every signed-in user that the site takes Monero.
- **Cause, confirmed (round 2):** EmDash 1.3.1's types have no role or permission field: an admin page is `path`, `label`, `icon`, `group`, and a widget is `id`, `size`, `title` (`emdash/dist/types-mQGTpP-4.d.mts:1476–1494`). EmDash's admin shell decides who sees them, so it's for Wyatt to report upstream, not a Coffer fix.
- **Evidence:** Wyatt's manual note, 2026-10-29 UTC (local, `~/xmr-pay-dev-data/notes/`).
- **Status:** open.

## RT-17 — A non-admin's refusal shows raw JSON in the "Plugin Error" banner

- **Rows:** F04. **Severity:** Low. **Pass 1, round 1, Manual layer** (Wyatt, B1 above).
- **What happened:** the Subscriber's refusal appears as EmDash's "Plugin Error" banner with the raw JSON error (`403 FORBIDDEN`, "Insufficient permissions").
- **What should happen:** a plain sentence that the page is for administrators. The refusal itself is correct.
- **Cause, confirmed (round 2):** EmDash refuses the private `admin` route (`apiError("FORBIDDEN", "Insufficient permissions", 403)`, `emdash/dist/authorize-CoDsRRp5.mjs`) before Coffer's handler runs. EmDash's admin UI then shows any non-OK reply as "Plugin responded with {status}: {raw body}" inside its "Plugin Error" banner (`@emdash-cms/admin` 1.3.1, `dist/index.js:60977–60987`). Coffer never sees the request, so this is upstream, for Wyatt to report.
- **Evidence:** Wyatt's manual note, 2026-10-29 UTC.
- **Status:** open.

## RT-18 — A tip note's stacked combining marks spill above and below its line on the admin page

- **Rows:** T08. **Severity:** Low. **Pass 1, round 1, Manual layer** (Wyatt, A3 above).
- **What happened:** a Zalgo note (letters carrying long stacks of combining marks) is stored and shown as plain text, but the marks draw above and below the note's line and over the rows next to it on Monero payments → Tips.
- **What should happen:** T08: notes "render escaped in Block Kit", which they do; the spec's "plain text only, length-limited" note shouldn't be able to deface the page around it. No markup or script results.
- **Fix options (fix session decides):** Coffer's note cleaner could cap combining marks per base character (the note is already limited to 140 characters and stripped of control and format characters); Wyatt suggested clipping the note's line, which Block Kit may not allow.
- **Evidence:** Wyatt's manual note, 2026-10-29 UTC.
- **Status:** open.

---

# Pass 1 (phase 07b), round 2 (white box)

Fresh attacker session, 2026-10-28 (local) / 2026-10-29 UTC. Order (Wyatt): the live block with the real stagenet payments, then `coffer-test`, then the plugin and bridge source. The dev site's baseline for this round is the backup `~/xmr-pay-dev-data/redteam/round2-k.db` (45 invoices, 345 pool rows, 8 KV rows, the bridge key); the setup session's 38/338 is out of date (Wyatt's A3 tips).

## Pass 1, round 2: summary (closed 2026-10-31)

**Findings this round:** 10. They are 3 Medium (RT-20, which **blocks release 1**, RT-26 and RT-27, all ruled by Wyatt) and 7 Low (RT-19, RT-21 to RT-25, RT-28).

**After both rounds:** 28 findings, 27 open and RT-28 fixed (2026-10-31). RT-29 (Medium) was found afterwards, in fix planning, and makes 29. **Fix sessions:** RT-11 and RT-29 fixed on 2026-10-31 (spec change 45), so 29 findings, 26 open. The 28: 2 High (RT-11, and RT-08, raised from Medium by Wyatt on 2026-10-31), 7 Medium (RT-05, 07, 12, 15, 20, 26, 27) and 19 Low. The summary table at the top lists all 28.

**Observations (no finding):**
- Cloudflare's injected analytics beacon is blocked by Coffer's CSP.
- What the cross-check's second nodes learn (new row P05).
- `moneroaddr` doesn't check the address checksum.
- RT-15's cap drops the newest invoices first.
- EmDash 1.3.1's own npm tree carries a critical and several high advisories (F5).
- T25's edges: `0.0.0.0` and IPv4-mapped IPv6 aren't on the loopback list, and a saved address with a path counts as unusable.

**What ran:**
- Real stagenet payments (K, A13).
- The data-at-rest scan (I1) and the log and transcript scan (I2).
- Live A8, C6 and J1 on the Node runner.
- F1 and F4 on `coffer-test`.
- The plugin white box (Step 2) and the bridge white box with 10-minute fuzz runs (Step 3).
- RT-15 on the built copy (Step 5).
- The dependency checks (F5).
- T24 and T25 spot-checks.

**New matrix row:** F08. **Now Covered:** T27, and T10 and T29 for pass 1.

**Not covered: tips scope.** Pass 2 runs after release 1 ships, so each of these has a home before release 1:

| Gap | Rows | Home |
| --- | --- | --- |
| Both nodes lying, both unreachable, a reordered block (round 1's `TestLiarHarness` and the cross-check tests cover one liar) | T14, R09 | RT-26's fix session, which works on the same chain-height path, adds them as tests |
| The wallet-rpc downgrade case | T26 | Round 3, after the fix sessions and before phase 09 |
| `07b-i2.sh` blind spots: subfolders not searched, an unreadable source reported as PASS | T29 | Fix the script and rerun I2 in round 3 |
| T19 L3 checkout tests hit the 30 s vitest wall once in a full run (passes alone and on re-run) | T19 | RT-12's fix session (the same 30 s wall), or a test-only fix there |
| The tip button through a real proxy that ends https | T17 (RT-20) | Phase 09, already listed |
| govulncheck and `pnpm audit` in CI; where release 1's bridge is built, and with which Go | T28 (RT-28) | Wyatt decides the build location and `pnpm audit`'s scope and level. Then a fix session adds CI, and phase 09 reruns both on the release artifacts just before publishing |
| Spec change 42 (EmDash 1.2+ site URL), and sites under an Astro `base` | T25 | Wyatt's decision on spec change 42; the `base` case, if supported at all, in round 3 |
| Retest of every fix (each `it.fails` and `t.Skip` flipped) | all open RT | Each fix session, then round 3 as a whole |

**Not covered: orders scope** (release 2, pass 2):
- product checkout live (A0 is only checked as refused in release 1);
- late and short orders live (R03, R04);
- Strict confirmations for large orders (T14);
- the goods switch on a live site;
- product-only admin wording beyond RT-01.

## Real stagenet payments (group K, A13), 2026-10-29 UTC: all as the spec says

Dev site in `astro dev` (EmDash 1.3.1), the dev box's installed bridge, stagenet. Wyatt sent every payment from his Feather buyer wallet; times are his, converted from MDT. Invoices made with `scripts/dev-invoices.mjs`; the watcher's log is `~/xmr-pay-dev-data/3h-watch.txt`. Each tip needed 2 confirmations.

| Attack | Rows | Invoice | What was done | Result |
| --- | --- | --- | --- | --- |
| K1 | R01 | #296 | Open tip, paid 0.001 at 02:02 | Seen 02:02:42, settled, counted once. PASS |
| K2 | R02 | #297 | Open tip, never paid | Expired at 02:22:21 (window 02:22:10, on evidence: the bridge's height and clock past the deadline); never settles. PASS |
| K3 | R03 | #298 | Open tip, paid 0.001 at 02:28, after it expired at 02:22 | Reopened (`reopened: true`) to confirming, then settled: a tip is never late (spec change 33). PASS |
| K4 | R03 | #287 | 0.0002 at 02:25 to a tip that expired on 2026-10-26 with nothing ever reported, whose address had been reported empty for about 3 days past its window | No change to the invoice (no transfer, same `seq`): its address left the watch under spec change 33's 24-hour untouched rule. Stated limit: the money is in the shop wallet, Coffer doesn't record it. PASS (Accepted limit) |
| K5 | R01, T07 | #303, #304 | One transaction (`c01bb2fd61ab…`) paying both, 0.001 each, at 02:30 | Both settled, each counted once, sharing the txid. PASS. (A first attempt, #299 and #300, went as two transactions in one block; both settled.) |
| K6 | R04 | #301 | Fixed amount 0.002, paid 0.0015 at 02:03 | Settled with 0.0015 received; never `underpaid` (spec change 33). PASS |
| K7 | R04 | #302 | Fixed amount 0.001, paid 0.0015 at 02:18 | Settled with 0.0015 received (the status route reports `receivedAtomic` 0.0015; tips record no overpayment field). PASS |
| A13 | R06, R12, T05 | #305 | Wyatt stopped `xmr-bridge`; after 340 s of silence a tip was made (accepted, at the last height heard), paid 0.001 at 02:47; the bridge started again | Seen 02:48:47, settled 02:51:06 at 2 confirmations, one transfer, counted once. PASS |

## I1 — data at rest after the payments and a pairing code: PASS

`scripts/with-shop-env.sh node scripts/redteam/scan-at-rest.mjs` over a `VACUUM INTO` copy, the live `-wal` and 8,447 lines of the dev site's log, with four pairing codes as needles (an unused one issued for the run through `dev-e2e.mjs --issue-code`, and the codes from the 3i and 3j real pairings and the Cloudflare spike). The view key in six encodings, all four codes, and IP-shaped text in Coffer's 419 rows and settings: none found (`~/xmr-pay-dev-data/redteam/scan-at-rest-2026-10-29T025141034Z.txt`). Rows P01, T02, T13, P03.

## Live A8, C6 and J1 on the Node runner

`scripts/redteam/round2-live.mjs` (commit `394169b`), each run on a cleared site, then `data.db` restored from the post-payment backup (`round2-post-k.db`) and compared row for row; the dev box's bridge synced again with its own key afterwards.
- **A8 (T05, P02):** see RT-04's live note. No reuse, no orphaned claim.
- **C6 (T13):** RT-07 reproduced live, 3 of 3.
- **J1 (R05): PASS.** A signed sync settling 35 invoices (32 transfers each, 222,769 bytes) was cut by SIGKILL on the dev site 153 ms in: 21 invoices were saved, 14 not, and no invoice held a partial transfer list. After a restart the same body (same `seq`), freshly signed as the bridge's retry would be, settled the other 14; each payment counted once, and a second retry changed nothing (`round2-j1-2026-10-29T025356584Z.txt`).

## I2 — secrets in the wallet host's logs and transcripts (dev box install): PASS

Wyatt ran `~/xmr-pay-dev-data/07b-i2.sh` (outside the repo) on the dev box on 2026-10-30 at 15:03 UTC, through `scripts/with-shop-env.sh`, with `sudo` inside for the root-only sources. The view key came only from the environment and the wallet-rpc login's shape from its known prefix; each needle reached `grep` on stdin, so the output holds only PASS/FAIL lines and counts. Rows T29, T02.
- **Control:** the shop address was found in `/etc/xmr-bridge/config` (1 line), so the search works on these files.
- **Searched:** the `xmr-bridge` journal (40,941 lines), `/etc/xmr-bridge/config`, `admin-binary.sha256`, `/var/lib/xmr-bridge/log/install.log` and `wallet-rpc.log`, and 9 saved install and uninstall transcripts in `~/xmr-pay-dev-data/`. Needles: the view key in hex, base64 and base64url, the login's `xmr-bridge:` + 43-character shape, and `rpc-login`. **0 matches in every source; 0 failures.** wallet-rpc's login file is gone after start-up (`supervise.go` deletes it).
- **Limits of this run (Wyatt's review):**
  - The script hides `grep`'s errors, so an unreadable source would print PASS "of 0" instead of "not checked". None did here: every source reported a non-zero line count.
  - It skips transcripts in subfolders such as `05-setup/`.
  - `3g-reinstall-output.txt` is checked twice.
  - The transcripts are 1–2 lines each, so the journal and the bridge's own logs carry the result.
  - A bare wallet-rpc password without its user name isn't matched; Go `TestNeverPrinted` covers that path.
  
  The three script fixes are on pass 2's list (`docs/progress.md`).

## RT-19 — The installer checks the pairing code last, so an expired code fails only after the keys are typed and wallet-rpc is downloaded

- **Rows:** T13 (the expiry itself held: an expired code was refused). The finding is about the admin budget, not a security claim. **Severity:** Low. **Pass 1, round 2, Install layer** (Wyatt on `coffer-test`, 2026-10-30).
- **What happened:** the first F1 install on `coffer-test` used a code issued at 16:29:40 UTC, valid until 16:44:40. Wyatt did the Feather checks and answered the prompts. The installer took the address, the view key and the node, wrote its files, downloaded and checked wallet-rpc, and only then stopped at pairing with `NOT_PAIRED` ("used or expired, or mistyped"). On the site the code was still stored unused, past its expiry, and no bridge key had been saved.
- **Why:** `install.go` checks only the code's format before the prompts (`codeRE`, line 175). Its validity is first tested by `st.Pair` (line 327), after the keys, the node, the machine changes (lines 269–313) and the 85 MB download (line 316).
- **What should happen:** an admin with a stale code finds out before typing keys. Phase 05's run A attempt 1 taught the same lesson for the same-machine check, now done before the key prompts (`install.go:177–179`). The 15-minute clock starts when the admin presses Connect, not when they reach the wallet host, so preparing the wallet app first can use it up.
- **Recovery today:** the message says to press Connect wallet host for a new code and run the installer again. A re-run asks for the address and view key again; the download is skipped (`installed.json`). So it costs the admin a second round of typing their keys and time against the 15-minute budget, no lost money.
- **Fix ideas for the fix session (each touches the spec, so Wyatt decides):**
  - check the code with the site before the prompts without using it up. This needs a non-consuming check, a change to how `bridge/sync`'s pairing case behaves;
  - pair first, right after the format check, using the bridge key the installer generates anyway. The site would then show a host that is still starting (spec change 29) until the wallet exists;
  - or keep the order and make the failure cheaper: say up front that the code lasts 15 minutes from the button press.
- **Evidence:** Wyatt's report, 2026-10-30. The site's `state:pairing` row (unused, `expiresAt` 16:44:40 UTC) was read read-only on the dev box. `coffer-test`'s `install.log`, copied off before the rollback: the install started at 16:42:06 UTC, 12 min 26 s after the code was issued, leaving it 2 min 34 s; the log then shows the address, view-key and node prompts (each `[answered]`, never the answer), the download and signature check, "Pairing with…" and the `NOT_PAIRED` stop. It has one timestamp, at the start, so it doesn't say when pairing ran. The void F1 run that followed found the binaries, `installed.json`, wallet-rpc and the config in place but no systemd unit and the service inactive.
- **A second attempt, same cause (2026-10-30):** after the rollback, the expired code's file was used again by mistake. The install again ran through the prompts and the download, then stopped with `PAIRING_REJECTED` instead of `NOT_PAIRED`. The difference is whether *any* code was active when the request arrived, not anything about the code sent (`plugin/src/sync/handle.ts:90–117`): the plugin reads a `pair` field only while a code is active. The first attempt reached pairing after its own code had expired, with no code active and no key stored, so the request fell through to the stored-key check and got `NOT_PAIRED`. The second reached pairing after a new code had been issued (18:25:55 UTC), so the plugin compared the old code with the new one's hash and answered `PAIRING_REJECTED`. The bridge gives both the same message (`bridge/internal/pairing/pairing.go:44–46`). This attempt's `install.log` was lost when `coffer-test` was rolled back before it was copied off, and the built copy logs no plugin requests, so its timing rests on the site side alone: from 16:44:40 to 18:25:55 no code was active, so a `PAIRING_REJECTED` (rather than `NOT_PAIRED`) means the request arrived after 18:25:55. The rejected request wrote nothing: there is no attempt counter or cooldown, the new code stayed unused with its expiry unchanged, and no key was stored (checked read-only on the dev box). Side note for the fix session: the comment on `pairingCodeMatches` (`plugin/src/sync/pairing.ts:33`) says wrong, expired and used codes all fail as `PAIRING_REJECTED`. That holds for the function, but at the route an expired or used code gets `NOT_PAIRED` or `BAD_SIGNATURE`, so an unsigned caller can tell whether a code is active right now. With a 128-bit code that tells them nothing useful, and the spec only says a `pair` with no active code is rejected (spec.md, `bridge/sync`), so it's an observation, not a finding.
- **Status:** open.

## RT-20 — Behind a proxy that ends https, the tip endpoint refuses every visitor's tip as cross-site

- **Rows:** T17. **Severity:** Medium (Wyatt ruled, 2026-10-30). The severity table has no row for an outage nobody causes on purpose; this one stops every tip on a common way of hosting a Node site, at least as bad as Medium's "checkout outage". **Blocks release 1** (Wyatt): tips are release 1's only feature, and most Node sites sit behind a proxy that ends https. **Pass 1, round 2**, found live by Wyatt on 2026-10-30 during F1 on `coffer-test`. Theme (`theme/tests/redteam.test.ts`, "[T17] [RT-20] a post from the site's own https page reaches checkout when the site itself sees plain http").
- **What happened:** Wyatt pressed the tip button on `https://dev.wyattdilley.com/posts/welcome`, and the endpoint answered 403, "This tip didn't come from this site's own page." The site is the built copy (Node, `node ./dist/server/entry.mjs`) behind a Cloudflare tunnel. The browser speaks https to Cloudflare, and the tunnel forwards plain http to the dev box.
- **Why:** `crossSite` (`theme/src/tip.ts:49–57`) refuses an `Origin` whose host *or protocol* differs from the request's own URL. On Node, Astro takes that URL's protocol from the socket, which is plain http, and ignores `X-Forwarded-Proto` unless the site sets `security.allowedDomains` (Astro 7.3.5, `astro/dist/core/app/node.js` `createRequest`, `validate-headers.js:40–60`). So the visitor's `https://` Origin never matches. EmDash's own CSRF check on plugin routes avoids this: it also accepts the configured public origin, `siteUrl` (`emdash/dist/astro/middleware/auth.mjs:47–58`). That's why the admin pages and the plugin routes work through the same tunnel. Coffer's endpoint calls checkout in-process and drops the `Origin` (`tip.ts:39`), so its own check is the only one, and it lacks that fallback.
- **Probes against the built copy (dev box, 2026-10-30, malformed forms so nothing was created):**
  - `Host: dev.wyattdilley.com`, `Origin: https://dev.wyattdilley.com`, `X-Forwarded-Proto: https`, `Sec-Fetch-Site: same-origin`: **403**.
  - `Origin: http://dev.wyattdilley.com`: passes to the form check (400).
  - `Origin: http://localhost:4322`: 403. So the host is taken from `Host`, and only the protocol differs.
  - No `Origin`: passes.
  - `Origin: https://evil.example`: 403, the control.

  So any https page's post that reaches the site as plain http is refused, whatever `X-Forwarded-Proto` says. What the tunnel actually sent wasn't captured: the built copy doesn't log headers, and a capture needs root on the dev box.
- **The browser's side (Wyatt, Firefox 158, HTTP/3 through Cloudflare, answered 403):** `Origin: https://dev.wyattdilley.com`, `Referer: https://dev.wyattdilley.com/posts/welcome`, `Host: dev.wyattdilley.com`, `Sec-Fetch-Site: same-origin`, `Content-Type: application/x-www-form-urlencoded`. The browser itself called the post same-origin. Only the protocol of the URL the site sees differs, which matches probe 1.
- **Reach:** release 1's tip button fails for every visitor on a Node site behind nginx, Caddy, a Cloudflare tunnel or any proxy that ends TLS and forwards http, unless the operator happens to configure Astro's `security.allowedDomains`. Asking them to would break the admin budget's "no required settings". No money or data is at risk; tips just can't be made. It wasn't caught before because 7c and 7e tested the button on `astro dev` over loopback http, where the page and the endpoint share a protocol.
- **Fix (Wyatt's choice for the fix phase):** also accept an `Origin` equal to EmDash's configured public origin (`siteUrl`), the way EmDash's own CSRF check does, keeping every existing refusal (another host, `null`, `Sec-Fetch-Site: cross-site`).
  - **Tests:** the expected-fail test above is the https-Origin-over-plain-http case. The fix session gives its fixture the configured `siteUrl`, however the fix reads it, and keeps a twin with no `siteUrl` configured, where the request is still refused.
  - **Live check (phase 09):** the tip button through a real proxy that ends https.
  - **Not chosen:** deciding by `Sec-Fetch-Site`.
- **A post with no `Origin` passes, and that is intended** (`tip.ts:47`, as on EmDash's own route). A browser's cross-site POST always carries an `Origin` or `Sec-Fetch-Site: cross-site`, so only non-browser clients send none, and they could call the public checkout route directly anyway. They meet the same caps as there (T05, T18): per client only where the site passes client IPs; otherwise the site-wide open-invoice cap, the spec's stated limit. On a Node site with no trusted-proxy setup, round 1's live L2 run made no per-client bucket at all.
- **Fixed (2026-11-02, `de558a1`, Wyatt's choice):** `crossSite` accepts an `Origin` equal to the request's own origin or to EmDash's configured public origin. It uses EmDash's own `getPublicOrigin` from `emdash/api/route-utils` (`siteUrl`, then `EMDASH_SITE_URL` or `SITE_URL`), the function EmDash's CSRF check uses. Every existing refusal stays.
  - **Tests:** the expected-fail test now passes with `siteUrl` in its fixture. Twins: no `siteUrl`, still refused; with `siteUrl`, another https host and `Origin: null`, refused.
  - **Limit, as chosen:** a site behind such a proxy with no `siteUrl` or `EMDASH_SITE_URL` still refuses tips. EmDash's own passkey sign-in reads the same setting first (progress, 2026-10-13, run A attempt 1), so a proxied site that signs in already has it. The phase 09 docs should say so.
  - **Live, at the combined session:** the public built copy already starts with `EMDASH_SITE_URL=https://dev.wyattdilley.com` (as on 2026-10-30), so the tip button through the tunnel is the check.
- **Status:** fixed in code; release 1 waits for the live check.

## Observation, round 2: Cloudflare's injected analytics beacon is blocked on Coffer's pages (T09, T23)

On the refused tip page above, Firefox's console showed Cloudflare's automatic Web Analytics injecting its beacon (a script from `static.cloudflareinsights.com` plus an inline script). Coffer's CSP blocked both, so no third-party script runs on a pay page even when the host's proxy injects one. That is T09's "no third-party assets" and T23's locked-down CSP working as meant. For the docs: the installation guide could warn that Cloudflare's automatic Web Analytics injects into every page, including pay pages, and that Coffer blocks it there (the console shows CSP errors, which are expected). An admin who wants analytics on the rest of the site doesn't need to change anything. Reported by Wyatt, 2026-10-30.

## Install layer: F1 and F4 on `coffer-test` (Wyatt, 2026-10-30 UTC)

**Code under test:** `main` at `e8e195a26eee011e7b796889caefce932e6601e0`. The dev release was built from `redteam-1` at `2d7a29d85bd4935888d433a6349b17396f832337`, which differs from `main` in `bridge/` only by test files and `internal/hostile` (in no binary's `go list -deps`). The two builds were byte-identical with a fixed version string. Release `0.0.202610301609-dev.2d7a29d`, signed with the dev key; `xmr-bridge` linux/amd64 `85699662dc482a58e607cbfd5bb687eef3968e1b6bad2d1fc2ff46a28dee7dc4`; `monero-wallet-rpc` as installed `06f36de37bda72ff377c11700ba622fef435d27510c883e9c83a27ba3c46ba1f`. Container `coffer-test` from its `blank` snapshot. The site was the dev site's built copy behind the Cloudflare tunnel (`dev.wyattdilley.com`, Access on all but the plugin routes), reset to a fresh-install state and restored afterwards. Node: run B's remote node `https://stagenet.xmr.kernal.eu:38089`, so the cross-check is on. Shop wallet: phase 05's tester wallet from Feather; its keys never reached the dev box.

**Runs that don't count:**
- **First install:** the code expired before pairing (RT-19). F1 then ran against a half-installed machine and its 30-minute watch saw nothing. Void.
- **Second install:** reused the expired code's file by mistake (RT-19). Void.
- **The third install paired** at about 18:36 UTC.
- **The first F1 on it** (18:53) is valid except its watch: Ctrl-C (pressed to copy in the console) ran the script's cleanup trap, which deleted the peer samples while the loop went on. The fixed watch, `07b-f1w.sh`, ends cleanly on Ctrl-C and samples every 2 s.
- **The first F4's part (a)** gave `sh` an empty script (`</dev/null` on the pipe's reader), so it tested nothing. It was re-run with `setsid`.
- **Script errors, all mine:** the void F1 watch, the empty F4(a) and the trap. Recorded so the evidence's gaps are explained.

**F1 (T10): PASS.**
- **Listeners:** wallet-rpc listens on `127.0.0.1` only and answers `401` without its login. The bridge has no listener.
- **wallet-rpc's command line:** flag names only (values never appear in the output); its login file was gone after start-up.
- **Files:** `config`, `bridge.key` and every wallet file are mode 600, owned by `xmr-bridge`. `install.log` is mode 600, owned by root. The admin copy `/usr/local/bin/xmr-bridge` is owned by root and matches the release.
- **The unit's sandboxing:** `User=xmr-bridge`, empty `CapabilityBoundingSet`, `ProtectSystem=strict`, `ReadWritePaths=/var/lib/xmr-bridge`, `NoNewPrivileges`, `PrivateTmp`, `PrivateDevices`, `MemoryDenyWriteExecute` and `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`.
- **Peers** (`07b-f1w.sh`, 19:28:38–19:44:25 UTC, 471 samples). The test tip, sent from Feather between 19:39:47 and 19:42:08, was mined in block 2,240,130 (txid `bc5f3e59…`) and settled on the site at 19:43:49 with its 2 confirmations.

  | Peer | Process | Why |
  | --- | --- | --- |
  | The site (Cloudflare, `:443`) | `xmr-bridge` | sync loop |
  | The configured node (kernal, `:38089`) | `monero-wallet-rpc`, `xmr-bridge` | the wallet's refresh; the bridge's height and block-hash calls |
  | `127.0.0.1` (wallet-rpc's port) | `xmr-bridge` (both ends listed) | the bridge driving wallet-rpc |
  | Second nodes: boldsuck, node.monerodevs, sethforprivacy, xmr-tw | `xmr-bridge` | the cross-check, only from 19:42:24, right after the tip was mined. Four different nodes in two minutes, all on the built-in list (`crosscheck.go:47–54`), never the configured node |
  | `www.getmonero.org:443` | `xmr-bridge` | the update check's `hashes.txt`. The dev build checks every minute (`release_dev.go`), under Go's 90 s idle timeout, so the connection stayed open throughout. A release build checks daily |
  | The release server (LAN) | `xmr-bridge` | the same update check (`release.json` and `.sig`, once a minute in its log). It isn't in the samples: Python's `http.server` closes each connection at once |

  `downloads.getmonero.org` was never seen. Nothing unexplained. The plan's table listed five built-in second nodes; there are six (`xmr-lux.boldsuck.org`), which is a counting error in the plan, not a finding.

**F4 (T16, T15): PASS**, run again at 19:45 UTC on the installed, working host:
- **(a)** `install.sh` from a folder holding a one-byte-changed binary: refused at the checksum, "nothing was installed", exit 1. The release server shows the container fetched the tampered binary first.
- **(b)** `xmr-bridge install --allow-same-machine` with a made-up mainnet address: the view key was asked for before the refusal (RT-21). Ctrl-C at that prompt didn't end the installer (RT-22). The driver killed it after 60 s, with nothing typed. Same result as the 19:08 run.
- **(c)** The hashes of both bridge copies, wallet-rpc, the config, the unit, `admin-binary.sha256` and `install.log`, plus `MainPID`, `NRestarts`, `ActiveState` and `SubState`: all SAME after (a) and (b).
- **(d)** Still syncing.

**F4c, Ctrl-C the way a person does it** (blank container, 19:55 UTC, the made-up key pair from `installer/fakes_test.go`, dummy code):
- **A:** Ctrl-C at the view-key prompt, then Enter at every prompt. After three empty answers: "giving up … Nothing was changed on this machine".
- **B:** Ctrl-C, then Enter, then the view key and run B's node. The node was refused three times as "doesn't answer as a Monero node", although it served the installed bridge from the same container minutes earlier.

Both left the machine blank (files, unit and service user checked). RT-22.
- **Known limit after the fix (Wyatt, 2026-11-06: recorded, not fixed for release 1).** `de558a1` accepts the request's own origin and `getPublicOrigin` (`siteUrl`, then `EMDASH_SITE_URL` or `SITE_URL`). It doesn't read the Site URL in Settings › General (`site:url`). So on a proxied Node site with only the Site URL set, the plugin and its install command get the right address, and every visitor's tip is still refused.
  - **Reach (from the code, EmDash 1.3.1, Astro 7.3.5; not run in a browser):** small. A passkey can't sign in at the public address on such a site either: the host comes from `Host` and the protocol from the socket, so the accepted origin is `http://<site>` and `@emdash-cms/auth` `authenticate.ts:226` refuses the browser's https origin. EmDash's docs already require `siteUrl` behind a proxy. What's left is a site set up under `astro dev` on loopback whose admin signs in through a tunnel to loopback, by a magic link, or by a handover session. A site with its own `security.allowedDomains` isn't affected: Astro moves its URL to https, so the tip passes.
  - **What changes instead:** the refusal stays a 403 before checkout, and its page tells the site's owner why when only the protocol differs on the same host (`theme/src/tip.ts`, `proxyNotSetUp`; tests "[T17] [RT-20] an https Origin on the request's own host…" and "everything else refused keeps the cross-site message"). A proxy that rewrites `Host` still gets the cross-site message. The install docs carry the limit (`docs/phases/09-release.md`, step 3). The admin page's banner stops telling admins to change EmDash's address settings; exact text approved by Wyatt, built in phase 09 (spec change 42).
  - **Correction to "Why" above:** the Node adapter calls `createRequestFromNodeRequest`, not `createRequest`. It takes the host from `Host` and the protocol from the socket; `X-Forwarded-*` is applied later, by `FetchState`, and only when `allowedDomains` is set. The finding's conclusion doesn't change.
- **Live check (Wyatt, 2026-11-06): passed.** He pressed the tip button on `https://dev.wyattdilley.com/posts/welcome`, through his Cloudflare tunnel, against the built copy at `f1f016f`, started with `EMDASH_SITE_URL=https://dev.wyattdilley.com`. This covers the `EMDASH_SITE_URL` path only, and not the owner's message, which that build doesn't have. Phase 09's check on a release build stays listed.

## RT-21 — With the stagenet-only flag, a mainnet shop is refused only after its view key has been asked for

- **Rows:** T15. **Severity:** Low. **Pass 1, round 2, Install layer** (F4 b, twice on 2026-10-30). Go test to follow in Step 3.
- **What happened:** with `--allow-same-machine` and a mainnet address, the installer asked for the private view key. The refusal ("is for development on stagenet only") comes after the key is checked.
- **Why:** `install.go` asks for the address (line 193) and the view key (line 212) before the flag's network check (lines 230–232). The network is known as soon as the address is parsed.
- **Reach:** the flag is for development. Nothing is written before the refusal, and `config.Validate` refuses the combination again. But an admin who tries the flag with a real mainnet shop types their view key for nothing: the same lesson as run A attempt 1's same-machine check, which now comes before the prompts.
- **Fix idea:** check the flag's network right after the address.
- **Status:** open.

## RT-22 — Ctrl-C at an installer prompt is ignored; after it, the install goes on and then fails with a misleading node error

- **Rows:** T15 (setup). **Severity:** Low (Wyatt's rule: above Low only if the install then changes the machine; it didn't). **Pass 1, round 2, Install layer** (F4 b twice; F4c A and B). Go test to follow in Step 3.
- **What happened:** Ctrl-C at the hidden view-key prompt did nothing visible; the installer kept waiting. After Enter it carried on as if nothing had been pressed: empty answers were refused as malformed. With real answers, it reached the node prompt and refused a working node three times as "doesn't answer as a Monero node". Then it stopped with "Nothing was changed on this machine", which was true: the machine stayed blank.
- **Why:** `main.go:36` turns SIGINT into a cancelled context (`signal.NotifyContext`) instead of ending the process. The prompts read `/dev/tty` with a blocking read that never looks at that context (`tty.go:55`), and only echo is turned off, so Ctrl-C still raises SIGINT. Every network step before the machine changes (`install.go:268`) uses the cancelled context and fails. That is what saves the machine, and it's also why a good node is reported as not answering.
- **Reach:** an admin who presses Ctrl-C to cancel sees nothing happen. If they then press Enter or carry on, they get a wrong diagnosis of their node. Nothing changes and no key is stored. Closing the terminal ends the installer (SIGHUP isn't caught).
- **Fix ideas:** end the installer on the first Ctrl-C at a prompt (restoring echo first), or check the context after each answer and say "cancelled".
- **Status:** open.

## RT-23 — `Node check: ok` shows when nothing was checked, and keeps showing an old result

- **Rows:** R13, T14. **Severity:** Low (misleading admin text). **Pass 1, round 2** (F1 watch, 2026-10-30).
- **What happened:** in `xmr-bridge status`:
  - **While the site watched nothing** (19:28–19:35 UTC), `Node check:` repeated "ok (checked with xmr-lux.boldsuck.org:38081)" from a check made before the earlier tip left the watch list.
  - **While a tip was watched but unmined** (19:35:40–19:42:12), it said "ok" with no node, although nothing had been checked.
  - **Only after the tip was mined** did it name a node again.
- **Why:** with no mined transfer, `Check` returns `OK` with the detail "no mined payments to check" (`crosscheck.go:144`). `status` prints the state and the node, never the detail (`pairstatus.go:166`). With nothing watched, `snapshots` returns before the cross-check (`bridgeloop.go:596`), so the last result stays in place (`:607`).
- **Reach:** an admin reading "ok" can't tell a passed check from no check, or how old a result is. A real mismatch still shows: it's set on the sync that finds it. Whether the site's admin page shows the same (`checks.node` reaches it in the sync body) is checked in Step 3.
- **Fix idea:** a separate "nothing to check" state, and the time of the last check.
- **Status:** open.

## Observation, round 2: what the cross-check's second nodes learn (P05)

The cross-check's second node is picked at random on every sync (`crosscheck.go:204–206`), so with a payment mined and still watched (about 20 minutes, until 10 deep), every 10–15 s one of the five built-in second nodes gets a `get_info` from the wallet host. F1 saw four of them in two minutes.
- **Every node picked** learns the wallet host's IP address and the timing. Because polling starts when a payment is mined, the timing also hints at which block holds it.
- **One node per payment** gets `get_block` at the payment's height, and learns that height. The result is cached in memory per txid and height, so a bridge restart asks again, perhaps another node.
- **Never sent:** a txid, an address, an amount or a key. The block's transaction list is checked on the wallet host.
- **Over time**, the second nodes between them can link the wallet host's IP to the blocks of the shop's payments.

The spec's Privacy list says nothing about remote nodes. Spec change 13 says the second node "learns a height, not a txid", which holds, but doesn't mention the per-sync `get_info` or the spread across nodes. Matrix row P05 records this. Whether the spec should state it is Wyatt's call. A Go test of exactly what a second node is sent follows in Step 3.

## RT-24 — One snapshot with a far-future `seq` freezes its invoice: every later honest snapshot is ignored

- **Rows:** T04. **Severity:** Low, defense in depth (Wyatt, 2026-10-30). Doing this on purpose needs the bridge key; a bridge bug could do it by accident with the same result. **Pass 1, round 2, Step 2 (white box).** Plugin (`plugin/tests/redteam/whitebox.test.ts`, the two "[T04] [RT-24] …" tests).
- **What I did:** with the paired test key, sent one snapshot for an open tip with `seq` ten years ahead, then the real payment with the bridge's real clock. Separately, sent one far-future snapshot for an untouched expired tip inside its 24-hour late window.
- **What happened:**
  - **The open tip:** the honest snapshot was ignored and the tip stayed `new`, payment uncounted. Expiry is stored only when a snapshot applies, so it stays open in storage and on the watch list indefinitely. From its deadline on, the pay page shows it expired: `status` evaluates for display only and saves nothing (`status.ts:48`).
  - **The expired tip:** it left the watch list at once, so a payment made later would never be reported.
- **Why:**
  - **The protocol:** `parseSyncBody` checks only that `seq` is a positive safe integer (`plugin/src/sync/protocol.ts:175`).
  - **The merge:** `mergeSnapshot` ignores any snapshot not newer than the invoice's `seq` (`merge.ts:16`).
  - **The watch:** an untouched expired tip leaves the watch once its `seq` passes `expiresAt` plus 24 hours (`core/watch.ts`).
- **How it could happen without an attacker:**
  - **The source of `seq`:** the bridge's clock in milliseconds, kept increasing (`bridgeloop.go:696–705`). The signed `x-xmr-ts` comes from the same clock in seconds.
  - **A clock error alone:** can put `seq` at most about 5 minutes ahead. Further, and the freshness check refuses the whole sync.
  - **So it takes a bug:** in how `seq` is made (a unit slip such as micro- for milliseconds, an overflow, a value carried across restarts), or a sync signed by the key, before anything can freeze an invoice for years.
- **Fix idea (defense in depth):** refuse a sync whose `seq` is more than the freshness window away from `x-xmr-ts` × 1000. Both come from the bridge's clock, so an honest bridge always passes. That bounds the damage of any such bug to the 5-minute window.
- **Status:** fixed 2026-11-01 (spec change 46, item 5; `6451809`). The plugin refuses such a sync with `SEQ_OUT_OF_RANGE`, on the pairing path too. The two tests now pass, and a third records what stays: a `seq` at the 300 s edge holds an invoice's snapshots for at most 5 minutes, inside the stolen-key limit.

## RT-25 — An invoice waiting in review loses its buyer data 30 days after review began, before the admin decides

- **Rows:** P04. **Severity:** Low. **Pass 1, round 2, Step 2 (white box).** Plugin (`plugin/tests/redteam/whitebox.test.ts`, "[P04] [RT-25] I3: …").
- **What I did:** stored a tip in `review` (reversed) with a buyer note, 31 days after it entered review and with no admin decision, then ran the housekeeping cron.
- **What happened:** the note was purged, and the invoice is still in review.
- **Why:** `finalAt` is set the first time an invoice leaves the open states (`core/invoice.ts:348`), and entering `review` counts. An admin decision keeps the earlier value (`admin.ts:840`, `next.finalAt ??= now`). `purgeBatch` purges 30 days after `finalAt` (`housekeeping.ts:28`).
- **What the contract says:**
  - **The matrix's P04:** buyer data goes 30 days after the invoice is "settled, expired or decided".
  - **The spec:** says "after an invoice is final" (Housekeeping) and doesn't define whether an undecided review is final.
  - **The code's comment** on `finalAt` reads it as "left the open states".
  
  **Ruled (Wyatt, 2026-10-30): the matrix's reading.** For an invoice in review, the 30-day clock starts at the admin's decision. The fix starts `finalAt` when review is decided, not when it began.
- **Reach:**
  - **Release 1:** a tip's note is purged while the tip waits in review. Tips reach review only through a reorg or a reversed payment.
  - **With products:** an underpaid order's refund address could be purged before the admin refunds it.
  
  Purging early is the privacy-safe direction. No money moves.
- **Status:** open.

## RT-26 — A dishonest remote node can push the reported chain height, which sticks on the site and puts a re-pair's restore height in the future

- **Rows:** T14, R09. **Severity:** Medium (Wyatt ruled, 2026-10-30). It needs no key, only a remote node that lies, and its effect outlasts switching to an honest node. **Pass 1, round 2, Step 3 (white box).**
- **Tests:**
  - Go `internal/bridgeloop/redteam_test.go`, "[T14][R09] [RT-26] …". It was skipped while open; without the skip it reported a height 1,000,000 blocks ahead, 15 s after the last.
    - **Reshaped at the fix (2026-11-02) to Wyatt's D1:** "a wallet height a million blocks ahead of the second node is reported as the second node's", with an own-node twin.
    - **Why:** the first form bounded the rise by elapsed time, which D1 rejected.
  - Plugin `tests/redteam/whitebox.test.ts`, "E4, plugin side" (passing: the consequence). Its third test, a pairing carrying no height, still gets a future restore height from the plugin. The installer's clamp covers that case.
- **How a node does it:**
  - **The bridge reports wallet-rpc's `get_height` unchecked** (`bridgeloop.go`, `SyncOnce`).
  - **wallet-rpc's height is the length of the chain its node served.** `get_height` returns `get_blockchain_current_height()`, which is `m_blockchain.size()` (`monero-v0.18.5.1/src/wallet/wallet_rpc_server.cpp:943`, `wallet/wallet2.h:1230`).
  - **`wallet2` checks a block's structure, not its proof of work.** It appends any block a node serves to `m_blockchain` (`wallet2.cpp:3023–3056`, `process_new_blockchain_entry`; no difficulty or proof-of-work check anywhere in the refresh path).
  - **So a node that serves made-up blocks raises the height at will.** The cross-check compares only block hashes at payment heights (`crosscheck.go:141–181`), and the wallet check compares the wallet with the same node.
- **What it does on the site:**
  - **The height sticks.** The plugin keeps the highest height it has ever been sent (`plugin/src/sync/handle.ts`, `Math.max`, spec change 16). It stays even after the admin switches to an honest node and the wallet's fake blocks are reorganized away.
  - **Every later invoice gets a future `createdHeight` and `expiresHeight`.** For release-2 orders, a payment mined at any real height then counts as on time.
  - **A re-pair's suggested restore height is in the future** (`handle.ts:166`). The installer uses it as given (`install.go:342–343`); the sync client refuses only a negative one. So the new wallet scans from a block that doesn't exist yet and misses every payment: run A attempt 2's failure, now caused remotely.
- **Fix ideas (Wyatt decides):**
  - check the reported height against the cross-check's second nodes;
  - cap how far it may move per sync, by elapsed time;
  - in the installer, never take a suggested restore height above the node's own height (and, on the plugin side, never suggest one above a cross-checked height).
- **Fix (spec change 47, Wyatt's D1–D4 and answers 2–3; bridge `4615ceb`, installer `889d652`, plugin `300fa80`):**
  - **The bridge, with a remote node:** it reports the wallet's height while that's at most 10 blocks above a second node's, else the second node's, from the first such sync. Health's "mismatch" follows after 5 minutes.
    - With no second node, it reports height 0 (the site keeps its own) and holds mined transfers at 0 confirmations (spec change 13 amended).
  - **Pairing requests** carry only a bounded height, and the site resets its height to it (D4).
  - **The installer** never scans from above the bounded height.
  - **The plugin** suggests a restore height from the healed height, and refuses checkout, tips included, while it has no height.
  - **Tests:** Go `crosscheck/rt26_test.go`, `bridgeloop/rt26_test.go`, `cmd/xmr-bridge/rt26_test.go`, `installer/rt26_test.go`; plugin `tests/redteam/floor.test.ts`.
- **Still to do:** the live session, in one release with RT-20 and step 6's rerun.
- **Status:** fixed in code; release 1 waits for the live session.

## RT-27 — The bridge takes the site's `poolTop` and `poolTarget` unbounded: one reply can start a catch-up of billions of subaddresses

- **Rows:** T15, F08. **Severity:** Medium (Wyatt ruled, 2026-10-30): it reaches across the machine boundary the design relies on. **Pass 1, round 2, Step 3 (white box), plan item E1.** Go `internal/bridgeloop/redteam_test.go`, the two "[T15][F08] [RT-27] E1: …" tests (`t.Skip("RT-27 open")`).
- **What I did:** gave the bridge loop a site reply with `poolTop` 2^32−1 (the most `syncclient` accepts), and separately one with `poolTarget` 1,000,000,000.
- **What happened:**
  - **`poolTop`:** the wallet didn't have that index, so the loop started a catch-up to it and created subaddresses 100 per call until the test's cap stopped it at 19,901. Without a cap it would go on toward 4.29 billion, growing the wallet file and wallet-rpc's memory until the wallet host runs out.
  - **`poolTarget`:** every sync created 100 more (3,000 in 30 syncs), with no end.
- **Why:**
  - `syncclient` bounds `poolTop` only by 2^32−1 and `poolTarget` only by ≥ 0 (`syncclient.go:249`).
  - `catchUp` creates up to any target (`bridgeloop.go:497–531`).
  - The top-up's only bound is 100 per sync.
- **Who can send it:** only whatever answers as the site. That means the plugin (a bug), a broken-in site server (T15), or, if TLS were broken, a man in the middle. The E3 tests show untrusted certificates are refused.
- **Reach:**
  - **The wallet host** (a separate machine, perhaps also running the admin's own `monerod`) can be driven out of disk or memory.
  - **Payments stop being reported.** No money is lost.
  - **T15's stated limit doesn't cover it:** the separate wallet host is meant to be what a site break-in can't reach.
- **Fix ideas:**
  - refuse a catch-up target far above the wallet's highest index (spec change 15 expects a reinstall's gap, not billions);
  - cap `poolTarget` at the spec's fixed pool size (with headroom);
  - say so in `status` when refusing.
- **Status:** fixed 2026-11-01, folded into spec change 46's bridge side (Wyatt):
  - numbering follows the site's `claimedTop`, never `poolTop`;
  - the catch-up goes no further than `claimedTop + 50`;
  - `poolTarget` counts for at most 50.

  The two tests pass without their `t.Skip`. A check-list row the wallet doesn't hold above that limit is reported to the site as not from this wallet, at once, with nothing created.

## Step 3 (bridge white box): what else was checked, no finding

- **RT-21, RT-22, RT-23 Go tests** are committed with `t.Skip("RT-nn open")`. Each was run without its skip once and failed for its finding's reason:
  - RT-21: the view-key prompt came before the refusal.
  - RT-22: in the fake, which ignores the cancelled context, the install carried on after Ctrl-C.
  - RT-23: the old `mismatch` was sent again with nothing watched, and status printed a bare "ok".
- **P05 (passing):** a second node gets only `get_info` and `get_block`, by the payment's height, once per payment. No txid, amount or index is sent (`internal/crosscheck/redteam_test.go`).
- **T27 (passing, now Covered):** the sync client, the updater and the Monero downloader each refuse an untrusted certificate (E3). The site sees no request, and the installed bridge is unchanged.
- **E2 (passing):** a 100 MB reply, a drip, a hang and a cut reply from the site are each an error within the caller's deadline. Round 1's `TestErrors` already covers 401, 403, a redirect, HTML and invalid values.
- **Release update schedule (passing):** a release build waits 10 minutes, then checks every 24 h ± 1 h, and waits 48 h before installing (`cmd/xmr-bridge/release_release_test.go`). F1 saw the dev build's one-minute checks.
- **Observation, `moneroaddr` doesn't check the address checksum**, by design (`moneroaddr.go:1–3`: wallet-rpc does). A stagenet address with its last character changed parses as a valid stagenet primary address. At the install prompt, a typo there is caught only if it changes the view key's bytes (the key match). Otherwise wallet-rpc refuses it when the wallet is created, which comes after pairing, so the code is already used. That's the same lesson as RT-19, for the fix session to weigh.
- **Fuzzing (2026-10-30, `GOMAXPROCS=2`, `-parallel=2`, 10 minutes each, one at a time):** `FuzzParseReply` (the site's reply) ran 9,799,866 times and `FuzzParse` (`moneroaddr`) 46,843,150 times. No crasher, nothing added to `testdata/fuzz/`.

## F5: dependency checks (T28), 2026-10-31 UTC

One-off runs for pass 1, approved by Wyatt on 2026-10-31. Nothing was added to the repo or CI. Evidence: `~/xmr-pay-dev-data/redteam/step6-*.txt` and `step6-audit-*.json`.

**The tool, and how it was checked before it ran:**
- `golang.org/x/vuln/cmd/govulncheck@v1.9.0`, run with `go run` from an empty scratch folder outside any `go.mod`, with `GOTOOLCHAIN=local`.
- `go env -changed` printed nothing (every Go setting at its default): `GOPROXY=https://proxy.golang.org,direct`, `GOSUMDB=sum.golang.org`, and `GONOSUMDB`, `GOPRIVATE`, `GONOPROXY`, `GOINSECURE` and `GOFLAGS` blank.
- The commit, `e672cbe8fbc8c76e28fcb6db0efd9ce354e0dac5`, was first taken from proxy.golang.org's version info on 2026-10-30. It was checked three ways:
  - `go mod download -json` (verified against sum.golang.org; `Sum h1:12VaqnI9…/sc=`): its `Origin` names that commit for `refs/tags/v1.9.0`.
  - `git ls-remote https://go.googlesource.com/vuln 'refs/tags/v1.9.0*'`: the tag points at that commit. It's a lightweight tag, so there is no `^{}` line.
  - Wyatt checked independently on GitHub's golang/vuln mirror: same commit.
- Vulnerability database: `vuln.go.dev`, "DB updated: 2026-10-27 21:16:18 UTC".
- **Exit codes:** under `go run`, govulncheck's own exit code shows as the line `exit status N` and `go run` itself exits 1. Results were classified by that line: 0 none, 3 found, anything else a failed run. **No run failed.**

**Which Go each result reflects:**
- **Source mode:** the dev box's toolchain, go1.27.1 (`/usr/local/go`).
- **Binary mode:** the version embedded in each binary, go1.27.1 for both dev-release binaries (`go version -m`). The binaries are `-trimpath` but **not stripped** (`file`: "with debug_info, not stripped"), so binary mode had full symbols. The dev box's installed bridge (`/usr/local/bin/xmr-bridge`) is go1.27.1 too.
- **Release 1:** where its bridge binaries are built isn't decided yet.
  - `CLAUDE.md` tier 3 says release builds run in CI from a clean checkout. But decision 88 (GitHub Actions, provenance) covers the plugin's EmDash release, and phase 09 says only "A script produces the binaries … pinned Go version".
  - The only bridge release path that exists, `scripts/build-dev-release.sh`, builds and signs on the dev box with `GOTOOLCHAIN=local`, so with this box's go1.27.1.
  - CI's `setup-go` pin is `go-version: 1.27.1` too, and CI publishes nothing.
  - **Either way, today's pins give go1.27.1.** go1.27.3 is the current stable release (`go.dev/dl`).
  - Which build location is used decides which Go phase 09's binary-mode rerun must check: open for Wyatt.

**Every manifest git tracks:**

| File | Checked | Result |
| --- | --- | --- |
| `bridge/go.mod` (no `require`) | govulncheck source mode (a); binary mode (c) on `xmr-bridge-0.0.202610301609-dev.2d7a29d-linux-{amd64,arm64}`, matching `SHA256SUMS` | (a) 10 called, 2 imported but not called, 2 required but not called, all in the standard library. (c) 9 found by symbol in each binary, 2 by package, 2 by module. **RT-28** |
| `bridge/oracle/go.mod` (CI-only; `go-crypto` v1.5.2, `circl` v1.6.3, `x/crypto` v0.41.0, `x/sys` v0.35.0) | govulncheck (b), also with `-test` (its only code is test files) | 0 called. Nothing in any third-party module; the go1.27.1 standard-library entries only, at package or module level |
| `plugin/package.json` + `pnpm-lock.yaml` | `pnpm audit --json` (a parsed audit report); lockfile check | 63 advisories (1 critical, 22 high, 31 moderate, 9 low) over 829 packages. Lockfile check passed |
| `theme/package.json` + `pnpm-lock.yaml` | same | 25 (1 critical, 7 high, 13 moderate, 4 low) over 694. Lockfile check passed |
| `spikes/xmr-spike/` (lockfile) | `pnpm audit`, record only (Wyatt): a throwaway spike, never shipped | 63 (1 critical, 22 high, 31 moderate, 9 low) over 829 |
| `spikes/cf-runner/limits/` (lockfile) | `pnpm audit`, record only | 23 (1 critical, 7 high, 11 moderate, 4 low) over 716 |
| `spikes/sandbox-canary/package.json` | not audited | no dependencies at all, so no lockfile |
| `contract/` | not audited | no `package.json` yet (phase 08) |

**The standard library's advisories against the shipped bridge.** The bridge is an HTTP client only: it runs no server (F1 saw it listening on nothing), sends no `CONNECT`, parses no multipart, doesn't import `html/template`, and runs on Linux.
- **Reach the bridge in practice:**
  - GO-2026-6809: the x509 distrust list for compromised intermediates. Fixed in go1.27.3.
  - GO-2026-6611: CPU exhaustion from a hostile HTTP/2 peer, client or server side. Fixed in go1.27.2.
- **Called, but only by an HTTP/2 or HTTP/1 server, a TLS server or a reverse proxy:** GO-2026-6617, 6613, 6612, 6610, 6607, 6605 and 6603.
  - Their traces run through the test-only `internal/hostile` server, or through govulncheck's interface over-approximation ("`installer.Uninstall` calls `fmt.Fprintf`, which eventually calls `http2.responseWriter.Write`").
  - In binary mode GO-2026-6612 drops to package level, because the `hostile` server isn't in the binary.
- **Called, but the flaw is in multipart parsing:** GO-2026-6608. Its trace is the client reading response headers, which `MaxResponseHeaderBytes` bounds.
- **Not called:** GO-2026-6609 (file serving), 6604 (Windows), 6600 and 6599 (`html/template`).

**npm (dev tooling only).**
- **Nothing ships:** tier 1 keeps every third-party package out of the plugin bundle, the theme components and the bridge.
- **Where they sit:** every advisory is under `emdash`, `@emdash-cms/plugin-test`, `@emdash-cms/plugin-cli`, `astro` or `vitest`. The critical one is DOMPurify 3.4.16 (`SAFE_FOR_TEMPLATES` bypass). The highs are undici 7.29.0 and 8.11.2 (DoS; TLS options dropped), seroval, `@modelcontextprotocol/sdk`, sharp (librsvg), zod, body-parser, source-map-js and vite.
- **Reach on this project:** the test tools run against local, trusted inputs. The dev site and its built copy run EmDash 1.3.1, the same tree every Coffer site runs.
- **No Coffer finding.** It's an observation for Wyatt, below.

**Lockfile check against the tiers (plugin and theme), passed:**
- Direct dev dependencies are exact pins within tier 2, and the lockfile's importer specifiers match `package.json`. pnpm 12's lockfile adds a first document holding only its own `packageManager` pin (`pnpm` 12.8.1).
- Every package has an sha512 `integrity` hash: 829 of 829, and 694 of 694.
- No tarball, git or directory sources. No `overrides`, `patchedDependencies` or `minimumReleaseAgeExclude` anywhere.
- `pnpm-workspace.yaml` has `strictDepBuilds: true`, `dangerouslyAllowAllBuilds: false`, `allowBuilds` with only `esbuild` and `workerd`, and `minimumReleaseAge: 10080`.

**Not covered:**
- CI (T28 stays Planned).
- The other platforms' builds: there are none; Linux only.
- What a lockfile refresh within EmDash's own ranges would clear. Several affected packages are open ranges inside EmDash (`sanitize-html ^2.17.1`, `@modelcontextprotocol/sdk ^1.26.0`). That's a dependency change, so it's Wyatt's call.

## RT-28 — The bridge is built with go1.27.1, which lacks the fixes for two standard-library vulnerabilities that reach it

- **Rows:** T28, T27. **Severity:** Low. **Pass 1, round 2.**
- **What I did:** ran govulncheck v1.9.0 in source mode on `bridge/` and in binary mode on both dev-release binaries (F5 above).
- **What happened:** 10 called standard-library vulnerabilities in source mode, and 9 by symbol in each binary. Two reach the shipped bridge in practice:
  - **GO-2026-6809 (CVE-2026-111943):** crypto/x509 now refuses known compromised intermediate certificates, for systems whose trust store hasn't caught up. Without it, a holder of such an intermediate's key, on the path between the wallet host and the site, can pass the bridge's TLS check. They could then read the signed snapshots and answer with replies the bridge trusts (RT-27's unbounded `poolTop` and `poolTarget`).
    - The two downloads aren't affected: Monero's comes from GPG-signed `hashes.txt`, the bridge's own from the Ed25519 release signature.
    - Wallet-rpc's own node connection is wallet-rpc's TLS, not Go's.
  - **GO-2026-6611 (CVE-2026-78669):** a hostile HTTP/2 peer (the site, or whatever answers for it) can make the bridge use excessive CPU.
- **Where it applies:** the dev releases, the dev box's installed bridge and CI's `setup-go` pin are all go1.27.1. Release 1 will be too, wherever it's built, unless a pin changes (F5, "Which Go each result reflects").
- **Reach:** no money moves: the bridge is view-only. 6809 needs a compromised intermediate's key plus a position on the path, on a host whose trust store lacks the distrust. 6611 is a slowdown of the wallet host.
- **Test:** `cmd/xmr-bridge/redteam_test.go`, "[T28] [RT-28] the bridge is built with go1.27.3 or later", `t.Skip("RT-28 open")`. Run once without its skip, it failed: "built with go1.27.1; go1.27.3 or later has the fixes for GO-2026-6809 and GO-2026-6611". It's a floor for today's advisories. Phase 09's govulncheck rerun is still what checks the release.
- **Fix (Wyatt, 2026-10-31):** go1.27.3, released 2026-10-20, pinned in one place CI reads, plus the same version on the dev box (Wyatt runs the sudo step). Release 1's bridge is built in CI, then rebuilt on the dev box with the same Go and flags, and the hashes must match before Wyatt signs. Afterwards govulncheck must show nothing called, and the test's skip comes off.
- **Status:** fixed 2026-10-31.
  - **The change:** `bridge/go.mod` and `bridge/oracle/go.mod` say `go 1.27.3`. `ci.yml`'s `setup-go` reads `go-version-file: bridge/go.mod`, so that line is the one pin. The dev box has go1.27.3 (Wyatt, sudo; the download's SHA-256 `65efbc80…379b40` matched go.dev's list and dl.google.com's `.sha256`; the old Go is kept at `/usr/local/go1.27.1-old`). With `GOTOOLCHAIN=local`, go1.27.1 now refuses the module ("go.mod requires go >= 1.27.3").
  - **The test:** its skip came off, and it passes.
  - **govulncheck v1.9.0 afterwards** (same database, updated 2026-10-27 21:16 UTC): "No vulnerabilities found" in source mode on `bridge/`, and in binary mode on fresh static builds for amd64 and arm64 (`-trimpath`, `CGO_ENABLED=0`, both go1.27.3). Evidence: `~/xmr-pay-dev-data/redteam/rt28-*.txt`.
  - **Still go1.27.1:** the dev releases in `~/xmr-pay-dev-data/dev-release/` and the dev box's installed bridge. Both are stagenet only; the next dev release picks up the new Go.


## Hardening, round 2 (Low, on the fix list; no RT ID): both localhost checks refuse the same addresses

Ruled by Wyatt (2026-10-31) from T25's spot-check edges. Checked with a scratch script on 2026-10-31: the same parsing as the plugin's `isLoopbackHost` and `publicHttpsOrigin`, and Go's `url.Parse` and `config.isLoopback`.

| Site address | Plugin (`admin.ts`, `isLoopbackHost`) | Installer (`config.IsLoopbackSite`, then `SameMachine`) |
| --- | --- | --- |
| `https://0.0.0.0` | accepted | accepted by both: it's not loopback in Go, and the same-machine check compares it with the machine's own addresses. On Linux, connecting to it reaches this machine |
| `https://[::]` | accepted | accepted by both, the same way |
| `https://[::ffff:127.0.0.1]` | accepted: the URL becomes `[::ffff:7f00:1]`, which the list doesn't match | refused: Go reads it as 127.0.0.1 |
| `https://localhost.` | accepted | not refused by the loopback check. `SameMachine` resolves it, so it's refused only if the resolver maps it to loopback |
| `https://127.1` | refused: the URL becomes 127.0.0.1 | not refused by the loopback check: Go doesn't parse `127.1` as an IP. The same-machine DNS check wasn't tried |
| `https://shop.localhost` | refused | the same as `localhost.` |

- **A trailing slash on the saved address isn't a path.** `walletHostSite` strips it, so `https://shop.example/` is used as `https://shop.example` ("[T25] a saved https address is used as is, without a trailing slash"). The bridge's `validateSite` also accepts a path of `/`.
- **Fix:** one list for both checks: `localhost` and `*.localhost` (with or without a trailing dot), 127.0.0.0/8 in any spelling, `::1`, IPv4-mapped loopback, and the unspecified `0.0.0.0` and `::`. Tests on both sides.
- **Reach:** none. These are addresses an admin would have to save or open the admin page at. With one of them the wallet host fails to reach the site, or reaches itself.

## Observation, F5: EmDash 1.3.1's own dependency tree carries a critical and several high npm advisories

Not Coffer code: tier 1 keeps it out of everything Coffer ships. But it's the tree every Coffer site runs, at the floor Coffer names (`emdash >=1.3.1 <2`). That covers DOMPurify (critical), undici, seroval, `@modelcontextprotocol/sdk`, sharp, sanitize-html, body-parser, hono and others (F5).
- EmDash 1.4.0 was published on 2026-10-29. It passes the 7-day rule on 2026-11-05.
- **The DOMPurify critical** (GHSA-cg2g-xh64-v4q7, `>=3.4.4 <=3.4.16`, fixed in 3.4.17 of 2026-10-12):
  - **It's on EmDash's runtime path.** `pnpm why dompurify` shows `dompurify@3.4.16` ← `@emdash-cms/admin@1.3.1` (a regular dependency) ← `emdash@1.3.1`, in both `plugin/` and `theme/`. So it's installed wherever EmDash is: it's EmDash's admin UI's sanitizer.
  - **1.4.0 doesn't clear it by itself.** `@emdash-cms/admin@1.4.0` keeps the same range, `dompurify ^3.3.2`. Whether a site gets 3.4.17 depends on when its lockfile last resolved, ours included.
- **Ruling (Wyatt, 2026-10-31):** EmDash 1.4.0 goes through the upgrade checklist after 2026-11-05, in the fix phase before phase 09's final tests.
- For the report: Coffer's security claims stop at its own code, and the host CMS's dependency hygiene is EmDash's. A possible upstream note.

## RT-29 — A re-pair keeps the previous wallet host's unused pool addresses, so new tips go to the old wallet (or another network) first

- **Rows:** T20, T03, R08. **Severity:** Medium (Wyatt, 2026-10-31); **fixed for release 1, with RT-11** (spec change 45). **Pass 1, fix planning** (2026-10-31), found while planning RT-11's fix.
- **What I did:** read the pairing path. There's no test yet; the fix session writes the failing one first.
- **What the code does:**
  - Pairing (`plugin/src/sync/handle.ts:96–110`) stores the new key and burns the code, but doesn't touch the pool.
  - A sync adds an address only if its index isn't in the pool already (`handle.ts:146`).
  - The bridge tops up from the site's `poolTop` (`bridge/internal/bridgeloop/bridgeloop.go:443–487`).
  - So after a re-pair, the previous host's unused addresses stay in the pool and are handed out first. The new host's addresses go above them.
- **What happens to people:**
  - **Another shop wallet on the same network** (the spec's own advice after a leaked view key): new tips go to the old wallet until its unused addresses (up to 50) run out. The new wallet host doesn't watch them, so those invoices never settle and expire. The money sits in a wallet the admin meant to retire, whose view key may be leaked. This contradicts the spec's "New payments go to the new wallet".
  - **Another network** (for example stagenet testing, then mainnet): the pool mixes networks with no attacker, the honest path to RT-11. A mainnet tipper is handed a stagenet address, which a mainnet wallet app refuses, so the tip fails.
  - **After a stolen key (RT-08):** a thief's unused addresses survive the re-pair, so "until you re-pair" isn't true yet.
- **Fix (spec change 45, Wyatt's ruling of 2026-10-31):**
  - Every new pairing drops all unused pool addresses, whatever their network, and clears the stored network. The new bridge's first address sets it again.
  - Claimed addresses and their invoices stay.
  - **Order:** the drop and the cleared network come before the new key is stored, so a failed pairing leaves the old one working (Wyatt).
  - **Costs checked:**
    - The empty pool after a re-pair is at most one immediate sync round trip, beyond what checkout already refuses.
    - The same wallet reinstalled from keys adds no gap in the address numbers.
    - A host that keeps its wallet skips up to 50 numbers per re-pair.
    - **A different wallet starts above the old wallet's highest claimed number** (confirmed from the code). After about 200 old checkouts, expired ones included, its tips are beyond a wallet app's lookahead. The Health warning doesn't see it, because `state:paidTop` is the old wallet's.
  - **Spec change 46 fixes the last two:** the bridge says at pairing whether it's the same wallet. A different wallet gets fresh numbering; the same wallet re-offers its own unused subaddresses.
  - **Until then,** the switch-wallets steps say to raise the wallet app's lookahead.
- **Status:** **fixed 2026-10-31**, with RT-11 (spec change 45).
  - **The fix:** in the pairing request, after the code and signature check out, every unused pool row is dropped and the network cleared, then the key stored, then the code burned. The drop marks each free row "dropped" with an `updateIf` guarded on `status: "free"` (checkout's own claim guard), then deletes it, so a racing claim keeps its row. `compareAndDelete` couldn't do that: `updateIf` leaves a row's revision unchanged (EmDash 1.3.1, `context-…mjs:644–667`).
  - **The window a running sync leaves (Wyatt, 2026-10-31: close it, don't file it):** each pool row carries the ID of the key that added it, and checkout hands out only the paired key's rows. A sync whose key is replaced while it runs is also refused before it writes.
  - **Tests:** repair (route level), pool-drop (the race), handle (the order, a failure after the drops), claim, uninstall.
  - **Still open, in spec change 46:** the different-wallet numbering gap and the same-wallet skipped numbers.
  - **A known limit left by spec change 46** (2026-11-01, from `TestLiveShopWallet`; recorded here, not filed as a new finding):
    - A wallet restored from keys stops at the first gap of 200 unused subaddresses: the live test's restored shop wallet had its next index at 10 while it held payments up to 305.
    - So on a "no match" for a wallet with history (both sides rebuilt, or a reused wallet paired as new), `create_address` can hand out addresses that already received payments, and `receivedTop` can be far too low.
    - A match is fine: the catch-up creates up to `claimedTop` and rescans.
    - The install docs will say to use a wallet made for this shop (phase 09). It's on pass 2's list.
  - **Live, 2026-11-02 (46's live check):** the same-wallet re-pairs (installer and `pair --code -`) matched and re-offered 358–407 with nothing skipped; the switch to a second wallet started at its own index 1 (2³²+1); the shop wallet restored from keys after it matched wallet 0, caught up to `claimedTop` 358 only, and started its pool at 359. The second wallet had history, which exposed RT-30 and RT-31: the known limit above is wider than recorded, because the probe answer comes before the wallet has scanned at all.

---

# Pass 1 (phase 07b), fix sessions: spec change 46's live check

Found live on the dev site, 2026-11-02, in 46's live step 6 (the switch to a second wallet). Evidence in `~/xmr-pay-dev-data/`: `46-live-step6-invoice.txt` (the invoice and its pool row), `46-live-step6-status.txt` (the status route), `46-live-step6-output.txt` (installer log, journal, `status`), `46-live-step6-site.txt` and `46-live-watch-2.txt` (the site's state). No code changed this session (Wyatt); each fix session writes the failing test first.

**What happened.** The second wallet installed for step 6 was `58WW…eSZP`, not a new wallet. Its index 1 had received three 0.0001 XMR payments: txids `fbb401a3…` (height 2,230,085, 2026-10-15 23:23 UTC), `e413ea6e…` (2,230,165, 2026-10-16 02:15) and `1419df9d…` (2,240,100, 2026-10-30 18:40). They match the test tips of phase 05's runs A and B and the 30 October `coffer-test` run, each sent to a fresh install's index 1, It is phase 05's setup-test shop wallet (Wyatt confirmed, 2026-11-02). Then:
- The install's restore height was 2,230,020 (`/etc/xmr-bridge/config`; Wyatt's read). No installer line names the site's suggestion (about 2,241,429 then: the open shop tip's `createdHeight` 2,242,149 − 720), so it came from `--restore-height`, below the suggestion and so without a warning. Wyatt passed it: it's the restore height Feather gave that wallet in run A attempt 2. With the suggestion instead, the wallet wouldn't have scanned the old payments and step 6 would have looked clean: the finding needs a restore height below the wallet's old payments, which a reused wallet's own restore height usually is.
- 16:29:35.521 UTC: the new service opened the wallet at height 579,994 (wallet-rpc's own chain right after `generate_from_keys`; the dev box's 8 October install logged the same) while the node was at 2,242,155.
- 16:29:35.556, 35 ms later: "answering the site's wallet probe" `match=false receivedTop=0`. Index 1 had been created to answer the probe.
- 16:29:35.713: "created pool addresses" `count=49`; the site took index 1 to 50 as wallet 1's 2³²+1 to 2³²+50.
- 16:30:07–16:30:15: four `notified` lines, wallet-rpc's `--tx-notify` as its catch-up found the old payments.
- 16:30:41.410: a test tip (0.002 XMR suggested, `minAtomic` 0.0001) was handed 2³²+1, the wallet's index 1, `createdHeight` 2,242,155.
- 16:30:42.614, the next sync: the three old transfers arrived for it (2,055 to 12,070 confirmations) and it **settled** with 0.0003 XMR received. Nobody paid. The pay page has shown "Tip received: 0.0003 XMR. Thank you!" since Wyatt first opened it.

## RT-30 — The bridge answers the wallet probe before its wallet has scanned, so `receivedTop` is 0 and an already-paid index 1 goes into the pool

- **Rows:** P02, R09. **Severity:** Medium (Wyatt, 2026-11-02), and it **blocks release 1**: until RT-31's height floor exists, RT-30's fix is the only thing stopping an honest admin's switch to a used wallet from crediting old payments. **Pass 1, fix sessions** (46's live check, step 6). Tests: Go `internal/bridgeloop/rt30_test.go`, `TestProbeWaitsForTheScan` (six cases, "[P02][R09] [RT-30] …"; five failed against the old code, and the sixth, a wallet ahead of its node, passes either way).
- **What I did:** the live step above, a wallet with history installed on a site with history (46's "no match" path).
- **What happened:**
  - The probe answer came 35 ms after the wallet opened, with the wallet 1.66 million blocks behind its node. `ReceivedIndexes` could only return what the wallet had scanned, nothing, so `receivedTop` was 0.
  - So the no-match start (above max(created, `receivedTop`)) began at 1, and index 1, created to answer the probe, went into the pool although it had been paid three times.
  - The catch-up found the payments 30–40 s later, after the addresses were already on the site.
- **What the spec says:** 46's no-match start skips indexes up to `receivedTop`, the wallet's highest received index. The known limit recorded under RT-29 (a restored wallet stops at the first 200-address gap) is a different, narrower gap: here the payments were on index 1, inside any lookahead, and only the timing hid them.
- **Reach:** any "no match" pairing of a wallet that isn't new and hasn't finished scanning: a reused wallet, a fresh install restored from keys with a restore height below its old payments, or a wallet behind its node for any reason. Every fresh install starts unscanned, so the condition is the normal case for a wallet with history, not a rare one. With RT-31 the first new invoice on such an address settles at once (seen live).
- **Fix idea (Wyatt decides):** answer the probe, and send any addresses, only once the wallet has scanned to the node's height (the bridge already compares the two for Health's "in step with its node"); until then keep the site waiting, as it already does for a bridge that hasn't answered.
- **Fix (2026-11-02, `73781ec`; Wyatt's rule, with an offline node as not ready):**
  - **When it answers:** only once the node has answered, is synchronized and online, and the wallet's height has reached the node's (no slack).
  - **The node's height:** read fresh while the site waits, not from the wallet check's one-minute cache. Without a node to ask, the bridge never answers.
  - **Until then:** the site keeps waiting, with no addresses, no index 1 created and no `ReceivedIndexes`. Syncs keep their normal pace. Health shows the wallet check ("behind", or "syncing"), and the bridge logs why, at most once a minute.
  - **Found while building:** index 1, created to answer the probe, sat in the bridge's pending list and would still have been sent. Answering now drops pending addresses that have received, and after a no-match every pending one at or below `receivedTop`.
- **Known limit:** a node that says "not synchronized" forever stalls the answer. Recorded, not fixed: a dishonest remote node can already stop payments showing in other ways.
- **Live check (2026-11-02, combined session step 2, dev release `0.0.202611022057-dev.1df3c4d`):** the phase 05 wallet with `--restore-height 2230020`.
  - **The wait:** the wallet opened at 579,994 at 22:56:35 UTC. The bridge logged "waiting for the wallet to scan before answering the site's wallet probe" (node 2,242,369) and didn't answer; the site showed the new key with no wallet and no addresses.
  - **The answer:** after 54 s of scanning (22:57:29 UTC), a match with wallet 1 and `receivedTop` 2.
  - **Paid indexes kept out:** the pool started at index 3, so neither index 1 nor index 2, both paid, went into it.
  - The same step found RT-32 and RT-33.
- **Status:** fixed; live check passed.

## RT-31 — A transfer mined before the invoice existed is counted toward it, so an old payment settles a new invoice

- **Rows:** P02, T14. **Severity:** High (Wyatt, 2026-11-02): a product whose price an old payment meets would be fulfilled with no new payment. **Release 1** (Wyatt, 2026-11-02, option A): the height floor and RT-26's fix both land in release 1. **Pass 1, fix sessions** (46's live check, step 6). Test: none yet (no code changes this session).
- **What I did:** the same live step. The invoice's stored transfers sit at heights 2,230,085, 2,230,165 and 2,240,100; its `createdHeight` is 2,242,155.
- **What the code does:** a transfer counts when it isn't a double spend and its `unlockTime` is "0" (`plugin/src/core/invoice.ts:182`, `counted`). Nothing compares its height with the invoice's `createdHeight` (`sync/merge.ts`, `mergeSnapshot`). So any payment the address ever received counts, however old.
- **Why it matters beyond RT-30:** the site's guarantee is "a fresh subaddress per invoice" (P02), checked only against other invoices on the site. An address the wallet used before Coffer, or under another site or install, isn't fresh, and the plugin can't see that. A height floor would have made RT-30 harmless here: the tip would have stayed unpaid, waiting for a real payment.
- **Fix idea (Wyatt decides):** ignore a *confirmed* transfer whose height is below `createdHeight` minus a small margin (`createdHeight` can run a little high, spec change 17's `RESTORE_MARGIN_BLOCKS`); unconfirmed ones (no height yet) still count. Show ignored old transfers to the admin rather than dropping them silently.
- **Checked against RT-26:** `createdHeight` is the site's last reported chain height (`checkout.ts:275`, `checkoutHeight`), which RT-26 lets a dishonest remote node push up for good. With a floor, an inflated height would move the floor above real payments: honest payments to new invoices would be ignored, and the invoices would expire unpaid (lost sales, the money still in the shop's wallet). So the floor needs RT-26's fix first, or a floor from something a node can't inflate (for example the cross-checked height, or the height when the address was handed out bounded by elapsed time). Without RT-26's fix, the floor trades this finding for a remote denial of service.
- **Fix (spec change 47, D4–D6; plugin `300fa80`):**
  - **The rule:** a confirmed transfer mined below `min(createdHeight, the site's height) − 30` (`FLOOR_MARGIN_BLOCKS`) doesn't count toward the invoice's sums or settlement. An unconfirmed one counts as before.
  - **Unchanged:** the paid-top behind the gap warning still sees the transfer.
  - **The admin page** shows the ignored transfers with their amount, under the tip in Newest tips and on the invoice and review views. The buyer's status route never does.
  - **Derived when needed, not stored,** so settled invoices from before the floor show the line too (Wyatt's answer 1). The dev site's `inv_f7ea94de1471f114` keeps its "settled" status as history.
  - **Tests:** `tests/redteam/floor.test.ts`, "[P02][T14] [RT-31] …", among them the live shape and the margin's edge.
- **Still to do:** the live session. The old tip `inv_f7ea94de1471f114` is the live view of the admin line, and a fresh tip shows nothing received until Wyatt pays. Step 2 (2026-11-02) didn't get that far: the floor moved the old tip to review instead (RT-33), and RT-32 stopped the step. Both checks wait for step 2's rerun.
- **Status:** fixed in code; release 1 waits for the live session.


## RT-32 — A re-pair of a wallet paid above the site's `claimedTop` starts an endless address loop and a false "not from your wallet" warning

- **Rows:** F08, R08. **Severity:** Medium, **blocks release 1** (Wyatt, 2026-11-06): ordinary admin actions reach it (restoring the site from an older backup, switching to a wallet that's been paid before), the loop grows without limit, and its false "not from your wallet" alarm teaches admins to ignore the real one (RT-08). **Pass 1, fix sessions** (the combined live session, step 2, on dev release `0.0.202611022057-dev.1df3c4d`). Test: none yet (no code changes this session).
- **What I did:** step 2, step 6's rerun. The phase 05 wallet installed with `--restore-height 2230020` on the dev site, where it's wallet 1 with one claimed row (index 1, the old RT-31 tip). Index 2 had also been paid. Corrected 2026-11-06: this said "in the phase 05 setup test, but the site never had a row for it". In fact a checkout tip paid it on 2026-10-30 at height 2,240,130, on a reset site where the wallet was wallet 0 and index 2 was a claimed row (`~/xmr-pay-dev-data/baseline/data.db.before-restore-20261030T200451477Z`). That day's restore erased the row.
- **What happened** (times UTC, from the site's database; evidence below):
  - 22:57:29.801: the probe answer matched wallet 1, with `receivedTop` 2 (stored as `state:paidTop:1` 2). The bridge sent 50 addresses, indexes 3 to 52.
  - 22:57:30.104: the bridge's pool check reported index 52 as bad. The site marked it bad and raised the sticky pool-check mismatch for the new key.
  - The site, now one free address short, asked for one more. The bridge created 53, reported it bad on the next sync, and so on. By 22:58:26.094, 137 rows (52 to 188) were bad. The free rows were 3 to 51 and 189.
  - 22:58:27: I stopped the dev site, which ended the loop: the bridge's sync in flight got EOF at 22:58:27.017. Its last report, index 189, never landed, so the site holds 189 as free. The bridge then backed off as designed (15 s, 30 s, 1, 2, 4 and 5 minutes).
  - **The bridge's side** (its journal, 22:54 to 23:10 UTC):
    - 22:57:29.500 "answering the site's wallet probe" `match=true receivedTop=2`;
    - 22:57:29.636 "re-offering this wallet's unused addresses" `from=2 count=0` (index 2 is paid, so nothing to re-offer);
    - 22:57:29.749 "created pool addresses" `count=50` (3 to 52);
    - from 22:57:30.101, 138 warnings "the site holds addresses that aren't from this wallet", each naming one index, 52 to 189, alternating with 137 "created pool addresses" `count=1`.
    - One cycle took 0.23 s at the start and 0.72 s at the end, 0.42 s on average, slowing as the site's rows grew. Nothing in the bridge slowed or stopped it; only a warning was logged.
  - No invoice was affected: all the bad rows were free (0 invoices with `not_your_wallet`).
- **Cause:** `checkPool` (`bridge/internal/bridgeloop/bridgeloop.go`) reports any check-list row above `claimedTop + maxPool` as bad at once, with nothing created (RT-27's bound). With `claimedTop` 1, that bound is 51. But the top-up starts above `receivedTop`, 2, so a full pool of 50 ends at 52, past the bound. Every address the bridge creates to refill is past it too, so the loop never ends.
- **Reach:** any re-pair whose matched wallet has received at an index above the site's highest claimed row: a wallet used by another install or another site, a site restored from an older backup, or a payment to an address the site never handed out. The shop wallet's re-pairs in 46's live check didn't hit it, because its `claimedTop` (358) was above its highest paid index (305).
  - **The setup test doesn't cause it (traced in code 2026-11-06, Wyatt's question; not run):** Get a test address claims its pool row and nothing releases a claimed row, so the paid index stays at or below `claimedTop`. A re-pair after setup has bound 51 and addresses up to 51.
  - **A switch to a used wallet (traced, not run):** no match gives `claimedTop` 0 and bound 50, and the top-up starts above `receivedTop`, so any `receivedTop` of 1 or more loops if the scan covers the payment. RT-30's fix makes `receivedTop` real, so this path is open now.
  - **No `--restore-height` needed:** a default install scans back to the oldest watched invoice − 720, across every wallet, and tips stay watched for up to 7 days. Live on 2026-11-06, two wallet-0 tips pulled a new wallet's scan back to 2,241,400.
- **Harm:**
  - The bridge creates subaddresses without limit, about two a second, and syncs about every 0.4 s while it does.
  - The site's pool fills with bad rows, and the admin sees the sticky "addresses not from your wallet" warning, which is false here.
  - No money is at risk. A bad row is never handed out, and the bad rows here had no invoices.
- **Fix idea (Wyatt decides; next session's plan, tests first):** take the bound from the same base as the top-up, `max(claimedTop, receivedTop) + maxPool`, or report as bad only a row whose address the wallet holds with a different digest, or doesn't hold. Either way, an address the bridge created itself must never come back bad. Note (2026-11-06): the `max` form alone looks insufficient, because the bridge sets `receivedTop` only when answering a probe and holds it in memory, so after a restart the bound falls back and the same rows would come back bad.
- **Evidence:** the site's database as the loop left it, `~/xmr-pay-dev-data/redteam/live-step2-loop.db` (SHA-256 `a0e7a7b991159462f1e23266cf60497257134eaedc0b3bb1b76b374ad5a57616`, `integrity_check` ok); the watcher's log `~/xmr-pay-dev-data/live-step2-watch.txt`; the collection script's output `~/xmr-pay-dev-data/live-step2-output.txt`. The bridge's journal for 22:54 to 23:10 UTC, saved by Wyatt (sudo), `~/xmr-pay-dev-data/redteam/live-step2-bridge-journal.txt` (304 lines, SHA-256 `18c82b47008250f9684e54324e302add8a8c691c7bdd9a3ffd41bf9b44c29b39`; no key, seed or password words in it).
- **Fix (2026-11-06, spec change 48, Wyatt's direction):**
  - **The check:** `checkPool` compares digests for every index the wallet holds, whatever its number. The `claimedTop + maxPool` bound applies only to indexes it doesn't hold, so RT-27 stays closed.
  - **The premise needed work:** the wallet's address count didn't survive a crash. `TestLiveStoreSurvivesKill` against the real wallet-rpc: without a save, index 50 was forgotten after `kill -9`; with `store`, kept. The bridge now saves after every create (top-up, catch-up, the probe's index 1), before the addresses go out. A failed save warns on Health and in the log, the addresses still go out, and the next sync tries again.
  - **The circuit breaker:** stops top-ups and shows a Health error when the check flags an address created in this run (`bad_created`), or after 100 addresses created for the pool without `claimedTop` rising (`too_many`; catch-up doesn't count). A restart or a new pairing clears it.
  - **Tests:** `bridge/internal/bridgeloop/rt32_test.go`, including step 2's live shape, a restart in the middle, and a fresh install from keys. No existing test changed; the shared fake wallet gained `Store`.
  - **Known limit:** a wallet that lost addresses with no re-pair still reports a row above the bound as bad. The realistic way there is a failed save followed by a crash (a full disk, say); a lost wallet file is the other. Separately, someone with a stolen bridge key can trip the breaker by forging a row (tips refuse once free rows run out; RT-08's real alarm still shows).
- **Live (2026-11-07 03:45 UTC, step 2's rerun, dev release `0.0.202611070301-dev.82ac08d`):** the same database and wallet as the loop. `match=true receivedTop=2`, 50 created once, free rows 3-52, index 52 above the old bound of 51 checks out, still 2 bad rows, address check OK. After `sudo systemctl restart xmr-bridge`: nothing created, the same rows, still OK. A fresh tip on index 3 settled.
- **Status:** fixed; live passed. Not exercised live: the breaker tripping, and a failed save (unit tests; both banners seen once by Wyatt).
- **Live data point (2026-11-07 00:35 UTC, combined session step 5, first install):** a fresh install of wallet 1 answered `receivedTop=2` with the site at `claimedTop` 3, caught up to 3, re-offered from 4 with count 0, created 50 addresses and didn't loop. That fits the finding's condition, a paid index above `claimedTop`, which didn't hold here.

## RT-33 — The height floor moves a tip settled before the floor existed to review as "reversed", with an alert

- **Rows:** R10, T14. **Severity:** Low, doesn't block release 1 (Wyatt, 2026-11-06), since 1.0.0 can't hold a pre-floor invoice; closed with RT-34's fix if one change covers both. **Pass 1, fix sessions** (the combined live session, step 2). Test: none yet.
- **What I did:** the same step. The old RT-31 tip `inv_f7ea94de1471f114` (`createdHeight` 2,242,155) was settled at 2026-11-02 16:30:42 UTC, before the floor existed, on three transfers mined at 2,230,085, 2,230,165 and 2,240,100.
- **What happened:** at the probe answer (22:57:29.801 UTC), wallet 1 became current. The tip went from settled to review with reason `reversed`, and the site raised a "reversed" alert. Wyatt's answer 1(a) to the 47 build plan was that it stays "settled" as history, with the ignored-payment line worked out when the page is shown.
- **Cause:**
  - The build plan said syncs never look at a settled tip like this one again. That was wrong.
  - `isWatched` (`plugin/src/core/watch.ts`) keeps a settled invoice watched until its counted depth reaches 10 (`FINAL_DEPTH`), for at most 24 hours after settling. With the floor, all three transfers stop counting, so the counted depth is 0 and the tip, 6.5 hours after settling, is watched again.
  - While wallet 0 was current, it wasn't reported. Once wallet 1 matched, the snapshot was evaluated with the floor: the counted total fell to 0, which is the "reversed" rule (R10).
- **Reach:** invoices settled before the floor shipped, inside 24 hours of settling, whose transfers sit below the floor. On the dev site, only this tip. A site upgrading from a pre-floor development build could hold others.
- **Fix idea (Wyatt decides):** judge a settled invoice's depth and reversal on the transfers that settled it (no floor for an invoice settled before the floor), or leave the floor out of the settled branch of `isWatched` and the reversal check.
- **Evidence:** as RT-32 (the loop database holds the tip in review and the alert; `live-before-step2.db` holds it settled).
- **Note (2026-11-06):** 1.0.0 is the first public version, so a released site can't hold a pre-floor invoice and this can't occur there. RT-34 reaches the same "reversed" result from a different cause.
- **Fix (2026-11-06, spec change 48):** with RT-34. A settled invoice with no stored floor has no floor for totals or the watch list, so it stays settled and leaves the watch list. Its old payments still show on the ignored line (spec change 47's answer 1(a)), the one place a counted payment is listed. Tests: `plugin/tests/redteam/rt34.test.ts`.
- **A related gap, found 2026-11-06, from reading the code; not run:** 1.0.0 can't hold a pre-floor invoice, but Mark settled writes a settled invoice with no stored floor, so the same branch is reachable on a release. Display only. See spec change 48.
- **Status:** fixed in code; unit-tested, its live window has ended.
- **Live data point, RT-33's fix still open (2026-11-07 00:50 UTC, combined session step 5):** a settled tip created after the floor existed (`inv_bf39dc72bcab799f`, wallet 1, settled 22:02:41 on 2026-11-06) stayed settled with its transfer when the site switched to wallet 0, about 3 hours into its 24-hour watch window, read 1½ minutes after the switch. It doesn't cover RT-33's own case, a tip from before the floor, which 1.0.0 can't hold.

## RT-34 — After a height heal, an inflated invoice's floor follows the site's height, so an honest settled payment turns "reversed"

- **Rows:** R10, T14. **Severity:** Medium, fix in release 1, in the same plugin change as RT-33 (Wyatt, 2026-11-06): it marks honest payments reversed and can leave one uncredited for good, which becomes a fulfilled order flagged reversed in release 2. If the fix grows past one session, Wyatt decides; it can wait for 1.0.x, before orders exist. **Pass 1, fix sessions** (found tracing RT-33 on 2026-11-06). Test: none yet. Not run live: nobody paid the inflated tip in step 3.
- **What I did:** ran `evaluate` from `plugin/src/core/invoice.ts` in memory, with nothing written, on a tip with `createdHeight` 3,245,086 and a payment mined at 2,245,088, at rising site heights.
- **What happened:**
  - Site height 2,245,090: settled (floor 2,245,060).
  - Site height 2,245,118: still settled (floor 2,245,088).
  - Site height 2,245,119: **review, `reversed`, with the alert** (floor 2,245,089), 31 blocks after the payment was mined, with no wallet change.
  - Controls with an honest `createdHeight`, including a site height lowered and raised again: stayed settled.
- **Cause:** `floorHeight` is `min(createdHeight, siteHeight) − 30`. With `createdHeight` inflated, the minimum is the site's height, so the floor rises with the chain indefinitely. `isWatched` keeps the invoice watched, because its floor from `createdHeight` alone leaves the counted depth below `FINAL_DEPTH`, for 24 hours after settling.
- **Reach (traced in code, not run):** a 1.0.0 site can get an inflated `createdHeight`, but not from one dishonest remote node or from a pairing with no height.
  - **Doesn't inflate it:**
    - A pairing with no height keeps the stored height and never raises it; a fresh site stays at 0 and tips are refused with `WALLET_HOST_SYNCING`.
    - A remote node lying alone is capped at the second node's height + 10, below the 30-block margin, so the floor stops under the payment.
    - A second node lying alone: the wallet's honest height is reported.
  - **Does inflate it:**
    - A remote node and one listed second node from another operator, both lying. One random pick is enough, because `max()` keeps it until a pairing.
    - A node treated as "own" (loopback, private or link-local, including a tunnel to a remote node) that lies: there's no bound at all.
    - A mainnet to stagenet re-pair whose pairing carries no height: no attacker needed. The site keeps about 3.8M on a chain at about 2.2M.
    - The holder of the signed bridge key, who can already forge payments.
  - **The reversal also needs:** a re-pair that heals the height, a payment mined after the heal or within 30 blocks before it, and 31 more blocks inside the 24 hours after settling.
- **Harm:** a false "reversed" review and alert on an honest payment; no money lost. Release 1 has tips only. With orders in release 2, it would flag an order already fulfilled. Related: a payment to an inflated tip mined more than 30 blocks before the heal stays ignored for good.
- **Fix idea (Wyatt decides; tests first):** keep the floor from rising once the invoice's height has healed, or judge a settled invoice on the floor it settled under.
- **Fix (2026-11-06, spec change 48, Wyatt's direction):** settling stores `settledFloor`, which never moves. A healed height stores `floorPin` once: the site's height − 30 − 2 × the blocks expected since creation, so a payment mined long before the heal is credited. The ignored line uses the same floor as totals; Wyatt caught that my plan would have listed a counted payment as ignored, and a mutation check shows the new test fails if that comes back. Tests: `plugin/tests/redteam/rt34.test.ts`, from the in-memory run's shape.
- **Status:** fixed in code; unit-tested, not live (Wyatt, 2026-11-06).
