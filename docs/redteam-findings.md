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
| RT-08 | Medium | T03, P02 | 1, 1 | A forged sync adds a pool address a tipper then pays, widening the stated "free goods / fake tip" limit | open |
| RT-09 | Low | P02 | 1, 1 | A forged sync adds a pool row duplicating an address already held | open |

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
- **Status:** open.

## Observations, round 1 (no finding)

- **The freshness window's future edge has a second of slack** (T04). The `x-xmr-ts` header is whole seconds and the server reads its clock a few hundred milliseconds after the sender, so a timestamp 301 s ahead was accepted once in round 1 (it landed 300.x s ahead); +301 s and beyond were refused in every later probe, as were −301 s and beyond. The exact edges are tested with a fixed clock in `protocol.test.ts`. The suite now checks ±299 s accepted and ±302 s refused.
- **A refused sync doesn't count as hearing from the bridge** (T03, R13). Unsigned, wrong-key and stale syncs left KV, including `state:bridge`, byte for byte unchanged, so they can't hide the silent-host alert.

## RT-08 — A forged sync adds a pool address a tipper then pays, widening the stated "free goods / fake tip" limit

- **Rows:** T03, P02. **Severity:** Medium (Wyatt rules). **Pass 1, round 1.** Group D (stolen bridge key; `plugin/tests/redteam/stolen-key.test.ts`, "[T03][P02] [RT-08] D2: an address a forged sync adds to the pool is never handed to a tipper to pay").
- **What I did:** holding the paired key, a forged sync added one pool address the attacker chose (index 2). The one honest address (index 1) was then claimed by a checkout, and the next tipper's checkout was handed index 2.
- **What happened:** the second tipper's invoice address was the attacker's. So with the signing key, an attacker doesn't only forge a received tip (D1); they can make a real tipper's payment go to an address the shop's wallet isn't watching.
- **What the spec says:** Security model, "Forged payment events (signing key stolen)": "The result is free goods, not lost funds." The bridge's job includes supplying pool addresses (pool top-up), so a stolen key supplying addresses is within the mechanism — but the stated consequence (free goods / a fake tip shown received) doesn't name "new tips routed to the attacker", and that needs no control of the pay page.
- **Reach:** needs the bridge signing key (the stolen-key position, a stated design limit). Within that, it reaches real tipper money, not only a fake record. The pay-page-control caveat in the spec's wallet-host table (an attacker who controls the site "can show their own address on the pay page") covers a site break-in, not a stolen bridge key on an intact site. This is a report-completeness finding against the T03 wording: the public report must state that a stolen bridge key can route new tips to the attacker, not only mark invoices paid. Scope matches the plan's D2 break condition exactly; no probing beyond D2 (Wyatt, 2026-10-26).
- **Evidence:** vitest output, round 1.
- **Status:** open. For Wyatt: whether this is a wording fix to the report (the mechanism is the stated stolen-key limit) or a change (e.g. the plugin pinning pool addresses it can verify belong to the shop wallet — but the plugin holds no wallet material, so it can't verify an address; this likely stays a documented limit).

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
