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
| RT-10 | Low | T22 | 1, 1 | The way-back validator matches its refused prefixes case-sensitively | open |
| RT-11 | High | T20, P02 | 1, 1 | A sync adds a wrong-network subaddress to the pool (the pre-agreed mixed-network finding) | open |
| RT-12 | Medium | T01, R11 | 1, 1 | One expensive plugin request blocks all others on the Node runner for the full 30 s wall | open |
| RT-13 | Low | F01 | 1, 1 | A slow request body isn't bounded by the 30 s wall; a connection can be held open past it | open |
| RT-14 | Low | F04 | 1, 1 | The admin handler settles or expires an open tip the release-1 page offers no action for | open |
| RT-15 | Medium | R11, R13 | 1, 1 | At a spam-cap-sized backlog each sync's watch scan takes ~28 s, within ~2 s of the 30 s wall | open |

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
- **Status:** open; fix in pass 1 per the ruling.

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
- **Status:** open.
