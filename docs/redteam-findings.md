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
