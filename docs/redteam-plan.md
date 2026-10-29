# Coffer — Adversarial test plan

One file for both passes. Pass 1 (phase 07b, release 1, tips) is below. Pass 2 (phase 08b, orders) is added before that pass. Each pass runs only its own rows (`docs/phases/07b-adversarial-testing.md`, attack catalog).

Written by the attacker session, not the builder. It covers every matrix row in the pass's scope with the attacks to run, the layer, and what result counts as a break. Wyatt approves this section before round 1.

---

# Pass 1 (phase 07b, release 1 — tips)

Branch `redteam-1` (local; Wyatt merges and pushes after the retest). Finding IDs run `RT-01`, `RT-02`, … across both passes and are never reused. Findings go in `docs/redteam-findings.md`.

## Scope and rules (from the Attacker brief)

- **Targets:** dev site at `http://localhost:4321` (dev mode) and the built copy at `127.0.0.1:4322`; the plugin through `createPluginTestHost()` / `createPluginRuntimeTestHost()` and the `redteamHost()` harness; the bridge through Go tests, `httptest` hostile servers (`bridge/internal/hostile`), `go test -fuzz`, and faked wallet-rpc/node replies; the installer on `coffer-test` only when Wyatt runs the `sudo` step; the canary plugin in `spikes/sandbox-canary/` on the dev site.
- **Never touch:** wyattdilley.com and its infrastructure, the public test hostname, any machine not listed, mainnet, wallet seeds/spend keys and `~/stagenet-wallets/`. The view key reaches a program only through `scripts/with-shop-env.sh` and is never printed. Never disable EmDash's or the OS's own protections to make an attack land.
- **Work rules:** `CLAUDE.md` applies in full — no new dependencies or attack tools without asking; one heavy process at a time; `free -m` before each heavy run (stop at <1.5 GB available); no pushing. Don't fix Coffer's code — write the attack as a test, run it, file the finding.
- **A succeeding attack is committed red and honest:** `it.fails("[Txx] [RT-nn] …")` in vitest, `t.Skip("RT-nn open")` in Go, so CI stays green. The fix session flips it to a normal test.
- **Plugin randomized input:** a seeded generator (`plugin/tests/redteam/random.ts`, sfc32); print the seed on failure (`REDTEAM_SEED=<n>` reproduces).
- **Go fuzzing:** `GOMAXPROCS=2 go test -fuzz=<Name> -fuzztime=10m -parallel=2`, one target at a time; commit any crasher to `testdata/fuzz/`.
- **Evidence** under `~/xmr-pay-dev-data/redteam/`. Redact IPs, tokens and user names before anything enters the repo.

## Harness in place (07b setup session, 2026-10-26)

- `scripts/redteam/lib.mjs` — loopback guard, RFC 8032 test keys, signed/tampered syncs, fake addresses, KV-shortcut code, `flood()` (≤50 in flight, stops <1.5 GB), `VACUUM INTO` backups (`backup.mjs`), evidence paths.
- `plugin/tests/redteam/` — `random.ts` (seeded hostile generators) and `harness.ts` (`redteamHost()`: signed/tampered syncs, raw checkout, status, price stub, `checkoutAs(meta, …)` for a chosen `requestMeta.ip`/`.geo`). Runs in the default vitest config.
- `bridge/internal/hostile` — scripted hostile servers (stream, drip, hang, cut, redirect, untrusted TLS, JSON-RPC by method, rewriting proxy); test-only (`go list -deps ./cmd/xmr-bridge` excludes it). Wired in `hostile_test.go` beside syncclient, crosscheck, noderpc, walletrpc, selfupdate.
- `spikes/sandbox-canary/` — slug `coffer-canary`, Coffer's exact manifest, 14 probes + a spin route; `canary-site.mjs on|off|status`, `canary.mjs`.
- `scripts/redteam/scan-at-rest.mjs` — scans a `VACUUM INTO` copy, `-wal` and the dev log for the view key (six encodings), `--code-file` codes, `--secret-file` secrets and `--ip` addresses; PASS/FAIL with a location, never a value.
- Baseline: `~/xmr-pay-dev-data/redteam/baseline-1.db` (38 invoices, 338 pool rows, 8 KV rows, 1 setting). Snapshot `pre-redteam-1b` is Wyatt's roll-back point.

Builder left for the attacker/fix sessions (not yet built): fuzz targets; T27 certificate tests (TLS helpers ready); T20's failing test; floods; the wallet-host `sudo` scan wrapper (T29); the live TLS man-in-the-middle proxy for spec change 28 — **not built this pass** (Wyatt, 2026-10-26: E5 runs as a Go `httptest` approximation; the live MITM row is deferred to phase 09).

## Rounds and order

- **Round 1 — black box.** Public routes and published behavior only (spec + matrix). Host/Runtime/Theme/Go layers are fair game because they exercise published behavior, but no reading of `plugin/src` or the bridge's non-test source for the attack design. Groups A, B, C, D (through the public route), H, and the plugin-side of F.
- **Round 2 — white box (fresh session).** Read the approved plan and round 1's findings, then `plugin/src/` and `bridge/` looking for places the code does less than the spec says. Re-aim the group-E/F/G/J attacks the source suggests; add attacks the catalog missed.
- **Manual / Wyatt / live** attacks (admin-page injection render, installer `sudo` steps, journal scan, real stagenet payments in K) are scheduled across both rounds as Wyatt is available; each writes its own output file.
- **Heavy runs** (floods H, fuzzing F, large-backlog H) are run one at a time with `free -m` checked first; `pre-redteam-1b` is the recovery point.

## Severity (reminder)

Critical: money (incl. a tip) anywhere but the shop wallet; any key/view key/wallet-rpc login/plaintext pairing code leaks; anyone without the bridge key makes the plugin accept a sync. High: a tip recorded paid without a valid confirmed payment and without a stolen key; buyer/tipper contact data readable by a non-admin; an anonymous request that crashes/hangs at will. Medium: checkout outage beyond the spec's stated limit; inconsistent state after an error; a promised check missing but not yet exploitable. Low: internal detail in errors, wrong codes, misleading admin text. Accepted limit: matches a spec/`decisions.md` design limit — recorded, not fixed.

---

## Attack plan

Attack IDs mirror the catalog's groups (A–L). Each lists: catalog source, matrix rows, layer, what I'll do, and the **break** condition (what, if observed, is a finding rather than expected behavior).

### A. Anonymous visitor: `checkout`, `status`, pay page

**A0 — No order/product path in a release-1 build.** Rows T06, T21, F02. Layer Host, dev site, Theme/CI.
Do: with the release-1 switch off (as committed), POST `checkout` with `kind:"order"`, `kind:"product"`, a product id/slug, and `product`/`productRef` smuggled onto a `kind:"tip"`; try `kind` variants `"Order"`, `"ORDER"`, `" order"`, `"order\n"`, `"prod­uct"` (with a soft hyphen / zero-width char). Confirm no order/adapter route resolves. On the admin page (via Wyatt's tunnel) confirm no products-filtered "All invoices" table, no "find it under All invoices" hint, no product-only row action. Confirm the release-1 `@cofferhq/astro` package exports no `PayButton`.
Break: any order/product checkout succeeds or is treated differently from an unknown `kind`; any order control/table/hint present; `PayButton` exported; a tip carrying `product`/`productRef` reaches product logic.

**A1 — Client-supplied amount/rate/currency/required on a tip checkout.** Rows T06, F02. Layer Host.
Do: send `amountAtomic`, `amount`, `rate`, `currency`, `required`, `expectedAtomic`, `minAtomic` with a tip checkout; switch `kind` mid-body; send a fiat `amount` plus a contradictory `amountAtomic`.
Break: any client-sent value changes the invoice's expected amount, rate, currency, or locked `required`; the locked rate differs from the server's price-API rate.

**A2 — Price API poisoning.** Row T06. Layer Host (queue responses via the harness price stub).
Do: make the price source return `0`, a negative, `NaN`, `Infinity`, `1e308`, a 30-digit integer, HTML, an empty body, a 500, and a slow reply; change the rate between two checkouts; have the first host fail and the second answer.
Break: checkout settles on a nonsensical/stale rate; `expectedAtomic` is `0`, negative, non-integer, or a float; no `RATE_UNAVAILABLE` when both sources are unusable; a fiat tip doesn't fall back to an open tip when configured to.

**A3 — Hostile buyer fields.** Rows F02, T08. Layer Host, Manual (render).
Do: wrong types, unknown fields, 1 MB strings, bidi/zero-width/control characters, HTML/`<script>`/SVG/`javascript:` payloads, and SQL/NoSQL-ish fragments in the tip `note` (and any other accepted field). Check the stored form and (Wyatt, via tunnel) the admin-page render.
Break: oversize/bad input accepted past the schema (note > 140 chars, control/format chars not stripped); anything stored that renders as live markup, an executed script, or a broken layout on the admin page; a crash or 500.

**A4 — `status` token handling.** Row F03. Layer Host, dev site.
Do: `status` with empty, malformed, 10 KB, control-char, and well-formed-but-unknown tokens.
Break: any reply differs from the generic not-found (leaks existence, a stack trace, an internal id, or a different error code per case); a crash.

**A5 — Pay-page / status headers and third-party loads.** Row T09. Layer dev site, Theme.
Do: fetch the pay page and `status`; inspect `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `noindex`, the CSP and its hashes; watch for any third-party request from the page; confirm the token appears once (same-origin status URL only); render with headers stripped (fails closed).
Break: a missing/weaker header; any third-party asset; the token in a `Referer` or a cross-origin URL; the page rendering content without its headers.

**A6 — Spoofed `Host` / `X-Forwarded-Host`.** Row F06. Layer Runtime, dev site.
Do: set `Host`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `Origin` on every public route and read back any URL the plugin builds (pay URL, `uri`, redirects).
Break: any plugin-built URL or redirect reflects an attacker-chosen host/scheme.

**A7 — Open-invoice cap and pool drain (anonymous, bridge stopped).** Rows T05, P02. Layer Host, dev site.
Do: with the bridge stopped, open tips until the site-wide cap is hit, then keep going; since tips stay open, verify the pool can't refill and eventually empties. Confirm no address is reused across invoices.
Break: a checkout past the cap claims a pool address; any address appears on two invoices; a reused `addrIndex`/`subaddress`; checkout permanently locked by the cap in a way the spec doesn't state (the stated limit is an *outage*, not money loss — see D2).

**A8 — Concurrency race for the last free address.** Rows T05, P02. Layer Host, dev site.
Do: 50 concurrent checkouts racing for one remaining free address (harness `flood()`), repeated with seeds.
Break: two invoices get the same address; a claimed address double-assigned; a crash/inconsistent pool row; more invoices created than free addresses.

**A9 — `returnUrl` / way-back open redirect.** Rows T22. Layer Host, Theme, dev site.
Do: tip checkout and pay-page `returnTo` / `?return=` with `//evil.example`, `https://evil.example`, `javascript:…`, `data:…`, backslashes `\evil`, dot-segments `/../`, double/triple percent-encoding, Unicode look-alike slashes (U+2044, U+FF0F), a target of the pay pages and the admin, and a >512-char value and control chars.
Break: any value that isn't a same-origin path/query is accepted and used as a redirect target; >512-char or control-char values accepted.

**A10 — Tip amount bounds.** Row F02. Layer Host.
Do: tips below the dust floor (0.0001 XMR = 1e8 atomic), exactly at it, one atomic unit under, and absurdly large (near and above 2^64−1); fiat amounts rounding to below the floor.
Break: a sub-floor tip accepted as settleable; the floor miscomputed; an amount parsed as a float or overflowing; a tiny fiat tip not raised to the floor.

**A11 — Per-entry tip totals (counting integrity).** Rows F02, T06, **T30** (new, see "New matrix rows"). Layer Host (totals are admin-only, `admin.ts`).
Do: tip a nonexistent / draft / trashed / private entry, and tip with another entry's id; drive invoices to expired, late (n/a for tips) and reversed and read the per-entry total.
Break: a total counts anything but a *settled* tip; a tip attributed to an entry that shouldn't accept one; a total readable for a private/draft entry.

**A12 — No public tip surface exists (absence check).** Rows T08, P03. Layer dev site, Theme.
Context: spec change 34 (the public "tips received" count) is **deferred**, and the theme has only `PayPage.astro` and `TipButton.astro` — per-entry totals live only in the admin page (`admin.ts`). So release 1 should expose *nothing* about tips publicly.
Do: confirm no public route or theme surface returns a tip count, a per-entry total, an amount, or a note; submit a hostile note and confirm it never surfaces anywhere public; check that no setting turns a public count on.
Break: any tip count/total/amount/note reachable publicly; a public tip route exists; a note surfaces publicly. (If found, it's also a trust-contract/spec-change-34 violation.)

**A13 — Tip across a silent bridge / syncing node (settles once).** Rows R06, R12, T05. Layer E2E (with K).
Do: pay a tip while the node is syncing / the bridge silent (tips stay open by the Oct 12 decision); bring the bridge back; confirm it settles exactly once.
Break: double-count, lost payment, or a tip refused at checkout while silent (tips must stay open).

### B. Logged-in non-admin / cross-site: `admin`

**B1 — Authorization on `admin`.** Row F04. Layer Runtime, dev site.
Do: call `admin` anonymously, as a logged-in user without `plugins:manage`, and without the `X-EmDash-Request` header.
Break: any of the three reaches an admin action or reads admin data.

**B2 — Admin row-action abuse.** Rows F04, T07, T13. Layer Host.
Do: row actions on unknown invoice ids; negative/zero/huge confirmation values; lowering `required`; marking an expired/reversed invoice settled; issuing pairing codes in a tight loop; acting on stale invoice state.
Break: `required` lowered; an expired/reversed invoice force-settled in a way that fulfills; a crash; unbounded pairing-code issuance with no single-active-code guarantee; a state change from stale input.

### C. Reaches `bridge/sync`, holds no key

**C1 — Signature forgery.** Row T03. Layer Host, Runtime.
Do: no `x-xmr-sig`; garbage sig; a valid sig over *different* bytes; a valid sig from an *unpaired* key; a valid sig with one bit flipped; correct sig but body mutated by one byte after signing.
Break: any of these applies a snapshot, tops up the pool, or changes any invoice; the signature checked *after* decoding rather than on raw bytes.

**C2 — Freshness and replay.** Row T04. Layer Runtime.
Do: `x-xmr-ts` at 299 s and 301 s, past and future; the exact same signed body twice; `seq` equal to, below, and far above the last accepted per invoice; a re-signed replay with a fresh timestamp but stale `seq`.
Break: a sync outside ±300 s applied; a non-newer `seq` applied; a replay double-applied; the 300/301 boundary wrong.

**C3 — Hostile `bridge/sync` body (fuzz + structured).** Rows F01, T11. Layer Runtime (seeded random + `go test -fuzz` on the plugin-side parser is N/A; plugin uses seeded random).
Do: random bytes, invalid UTF-8, a leading BOM, truncated JSON, duplicate keys, unknown fields, `v:0` and `v:99`, amounts negative/decimal/exponent/`>2^64−1`, `unlockTime` non-zero and huge, a 33rd transfer, a body at `maxBytes` (256 KiB) and one byte over. Seeded generator; print seed on failure.
Break: any input past the signature gate changes state, crashes, hangs, or is parsed as a float/overflow; a BOM'd correctly-signed body mishandled; the cap off by any amount.

**C4 — Proxy-added headers.** Row T03. Layer dev site.
Do: add `Origin` (cross-origin) and `Authorization: Bearer …` to a valid signed sync, as a proxy might.
Break: EmDash doesn't reject them (spec: 403 `CSRF_REJECTED` / 401), or the plugin accepts the sync with them present.

**C5 — Slow-body / wall-time.** Row F01. Layer dev site.
Do: a request body that drips for ~60 s against `bridge/sync`.
Break: the request outlives the 30 s wall limit; the site stops answering other requests meanwhile.

**C6 — Pairing abuse.** Row T13. Layer Runtime, dev site.
Do: a guessed code; an expired code; an already-used code; a `pair` field with no active code; a `pair` body over 4 KiB; a `pair` signed by a key other than the one in the body; two simultaneous pair requests with the same valid code.
Break: any pairs successfully; the body parsed-before-signature outside the active-code/<4 KiB exception; both simultaneous requests win.

### D. Holds a stolen bridge key (pair the RFC 8032 test key)

The spec's stated worst case is free goods / a fake tip shown received, not lost funds. Map the exact blast radius.

**D1 — Forge a settled invoice.** Row T03. Layer Host. Expected: works; stated limit. Record precisely what "settled" fulfills for a tip.
**D2 — Push attacker-controlled pool addresses.** Rows T03, P02. Layer Host. Do tippers then pay the attacker? Also push addresses that reuse an existing index or duplicate a held address.
Break (beyond the stated limit): a forged sync causes **new payments to go to an attacker address** without the stated "controls the pay page" caveat already covering it — i.e. the "free goods" wording is incomplete; if so the report must say so. A duplicate/reused index corrupting the pool is itself a finding.
**D3 — Review-queue / state abuse.** Rows T03, T12. Layer Host. Make a settled invoice look reversed (flood review); re-open an expired invoice; drop transfers from a snapshot.
Break: reversal/re-open reaches a state the lifecycle forbids, or corrupts counting.
**D4 — Watch-list manipulation.** Row T03. Layer Host. Shrink the watch list; send huge indexes.
Break: a crash, an unbounded scan, or lost tracking of a real invoice.
**D5 — Can a forged sync change amounts/required?** Row T07. Layer Host. Expected: no.
Break: a forged sync lowers `required` or changes any amount/currency on an invoice.
**D6 — Inflate a per-entry tip total with forged settled tips.** Row **T31** (new, see "New matrix rows"). Layer Host. Record how far it goes.
Break: scope is wider than D1's single-invoice "fake tip received" (this is the tips analogue of "free goods" and must be stated).

### E. Hostile site or network, aimed at the bridge (Go)

**E1 — Absurd pool/watch instructions.** Row F05. Layer Go (`httptest`). Site answers `poolTop` near 2^32, `poolTarget` ~1e9, a million-entry watch list.
Break: the bridge creates millions of subaddresses or rescans forever; no bound.
**E2 — Hostile HTTP responses.** Row F05. Layer Go. 100 MB reply; a reply that drips for minutes; a redirect to another host; 401/403; wrong content type; invalid JSON.
Break: unbounded read, redirect followed off-host, hang, or a crash; a bad reply reported as payment data.
**E3 — Untrusted/expired TLS on the site and release host.** Row T27. Layer Go (`httptest.NewTLSServer`). Sync client and downloader each against a server whose cert isn't trusted; plain http for downloads. This is T27's accepted scope for pass 1 (Wyatt, 2026-10-26: one self-signed-server test per client).
Break: any connection accepted without a trusted cert; `InsecureSkipVerify` reachable in a build; plain http accepted.
**E4 — Dishonest node (offline).** Row T14. Layer Go. Lies about height; txid in the wrong block; both nodes lie; both nodes unreachable.
Break: a confirmation reported despite a block-hash mismatch; a crash when both are down instead of withholding.
**E5 — MITM on an https node with a cert for another name (spec change 28).** Rows T14, T27. Layer Go (`httptest`) this pass; live row **deferred to phase 09** (Wyatt, 2026-10-26). Approximate the MITM at the Go layer: a hostile node server (trusted test cert, since E3 covers the cert-trust path) feeds a false height, a fake transfer and a reordered block, and I record whether the cross-check catches each. The live wallet-rpc "does it check the cert name" question (expected today: no) is **recorded as deferred to phase 09, not run as a pass** — its result is the evidence for the TLS-forwarder decision.
Break: the cross-check misses a lie it should catch at the Go layer.
**E6 — Hostile wallet-rpc replies.** Rows F05, T11. Layer Go. Huge numbers, missing fields, negative amounts, non-zero `unlock_time`.
Break: a payment reported from an unparseable/invalid reply; a float/overflow; a non-zero-unlock transfer counted.
**E7 — Double-spend flag on an already-counted transfer.** Rows T11, T12. Layer Go, Host.
Break: a flagged transfer still counts; the invoice doesn't move to review/reversed.

### F. Supply chain, install, wallet host

**F1 — Wallet-host posture after install (Wyatt, `sudo`).** Row T10. Layer Install, Manual. `ss -tlnp`/`ss -tnp` on `coffer-test`: wallet-rpc listens only on 127.0.0.1 and refuses requests without its login; the bridge opens no port; over a few sync cycles outbound goes only to the site, the node(s), and the release/download hosts.
Break: any other listener, any inbound port, or outbound to an unexpected host.
**F2 — Update integrity.** Rows T16, T26. Layer Go. A bridge update with a bad signature; a validly-signed *older* version (downgrade); a truncated binary; an older signed `monero-wallet-rpc` offered as an update.
Break: any installs; the running version replaced by a bad/older one.
**F3 — `hashes.txt` tampering.** Row T16. Layer Go. Bad GPG signature; a mismatched hash for wallet-rpc; (reuse the fuzz/tampered-corpus rule: no generated input verifies).
Break: any accepts.
**F4 — Tampered installer / same-machine bypass (Wyatt, `sudo`).** Rows T16, T15. Layer Install. A tampered `install.sh` from the dev release server; the same-machine check bypassed by a flag on mainnet.
Break: a tampered script runs to completion; the same-machine/mainnet guard bypassed.
**F5 — Dependency/lockfile drift.** Row T28. Layer: ad hoc this pass, not CI. `pnpm audit`; `govulncheck` run **ad hoc outside the repo's `go.mod`, at a pinned version ≥7 days old** (Wyatt, 2026-10-26); a lockfile diff against the tiers. Nothing is added to CI in an attacker session — the CI step comes later in a builder session with Wyatt's T28 approval.
Break: a dependency outside the tiers; an unpinned/changed lockfile; a high-severity advisory in shipped code (dev-tooling advisories are reported, not necessarily findings — note per tier rules).

### G. The sandbox itself

**G1 — Canary capability probes.** Row T01. Layer dev site. Run the 14 probes: raw `fetch()`, a host outside `allowedHosts`, `ctx.content.create`, another plugin's storage, `process.env`, a Node built-in import. **Follow up the setup smoke results:** plain http to an allowed host answered (is that intended?), and `ctx.media`/`ctx.taxonomies` expose *write* methods under `content:read` — call them and see whether a write succeeds.
Break: any undeclared capability/host/storage access succeeds; a media/taxonomy *write* succeeds under `content:read` only; `process`/`node:fs` reachable.
**Limit (Wyatt, 2026-10-26):** at most **one** confirming write on the dev site. If a `ctx.media`/`ctx.taxonomies` write lands, write it up for Wyatt to report to EmDash privately, and **don't probe further** — it's an EmDash sandbox bug, not a Coffer one (brief: write up upstream bugs, don't keep probing).
**G2 — CPU spin vs. liveness.** Rows T01, R11. Layer dev site. The canary spin route for 60 s; measure whether it's stopped at 30 s and whether checkout/status still answer meanwhile (setup smoke showed a status request blocked ~3 s behind a 3 s spin — quantify at 60 s).
Break: the spin runs past 30 s; or an anonymous spin blocks checkout/status site-wide (a DoS the install docs must then name).
**G3 — Manifest/route/host drift in CI.** Row T01. Layer CI. Confirm the CI check fails the build if capabilities, hosts or public routes drift from the spec.
Break: drift doesn't fail CI.

### H. Resource exhaustion on the Node runner

**H1 — Large backlog sync timing.** Rows R11, R13. Layer Runtime, dev site. Seed thousands of open+expired invoices; time each sync; confirm each finishes <30 s and the backlog drains over several syncs; check the 200-page watch-scan cap and its Health warning; confirm payments to invoices past the cap settle once the backlog drains.
Break: a sync exceeds 30 s; the backlog never drains; the Health warning doesn't show; a past-cap payment is lost.
**H2 — Checkout/status flood.** Row T05. Layer dev site. Ramp a flood with Node's `fetch` (≤50 concurrent); record the rate at which the site stops answering, to name a real rate-limit number for the docs. Stop at <1.5 GB available.
Break: the site falls over far below a reasonable rate (informs the docs; a crash/stuck state is a finding).

### I. Data at rest (after a full stagenet payment + pairing — with K)

**I1 — At-rest scan.** Rows T02, P01, P03. Layer E2E. `scan-at-rest.mjs` over a `VACUUM INTO` copy of `data.db`, plugin KV, settings and the astro logs for the view key, the plaintext pairing code and raw IPs.
Break: any of them present.
**I2 — Journal / transcript scan (Wyatt, `sudo`).** Rows T29, T02. Layer Manual. The bridge journal, the install transcript and the same DB copy for the view key and the wallet-rpc login; output to a file.
Break: any present.
**I3 — Purge after 30 days.** Row P04. Layer Runtime. Fast-forward past 30 days; confirm the tip note (pass 1) is gone and the tip still counts.
Break: buyer data survives the purge; a purge drops a settled tip's count.

### J. Failures at bad moments

**J1 — Crash mid-sync / mid-POST.** Row R05. Layer E2E. Kill the dev site mid-sync and the bridge mid-POST; after restart nothing is lost or double-counted.
Break: a lost or double-counted payment; a corrupt invoice/pool row.
**J2 — Clock skew (probe; C05 deferred).** Rows C05, T04. Layer Runtime, dev site. Bridge clock 301 s fast then 301 s slow: syncs refused; does the admin page explain why? **C05 is deferred to release 1.x — report as a Known limit, don't file a finding for the missing Health line.**
Break (still a finding): a skewed sync *accepted*; state corruption.
**J3 — Concurrent housekeeping + sync / admin action during sync.** Rows R05, T07. Layer Runtime.
Break: double-processing, a lost update, or an inconsistent invoice.
**J4 — Payment disappears before settlement.** Row R10. Layer Host, Go (faked). → review `reversed`, never settles.
Break: it settles, or is dropped silently.
**J5 — R06–R09 evidence.** Rows R06–R09. Attach the 3h/3i stagenet evidence already in the matrix rather than re-running, unless round 2 finds a reason.

### K. Real stagenet payments (Wyatt sends each from Feather; keep few)

Each writes an address+amount file; Wyatt sends one per line and notes the time.
- **K1 — Normal tip (control).** Row R01.
- **K2 — No payment, expires.** Row R02.
- **K3 — Pay after expiry inside 24 h.** Row R03.
- **K4 — Pay an expired address after its watch ends.** Row R03.
- **K5 — One tx paying two invoices (two "address, amount" lines in Feather's Pay to field).** Rows R01, T07 — both settle, each counted once, shared txid.
- **K6 — Underpay a fixed-amount tip (settles at the floor).** Row R04. Release 1's TipButton sends set amounts (3/5/10 in site currency, or custom), so a fixed-amount tip exists (spec change 33). A short payment **above the floor settles at the floor** — a fixed-amount tip is never `underpaid` and never `late`. Confirm live.
- **K7 — Overpay a fixed-amount tip.** Row R04. Settles; the Paid card shows the amount received (spec change 33). Confirm live.
- (Wyatt, 2026-10-26: R04's underpay/overpay run live in pass 1 for tips.)

### L. Phase-07 surfaces (folded into the catalog at setup)

**L1 — Tip endpoint cross-site refusal and forged forms.** Rows T17, F07, T06, T08. Layer Theme, dev site. POST `/pay/coffer/tip` with a foreign/`null`/missing `Origin`, each `Sec-Fetch-Site` value, and a form posted from another page; forged forms with wrong/repeated field names, decimal/exponent/signed/huge amounts, and hostile notes.
Break: a cross-site post reaches checkout; a malformed form reaches checkout or isn't an error page; an amount parsed as a float.
**L2 — Per-client cap vs. spoofed IP headers.** Rows T18, T05, P03. Layer Host, Theme, dev site. Spoof `X-Forwarded-For`, `CF-Connecting-IP` and whatever `trustedProxyHeaders` names, with the origin reachable directly (7a); also through the tip endpoint, which forwards the visitor's headers.
Break: a visitor dodges the cap, or fills another visitor's bucket; a raw IP stored.
**L3 — Platform refusal via `requestMeta.geo`.** Row T19. Layer Host, dev site. Can a visitor's headers make a Node site answer `UNSUPPORTED_PLATFORM`, or let a Workers site through?
Break: headers flip the platform decision either way.
**L4 — Way-back open redirect (deep).** Row T22. Layer Theme, dev site. `returnTo` and `?return=` with double-encoding, Unicode look-alike slashes, backslashes, dot-segments, and the pay/admin pages as targets. (Overlaps A9; run as one suite.)
Break: as A9.
**L5 — Mixed-network pool address.** Rows T20, P02. Layer Host. A sync bringing a mainnet subaddress into a stagenet site's pool, or the reverse. **Not refused yet — file as a finding; Wyatt, 2026-10-26: fixed in pass 1 through the finding flow (`docs/decisions.md`).** Write the failing test first (`it.fails`/`t.Skip`).
Break: the wrong-network address is accepted into the pool / onto an invoice (expected to break now; this is the pre-agreed finding).
**L6 — Coexistence.** Row T23. Layer Theme, dev site. Coffer's headers/CSP/toolbar placeholder only on its own pages; `TipButton` renders no script and only its scoped `coffer-tip` styles.
Break: Coffer headers/CSP on a non-Coffer page; `TipButton` emits script or unscoped styles.
**L7 — Watch-scan cap under a flood.** Rows R11, R13. Layer Runtime, dev site. (Runs with H1.) Under a tip flood, does the 200-page cap's Health warning show, and do payments past the cap settle once the backlog drains?
Break: as H1.

---

## New matrix rows (Wyatt approved, 2026-10-26)

Two new rows, numbered in the matrix's normal style (next free T IDs). Added to `docs/security-matrix.md` as Planned, pass 1, in this session, before the tests that cover them (per "a new security test with no row gets its row first"). The third proposed behavior (public tip display) is **dropped as a row**: spec change 34 is deferred and the theme exposes no public tip surface, so there is nothing public to claim — A12 confirms that absence under T08/P03 instead.

| ID | Claim | Must hold (pass conditions) | Layer | Pass | Covered by |
| --- | --- | --- | --- | --- | --- |
| T30 | Per-entry tip totals count only settled tips | A per-entry total (admin page) counts a tip only when it is `settled`; expired, reversed and below-floor tips never count (tips are never late/underpaid, spec change 33); totals aren't produced for nonexistent/draft/trashed/private entries; totals are admin-only, never public | Host | 1 | A11 |
| T31 | Forged-tip total inflation is bounded | With a stolen bridge key, a per-entry total can be inflated only via forged *settled* tips (the tips analogue of "free goods"); no wider reach; the report states the exact blast radius | Host | 1 | D6 |

---

## Coverage checklist (every pass-1 row → where it's attacked)

| Row | Attacks | Notes |
| --- | --- | --- |
| T01 | G1, G2, G3 | sandbox probes, spin, CI drift |
| T02 | I1, I2 | at-rest + journal scans |
| T03 | C1, C4, D1–D6 | forge/stolen-key blast radius |
| T04 | C2, J2 | freshness/replay; skew probe |
| T05 | A7, A8, H2, L2 | cap, race, flood, IP cap |
| T06 | A0, A1, A2, A11, L1 | price/amount integrity; order path absent |
| T07 | B2, D5, K5, J3 | required locked; amounts |
| T08 | A3, A12, L1 | injection; public display |
| T09 | A5 | pay-page headers |
| T10 | F1 | wallet-host posture (Wyatt) |
| T11 | C3, E6, E7 | hostile transfers |
| T12 | D3, E7, J4 | reorg/reversed |
| T13 | B2, C6 | pairing |
| T14 | E4, E5 | dishonest node; MITM |
| T15 | F4, I1 | same-machine; no key on site |
| T16 | F2, F3, F4 | install/update/hashes |
| T17 | L1 | tip-endpoint cross-site |
| T18 | L2 | IP-header spoofing (the matrix Gap) |
| T19 | L3 | platform refusal |
| T20 | L5 | mixed-network (pre-agreed finding) |
| T21 | A0 | no order path |
| T22 | A9, L4 | open redirect |
| T23 | L6 | coexistence |
| T24 | — | vendored QR already Covered; re-check only if round 2 finds reason |
| T25 | — | install-command site already Covered; spot-check in round 2 |
| T26 | F2 | downgrade |
| T27 | E3, E5 | TLS checks |
| T28 | F5 | dependency drift |
| T29 | I2 | journal/transcript |
| T30 | A11 | tip totals count only settled (new) |
| T31 | D6 | forged-tip inflation bounded (new) |
| P01 | I1 | view key not on site |
| P02 | A7, A8, D2, L5 | fresh subaddress / no reuse |
| P03 | A12, I1, L2 | no IP stored |
| P04 | I3 | 30-day purge |
| R01 | K1, K5 | normal + one transaction to two invoices |
| R02 | K2 | expiry |
| R03 | K3, K4 | late / after-watch |
| R04 | K6, K7 | fixed-amount tip underpay/overpay, live pass 1 (spec change 33) |
| R05 | J1, J3 | restart mid-payment |
| R06 | A13, J5 | bridge outage across expiry (3h evidence) |
| R07 | J5 | wallet-rpc crash (3h evidence) |
| R08 | J5 | lost key (3h evidence) |
| R09 | J5 | reinstall restore height (3i evidence) |
| R10 | J4 | reversed |
| R11 | G2, H1, L7 | backlog / spin / watch cap |
| R12 | A13 | silent/syncing |
| R13 | H1, L7 | Health under flood |
| F01 | C3, C5 | sync-body fuzz; slow body |
| F02 | A1, A2, A3, A10, A11 | checkout input |
| F03 | A4 | status tokens |
| F04 | B1, B2 | admin route |
| F05 | E1, E2, E6 | wallet-rpc/node replies |
| F06 | A6 | host/URL spoofing |
| F07 | L1 | tip form / TipButton props |
| C05 | J2 | probe + report as Known limit (deferred) |

Every pass-1 T/P/F row has at least one attack. R06–R09 reuse 3h/3i evidence (J5). T24/T25 are already Covered and only spot-checked in round 2 (reason recorded here, per "Done when").

---

## Decisions (Wyatt, 2026-10-26)

1. **Live TLS MITM proxy (E5):** not built this pass. E5 runs as a Go `httptest` approximation; T27 is covered by one self-signed-server test per client (E3). The live MITM row is **deferred to phase 09**, recorded as deferred, not run as a pass.
2. **`govulncheck` (F5/T28):** run ad hoc this pass, outside the repo's `go.mod`, at a version pinned ≥7 days old. No CI change in an attacker session; the CI step comes later in a builder session with Wyatt's T28 approval.
3. **Fixed-amount tips (R04/K):** release 1's TipButton sends set amounts (3/5/10 in site currency, or custom), so K6 (underpay → settles at the floor) and K7 (overpay) run live in pass 1 (spec change 33).
4. **New rows:** T30 and T31 added to the matrix (above). The public-display row is dropped — spec change 34 is deferred and no public tip surface exists; A12 checks that absence under T08/P03.
5. **Heavy runs:** keep the caps — ≤50 in flight, stop below 1.5 GB available, one heavy run at a time. Fuzzing time-boxed to 10 minutes per target; the large backlog runs once, up to the 20,000-row cap. **If the box degrades, stop and tell Wyatt before rolling back to `pre-redteam-1b`.**
6. **G1 sandbox writes:** at most one confirming write on the dev site. If it lands, write it up for Wyatt to report to EmDash privately and don't probe further.

Reading order done: `docs/spec-changes.md` (33 and 34), confirming no public tip surface, read after approval. `docs/decisions.md` and the rest of `docs/progress.md` are read at the start of round 1 — a result matching a decision already made is an Accepted limit, not a finding.

Round 1 (black box) runs groups A, B, C, D-via-route, G, H, L, and the plugin-side of F. Round 2 (white box, fresh session) re-aims E/F/G/J from the source.
