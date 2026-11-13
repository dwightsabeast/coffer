# Progress log

Newest entry at the bottom. Each session appends one entry:

```text
## YYYY-MM-DD · Phase NN · short title
Done:
Tests: (commands run and results)
Open issues:
Next step:
```

## 2026-10-01 · Starter kit

Done: Starter kit assembled outside Claude Code: spec snapshot, decisions, ground rules, phase prompts, proof of concept, EmDash reference. Dev box set up per the runbook (stagenet node syncing, dev site running).
Tests: none yet.
Open issues: license and repository visibility to choose in phase 00. The repository exists (`dwightsabeast/EmDash-MoneroPay`, one commit with `.gitattributes`).
Next step: Phase 00, `docs/phases/00-repo-bootstrap.md`.

## 2026-10-02 · Phase 00 · Repo bootstrap

Done: Preflight passed (user `dev`, real noreply git identity, `git ls-remote origin` OK over SSH, dev site owned by `dev`, `kit-setup/` gone). Scripts made executable. Exact tool versions recorded in `docs/dev-environment.md` (local only). Wyatt chose MIT (copyright Wyatt Dilley) and a public repository from now; both recorded in `docs/decisions.md`. Added `LICENSE` and a public `README.md`. Removed the dev box's LAN address from `docs/phases/05-setup-test.md` (it now points to `docs/dev-environment.md`). Committed the kit after a staged-file scan (no LAN address, no key-like strings, local-only files not staged). `emdash-docs` MCP answers `search_docs`.
Tests: `scripts/check-env.sh`: all `[ok]`. Node v24.21.0, pnpm 12.8.1, Go 1.27.1, git 2.47.3, jq 1.7, Claude Code 2.1.288, Monero v0.18.5.1, `monerod-stagenet` active and synced at height 2220727, `stagenet.env` mode 600, workerd 2026-10-02, sandboxRunner configured, dev site answering on localhost:4321. No code tests yet (no code).
Open issues: The spec's manifest still reads `<SPDX id>`. Wyatt to set it to `MIT` in the live spec and refresh `docs/spec.md`. The repo's initial commit (`bd94c9e`) carries Wyatt's personal email; Wyatt chose not to rewrite history and turned on GitHub's email privacy settings instead. Wyatt switches the repository to public on GitHub himself.
Pushed: `bd94c9e..242f82e` to `origin/main`, with Wyatt's approval; `git ls-remote origin` matched local HEAD.
Next step: Phase 01, `docs/phases/01-spike.md`.

## 2026-10-03 · Phase 01 · Reminder: delete the release-age excludes on 2026-10-08

**Done 2026-10-08, 23:10 UTC (session 3j):** both blocks deleted (`plugin/`, `spikes/xmr-spike/`); `pnpm install` in each passed the supply-chain check with `pnpm-lock.yaml` unchanged; plugin tests 122/122.

Done: `spikes/xmr-spike/` installed with `minimumReleaseAge: 10080` (7 days) and 12 exact-version `minimumReleaseAgeExclude` entries for the EmDash 1.1.0 release (published 2026-10-01), approved by Wyatt: `emdash@1.1.0`, `@emdash-cms/blocks@1.1.0`, `plugin-types@0.5.0`, `plugin-test@0.2.7`, `plugin-cli@0.13.2`, `cloudflare@1.1.0`, `admin@1.1.0`, `auth@1.1.0`, `gutenberg-to-portable-text@1.1.0`, `registry-client@0.7.0`, `registry-lexicons@0.7.0`, `registry-verification@0.3.3`. Nine match `~/sites/xmr-dev-site/package-lock.json` exactly; `plugin-test`, `plugin-cli` and `cloudflare` aren't in the site and were accepted on provenance (same release commit `913cb1bb9b7f` of `emdash-cms/emdash` as the site's `emdash@1.1.0`). All 12 carry verified registry signatures and SLSA v1 provenance from `emdash-cms/emdash` `.github/workflows/release.yml`; `npm audit signatures` in the dev site: 698 verified signatures, 253 verified attestations, none invalid or missing.
Tests: `pnpm install` (clean) and the scaffold's `pnpm test` (1 passed).
Open issues: none for this item.
Next step: **On or after 2026-10-08**, delete the whole `minimumReleaseAgeExclude` block from `spikes/xmr-spike/pnpm-workspace.yaml` (and from any other package that copied it), run `pnpm install`, confirm it succeeds and `pnpm-lock.yaml` doesn't change, and commit, noting it in that day's entry. The exception list never grows.

## 2026-10-03 · Phase 01 · Spike

Done: Spike plugin `spikes/xmr-spike/` (slug `xmr-spike`, fake publisher DID) and `spikes/wallet/`, with dependency guardrails (exact pins, install-script allowlist, 7-day release age with 12 dated EmDash excludes). `docs/spike-findings.md` has a verdict and evidence for every question, plus recommendations. Gates: Q1 Ed25519 pass in the test host, `astro dev` and the built workerd server; Q2 no-`Origin` POST pass through the SSH tunnel and `dev.wyattdilley.com` behind Cloudflare Access; Q3 per-minute cron accurate (16/16 runs, 12–55 ms late; survives a restart), but config-managed plugins never get `plugin:install` or `plugin:activate` at startup. Q4: `ctx.settings` with encrypted secrets (secrets need `EMDASH_ENCRYPTION_KEY`, plain values don't). Q5: `requestMeta.ip` is `null` on Node unless trusted proxy headers are configured (then spoofable from outside Cloudflare). Q6: `updateIf` claims correct, concurrency not really exercised, PostgreSQL untested. Q7: `unlock_time` marks time locks, `locked` is the 10-block spendable age; time-locked sends are gone in Monero 0.18.5.1. Q8 skipped (Wyatt: no second `monerod` on this box). Q9: `backend.js` 4 KB. Spec changes: 1 accepted (bytes body, Wyatt's four bridge terms), 2–4 proposed. Also: `check-env.sh` nesting-depth check for `sandboxRunner` and a memory line; CLAUDE.md sections "Dependency tiers", "Working with Wyatt's PC" (SSH alias, scp a script and its output) and "Memory" (the box ran out of RAM; 8 GB is the maximum); decisions.md dependency-tiers row; phases 02/04/06 drop zod, `@emdash-cms/blocks` and QR packages; setup-friction rows for the misplaced `sandboxRunner`, the out-of-memory crash, astro's agent auto-background, and the PC command and output snags.
Tests: `cd spikes/xmr-spike && pnpm test`: manifest valid, 4 files, 21 tests passing; `tsc --noEmit` clean; `emdash-plugin bundle --validate-only` passed (9.5 KB across 3 files). Dev-site scripts: `send-vectors.mjs` all as expected on `astro dev` and the built server; `claim-race.mjs` 10/10 rounds on both; cron 15 min on `astro dev`, restart check, 5 min on the built server. `scripts/check-env.sh` all `[ok]` after cleanup. Not covered: real concurrent claims, PostgreSQL, a time-locked transfer, regtest, Cloudflare Workers limits.
Cleanup: dev site restored to the morning baseline (`astro.config.mjs`, `package.json`, `package-lock.json` byte-identical; `dist/` removed); the spike's 10 rows deleted from `data.db` (`_plugin_storage` 7, `_plugin_indexes` 2, `_emdash_cron_tasks` 1; backup in `~/xmr-pay-dev-data/baseline/data.db.before-spike-cleanup`); view-only wallet files and the wallet-rpc log deleted; dev site, built copy and wallet-rpc stopped. `~/xmr-pay-dev-data/q2-output-round{1,2}.txt` (Wyatt's unredacted IP) and `q2.ps1` are still there, local only.
Open issues: none blocking; Wyatt has read `docs/spike-findings.md` (2026-10-03), so phase 01's "done when" is met. Spec changes 1–5 are accepted and in live spec revision 69 and `docs/spec.md` (CLAUDE.md now says "raw bytes body"; regtest is "No, for now" in decisions.md). The snapshot's manifest `"license"` briefly read `"<SPDX id>"`; Wyatt set `MIT` in the live spec and `docs/spec.md` the same day. `dev.wyattdilley.com` removed; the unredacted Q2 output files deleted. Wyatt to remove the `dev.wyattdilley.com` hostname if not done. Delete the `minimumReleaseAgeExclude` list on or after 2026-10-08 (reminder above). The decisions.md "Still to decide" row on regtest stays open.
Next step: Phase 02, `docs/phases/02-plugin-core.md`, session 2a.

## 2026-10-03 · Phase 02 · Session 2a: scaffold

Done: `plugin/` scaffolded with `pnpm dlx @emdash-cms/plugin-cli@0.13.2 init xmr-pay --dir plugin --yes` (Wyatt's DID `did:plc:cmbxrwdt4hdl43g67bd6xegk`, the repo's GitHub security-advisory URL as security contact, MIT). Manifest = the spec's trust contract (revision 69), with the admin page at `/payments` because EmDash rejects `/` (spec change 6, accepted; Wyatt updates the live spec). A private `admin` route serves a placeholder page and the `xmr-status` widget (the bundle check requires it). Exact pins and the spike's guardrails, with the same 12 dated excludes (approved); the lockfile is identical to the spike's. Dev site: `products` collection and three test products from the committed `scripts/dev-products.seed.json` (`emdash seed`, no login; backup `~/xmr-pay-dev-data/baseline/data.db.before-products-seed`); the plugin installed as `file:../../xmr-pay/plugin` and listed in `sandboxed: [xmrPay]` (this replaces the spike's baseline as the site's normal state). Phase file updated to match spec changes 1–6; three setup-friction rows and a lesson; two CLAUDE.md command rows.
Tests: `cd plugin && pnpm test`: manifest valid, 2 tests passing (built manifest equals the trust contract; admin page and widget load through the runtime host's admin path); `tsc --noEmit` clean; `emdash-plugin bundle --validate-only` passed (2.7 KB). Dev site: log shows `Loaded sandboxed plugin xmr-pay:0.1.0 with capabilities: [content:read, network:request]`; `ec_products` has the three products (price stored as SQLite `REAL`). `scripts/check-env.sh` sandboxRunner depth check `[ok]`.
Open issues: Wyatt updates the live spec's admin page path to `/payments` and copies `docs/spec.md`. Excludes in `spikes/xmr-spike/` and `plugin/` to delete on or after 2026-10-08. Price conversion from `REAL` is a 2b/2d task (shortest decimal string, integer minor units). Dev site is stopped.
Next step: Session 2b, the pure core (money math, presets, counted / on-time / classify / evaluate, watch-list rules), with unit tests ported from the POC.

## 2026-10-03 · Phase 02 · Session 2b: pure core

Done: `plugin/src/core/` (no `ctx`, no clock, no I/O): `constants.ts` (the spec's tunables and presets), `money.ts` (`ceilDiv`, `expectedAtomic`, `paidThreshold`, exact XMR strings, decimal and stored-float price to minor units through the shortest decimal string), `presets.ts` (integer tier boundaries, raise-only `raiseRequired`), `invoice.ts` (invoice and transfer types ready for tip and order, `newInvoice`, `counted`, `onTime`, `totals`, `classify`, `evaluate` returning the new invoice plus events), `watch.ts` (`isWatched`). Follows the spec where the proof of concept differs: any-one on-time evidence (spec change 5), integer preset boundaries, no float price math. Wyatt's five answers and one new rule (an undecided unmined transfer waits while it can still be mined by `expiresHeight`) are in `docs/spec-changes.md` entry 7. Not wired into routes yet (2c/2d).
Tests: `cd plugin && pnpm test`: manifest valid, 4 files, 49 tests passing (47 core: money, presets, every POC scenario through a small chain-and-bridge simulator, core-level attacks, expire on evidence, spec change 5, inclusive boundaries, reopen, underpaid after expiry, watch list). Mutation check: removing the undecided wait, setting the tolerance to 100%, or counting time-locked transfers each fails exactly the tests aimed at it (2 each). `tsc --noEmit` clean; `bundle --validate-only` passed (2.7 KB; the core isn't imported yet).
Open issues: Wyatt to fold spec-changes entry 7 (and entry 6, `/payments`) into the live spec. Excludes to delete on or after 2026-10-08.
Next step: Session 2c, the sync protocol: `"bytes"` body, signature over the exact bytes, strict UTF-8 with a BOM rejected, freshness, protocol version, `seq`, pairing, pool top-up, watch-list response, and `contract/test-vectors/sync-signature.json`.

## 2026-10-03 · Phase 02 · Session 2c: sync protocol

Done: `plugin/src/sync/`: `protocol.ts` (version 1 plus the previous one flagged outdated, 300 s freshness, caps: 256 KiB body, 100 addresses, 100 snapshots, 32 transfers per snapshot; header checks; Ed25519 over ts + "\n" + exact bytes with WebCrypto; strict UTF-8 with a BOM refused; hand-written body validation), `merge.ts` (seq ordering, seenAt/poolTs kept, snapshot overwrite, then `evaluate`), `pairing.ts` (128-bit code as 22 base64url chars, stored only as a SHA-256 hash, 15-minute expiry, burned on use), `handle.ts` (`handleSync` against a `SyncStore` interface, in the spec's order; returns the response and lifecycle events). Error codes as agreed with Wyatt. One deviation from what Claude told Wyatt, to keep the spec's rule that a body is parsed before verification only while a code is active: a used or expired code fails as `NOT_PAIRED` or `BAD_SIGNATURE`, not `PAIRING_REJECTED` (documented in `contract/test-vectors/README.md`). Shared vectors: `contract/test-vectors/sync-signature.json` (9 cases, RFC 8032 TEST 1 and TEST 2) generated by `make-sync-signature.mjs`, which checks both keys against the RFC's own signatures first. Not wired into the route or storage yet (2d).
Tests: `cd plugin && pnpm test`: 7 files, 85 tests passing (36 new: every vector through the protocol functions and `handleSync`; headers and freshness; strict decoding; body validation, versions and caps; pairing: success, wrong code, wrong signer, expired, reused, pair without a code, over 4 KiB, a new pairing replacing the key; forged, tampered, stale and BOM requests changing nothing; pool top-up; snapshots; replays and idempotent retries; the watch list; pairing to settled end to end). Mutation check: strict decoding off, expired codes accepted, or the seq check removed each fails the tests aimed at it. `tsc --noEmit` clean; `bundle --validate-only` passed (2.7 KB; not wired yet).
Open issues: none new. Excludes to delete on or after 2026-10-08; spec changes 6 and 7 to fold into the live spec.
Next step: Session 2d, routes and storage: the `checkout`, `status` and `bridge/sync` routes, a `SyncStore` on `ctx.storage` and `ctx.kv`, the housekeeping batches in `bridge/sync`, backup cron scheduling, `plugin:uninstall`, rate fetch (after checking the price APIs' terms), pool claims, spam limits.

## 2026-10-03 · Phase 02 · Session 2d-1: bridge/sync on real storage

Done: Price sources decided (spec change 8, accepted: Kraken first, CoinGecko keyless as fallback, USD and EUR only; decisions.md updated). `plugin/src/store.ts`: `CtxSyncStore` (bridge key and settings in `ctx.settings`, pairing and bridge state and alerts in KV, pool and invoices in storage with bounded paged queries; pool rows created only when absent so a claimed row is never reset) and `deletePluginData`. `plugin/src/housekeeping.ts`: the 30-day buyer-data purge in batches of 25 with a KV cursor, and `ensureCron` (hourly `housekeeping` task, idempotent). `plugin/src/plugin.ts`: the `bridge/sync` route exactly as the spec declares it (public, POST, `"bytes"`, the two headers, 256 KiB), alerts recorded in KV, a purge batch after each successful sync; hooks `plugin:install` and `plugin:activate` (schedule the cron), `cron` (purge), `plugin:uninstall` (deletes data only with `deleteData`); the admin route's first page load schedules the cron for config-managed installs. Contract README: the `{ success, data }` envelope, EmDash's 413 for bodies over 256 KiB, and a snapshot for every watched index each sync.
Tests: `cd plugin && pnpm test`: 9 files, 95 tests passing (10 new: route tests in the runtime host for NOT_PAIRED, pool top-up, a claimed row never reset, settling from signed snapshots, a reversal alert, state across `restart()`, pairing through the route, forged requests, EmDash's 413 for an oversized body (`INVALID_PLUGIN_REQUEST`), the purge after a sync and from the cron, the cron scheduled by the first admin page load and idempotently by activation; the manifest test now expects `bridge/sync` exactly as declared; `deletePluginData` against a fake context, since the test hosts can't both seed this state and invoke uninstall). `tsc --noEmit` clean; `bundle --validate-only` passed (14.4 KB). Dev site: the live route answers `MISSING_SIGNATURE` unsigned and `NOT_PAIRED` signed but unpaired.
Open issues: the uninstall hook's host wiring is untested (logic only). Concurrent writes to one invoice (a sync and a status read) are last-writer-wins for now; revisit in 2d-2 with `status`.
Next step: Session 2d-2: `checkout` (products, rate fetch Kraken then CoinGecko, spam limits, pool claims) and `status`.

## 2026-10-03 · Phase 02 · Session 2d-2: checkout and status

Done: `plugin/src/rates.ts` (Kraken Ticker first, CoinGecko keyless as the fallback, USD and EUR; prices parsed from decimal text, CoinGecko's JSON number read from the response text, not a float; rounded down to the cent so the XMR amount is never lower; 60 s KV cache; 5 s timeout; sanity bounds; never a stale price). `plugin/src/checkout.ts` (products only; hand-written validation that ignores any client-sent price or amount; product by entry id, or by slug among published products, scanned in memory because EmDash's plugin content API can't filter by slug, bounded at 1,000 products; site-wide cap of 40 open invoices counted until `expiresAt`; per-client hashed buckets with a per-site salt only when `requestMeta.ip` is known; pool claim by `updateIf` in a bounded loop, a refused invoice write (the unique `subaddress` index) treated as a lost claim; the exact `monero:` URI). `plugin/src/status.ts` (by token; evaluates for display but never writes, so it can't race a sync). Routes `checkout` (POST, public, JSON, 4 KiB) and `status` (GET, public, `private, no-store`); the manifest test now pins all four routes. Domain errors added beyond the spec's list: `INVALID_REQUEST` (checkout input) and `INVOICE_NOT_FOUND` (status).
Tests: `cd plugin && pnpm test`: 10 files, 108 tests passing (13 new route tests in the runtime host: an invoice from the product's price and the Kraken rate on a pool address with the exact URI; slug and id lookups; a client-sent price ignored; PRODUCT_NOT_FOUND for unknown, draft, zero and over-precise prices; the CoinGecko fallback; RATE_UNAVAILABLE with nothing claimed; the EUR setting; NO_ADDRESS_AVAILABLE; INVALID_REQUEST cases; the site-wide cap and invoices past their deadline no longer counting; the per-client cap (through `transport.invokeRoute`, which passes an IP like a Cloudflare site; the real request path gives `ip: null` off Cloudflare, as the spike found); status fields, `no-store`, INVOICE_NOT_FOUND, pendingExpiry without writing; checkout to signed sync to settled). `tsc --noEmit` clean; bundle valid, `backend.js` 19,698 bytes of 128 KB.
Open issues: the POC's `HOST_NOT_ALLOWED` attack isn't exercised here (the plugin never fetches another host; EmDash enforces `allowedHosts`, which the manifest test pins). Concurrency of claims on PostgreSQL remains untested (spike Q6).
Next step: Session 2e: the minimal `admin` route (settings: currency USD or EUR and speed; Connect wallet host: pairing code and install command).

## 2026-10-03 · Phase 02 · Session 2e: minimal admin route

Done: `plugin/src/admin.ts`, served by the private `admin` route (Block Kit as plain JSON). Page `/payments`: status fields (paired, last sync, free addresses of 50), the silent-bridge banner when the last sync is over 5 minutes old (worked out at load time, spec change 2), an update banner for an outdated bridge protocol, **Connect wallet host** (a 22-character code valid once for 15 minutes; only its SHA-256 hash is stored; shown once with the install command `curl -fsSL <install URL> | sh -s -- --site <site URL> --pair <code>` and the cautious `xmr-bridge install --site … --pair …`; a confirm dialog before replacing a paired host), and the settings form (currency USD or EUR, speed Fast / Standard / Strict, "changes apply to new invoices only"). Widget `xmr-status`: one health line. The install URL is a deliberate non-resolving placeholder, `https://REPLACE-RELEASE-HOST.invalid/install.sh`, until phase 09, so a premature copy fails instead of running. Any admin load schedules the backup cron if it isn't yet.
Tests: `cd plugin && pnpm test`: 11 files, 114 tests passing (6 new through the runtime host's admin helpers, which also validate Block Kit: page defaults; settings saved and invalid values refused; the code shown once, its hash stored, not the code, a reload not showing it, a second press replacing it; the page's code pairing a bridge through `bridge/sync`, then "Paired" and a confirm before replacing; silent, outdated and healthy states on the page and in the widget; an unknown action). `tsc --noEmit` clean; bundle valid (27.0 KB).
Verified before pushing (Wyatt's four checks):
1. An admin page load schedules the backup cron: `handleAdmin` calls `ensureCron` when `state:cronScheduled` isn't set; test "activation and the first admin page load schedule the backup cron" (`tests/routes/sync-route.test.ts`) loads `/payments` on a fresh host and finds the hourly `housekeeping` task.
2. The install command uses the site URL, not `request.url`: it uses `ctx.site.url`, which EmDash fills from the site's configuration (`siteUrl` / `EMDASH_SITE_URL`) or the address stored at setup (`emdash:site_url`), never from the request (EmDash's `api/site-url.ts`: "A configured or stored value always beats the request"). Fixed while checking: with no site URL the page used to fall back to `ctx.url("/")` (giving `--site /`); now it shows an error banner and creates no code. The page also says which address the wallet host will connect to, since a site set up under one address keeps it (the dev site's stored URL is `http://localhost:4321`, written by the dev-bypass login). Tests: a configured `https://shop.example` appears in the command; no site URL means no command and no code.
3. The pairing code is never logged or stored in plain text: only its SHA-256 hash goes to KV; the code appears only in the one admin response that creates it (not in the toast); the plugin's only log call is the invoice status change. The test now checks KV, settings and both storage collections for the code.
4. A new code cancels the old one: it overwrites the stored hash. New test: after a second code, the first is refused (`PAIRING_REJECTED`) and the second pairs.
Tests after the fixes: 11 files, 117 passing; `tsc --noEmit` clean; bundle valid (27.5 KB).
Open issues: Wyatt hasn't seen the page rendered in the admin yet (2f, through the SSH tunnel). The dev site's stored site URL is `http://localhost:4321`; fine for a bridge on this box, wrong for a separate wallet host.
Next step: Session 2f: dev-site run scripted end to end with a fake bridge (pair from the admin code, top up, checkout, signed syncs, settle, status), the site-level checks the test host skips (401 for an invalid Bearer, 403 for a cross-origin Origin), the bundle check, and the CI workflow (ask first).


## 2026-10-03 · Phase 02 · Session 2f: dev-site end to end, CI

Done: `scripts/dev-e2e.mjs`, a fake bridge against the running dev site (Node standard library only; the bridge key is generated in memory per run and never written; pool addresses are well-formed fakes). Pairing through the KV shortcut Wyatt approved (dev only, no plugin change: the script writes its code's SHA-256 hash to the plugin's `__kv` row `state:pairing` in `_plugin_storage`, where the sandbox runner keeps a sandboxed plugin's KV), or `--pair <code>` with a code from the admin page. It refuses non-loopback sites and a plugin that already has a pool, invoices or a bridge key, and removes what it created afterwards (`--keep`, `--cleanup-only`); Wyatt's settings, the salt and the cron flag stay. `.github/workflows/ci.yml` (approved: `contents: read`, no `pull_request_target`, `persist-credentials: false`, `--frozen-lockfile`): pushes to `main` and pull requests, `ubuntu-24.04`, `actions/checkout` v7.0.1 and `actions/setup-node` v7.0.0 pinned to commit SHAs (both GitHub's own, released 2026-07), its automatic cache off, Node 24.21.0, pnpm 12.8.1 from corepack (no third-party setup action), then typecheck, validate, tests and the bundle check. Both decisions in `docs/decisions.md`; two command rows in CLAUDE.md. Dev-site database backed up first to `~/xmr-pay-dev-data/baseline/data.db.before-2f`.
Tests: `node scripts/dev-e2e.mjs` on `astro dev` with a fresh plugin build: 30 of 30 as expected (`~/xmr-pay-dev-data/2f-e2e-run3.txt`). Host checks the test hosts skip: invalid `Bearer` → 401 `INVALID_TOKEN` (bridge/sync and admin), cross-origin `Origin` → 403 `CSRF_REJECTED` (bridge/sync and checkout), admin with no session → 401, bridge/sync over 256 KiB → 413. Protocol on the live route: unsigned `MISSING_SIGNATURE`, unpaired `NOT_PAIRED`, wrong code `PAIRING_REJECTED`, pairing with 10 addresses, the code burned and refused for another key, top-up to 50, another key and a changed byte `BAD_SIGNATURE`, 10-minute-old timestamp `STALE_TIMESTAMP`, a BOM `INVALID_ENCODING`. Payment: checkout of `test-sticker` at the live Kraken rate (1.00 USD → 1807305128 atomic) on a pool address with the exact URI; a client-sent price ignored (same amount as a checkout without it); new → seen (half, unmined) → still seen with a time-locked full-amount transfer beside it → confirming (rest arrives) → confirming at 1 of 2 → settled at 2 of 2; an older `seq` with the payment gone changes nothing. Runs 1 and 2 failed on the script's own mistakes (96-character fake addresses, which the plugin rightly skipped; expecting `seen` for a full payment the spec sends straight to `confirming`); one extra run started by mistake with its output discarded also cleaned up after itself. Plugin, unchanged this session: 11 files, 117 tests passing; `tsc --noEmit` clean; manifest valid; bundle valid (27.5 KB). CI rehearsed locally from a clean clone: corepack pnpm 12.8.1, `pnpm install --frozen-lockfile`, then the four checks, all passing. Not covered: the workflow on GitHub itself (needs a push), the built workerd copy (only `astro dev` this session), PostgreSQL.
Open issues: Wyatt's hand pairing from the admin page (`--pair`) still to run. `deletePluginData` doesn't remove the rate cache (`cache:rate:USD` / `EUR` in KV): harmless, but uninstall with "delete data" leaves those rows; a small plugin fix for phase 04 or a later 2x session. Excludes to delete on or after 2026-10-08; spec changes 6 and 7 to fold into the live spec. Dev site left running for the hand pairing.
Next step: Wyatt runs the hand pairing and Claude reads `~/xmr-pay-dev-data/2f-hand-pair-output.txt`; then, with Wyatt's approval, push so CI runs on GitHub, and check phase 02's "done when" list.

## 2026-10-03 · Phase 02 · Session 2f addendum: hand pairing

Done: `dev-e2e.mjs --pair` first refused the admin page's own active code (fixed in `39d3d2f`; setup-friction row). Wyatt then paired by hand from the admin page: `~/xmr-pay-dev-data/2f-hand-pair-output.txt`, 30 of 30 as expected, run with `--keep`. The admin page showed "48 of 50" free addresses, matching the database: 50 pool rows, 2 claimed (indexes 1 and 2), 2 invoices (the settled test payment, and the second checkout used to prove a client-sent price is ignored, still `new`), each claimed row pointing at its invoice and back, no free row carrying an invoice id. Wyatt read "Free addresses" as linked wallets: wording note added to `docs/phases/04-admin-page.md`, setup-friction row added.
Open issues: Wyatt runs `--cleanup-only` after this. Not pushed yet; CI hasn't run on GitHub. Rate cache not removed by uninstall (from the 2f entry).
Next step: with Wyatt's approval, push so CI runs on GitHub, then check phase 02's "done when" list.

## 2026-10-03 · Phase 02 · Session 2f: where it stands at end of day

Done: everything in 2f except CI's first run on GitHub. Dev-site end to end with a fake bridge: 30 of 30, by the KV shortcut and by Wyatt's hand pairing from the admin page (`~/xmr-pay-dev-data/2f-e2e-run3.txt`, `2f-pair-fix-run.txt`, `2f-hand-pair-output.txt`). Host checks (401, 403, 413) confirmed on the site. Bundle valid (27.5 KB). CI workflow committed and rehearsed from a clean clone. decisions.md: the hosted bridge row (still to decide) now records Wyatt's pricing direction: tiers by monthly checkouts, soft limits, the plugin stays tier-free.
Tests: no new runs since the addendum above.
Open issues: Wyatt's `--cleanup-only` hadn't run at the time of this entry (the dev database still held the hand run's 50 pool rows, 2 invoices, `state:bridge`, `state:pairing` and the bridge key); the dev site was stopped at the end of the day. `deletePluginData` leaves the rate cache (`cache:rate:*`). Excludes to delete on or after 2026-10-08. Spec changes 6 and 7 to fold into the live spec. Phase 04 wording note ("Free addresses").
Next step: (1) If not done, `node ~/xmr-pay/scripts/dev-e2e.mjs --cleanup-only` and confirm it reports 52 pool and invoice rows, 2 KV rows and 1 bridge key removed. (2) Open the repository's Actions tab on GitHub and confirm the "CI" run for the pushed `main` passed all six steps (install, typecheck, validate, tests, bundle caps); if it failed, Claude reads the log and fixes it. (3) Then Claude checks phase 02's "done when" list against `docs/phases/02-plugin-core.md` and, if everything holds, writes phase 02's closing entry; the next phase is 03 (`docs/phases/03-bridge-and-installer.md`).

## 2026-10-04 · Phase 02 · Session 2f close

Done:
- Dev-site cleanup: `data.db` backed up to `~/xmr-pay-dev-data/baseline/data.db.before-2f-cleanup`, then `dev-e2e.mjs --cleanup-only`: "removed 52 pool and invoice rows, 2 KV rows, 1 bridge key". Left: `cache:rate:USD` and `state:cronScheduled` (KV), plus Wyatt's settings.
- CI on GitHub: the "CI" run for `5e9fe26` completed with success (read from the public Actions API; `gh` isn't installed).
- `deletePluginData` now also removes the rate cache (`cache:rate:USD` and `cache:rate:EUR`): `a882711`, test first.
- Done-when check, test by test against "Tests (minimum)" in `docs/phases/02-plugin-core.md`. One gap: spec change 3's "a second invoice with an address already used is refused and checkout retries" had no test. The route-level attempt showed that the runtime test host **doesn't apply `uniqueIndexes`**: a duplicate was stored without complaint. On a real site EmDash does: the dev DB has `CREATE UNIQUE INDEX uidx_plugin_xmr-pay_invoices_subaddress … json_extract(data, '$.subaddress')`, and a scratch copy refused a second invoice with the same address (`UNIQUE constraint failed`, `~/xmr-pay-dev-data/2f-unique-index-check.txt`). Added `tests/routes/claim.test.ts`: the exported `claimAndStore` against a fake store that refuses duplicates. The refused row stays claimed and another free address is used; with every free address taken it returns `NO_ADDRESS_AVAILABLE`. Mutation (rethrow on refusal) fails both tests. Commit `3d9b3c0`.
- Spec change 9 proposed (Wyatt's request): the shop's wallet app may miss payments after 200 or more unpaid addresses in a row (subaddress lookahead). Notes added:
  - phase 03: a stagenet test of the gap, a default-settings wallet as the shop's app, and a reinstalled bridge
  - phase 04: a gap warning from a constant threshold, beside "a run of unpaid expired invoices"
  - phase 05: the test tip must show up in the shop's wallet app, as a timing-sheet row and a pass criterion
  - commit `6b5bba4`

Phase 02 "done when":
- all tests pass in the test hosts: yes
- the plugin runs in the dev site: yes, since 2a
- a signed sync sent by a script settles an invoice: yes (2f run 3 and Wyatt's hand run)
- the bundle is under its caps: 27.5 KB
- CI runs the tests: yes (run on `5e9fe26`)

Phase 02 is done, with the open items below.

Tests:
- `cd plugin && pnpm test`: 12 files, 119 tests passing
- `tsc --noEmit` clean
- manifest valid
- `bundle --validate-only` passed (27.5 KB across 3 files)

Not covered:
- unique-index enforcement through the plugin's own storage API on a live site (shown on the SQL index directly, and on the plugin's logic with a fake)
- real concurrent claims and PostgreSQL (spike Q6)
- the built workerd copy in 2f
- the uninstall hook's host wiring

Open issues:
- The dev DB still has two SQL indexes from the phase 01 spike (`idx_plugin_xmr-spike_pool_status`, `uidx_plugin_xmr-spike_pool_addrIndex`; their `_plugin_indexes` rows were removed then, the indexes weren't). They're harmless. Ask Wyatt before dropping them.
- Delete the excludes on or after 2026-10-08 (both packages).
- Spec changes 6 and 7 are still to fold into the live spec; spec change 9 is for Wyatt to decide.
- Commits `a882711`, `3d9b3c0`, `6b5bba4` and this entry are local, not pushed.

Next step: with Wyatt's approval, push (CI should pass: same checks run locally). Then phase 03, session 3a, from `docs/phases/03-bridge-and-installer.md`. If Wyatt has decided spec change 9 by then, fold it into the 3a plan.

## 2026-10-04 · Phase 02 · After the close

Done:
- Pushed `5e9fe26..0cf425c` to `origin/main` with Wyatt's approval; `git ls-remote` matches.
- Spec change 9 accepted. Wyatt's open question (how an admin raises the wallet app's lookahead, and whether that manual step fits the admin budget) is recorded in the entry and as a "Still to decide" row in `docs/decisions.md`: settle it after phase 03's stagenet test, before phase 04.
- Dropped the phase 01 spike's two leftover SQL indexes from the dev DB, with Wyatt's approval. Backup first: `~/xmr-pay-dev-data/baseline/data.db.before-spike-index-drop`. Afterwards: no `xmr-spike` indexes or `_plugin_indexes` rows, xmr-pay's 7 indexes intact, `PRAGMA integrity_check` ok (`~/xmr-pay-dev-data/spike-index-drop-output.txt`).
Tests: no code changes.
Open issues: Wyatt folds spec changes 6, 7 and 9 into the live spec. Delete the excludes on or after 2026-10-08. This entry and the spec change 9 acceptance are local, not pushed.
Next step: phase 03, session 3a (`docs/phases/03-bridge-and-installer.md`).

## 2026-10-04 · Phase 03 · Session 3a: bridge module, config, wallet-rpc client

Correction to the "After the close" entry above: the spec change 9 acceptance (`7715fb8`) was pushed the same day, at Wyatt's request.

Done:
- **Plan and decisions.**
  - Spec revision 70 snapshot committed with the matching `docs/decisions.md` row: the hash-list verifier is our own, standard library only, `4cb6ddd`.
  - Wyatt approved all six plan items, `98f30a4`:
    - `go-crypto` only in the separate test module `bridge/oracle/`
    - `actions/setup-go` in CI
    - the release-signature scheme
    - dev release mode
    - `CLAUDE.md`: no standard-library exception for the bridge
    - 3b split into 3b-1 (verifier) and 3b-2 (download and supervise)
- **`bridge/`**, Go module, no dependencies, `go 1.27`, built with `GOTOOLCHAIN=local`, commit `c5acc27`:
  - `internal/secret`: values that format, log and marshal as `[redacted]`; only `Reveal` returns them; never unmarshalled.
  - `internal/config`: one JSON file, mode 600 enforced on load, 64 KiB cap, unknown fields and trailing data refused, atomic save.
    - The site must be https, or http on loopback only, with no path, query or login.
    - The same-machine flag is allowed on stagenet only.
    - No secrets in the file. `ReleaseURL` stays out until 3g, behind the `devrelease` build tag.
  - `internal/walletrpc`: JSON-RPC client with hand-written digest auth.
    - Real wallet-rpc 0.18.5.1 offers two challenges with one nonce, `algorithm=MD5` and `algorithm=MD5-sess`; MD5 with `qop=auth` is used.
    - A stale nonce is retried once and a wrong password gives `ErrUnauthorized`, never a loop.
    - Responses capped at 16 MiB; trailing data refused.
    - Methods: `get_version`, `get_height`, `create_address` (account 0, label), and `get_transfers` (in and pool, account 0, `subaddr_indices`, no call for an empty list).
    - Amounts and unlock times are read as `uint64` and returned as decimal strings; `locked` is ignored.
    - Malformed txids and transfers for indexes that weren't asked for are refused.
  - `cmd/xmr-bridge`: `version` and `run --config`. `run` loads the config, logs to stderr without timestamps (the journal adds them) and stops on SIGTERM; the sync loop is 3d.
- **CI**, commit `4a06612`:
  - A `bridge` job: gofmt, vet, tests, static build. `actions/setup-go` v7.0.0 pinned to `b7ad1dad31e06c5925ef5d2fc7ad053ef454303e` (released 2026-07-16), Go 1.27.1, cache off, `GOTOOLCHAIN=local`, `GOFLAGS=-mod=readonly`.
  - Three `CLAUDE.md` command rows (bridge tests, static build, the live wallet-rpc test).

Tests:
- `cd bridge && go vet ./... && go test ./...`: 4 packages, 25 top-level tests (41 with subtests) passing, 1 skipped (the live test, without its variables). `gofmt -l .` empty.
- `CGO_ENABLED=0 go build`: a static ELF of 4.5 MB.
- **Live test** against a real `monero-wallet-rpc` 0.18.5.1 (stagenet, random login, no wallet; `~/xmr-pay-dev-data/3a-live-walletrpc.txt`): `get_version` 1.31 four times on one challenge, `get_height` returned wallet-rpc's `-13 No wallet file` after a successful login, and a wrong password gave `ErrUnauthorized`. The probe was stopped and its login and files deleted.
- **Mutation checks**, each caught: a constant `nc` (2 failing), any digest algorithm accepted (3), the index check removed (3), the txid check removed (3), and the secret's `Format` or `LogValue` removed (1 each). Removing the JSON methods changed nothing because `MarshalText` covers JSON, so they were dropped.
- CI rehearsed from a clean clone: all four bridge steps pass. The workflow parses (2 jobs). Not run on GitHub yet (needs a push).

Not covered:
- digest `opaque` and `qop` lists with `auth-int` against a real server (wallet-rpc sends neither)
- concurrent use of one client (it's mutex-safe, not stress-tested)

Open issues:
- In the real install, wallet-rpc's `--rpc-login` on the command line is visible in the process list. Decide in 3b-2 how the supervised wallet-rpc gets its login (for example `--rpc-login` with the password fed another way, or `--rpc-login-file` if 0.18.5.1 has one; check `--help`).
- Delete the excludes on or after 2026-10-08.
- Wyatt folds spec changes 6, 7 and 9 into the live spec.
- Commits `4cb6ddd` through this entry are local, not pushed.

Next step: session 3b-1, the `hashes.txt` verifier. First download binaryFate's public key (monero-project repository) and the current `hashes.txt` (getmonero.org), confirm the fingerprint `81AC 591F E9C4 B65C 5806 AFC3 F0AF 4D46 2A0B DF92` with `gpg --show-keys` (no import), and record the key's algorithm before writing code; stop and tell Wyatt if it isn't RSA.

## 2026-10-04 · Phase 03 · Session 3b-1 (part 1): hashes.txt verifier

Done:
- Pushed `7715fb8..9f2515c` with Wyatt's approval. CI on GitHub passed for `9f2515c`, both jobs (the bridge job's first run).
- **Key confirmed before any code**, from `utils/gpg_keys/binaryfate.asc` (monero-project repository) and `getmonero.org/downloads/hashes.txt`, with `gpg --show-keys` in a temporary home (no import):
  - primary key RSA 4096 (algorithm 1), fingerprint `81AC591FE9C4B65C5806AFC3F0AF4D462A0BDF92`, created 2019-12-12
  - one RSA 4096 subkey that can also sign, `AD564CDA8F1665ACE78B5DFD2593838EABB1F655`
  - `hashes.txt` is signed by the **primary** key: `gpgv` `VALIDSIG` signing and primary fingerprints are equal; v4, RSA, SHA-256, class 0x01, made 2026-07-20; hashed subpackets 33 (issuer fingerprint) and 2 (creation time), unhashed 16 (issuer key ID); armor checksum present, no armor headers
  - the list covers CLI 0.18.5.1 and GUI 0.18.5.2
- **`bridge/internal/hashsig`** (standard library only), commits `9e5c861` and `296601e`:
  - `Verify` accepts exactly revision 70's shape and returns the canonical verified text.
  - `ParseHashes` reads `<sha256>  <name>` lines from that text only.
  - `pinned.go` holds the key as constants. `init` checks them against the fingerprint, and a test checks them against the published key.
  - Errors are separate, for the health check: `ErrUnknownSigner` (keep the current wallet-rpc, ask for a bridge update), `ErrExpired`, `ErrBadSignature`.
  - A signature by the subkey is refused as an unknown signer. If Monero ever signs with the subkey, the bridge treats it like a key change.
- **Test files** (`testdata/make-corpus.sh`): two throwaway RSA 3072 keys made in a temporary gpg home, deleted on exit; only their public keys and the signed files are committed. 3 good files and 6 bad ones: wrong signer, subkey signer, two signatures, SHA-384, expired (signed with a faked 2020 time), and a mismatched `Hash:` header.
- **Fuzzing**:
  - `FuzzVerify`: no input verifies with text other than what that key actually signed. Changes to line endings, trailing whitespace and armor wrapping may verify, because they don't change the canonical text; that is how revision 70's "no generated input ever verifies" is read here.
  - `FuzzSignaturePacket` and `FuzzParseHashes`: no panics.
- **`bridge/oracle`**, a separate test-only module, compares our verdicts with `gpgv`'s (commit `fa26968`). Spec change 10 proposed (below). CI runs it.

Tests:
- `cd bridge && go test ./...`: 5 packages pass. `hashsig` has 14 tests plus 3 fuzz targets on their seeds. `gofmt` and `vet` clean.
- **Mutation checks** (each removes one protection):
  - Caught: RSA check, prefix check, issuer fingerprint check, issuer key ID check, expiry, extra packets allowed, text before BEGIN, other message headers, no trailing-whitespace canonicalization, armor checksum, signature older than its key, dash-escape not undone, non-minimal MPI.
  - Three needed new tests, which were added: the signature value changed with the right prefix, the unsigned issuer key ID changed, an understated MPI bit count.
  - Two are redundant by construction: the `Hash:` header check (the digest uses the header's algorithm, so a mismatch fails anyway) and END-must-be-last (text after END lands where the checksum must be).
- **Fuzz runs** (`~/xmr-pay-dev-data/3b1-fuzz-*.txt`), 2 workers, no failures, no failing inputs saved: `FuzzVerify` 4 min, about 8.7M inputs; `FuzzSignaturePacket` 2 min, about 0.6M; `FuzzParseHashes` 2 min, about 8.2M.
- **`gpgv` comparison** (`~/xmr-pay-dev-data/3b1-oracle-gpgv.txt`): 26 inputs × 3 keys = 78 comparisons with 8 acceptances. 73 match. Ours never accepted what `gpgv` refused, and accepted texts were identical. The 5 differences are our refusals by name (spec change 10).
- Clean-clone rehearsal of the CI steps: passes.

Not covered: the `go-crypto` comparison (waiting on a dependency answer), and long fuzz runs (minutes, not hours).

Open issues, for Wyatt:
1. `go-crypto` v1.5.2 (2026-09-25, 9 days old) requires `cloudflare/circl` v1.6.3 **and** `golang.org/x/crypto` v0.41.0 and `golang.org/x/sys` v0.35.0. The approval covered `go-crypto` and `circl` only. Approve the two `golang.org/x` modules (Go team, BSD-3) for `bridge/oracle` only?
2. Spec change 10: approve the verdict definition, and choose strict (current) or RFC 9580-tolerant handling of a missing armor checksum and signature-block armor headers.

Also open: delete the excludes on or after 2026-10-08; spec changes 6, 7 and 9 to fold into the live spec. Commits `9e5c861`, `296601e`, `fa26968` and this entry are local.

Next step: with Wyatt's answers, add `go-crypto` to `bridge/oracle` (exact versions, committed `go.sum`) as a third verdict in the same comparison, finish 3b-1, then 3b-2.

## 2026-10-04 · Phase 03 · Session 3b-1 (part 2): comparison checks, 3b-1 done

Done:
- **Wyatt's answers.** Spec change 10 accepted, strict. `golang.org/x/crypto` and `golang.org/x/sys` approved for `bridge/oracle` only. Both recorded in `docs/spec-changes.md` and `docs/decisions.md`.
- **`go-crypto` v1.5.2 added to `bridge/oracle`** (`go.sum` committed; `go mod verify`: all modules verified).
  - Indirect: `circl` v1.6.3, `x/crypto` v0.41.0, `x/sys` v0.35.0, all far past 7 days old.
  - `bridge/go.mod` is unchanged and has no `go.sum`.
- **The second comparison** asks `go-crypto` the same question as `gpgv`: one signature packet, valid at the test time, issued by the primary key, and the text it returns. The CI step runs both. Commit `d8f2769`.
- **Found by the comparison:**
  - `go-crypto` refused the test-key files as "signature expired". They had been signed at 17:43 UTC, after the tests' fixed 12:00 "now", and `go-crypto` refuses future-dated signatures.
  - Our verifier accepted them, which spec change 10 forbids. `Verify` now refuses a signature dated after "now" (test plus mutation check).
  - The generator now signs at a fixed 2026-01-01 (expired case 2020), so the files don't depend on when they were made. Regenerated with new throwaway keys, public halves only. Commit `1ce6f68`.
- **`go-crypto` is more lenient than `gpgv` in four ways:** it ignores the `Hash:` header (missing or mismatched), ignores a changed armor checksum, and reads only the first of two signed blocks. `gpgv` refuses all of these, as we do.

Tests:
- `cd bridge && go test ./...`: 5 packages pass (`hashsig` 15 tests plus 3 fuzz targets on their seeds); `gofmt`, `vet` clean.
- **Comparison** (`~/xmr-pay-dev-data/3b1-oracle-both.txt`): 26 inputs × 3 keys × 2 oracles = 156 comparisons, 8 acceptances by ours, all three verifiers agreeing on each.
  - Ours never accepted what an oracle refused, and accepted texts were identical.
  - 10 rows where ours refuses and an oracle accepts, each named in the test with its policy: SHA-384; text outside the signed block (before, after, the file twice); a missing or mismatched `Hash:` header (3); armor checksum changed or removed; signature-block armor header.
- `FuzzVerify` again for 90 s on the new seeds: about 3.4M inputs, no failures.
- Clean-clone rehearsal of the whole CI bridge job, including the module download and `go mod verify`: passes.

Not covered: hour-long fuzz runs; Monero's previous signing keys (none pinned, by design).

Phase 03 so far: 3a and 3b-1 done. Revision 70's verifier tests (fuzzing, tampered files, two comparison oracles in CI) are all in place.

Open issues:
- Wyatt folds spec changes 6, 7, 9 and 10 into the live spec.
- Delete the excludes on or after 2026-10-08.
- From 3a: how the supervised wallet-rpc gets its login without showing it in the process list (3b-2).
- Commits `9e5c861` through this entry are local.

Next step: session 3b-2.
1. Check `monero-wallet-rpc --help` for how a login can be passed without the command line.
2. Plan the download path: `hashes.txt` from getmonero.org, verify with `hashsig`, the archive for the CPU (linux64 or linuxarm8), its SHA-256 checked against the verified list, extract only `monero-wallet-rpc` (`compress/bzip2`, `archive/tar`), and supervision (localhost bind, generated login, `--tx-notify`).

## 2026-10-04 · Phase 03 · Session 3b-2: download, verify and supervise wallet-rpc

Done:
- Pushed `9f2515c..b33c514` with Wyatt's approval. Plan approved as written: `xmr-bridge notify` for `--tx-notify`, the two download hosts fixed in code, wallet-rpc in `<dataDir>/bin/`.
- **Research.** wallet-rpc 0.18.5.1 has no login-file option, but `--config-file` takes `rpc-login=user:password`. A probe confirmed the login works that way and the password appears nowhere in the process list. Archives are direct downloads: linux-x64 0.18.5.1 is 84,575,716 bytes, linux-armv8 74,269,877.
- **`internal/monerodl`**, commit `6388886`:
  - `Latest`: `hashes.txt` over https from `www.getmonero.org`, verified with `hashsig` and the pinned key, then exactly one CLI archive for this CPU (x64 or armv8).
  - `Install`: downloads from `downloads.getmonero.org/cli/` with a 256 MB cap, checks the SHA-256 against the verified list, then extracts only `<dir>/monero-wallet-rpc` (a regular file, exactly one, 128 MB cap, decompression bounded at 2 GB).
  - Writes the binary (0755) and `installed.json` (version, archive and binary hashes) by temporary file and rename. A failure leaves the previous install untouched.
  - Redirects only over https and only between the two hosts.
  - Fixtures from `testdata/make-fixtures.sh`: tiny archives made with system `tar` and `bzip2`, lists signed by a throwaway key deleted on exit (public key and its parameters only).
- **`internal/supervise`**, commit `0696c53`:
  - wallet-rpc runs as a child, bound to 127.0.0.1 on a free port.
  - A new random login each start, in a mode-600 `--config-file` that is removed once wallet-rpc answers.
  - Empty environment, its own process group; wallet, ringdb and log (2 × 10 MB) under the data folder.
  - Network flag, `--daemon-address` and `--daemon-ssl` from the node URL; `--tx-notify "<bridge> notify --pid <pid> %s"`.
  - Ready when `get_version` answers. Restart backoff 1 s to 60 s, reset after 5 minutes of stable running. Stop: SIGTERM, then SIGKILL after 30 s.
  - The parent-death signal is sent from a locked OS thread, so the child dies with the bridge. `Status` is ready for health and `xmr-bridge status`.
- **`xmr-bridge notify --pid <pid> [txid]`** sends SIGUSR1. `run` takes SIGUSR1 from the start (Go's default for it is to exit) and logs it; the sync loop in 3d will act on it.

Tests:
- `cd bridge && go test ./...`: 7 packages pass. `gofmt` and `vet` clean, static build, `oracle` passes.
  - `monerodl`: 9 top-level tests.
  - `supervise`: 10 tests, using the test binary re-run as a fake wallet-rpc, or as a fake bridge.
  - `cmd`: 3 new tests.
- **`supervise` repeated 10 times:** no flakiness, no leftover processes. The race detector couldn't run: there's no C compiler on this box (see open issues).
- **Mutation checks, all caught:**
  - `monerodl`: archive hash check, redirect host check, https requirement, redirect scheme check, signature check, second entry, links, any depth, several releases, download size cap.
  - `supervise`: login file kept, environment inherited, no SIGKILL fallback, ready without an answer, bind on all interfaces, backoff never resets.
  - Redundant by construction: the binary's header size cap and its copy cap back each other up.
  - Three test fixes were needed to catch these: a real plain-http server, a two-entry archive at the normal depth, and asserting the size-cap error.
- **Live, download** (`~/xmr-pay-dev-data/3b2-live-download.txt`): the real list verified with the pinned key, the 85 MB archive matched `22a7dda7…c9958`, and the extracted binary is byte-identical to `/opt/monero/monero-wallet-rpc`. 48 s.
- **Live, supervise** (`~/xmr-pay-dev-data/3b2-live-supervise.txt`), real wallet-rpc 0.18.5.1 against the stagenet node: ready with RPC 1.31, no `rpc-login` on its command line, login file gone, log written. After `kill -9` it was back about 1 s later with a new pid, port and login. Stop left nothing running. 8.4 s.
- **Child dies with the bridge:** passed 5 of 5 times.

Not covered:
- `--tx-notify` actually firing (needs a wallet and a payment: 3c and 3h)
- wallet-rpc's own behaviour under `systemd` hardening (3f)
- the race detector (no `gcc`)

Notes:
- The parent-death signal is SIGTERM, so wallet-rpc can save its wallet. A child that ignored SIGTERM would survive a hard kill of the bridge; the real wallet-rpc honours it.
- One leftover fake process, from the "no SIGKILL fallback" mutation run, was found and killed. Normal runs leave none.
- `run` doesn't install or supervise yet: wiring belongs with the wallet (3c) and the sync loop (3d).

Open issues:
- **For Wyatt:** add a `go test -race ./...` step to CI? GitHub's Ubuntu runners have `gcc`, so it needs no new dependency. Locally it would need `gcc` installed (a system package).
- Delete the excludes on or after 2026-10-08.
- Wyatt folds spec changes 6, 7, 9 and 10 into the live spec.
- The downloaded wallet-rpc stays in `~/xmr-pay-dev-data/3b2-live-download/` for 3c.
- Commits `6388886`, `0696c53` and this entry are local.

Next step: session 3c, wallet from keys.
- `generate_from_keys` with the shop's address and view key, no spend key.
- Restore height from the node's current height unless set.
- The network check: the address prefix must match the node's network.
- Wire install-if-missing and supervise into `run`.
- Spec change 9's lookahead test needs a wallet, so it fits here or in 3h.

## 2026-10-04 · Phase 03 · Session 3c: view-only wallet from keys, network checks, run wiring

Done:
- Pushed `b33c514..0590403` with Wyatt's approval. Added a race-detector step to CI (`ae5d394`, approved; it needs cgo, and the runner has `gcc`). Not runnable on the dev box; first run on the next push.
- Plan approved:
  - the wallet password saved mode 600
  - restore height = the node's height
  - the live test with a view-only copy of the stagenet shop wallet, deleted afterwards
  - item 3, relying on wallet-rpc to refuse a mismatched view key, was reversed (below)
- **Research.** `scripts/with-shop-env.sh` refuses `sh`, `printf` and similar, so the live test is a Go test run under it, reading `SHOP_*` from its environment. The shipped binary has no dev path for keys. The node's `get_info` gives `nettype`, `height`, `synchronized` and `offline`.
- **Code**, commit `c9fa692`:
  - `internal/moneroaddr`: Monero base58, address prefixes, the two public keys.
  - `internal/shopkeys`: reads the installer's two lines; view-key format checks (64 hex, nonzero, below l, seed-like input refused).
  - `internal/noderpc`: `get_info`.
  - `walletrpc`: `generate_from_keys`, `open_wallet`, `close_wallet`, `get_address`.
  - `internal/wallet`: Create and Open. The wallet password is random, mode 600, never overwritten. Open checks the opened wallet is the shop address.
  - `config`: the shop address, checked against the network.
  - supervisor `Init` hook: the wallet is opened on every start.
  - `run`: without a wallet it stops with the fix before any network use. Otherwise it installs a verified wallet-rpc if one is missing and supervises it.
  - `internal/testaddr`: test-only address builder.
- **Found live: wallet-rpc doesn't check the view key** (spec change 11, accepted by Wyatt).
  - The first live run gave the real wallet-rpc 0.18.5.1 the real shop address with a wrong (well-formed) view key. `generate_from_keys` succeeded.
  - The v0.18.5.1 source confirms it: `on_generate_from_keys` only parses the hex, and `wallet2::generate` (view-only) calls `create_from_viewkey` with no comparison.
  - Without a check of our own, a wrong key makes a wallet that never sees payments, and a pasted spend key would be stored.
  - **Fix**, commit `a7a23cd`:
    - `internal/edwards`: k·B on Ed25519, standard library `math/big`, complete addition law, not constant-time (used once at install).
    - `shopkeys.CheckViewKeyMatches`: view·B must equal the address's public view key. Equal to the public spend key gives `ErrSpendKey`: "that is the shop wallet's SPEND key. Never enter it here…".
    - `ReadKeys` and `wallet.Create` both check before wallet-rpc sees the key.
  - The failed first run left a wallet-rpc briefly running (it exited on the parent-death SIGTERM) and a temporary folder with empty subfolders (no keys; the real key was never used). Both are gone. The test now stops wallet-rpc before deleting anything.

Tests:
- `cd bridge && go test ./...`: 92 top-level tests pass, 4 live tests skipped by default. `gofmt`, `vet`, static build clean. `oracle` passes.
- **Curve code:**
  - RFC 8032 section 7.1, TESTs 1 to 3
  - 300 random seeds against Go's `crypto/ed25519` (the test's oracle)
  - k·B == (k mod l)·B
  - 0·B and 1·B
  - fuzzed against `crypto/ed25519` for 2 min, about 124k inputs (`~/xmr-pay-dev-data/3c-fuzz-edwards.txt`)
- **Mutation checks, all caught:**
  - curve: sign bit, top scalar bit, d instead of 2d, wrong sign of d
  - address: network check, subaddresses accepted, unreduced scalar, seed check
  - node: status ignored, size cap
  - wallet: node network check, node offline accepted, existing wallet overwritten, opened address unchecked, password file kept after a failure, created address unchecked
  - supervisor: `Init` failure ignored
  - config: address unchecked, same-machine flag anywhere
  - the view-key match skipped in `Create` or in `ReadKeys`, the spend key not recognised, any key accepted
- **Test gaps the mutation checks found, fixed:**
  - two config cases ("same machine on mainnet/testnet") had been passing for the wrong reason since an edit silently didn't apply
  - wallet refusal cases had passed because the fake wallet-rpc failed
  - the node size cap's error wasn't asserted
  - Not run: the "run without a wallet" mutation, which would start a real 85 MB download; without the check, the test hangs until its timeout.
- **Live** (`~/xmr-pay-dev-data/3c-live-shop-wallet.txt`, run under `scripts/with-shop-env.sh`):
  - The real stagenet address and view key pass every check, including view·B == the address's public view key.
  - A wrong key was refused before wallet-rpc.
  - The wallet was created from `SHOP_RESTORE_HEIGHT` (2219978) and opened by `run`'s start-up path; the address matches. Synced to the node's height 2222135 in 5 s.
  - **The phase 01 spike's 0.001 XMR payment was found:** subaddress 1, height 2221449, 686 confirmations, unlock 0.
  - After `kill -9` it was restarted and the wallet reopened.
  - Wallet files mode 600, folder 700.
  - Nothing left running; the temporary folder deleted. 24 s.

Not covered:
- `--tx-notify` firing on a new payment (3h)
- the subaddress-lookahead test (spec change 9, 3h)
- the race detector (CI only, not yet run)
- a remote node that needs a login (no setting for it, by design)

Open issues:
- Wyatt folds spec changes 6, 7, 9, 10 and 11 into the live spec.
- Delete the excludes on or after 2026-10-08.
- Commits `ae5d394` through this entry are local.

Next step: session 3d.
- The Ed25519 bridge key (`crypto/ed25519`, key file mode 600).
- Pairing with the one-time code; signing that matches `contract/test-vectors/sync-signature.json` byte for byte.
- The sync loop (10–15 s and on SIGUSR1), snapshots from `get_transfers`, pool top-up with `create_address`, reconcile on start, backoff when the site is unreachable.
- `xmr-bridge status`.
- End to end against the dev site.

## 2026-10-04 · Phase 03 · Session 3d: signing, pairing, sync loop

Done:
- Pushed `0590403..6a756ba` with Wyatt's approval. CI on GitHub: the new race-detector step passed on its first run.
- Plan approved:
  - spec change 12 (more than 32 transfers to one address: send the 32 largest), accepted
  - pending pool addresses kept in `run/pending.json`
  - `xmr-bridge pair` and `dev-e2e.mjs --issue-code`
  - the shop wallet's real stagenet subaddresses in the dev site's pool during the test
- **Code**, commit `af293af`:
  - `internal/syncsign`: Ed25519 over `ts + "\n" + body`; key file with the seed, mode 600.
  - `internal/syncclient`: one bridge/sync request.
    - JSON without a BOM; no `Origin` or `Authorization` header; 256 KiB (4 KiB for pairing) checked before sending.
    - Redirects are reported, not followed.
    - Each refusal carries the site's code and its fix: pair again, the clock, or access rules for `/_emdash/api/plugins/xmr-pay/*`.
  - `internal/pairing`: a fresh key and one `pair` request; the key is saved only when the site accepts it.
  - `internal/bridgeloop`:
    - syncs every 12–15 s, and on SIGUSR1 (debounced)
    - reconcile on start
    - a snapshot for every watched index, rotated past 100 and halved if a body is too large; at most the 32 largest transfers per index
    - pool top-up up to 100 addresses per sync, pending ones persisted until the site takes them
    - `seq` never goes back; backoff 15 s to 5 min; the key file read every sync, so re-pairing needs no restart
    - `run/status.json` after every attempt
  - Commands: `xmr-bridge pair --config --code` and `xmr-bridge status --config` (plain words and fixes; exit 1 unless healthy). `run` starts the loop beside the supervisor.
- **Live end to end with the dev site**, commit `5e7306d`. The first run found that a used code answers `BAD_SIGNATURE`, as the contract README says (nothing is read before the signature once a code is spent). The test's expectation was wrong; pairing now explains `NOT_PAIRED`, `BAD_SIGNATURE` and `PAIRING_REJECTED` as "the pairing code is used or expired, or mistyped".
- `scripts/dev-e2e.mjs --issue-code <file>`; CLAUDE.md command rows.

Tests:
- `cd bridge && go test ./...`: 121 top-level tests pass, 5 live tests skipped by default. `gofmt` and `vet` clean.
- The Go signer reproduces all 9 cases of `contract/test-vectors/sync-signature.json` byte for byte (RFC 8032 TEST 1 and 2), and its verdicts match.
- **Mutation checks:** 15 of 16 caught. They covered:
  - the message separator, a readable key file, signing other bytes, the size limit, following redirects, a bad watch index
  - the 32 cap, the tie rule, duplicate txids, `seq` going back, pending not saved, no immediate reconcile, too-large not split
  - a key saved after a refusal, status hiding errors

  The survivor, pending addresses in the top-up count, is redundant: after a successful sync nothing is pending.
- **Live** (`~/xmr-pay-dev-data/3d-live-devsite.txt`; dev site on `astro dev` with a fresh plugin build; `data.db` backed up to `~/xmr-pay-dev-data/baseline/data.db.before-3d`), real wallet-rpc and view-only shop wallet, 51 s:
  1. paired through an issued code
  2. the used code refused with the key unchanged
  3. pool filled to 50 of 50 real subaddresses; `xmr-bridge status` healthy
  4. restarted: synced again, pool still 50, nothing new created
  5. proxy down: "can't be reached: connection refused" in the status, and `status` exits 1
  6. proxy back: syncing again after 15 s
  7. paired again with a new code: the running bridge synced with the new key, and the old key got `BAD_SIGNATURE`
  - Cleanup: the site's 50 pool rows, 2 KV rows and the bridge key removed. The database is back to its baseline (rate cache and cron flag only), the wallet copy and code files deleted, no wallet-rpc left, the dev site stopped.

Not covered (3h, with Wyatt's payments):
- snapshots carrying real transfers to a pool address
- `--tx-notify` waking the loop
- a checkout settling through the real bridge
- the built (workerd) copy of the site

Open issues:
- Wyatt folds spec changes 6, 7 and 9–12 into the live spec.
- Delete the excludes on or after 2026-10-08.
- Commits `af293af`, `5e7306d` and this entry are local.

Next step: session 3e, the remote-node cross-check. Compare the block hash at each payment height with a second node before reporting confirmations; hold at 0 and turn a check red on a mismatch.
- Open questions for Wyatt: which second nodes by default (open question 12), and whether the cross-check applies only when the configured node is remote.

## 2026-10-04 · Phase 03 · Session 3e: remote-node cross-check

Done:
- Pushed `6a756ba..5423a71` with Wyatt's approval. Plan approved (all five): spec change 13 accepted, commit `37c68fb`.
  - The method: the second node's whole block at the payment height must have the configured node's hash and contain the txid. The second node learns heights only.
  - Only when the node isn't the shop's own.
  - A built-in list of second nodes, no setting.
  - A mismatch holds the transfer at 0 (red); no second node answering is amber, with confirmations as reported.
  - An optional `checks` field in the sync body, shown on the admin page in phase 04.
- **Second-node research** (open question 12):
  - Stagenet candidates from monero.fail and xmr.ditatompel.com. Six answer `get_info` (stagenet) and `get_block` at height 2221449 with the local node's hash: `stagenet.xmr.kernal.eu:38089` (https, and the only one with https), `stagenet.xmr-tw.org:38081`, `node.sethforprivacy.com:38089`, `node.monerodevs.org:38089`, `node2.monerodevs.org:38089`, `xmr-lux.boldsuck.org:38081`.
  - Mainnet: candidates listed only, not probed (no mainnet use in development). Added to "Still to decide" in `docs/decisions.md`.
- **Code**, commit `3009559`:
  - `noderpc`: `get_block_header_by_height` and `get_block` on a shared JSON-RPC helper.
  - `internal/crosscheck`: the check, the cache per txid@height (a reorg is checked again), the smaller confirmation count, the second node held to 0 while it's behind, own-node detection (names resolved), the built-in lists.
  - The loop applies it before building snapshots; the sync body carries `checks`; `status.json` and `xmr-bridge status` show "Node check" (a mismatch is unhealthy); `run` enables it only for a remote node.

Tests:
- `cd bridge && go test ./...`: all pass, live tests skipped by default. `gofmt` and `vet` clean.
- **Mutation checks, 10 of 10 caught:** block hash not compared, txid not looked for, the second node's count ignored, its network ignored, no cache, cache ignoring the height, the second node behind not held, private LAN treated as remote, the loop ignoring checked confirmations, status calling a mismatch healthy.
- **Live** (`~/xmr-pay-dev-data/3e-live-crosscheck.txt`), the local stagenet node against the built-in public nodes:
  - the spike payment checks out (883 confirmations on both)
  - a made-up txid is a mismatch
  - a proxy rewriting the local node's block hash (a dishonest node) is caught as a mismatch
  - 1.1 s
- The plugin ignores the new top-level `checks` field: its test "accepts a well-formed body and ignores unknown fields" covers a top-level unknown key.

Not covered:
- the cross-check inside a full run with a remote configured node; 3h or phase 05's remote-node run, which uses a public node as the configured node
- mainnet second nodes (to decide)
- the admin page showing `checks` (phase 04)

Open issues:
- **For Wyatt:** the mainnet second-node list, before release (phase 09).
- Wyatt folds spec changes 6, 7 and 9–13 into the live spec.
- Delete the excludes on or after 2026-10-08.
- Commits `37c68fb` through this entry are local.
- Plaintext second nodes: five of the six stagenet nodes are http only. A network attacker between the wallet host and that node could answer for it, but would also have to fake the configured node's view to cause harm. https entries are preferred when the list is chosen for mainnet.

Next step: session 3f, `installer/install.sh` and the systemd unit (Wyatt runs it with `sudo`; the same-machine check; prompts read from `/dev/tty`; the cautious path `xmr-bridge install`).

## 2026-10-04 · Phase 03 · Session 3f-1: xmr-bridge install and uninstall

Done:
- Pushed `5423a71..453538a` with Wyatt's approval. 3f plan approved (all five); `shellcheck` skipped.
- **The install flow**, commit `320ac1b`. Everything the machine sees goes through small interfaces, so the whole flow runs against a fake root folder.
  - Checks before any prompt: root, systemd, `--site`, `--pair`.
  - Prompts on `/dev/tty`: the address, then the view key with echo off. Three tries each, with the 3c checks, including the view key belonging to the address and the spend key recognised. The network comes from the address.
  - The same-machine check (site process, `astro.config.*` importing `emdash`, the site's name resolving here), refused unless `--allow-same-machine` on stagenet. How reliable each signal is (open question 17) is documented in `internal/installer/samemachine.go`.
  - The local node is tried on 127.0.0.1 and [::1] at the network's port, else asked for.
  - The service user and files:
    - `/var/lib/xmr-bridge` (700) holds the bridge binary, wallet-rpc, wallet and key
    - `/etc/xmr-bridge/config` (600, the service account's)
    - `/usr/local/bin/xmr-bridge` symlink, which never replaces a file the installer didn't make
  - wallet-rpc runs as the service account even during install: the supervisor's new `Credential` option, with root's groups dropped.
  - Running it again keeps the wallet for the same address and pairs again; another address is refused.
  - Then systemd: `enable --now`, or `restart` when the unit already existed.
  - `uninstall` keeps the data unless `--delete-data` is given.
  - Commands: `xmr-bridge install --site --pair [--node] [--restore-height] [--no-auto-update] [--allow-same-machine]` and `xmr-bridge uninstall [--delete-data]`.
- **The unit:** a dedicated user, `NoNewPrivileges`, `ProtectSystem=strict` with `ReadWritePaths=/var/lib/xmr-bridge`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, the kernel, cgroup, clock and hostname protections, `RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX`, `RestrictNamespaces`, `SystemCallFilter=@system-service`, `MemoryDenyWriteExecute`, `ProtectProc=invisible`, `RemoveIPC`, an empty capability set, `UMask=0077`.
  - `systemd-analyze verify`: clean apart from the binary not existing yet.
  - `systemd-analyze security --offline`: exposure 3.0, then **1.5** after the last five directives.
  - `MemoryDenyWriteExecute` and `SystemCallFilter` are confirmed against the real wallet-rpc in Wyatt's run (3f-2).
  - The dev box runs systemd 257 (Debian 13), not Debian 12 as I'd assumed.

Tests:
- `cd bridge && go test ./...`: all pass, live tests skipped by default. `gofmt` and `vet` clean.
- Installer tests:
  - a full install: config, files, modes, owners, symlink, order, the credential, the unit, systemd calls, no key in the output
  - early refusals that leave nothing behind
  - retries and giving up
  - mainnet and the IPv6 local node
  - the node prompt and `--node`
  - same machine, with and without the flag
  - running it again
  - a foreign file at the symlink's place
  - uninstall, with and without `--delete-data`
  - the unit's directives
  - the same-machine signals against a fake `/proc` and fake folders
  - the prompter (echo restored, line cap)
  - `Chown` not following links
- **The real detector on the dev box** (dev site stopped) found the dev site's `astro.config.mjs`, the baseline copy of it in `~/xmr-pay-dev-data/baseline/`, and `localhost` resolving here.
- **Mutation checks:** 12 of 13 caught. The survivor (the dev flag on mainnet) is refused by config validation too, before any change.

Not covered: anything as real root (3f-2, Wyatt's run). Not unit-tested without a terminal or root: `useradd`, `userdel`, `systemctl`, and the terminal echo ioctls.

Open issues:
- Commit `320ac1b` and this entry are local.
- Spec changes 6, 7 and 9–13 to fold into the live spec.
- Delete the excludes on or after 2026-10-08.
- The mainnet second-node list.

Next step: session 3f-2.
- `installer/install.sh` (POSIX `sh`): detect the CPU, download the bridge, check the embedded SHA-256, then `sudo <bridge> install "$@"`.
- `scripts/build-dev-release.sh`, with a dev `install.sh` pointing at `http://127.0.0.1:8099`.
- Wyatt's real run on the dev box: stagenet, `--allow-same-machine`, a code from the admin page, then status, restart and uninstall.

## 2026-10-04 · Phase 03 · Session 3f-2: install.sh, dev release, Wyatt's real install

Done:
- Pushed `453538a..73e2ea2` with Wyatt's approval.
- **`installer/install.sh`**, POSIX `sh`, a template the build fills in (an unfilled one refuses to run), commit `89635ac`.
  - Linux and x86-64 or 64-bit ARM only.
  - Downloads that release's `xmr-bridge` and checks it against the SHA-256 written into the script.
  - Falls back to the home folder when `/tmp` can't run programs.
  - Then `sudo xmr-bridge install "$@"`, reading the terminal so it works piped from curl.
- **`scripts/build-dev-release.sh`:** both CPUs and a filled `install.sh` for `http://127.0.0.1:8099` in `~/xmr-pay-dev-data/dev-release/`. Built at `0.0.0-dev.89635ac`; about 11 MB per binary (4.5 MB at 3a).
- **`scripts/dev-bridge-checks.sh`:** Wyatt's `sudo` checks, written to one file.
- **Wyatt's real install on the dev box** (stagenet, `--allow-same-machine`, a code from the admin page; `data.db` backed up to `~/xmr-pay-dev-data/baseline/data.db.before-3f2`). From `~/xmr-pay-dev-data/3f-checks-output.txt`, `3f-where.txt`, `systemctl` and the site's database:
  - **Installed:** `xmr-bridge status` paired, synced, node check off (own node), 50 of 50 addresses on the site, exit 0. The service ran as `xmr-bridge` with wallet-rpc on 127.0.0.1, no login on its command line, 72 MB.
  - **Files:** config 600 and the wallet files 600, all owned by `xmr-bridge`; data folder 700; the symlink in place.
  - **Hardening:** live `systemd-analyze security` 1.5 OK. wallet-rpc runs under `MemoryDenyWriteExecute` and `SystemCallFilter=@system-service`, so both stay.
  - **Restart:** synced 3 s after.
  - **`kill -9` wallet-rpc:** restarted 6 s later, wallet reopened, height advancing.
  - **Uninstall:** service and symlink gone; wallet, key and config kept, with the message saying where.
  - **The second install with a new code:** the service started at 20:49:56, the wallet opened at height 2222352, the code was marked used, syncing resumed, and the pool stayed at 50 with no new addresses created.
  - The view-only wallet file is about 54 MB just after creation, at a restore height of today.
- **Not recorded:** `3f-install-output.txt` and `3f-reinstall-output.txt` were never written, in `/home/dev` or `/root`; the cause is unknown. That leaves the installer's messages unseen, including "Keeping the existing view-only wallet" on the second run, which is proven only by `TestRunAgain`. Setup-friction row added, with a proposal for Wyatt: `xmr-bridge install` writes its own messages (never the answers) to `/var/lib/xmr-bridge/log/install.log`.

Tests:
- `install.sh` under `/bin/sh` (dash), with a fake release server and fake `sudo`, `uname` and `id`:
  - a good install, with sudo and as root
  - arm64
  - tampered or missing download
  - an unfilled template, another CPU, not Linux
  - the noexec `/tmp` fallback
  - the download folder removed afterwards
- Mutation: without the checksum comparison, 2 tests fail.
- `cd bridge && go test ./...`: all pass.

Not covered:
- the installer's messages in a real run (not captured)
- a separate wallet-host machine (phase 05)
- a remote node in a real install (phase 05)
- arm64 on real hardware

State left:
- **The wallet host service stays installed and enabled on the dev box** for 3g and 3h, paired with the dev site. It backs off while the dev site is stopped.
- The dev site and release server are stopped.
- The dev database holds the pairing: the bridge key, 50 real stagenet subaddresses of the shop wallet in the pool, and `state:bridge`. Remove with `dev-e2e.mjs --cleanup-only` and `sudo xmr-bridge uninstall --delete-data` when done with phase 03.

Open issues:
- **For Wyatt:** the `install.log` proposal (above).
- Spec changes 6, 7 and 9–13 to fold into the live spec.
- Delete the excludes on or after 2026-10-08.
- The mainnet second-node list.
- Commit `89635ac`, the setup-friction row, CLAUDE.md and this entry are local.

Next step: session 3g, signed self-update.
- `release.json` signed with Ed25519 (`"xmr-bridge-release-v1\n"` prefix), up to two pinned keys.
- The `devrelease` build tag pins a dev key from `~/xmr-pay-devkeys/`.
- `--release-url` on stagenet only.
- Downgrade refused, a 48-hour staged delay, rollback on a failed health check.
- The daily check for new Monero wallet-rpc releases (3b-2's verifier).

## 2026-10-04 · Phase 03 · Session 3g (paused): handoff

**Finished** (built, tested, committed locally; not pushed): commits `bfa1f94`, `2d62ff5`, `4754c7b`.
- **Install log:** `/var/lib/xmr-bridge/log/install.log`, written once the installer starts changing the machine. It holds the installer's messages, with answers shown as `[answered]`, never the answers or the code.
- **Signed self-update:** `release.json` signed with Ed25519 over `"xmr-bridge-release-v1\n"` plus its bytes, checked against pinned keys.
  - Newer versions only; a refused version, and anything older, is skipped until a newer one appears.
  - Waits 48 h after the signed date.
  - Size, SHA-256 and a `version` run are checked before any swap.
  - The previous binary is kept as `.prev`.
  - Applied with wallet-rpc stopped, then exit 75 for systemd to restart the service.
- **Rollback:**
  - The guard (`update-guard.sh`, `ExecStartPre`, run as `xmr-bridge`) restores the previous binary on the 4th start without a proper start, then refuses the version.
  - The 10-minute rule rolls back only when the wallet never opened, or when the site answered and refused while nothing was accepted. An unreachable site never counts against the update.
- **wallet-rpc updates:** 48 h after first seen; the wallet files are backed up before the swap. Rollback after 3 failures or 5 minutes, restoring both binary and wallet, and refusing the version.
- **Admin copy:** `/usr/local/bin/xmr-bridge` is now a root-owned copy (hash recorded; uninstall removes only that file), so root never runs a file the service can write.
  - `status`, `pair` and `uninstall` refuse a newer state format, telling you to re-run the installer.
  - `pair` run as root hands the key to `xmr-bridge`.
- **The unit:** `StartLimitIntervalSec=600` and `StartLimitBurst=20` in `[Unit]`; `ExecStartPre` without a prefix, `RestartForceExitStatus=75` and `RestartSec=10` in `[Service]`; `User=` and `Group=xmr-bridge`. `systemd-analyze security --offline`: 1.5.
- **Dev builds** (`-tags devrelease`):
  - The dev public key and release address are set at build time.
  - Updates happen only when the open wallet's address is on stagenet.
  - Short delays.
  - Break modes: `crash` and `badsig`.
- **The content test:** a release build contains no dev key, no dev address and no `devBreak` (with a control on the dev build).
- **Scripts:**
  - `dev-release-key.sh` and `sign-dev-release.sh` (both run by Wyatt)
  - `build-dev-release.sh` (`--version`, `--break`, unsigned `release.json`)
  - `check-dev-signature.sh` (Claude: public key only)
- **Tests:** `cd bridge && go test ./...` passes, with and without `-tags devrelease`; `gofmt` and `vet` clean. 17 of 17 mutation checks caught. An `openssl -rawin` signature verifies in `VerifyManifest` (checked with a throwaway key, since deleted).

**Left, in order:**
1. **Wyatt makes the dev key**, on the dev box as `dev`, not with sudo:
   ```sh
   sh ~/xmr-pay/scripts/dev-release-key.sh 2>&1 | tee /home/dev/xmr-pay-dev-data/3g-key-output.txt; ls -l /home/dev/xmr-pay-dev-data/3g-key-output.txt
   ```
2. **Claude:**
   - reads `3g-key-output.txt` and `~/xmr-pay-dev-data/dev-release.pub`
   - backs up `data.db`
   - builds V1 with `scripts/build-dev-release.sh`
   - starts the dev site (fresh plugin build) and the release server: `tmux new -d -s release 'cd ~/xmr-pay-dev-data/dev-release && python3 -m http.server 8099 --bind 127.0.0.1'`
3. **Wyatt's sudo reinstall** with a new code from Connect wallet host; only the installer runs with sudo, and the output path is absolute:
   ```sh
   curl -fsSL http://127.0.0.1:8099/install.sh | sh -s -- --site http://localhost:4321 --pair <CODE> --allow-same-machine 2>&1 | tee /home/dev/xmr-pay-dev-data/3g-reinstall-output.txt; ls -l /home/dev/xmr-pay-dev-data/3g-reinstall-output.txt
   ```
   This migrates the 3f layout (the symlink becomes the root-owned copy, the guard is installed, the unit gets its new lines).
4. **V2, good:** Claude builds `--version <newer>`; Wyatt runs `sh ~/xmr-pay/scripts/sign-dev-release.sh`; Claude checks with `scripts/check-dev-signature.sh`, then watches the service update itself (2-minute delay, checks every minute) and commit after a sync.
5. **V3, crash:** `--break crash`; Wyatt signs. Expected: the guard rolls back on the 4th start, V3 is refused, and the next check skips it.
6. **V4, bad signature:** `--break badsig`; Wyatt signs. Expected: the site answers `BAD_SIGNATURE`, and 10 minutes later V4 is rolled back and refused.
7. Then: the 3g progress entry, the push (with Wyatt's approval), and CI on the new commits.

**Open or unverified:**
- **No 3g behaviour has run on the real system yet:** updates, both rollbacks, the guard under `ProtectSystem=strict` as the service user, the new unit lines under real systemd, the admin copy and the install log.
- **The installed service is the 3f build** (`0.0.0-dev.89635ac`): old layout (the symlink), no guard, the old unit, no update code. It is still active and paired, backing off while the dev site is stopped. Step 3 replaces it.
- **The harness refuses any Bash command that touches `~/xmr-pay-devkeys/`** (the new Read deny applies to shell commands too). Every key operation is Wyatt's.
- **`.claude/settings.json` has Wyatt's two deny rules, uncommitted;** his to commit.
- **wallet-rpc updates can't be tested live:** there is no newer Monero release than 0.18.5.1. They're covered by unit tests only.
- **CI hasn't run on `bfa1f94`, `2d62ff5`, `4754c7b`** (not pushed), including the race step on the new code.
- The dev database still holds the 3f-2 pairing: the bridge key and 50 real stagenet subaddresses of the shop wallet.
- From earlier sessions:
  - fold spec changes 6, 7 and 9–13 into the live spec
  - delete the release-age excludes on or after 2026-10-08
  - the mainnet second-node list
  - the 3f-2 transcripts were never captured

## 2026-10-05 · Phase 03 · Session 3g: live update and rollback runs (3g done)

Done:
- **Wyatt's steps:** made the dev key (`dev-release-key.sh`; the public key in `~/xmr-pay-dev-data/dev-release.pub`, 32 bytes), committed his deny rules (`34f1000`), reinstalled from a dev release, and signed V2, V3 and V4. Each signature was checked with the public key only (`scripts/check-dev-signature.sh`), which also proved the public file matches his key.
- **V1 install** (`0.0.202610051414-dev.34f1000`), from `~/xmr-pay-dev-data/3g-final-output.txt` and what I could see without root:
  - The 3f layout migrated: `/usr/local/bin/xmr-bridge` is now a root-owned copy, and the guard is installed.
  - The unit systemd loaded has every new line: `StartLimitIntervalSec=600` and `StartLimitBurst=20` in `[Unit]`, `User=` and `Group=xmr-bridge`, `ExecStartPre=…/update-guard.sh` with no prefix, `RestartForceExitStatus=75`, `RestartSec=10`, and the hardening.
  - `install.log`: questions shown as `[answered]`, "Keeping the existing view-only wallet for this address", pairing done, the dev-flag signals listed.
- **V2, good update** (`…1436`): at 08:39:43 it verified the signed `release.json`, downloaded and checked the binary, and swapped it in. It logged "restarting for the update" (exit 75), systemd restarted it 10 s later, and it logged "update confirmed" 15 s after starting (08:40:09). Later checks fetched `release.json` and its signature but never the binary again.
- **V3, crash** (`…1447`): swapped in at 08:50:33. Three starts each logged "deliberately broken … exiting", 10 s apart. Then the guard, as the service user: "the update to bridge …1447 didn't start 3 times in a row; rolled back and refused it" (08:51:14), and V2 started again. Later checks never downloaded V3. systemd stayed well inside its start limit (5 starts in about 45 s).
- **V4, bad signature** (`…1451`, newer than the refused V3, so it got past that refusal): swapped in at 08:54:35 and ran normally. The site's last accepted sync stayed frozen at 14:54:29 UTC for 10 minutes; every sync was refused with `BAD_SIGNATURE`. At 09:04:46, 10 minutes after the swap: "the update to bridge …1451 didn't work; rolling back to …1436 and refusing …1451". V2 was back at 09:04:57, and the site accepted syncs again from 15:05:27 UTC.
  - `run/refused` holds both V3 and V4.
  - The admin copy (still V1) ran `status` successfully against the self-updated V2 service: same state format, exit 0.
- **Two gaps found by the live run, fixed** (commit `52cf950`, tests first, mutation checks caught):
  - `xmr-bridge status` didn't print the update state it records; it now prints `Updates:`.
  - `update-state.json`, which the admin copy's format check reads, only appeared once a wallet-rpc version had been seen; `run` now writes the format at every start.
  - Both are unit-tested; neither is live yet (the service runs V2, built before them). A V5, signed the same way, would deliver them.
- Setup-friction row: why `tee` transcripts can't hold the installer's messages, and the still-missing files.

Tests:
- `cd bridge && go test ./...`: all pass, with and without `-tags devrelease`; `gofmt` and `vet` clean.
- Live: V1 install, V2 update, V3 crash rollback, V4 10-minute rollback, all as designed (watch files `~/xmr-pay-dev-data/3g-v3-watch.txt`, `3g-v4-watch.txt`; journal and state in `3g-final-output.txt`).

Not covered:
- wallet-rpc updates live (there is no newer Monero release than 0.18.5.1; unit tests only)
- an update while the site is unreachable (unit-tested as "wait, never roll back")
- a real arm64 machine
- release builds' "no key pinned" state on a live machine (unit-tested)

State left:
- The wallet host service runs V2 (`0.0.202610051436-dev.34f1000`), paired, and backs off while the dev site is stopped.
- The dev site and release server are stopped; no tmux sessions.
- `~/xmr-pay-dev-data/dev-release/` holds the V4 files.
- The dev database still holds the pairing and 50 real stagenet subaddresses.

Open issues:
- Commits `bfa1f94`, `2d62ff5`, `4754c7b`, `a0b03fd`, `52cf950` and this entry are not pushed; CI hasn't run on them.
- Spec changes 6, 7 and 9–13 to fold into the live spec.
- Delete the release-age excludes on or after 2026-10-08.
- The mainnet second-node list.
- The cause of the missing transcript files is still unknown.

Next step: session 3h, end to end on stagenet with the dev site, with Wyatt sending payments:
- happy path, two-part payment, underpayment, late payment
- the bridge stopped across an invoice's expiry
- wallet-rpc killed, the site unreachable
- re-pairing after deleting the bridge's key
- plus spec change 9's subaddress-lookahead test

## 2026-10-05 · Phase 03 · Before 3h: the plugin is renamed Coffer (slug `coffer`)

Done:
- **Rename** (Wyatt's decision; spec change 14, proposed; `docs/decisions.md`), commits `2f0bdf1` (code) and `5fbda8c` (docs). Every `xmr-pay` hit was sorted into three groups:
  - **Slug or brand, changed:** the manifest slug `coffer` and name `Coffer`, the npm name `coffer`, the bridge's sync route `/_emdash/api/plugins/coffer/bridge/sync`, the access-rule hint path, the `BAD_RESPONSE` hint, the subaddress label `coffer` (write-only, nothing reads it back), doc comments, `dev-e2e.mjs`, the seed wording, README, CLAUDE.md, the contract README, phases 06 and 08, the setup-friction lessons.
  - **Installer wording:** `install.sh` now says `xmr-bridge installer:` and uses `xmr-bridge.XXXXXX` temp folders (Wyatt's choice: the wallet host keeps the xmr-bridge name).
  - **Unchanged:** the xmr-bridge layer (binary, user, paths, unit including its `Description`, guard, the signed `"xmr-bridge-release-v1\n"`), dev-box paths, signed hash-list fixtures, dated history, the PoC snapshot.
- **Dev site:**
  - Old plugin's data removed. EmDash can't uninstall a config-listed plugin from the admin page, so Wyatt ran `~/xmr-pay-dev-data/purge-xmr-pay.cjs` after the auto-mode classifier blocked it for Claude; it ran 2 storage rows, 7 indexes and the cron row down to 0. A read-only scan finds no `xmr-pay` in any table or index.
  - Dependency and `astro.config.mjs` switched to `coffer`.
  - This replaces the end-of-phase-03 cleanup: `dev-e2e.mjs --cleanup-only` and Wyatt's `sudo xmr-bridge uninstall --delete-data` both ran.
- **Dev bridge reinstalled and re-paired:** `dev-release/` emptied, then rebuilt as `0.0.202610051631-dev.5fbda8c`; the binary holds the coffer path and no `plugins/xmr-pay`.
  - Wyatt's install with a `--issue-code` code; the service is active.
  - `xmr-bridge status`: paired, synced 5 s before, stagenet, node check off (own node), 50 of 50 addresses, **`Updates:    on`**. That line is from `52cf950`, now live.
  - Site side: 50 `coffer` pool rows, `state:bridge` at height 2222773, the bridge key option, the 7 `idx_plugin_coffer_*` indexes (created on EmDash's periodic sweep, not at plugin load).
- **The transcript** `coffer-install-output.txt` was written (12:16:12, checked with `ls -l` in the same command). As 3g found, it holds only `install.sh`'s two lines; the installer talks through `/dev/tty`, and its record is `install.log`. So the missing 3f and 3g key files remain unexplained, but this run shows `tee` itself works from Wyatt's shell.
- Setup-friction rows (`2e4becf`): a handed-over script that was never written (Claude's error), and a `cp` backup of `data.db` without its WAL.

Tests:
- Tests first. Each new expectation failed before the code change: the source manifest's slug and name, the pool label `coffer`, the `xmr-bridge installer:` prefix, the sync and hint paths.
- Plugin: typecheck clean, `validate` ok, 120 of 120 tests, bundle check ok (27.5 KB).
- Bridge: gofmt and vet clean; `go test ./...` and `go test -tags devrelease ./...` all pass.
- Live: the steps above.

Not covered:
- `walletrpc/client_test.go` passes with any label (it tests the pass-through only); `bridgeloop`'s test pins the label.
- The `housekeeping` cron row doesn't exist yet. As designed, a config-listed install schedules it on the first admin page load (`src/admin.ts:148`), and pairing went through `--issue-code`, so the admin page hasn't been opened.
- Backups: `data.db.before-coffer.NO-WAL` lacks the WAL. The full copy is `data.db.coffer-after-cleanup` (`VACUUM INTO`, after the old-slug cleanup).

State left:
- The wallet host service runs `0.0.202610051631-dev.5fbda8c`, paired with the dev site under `coffer`, and backs off while the site is stopped.
- The dev site and release server are stopped; ports free. `dev-release/` holds this build (unsigned `release.json`).

Open issues:
- **For Wyatt:**
  - spec change 14: fold it into the live spec, and decide on the unit's `Description` and the PoC
  - whether `coffer` is free in the registry and on npm
- Commits `2f0bdf1`, `5fbda8c`, `2e4becf` and this entry are not pushed.
- Carried over: spec changes 6, 7 and 9–13 to fold in; delete the release-age excludes on or after 2026-10-08; the mainnet second-node list.

Next step: session 3h as planned (stagenet end to end with the dev site, Wyatt sending payments). Open the admin page first, which schedules the cron. Back up `data.db` with `VACUUM INTO`.

## 2026-10-06 · Phase 03 · Session 3h: stagenet end to end with the dev site

Done (real stagenet payments from Wyatt's buyer wallet through the installed bridge into the dev site; Speed Standard, 2 confirmations; evidence files `~/xmr-pay-dev-data/3h-*`, the watch log `3h-watch.txt`):
- **Tooling** (`b290c9a`, `4014a2b`): `scripts/dev-invoices.mjs` (checkouts, pay scripts Wyatt runs, a status watcher, the `drain-pool` dev shortcut Wyatt approved), `walletrpc.RescanBlockchain`, `TestLiveLookahead`.
- **Results, each as the spec says:**
  | Scenario | Result |
  |---|---|
  | No payment | 4 invoices: `pendingExpiry` at the deadline, `expired` at the next sync (19:30:20 to 19:30:35) |
  | Happy | Full payment at once: `confirming` (skipping `seen`), then `settled` at 2 confirmations |
  | Two-part | 60% then 40%, both in the window: `seen`, `confirming`, `settled` |
  | Underpaid | 90%: `seen`, then review `underpaid` at expiry. A first two-part attempt whose second part couldn't come in time did the same |
  | Late | Paid after expiry, within 24 h: `expired` to review `late` |
  | E: bridge stopped across expiry | Both invoices `pendingExpiry` while the bridge was silent. Started about 2 h after the deadline: the paid one (mined at 2222909, `expiresHeight` 2222924) settled, the unpaid one expired |
  | K: wallet-rpc killed | Restarted by the bridge's supervisor 1 s later (systemd restarts 0); syncs continued |
  | S: site down 5 min | The bridge backed off and resumed within about 3 min of the site's return; a payment made during the outage was reported then |
  | R: key deleted | `status` said "not paired" with the fix; `pair` with a new code; syncs resumed |
  | L1: gap | Index 261, 252 past the last paid index: reported and settled |
  | L2: shop app stand-in | Not seen as restored, not seen after creating addresses, seen after a rescan (spec change 9 evidence) |
  | L3: reinstall | Found a gap: a settled high-index invoice falsely went to review `reversed`, and the catch-up was a 303-sync loop. **Spec change 15, proposed** |
- **Docs:** spec change 9's evidence, spec change 15, and a setup-friction row (Claude's `pkill -x` mistake).

Tests:
- `node --test scripts/dev-invoices.test.mjs`: 5 pass; two mutation checks caught.
- Bridge: `go test ./...` passes with and without `-tags devrelease`; gofmt and vet clean. `TestLiveLookahead` passed live on its second run; the first failed on the 5 s client timeout during the rescan, now tolerated.
- Live: the table above.

Not covered:
- Tips; a reorg or double-spend on stagenet (plugin scenario tests only); overpayment; the per-client rate limit.
- **The admin page wasn't opened**, so its bridge-key display (part of phase 03's "done when") isn't confirmed this session, and the `housekeeping` cron row still doesn't exist.
- Whether raising a wallet app's lookahead before restoring finds the far payment (spec change 9's open question for Wyatt).

Notes for later phases:
- Phase 04 admin page: an underpaid or review invoice shows `confirmations: 0` because the count is that of the payment that crosses the threshold (`totals()`). Label it, or show the deepest transfer.
- Phase 04: the site has no way to undo a false `reversed` except an admin decision (spec change 15 prevents the cause).

State left:
- The wallet host service runs `0.0.202610051631-dev.5fbda8c`, reinstalled in L3 with restore height 2222850, paired, synced.
- The dev site, watcher and release server are stopped; ports free; no tmux sessions.
- The dev database (backup before the session: `baseline/data.db.before-3h`, `VACUUM INTO`):
  - 16 invoices (settled, expired and review)
  - `far` in review `reversed`, a consequence of the reinstall gap
  - pool rows 1–312, with 261 drained rows claimed without invoices
  
  Clean up with `dev-e2e.mjs --cleanup-only` when no longer needed.

Open issues:
- **For Wyatt:**
  - spec change 15 (accept, change or reject)
  - spec change 14 (fold in)
  - spec change 9's lookahead question
  - open the admin page once to confirm the bridge key and schedule the cron
- Commits `b290c9a`, `4014a2b` and this session's docs commit are not pushed.
- Carried over: spec changes 6, 7 and 9–13 to fold in; delete the release-age excludes on or after 2026-10-08; the mainnet second-node list.

Phase 03 status: its "done when" is met (install.sh sets up the service, pairing succeeds, a stagenet payment settles, the restart and outage tests pass), apart from the admin-page check above. Spec change 15 is a real gap in the reinstall path; if Wyatt accepts it, the next session (3i) implements it and reruns L3.

Next step: Wyatt decides spec change 15 and opens the admin page. Then either session 3i (spec change 15) or phase 04.

## 2026-10-06 · Phase 03 · End of day: handoff (break for the night)

Pushed with Wyatt's approval: `2f0bdf1..9768d84` (the Coffer rename) and `b290c9a..c5d23c0` (3h), CI green on both (`c5d23c0`: run 37407668991). This handoff commit is local.

Everything found or changed in this session (2026-10-05 and 06), with where it's recorded:
1. **The plugin is Coffer, slug `coffer`.** The wallet host keeps the xmr-bridge name, and the repo and dev-box paths keep xmr-pay. Recorded in `decisions.md` and spec change 14 (proposed: spec text to fold in, the unit's `Description` and the PoC left for Wyatt).
2. **EmDash facts found on the way** (spec change 14 and the rename entry):
   - a new slug is a new plugin
   - EmDash's uninstall handles only registry and marketplace plugins, so a plugin listed in `astro.config.mjs` has its data removed by hand
   - plugin indexes are created on EmDash's periodic sweep, not at load
   - such a plugin schedules its cron only on the first admin page load (already in the spec)
3. **Payment rules confirmed on stagenet** (3h entry): no-payment expiry on evidence, happy, two-part, underpaid, late, bridge stopped across expiry (settled on `expiresHeight`), wallet-rpc killed, site down, key deleted and re-paired, far-index payment.
4. **Spec change 9 evidence:** a wallet restored from keys with default settings misses a payment 252 addresses past the last paid one; creating the address alone doesn't find it; a rescan does.
5. **Spec change 15 (proposed):** a reinstalled bridge doesn't catch its wallet up to the pool.
   - It caused a false review `reversed` on a settled invoice (`far`, index 261, still in review in the dev database).
   - It caused a 303-sync loop of duplicate addresses.
   - It risks missing payments mined to addresses the fresh wallet doesn't know yet.
   - The bridge's 5 s wallet-rpc client timeout matters for any rescan.
6. **New code and tooling:**
   - `scripts/dev-invoices.mjs` and its tests, `walletrpc.RescanBlockchain`, `TestLiveLookahead`
   - CLAUDE.md commands for both, and for database backups
   - `decisions.md`: the pay-script and pool-drain dev shortcuts
7. **For phase 04's admin page** (3h entry, "Notes for later phases"):
   - Underpaid and review invoices show `confirmations: 0` by design; label it.
   - A false `reversed` can only be cleared by an admin decision.
8. **Setup friction, 4 rows:**
   - a handed-over script that was never written (Claude)
   - a `cp` backup without the WAL (Claude)
   - `pkill -x` with a long process name (Claude)
   - the buyer wallet's funds and the 10-block lock pacing the payments
   
   Also, in the rename entry: the `tee` transcript did land this time (absolute path, checked with `ls -l`) and holds only `install.sh`'s lines, as 3g found. The 3f/3g missing files stay unexplained.
9. **Not done:**
   - Wyatt hasn't opened the admin page, so the bridge-key display (phase 03's last "done when" item) isn't confirmed and the `housekeeping` cron isn't scheduled.
   - Not covered on stagenet: tips, reorgs, double-spends, overpayment, the per-client rate limit.

State left for the break:
- The bridge service is installed and paired (L3 reinstall, restore height 2222850). It keeps running, backing off quietly while the dev site is stopped.
- The dev site, watcher and release server are stopped; no tmux sessions.
- The dev database holds the 3h invoices; the backup from before the session is `baseline/data.db.before-3h`.
- `~/xmr-pay-dev-data/3h-*` holds the evidence and the used pay scripts. They contain stagenet addresses only, no keys.

Reminders:
- Delete the release-age excludes on or after **2026-10-08**.
- Spec changes 6, 7 and 9–14 to fold into the live spec; the mainnet second-node list.

Next step, in order:
1. Wyatt decides spec change 15 (`docs/spec-changes.md`, last entry).
2. Wyatt opens the admin page once through the tunnel (`ssh -N -L 4321:localhost:4321 xmr-dev`, with the dev site started) to confirm the bridge key; that also schedules the cron. Phase 03 is then done.
3. If spec change 15 is accepted: session 3i. Tests first (fresh wallet behind the pool: no snapshots before catch-up, one rescan, no duplicate addresses), then the plugin's `poolTop`, then the bridge, then L3 again on stagenet. Otherwise phase 04.

## 2026-10-07 · Phase 03 · Session 3i: spec change 15 (catch-up after a reinstall), part 1

Wyatt accepted spec change 15 today and asked for it next.

Done:
- **Docs** (`398c61c`): spec change 15 marked accepted; `decisions.md` entry.
- **Plugin** (`8acdffa`): the `bridge/sync` response carries `poolTop`, the pool's highest `addrIndex` (pool rows are never deleted and every invoice's index is a pool row). An optional field; no trust-contract change.
- **walletrpc** (`4f04c11`):
  - `HasSubaddress` (`get_address`; −15 means absent)
  - `CreateAddresses` (`create_address` with `count`, at most 1000 per call, consecutive indexes checked)
  - `RescanBlockchain` now runs on an untimed copy of the client (ctx bounds it)
  
  Behaviour read from wallet-rpc v0.18.5.1's source (`~/work/monero-v0.18.5.1`, sparse clone).
- **Bridge loop** (`f631de5`):
  - When the site's `poolTop` is above what the wallet is known to have, the bridge probes the wallet. If the index is missing, it creates addresses up to `poolTop` in batches of 100 (not sent), rescans once (capped at 24 h), then reconciles.
  - Marker `run/catchup.json` redoes an interrupted catch-up, rescan included, before any snapshot.
  - A top-up address at or below `poolTop` is never sent; it starts a catch-up.
  - `xmr-bridge status` shows a "Catching up" line and doesn't report a stale sync while it runs.
- **Live** (`1a1ec84`, `TestLiveShopWallet`, stagenet, real wallet-rpc 0.18.5.1): a fresh wallet's next index was 10; −15 above it; `count` 100 in 198 ms and 1000 in 2.2 s, consecutive; `rescan_blockchain` answered after 8 s through the supervisor's 5 s client. Evidence: `~/xmr-pay-dev-data/3i-live-shopwallet.txt`.
- **Phase 03's last "done when" item: met.** Wyatt opened the admin page through the tunnel: Paired, last sync "less than a minute ago", 50 of 50 free. The `housekeeping` cron row exists (hourly, created 2026-10-08 01:19:16 UTC).

Tests:
- Plugin: 122 pass (2 new), typecheck, validate and bundle check (27.6 KB) clean. Mutation check: ascending order caught.
- Bridge: gofmt, vet, `go test ./...` with and without `-tags devrelease` pass.
- New tests: syncclient `TestPoolTop` and two refusal cases; walletrpc rescan-timeout, `HasSubaddress`, `CreateAddresses`; bridgeloop L3 model (pool to 312, paid index 261, wallet at 10), redo after a failed rescan and restart, the top-up guard, an older site without `poolTop`, no probe per top-up; `TestStatusCatchUp`.
- Mutations caught: no top-up guard, no redo at start, no rescan. Static build OK.
- Race detector: CI only (no `gcc` here).

Not covered yet: the L3 rerun on stagenet (below).

Paused: Wyatt's buyer wallet had too little sXMR for `far3` (index 263, created 01:07 UTC). It expired unpaid at 01:37 and will show `expired` at the next sync.

Findings for later (not acted on):
- **Stale height estimate at checkout:** after about 1.5 days of a silent bridge, checkout's estimate (`checkout.ts:142`, last sync + 2 min per block) was 35 blocks low, so `far3`'s `expiresHeight` (2224387) was already below the chain (2224404). Payments still count as on time if seen before `expiresAt`. But a payment reported late after a long outage is judged against a too-low `expiresHeight`. For Wyatt / phase 04.
- **Reinstall restore height:** `xmr-bridge install` defaults `--restore-height` to today. A reinstall with the default can't find payments mined before it, even with spec change 15's rescan. The rescan only scans from the restore height. For Wyatt: possibly the installer should suggest a height at or below the oldest open invoice's `createdHeight`. Spec-changes proposal to write if he wants it.

State left:
- Dev site, watcher and release server stopped; ports free.
- Installed bridge is still the old `0.0.202610051631-dev.5fbda8c`, paired.
- New dev release `0.0.202610080123-dev.1a1ec84` is built in `~/xmr-pay-dev-data/dev-release/` (unsigned `release.json`; install needs only the SHA-256s).
- Database backup `baseline/data.db.before-3i`.

Next step (when Wyatt's wallet is topped up), the L3 rerun:
1. Start the site and the watcher.
2. New invoice `far3b`; Wyatt pays it; it settles.
3. New invoice `far4`. Serve the release.
4. Wyatt:
   - `sudo xmr-bridge uninstall --delete-data`
   - pay `far4` and wait for it to be mined
   - reinstall with `--restore-height 2222850` and a code from `dev-e2e.mjs --issue-code`
5. Expect:
   - `far3b` stays settled
   - `far4` is found by the rescan and settles
   - nothing goes to review `reversed`
   - the "Catching up" status, then normal
   - no burst of syncs

## 2026-10-08 · Phase 03 · Session 3i, part 2: the L3 rerun on stagenet (spec change 15, live)

Evidence: `~/xmr-pay-dev-data/3h-watch.txt` (from "--- 3i run resumed"), `3i-before-reinstall.txt`, `3i-uninstall-output.txt`, `3i-install-output.txt`, `3i-status-output.txt` (status and journal).

Run (Speed Standard, 2 confirmations; times UTC):

| Step | Result |
|---|---|
| `far3b`, index 264, paid by Wyatt | `confirming` 01:50:37, `settled` 01:52:23 |
| Uninstall, `--delete-data` (old bridge `5fbda8c`) | Service, data and user removed |
| `far4`, index 265, created 01:53:53, paid with no bridge installed | Mined at 2224419 (`expiresHeight` 2224436); `pendingExpiry` at 02:23:55, correctly, with no evidence yet |
| Reinstall, dev release `0.0.202610080123-dev.1a1ec84`, `--restore-height 2222850`, a fresh pairing code | Started 02:32:54 |
| Catch-up | 02:32:57 wallet open (height 579994), target 314; 02:32:58 addresses created, rescan; 02:33:09 caught up (11 s); 02:33:10 one top-up address (index 315) |
| `far4` | `pendingExpiry` → **`settled`** 02:33:15, 1786639510 atomic, 23 confirmations: **found by the rescan** |
| `far3b` | Stayed **`settled`** (reported with its transfer, 26 confirmations) |
| False `reversed` | **None** (only `far`, index 261, from 3h remains) |
| Duplicate-address loop | **None**: 315 pool rows, top 315; one `created pool addresses` line after the catch-up (3h: 303) |
| `xmr-bridge status` | Paired, last sync 10 s, 50 of 50, watching 1 |

All of spec change 15's expectations held. Its "status shows catching up" wasn't seen live, because the catch-up took 12 s; it's covered by `TestStatusCatchUp`.

The first reinstall attempt didn't reach the dev box (setup-friction row). `far3` (index 263) expired unpaid while the buyer wallet was refunded.

New spec-change proposals (for Wyatt):
- **16:** the site's height can be far off. A fresh wallet's first sync reports height 579994. Checkout's estimate after 1.5 days of silence was 35 blocks low. Either gives invoices a too-low `expiresHeight`. Proposed: a stored height that never goes down; refuse checkout (or ignore the height rule) when the bridge is silent.
- **17:** a reinstall's restore height. The default (today) would have missed `far4` despite the rescan. Proposed: the pairing response suggests a restore height from the oldest watched invoice.

State left:
- Bridge `0.0.202610080123-dev.1a1ec84` installed and paired; it backs off while the site is stopped.
- Dev site, watcher and release server stopped; ports free; no tmux sessions.
- Dev database: 3h's invoices plus `far3` (expired), `far3b` and `far4` (settled); pool rows 1–315. Backup from before 3i: `baseline/data.db.before-3i`.
- `~/work/monero-v0.18.5.1`: a sparse clone of Monero's wallet source (reference only).

Phase 03 status: done. Every "done when" item is met, and spec change 15 is implemented and passed on stagenet.

Open issues:
- **For Wyatt:**
  - spec changes 16 and 17
  - spec changes 6, 7, 9–15 to fold into the live spec (15 is accepted)
  - spec change 9's lookahead question
  - the mainnet second-node list
- Commits from `398c61c` to this entry are not pushed. CI's race-detector step covers the new bridge code; there's no `gcc` here.
- **Today (2026-10-08):** delete the release-age excludes and their reminder (CLAUDE.md, dependency tiers).

Next step:
1. Wyatt approves the push and watches CI.
2. The release-age excludes are deleted (due today).
3. Wyatt decides spec changes 16 and 17.
4. Phase 04 (admin page), which also picks up 3h's notes: label `confirmations: 0` on review invoices; an admin path to clear a false `reversed`.

## 2026-10-08 · Phase 03 · Wrap-up: spec changes 16 and 17 accepted, push, release-age excludes deferred to 16:48 UTC

- **Spec changes 16 and 17 accepted by Wyatt.** Recorded with the recommended sub-choices: for 16, checkout refuses while the bridge is silent; for 17, option (a). Wyatt may override either before implementation. `decisions.md` rows added.
- **Release-age excludes not deleted yet.** The newest excluded package, `emdash@1.1.0`, was published 2026-10-01T16:47:35Z (`npm view … time`); `plugin-cli`, `admin` and others came minutes earlier, and four were published on 2026-09-27. So the 7-day rule passes for all of them only at **2026-10-08T16:48Z**. Deleting earlier would make the strict `pnpm install` refuse them.
- **Still due, after 16:48 UTC today:** delete the whole `minimumReleaseAgeExclude` block and its comment from `plugin/pnpm-workspace.yaml` and `spikes/xmr-spike/pnpm-workspace.yaml`, run `pnpm install` in each (one at a time), confirm both succeed with `pnpm-lock.yaml` unchanged, then commit, and remove the reminders.
- Next step after that: phase 04 (admin page), planned with spec changes 16 and 17. They touch the plugin's sync, checkout and the pairing response, and the bridge's installer; Wyatt to say whether they go into phase 04 or a session 3j first.

## 2026-10-08 · Phase 03 · End of night: handoff (Wyatt chose session 3j before phase 04)

Pushed with Wyatt's approval: `c5d23c0..60e22a8`. CI run 37719242461 passed, both jobs, the race-detector step included (the first race run of the spec change 15 code). This handoff commit is local.

Added tonight:
- `scripts/ci-status.py`: CI status from GitHub's public API, because there's no `gh` here. CLAUDE.md has a row for it.
- Phase 03's session table now has 3i and 3j.
- A setup-friction row: a time-based reminder needs the exact UTC moment.

State left:
- The bridge `0.0.202610080123-dev.1a1ec84` is installed and paired, backing off while the site is stopped.
- The dev site, watcher and release server are stopped; no tmux sessions.
- The dev database has 3i's invoices; backup `baseline/data.db.before-3i`.

Next steps, in order:
1. **After 2026-10-08T16:48Z only:** delete the release-age excludes.
   - Delete the whole `minimumReleaseAgeExclude` block and its comment in `plugin/pnpm-workspace.yaml`, then in `spikes/xmr-spike/pnpm-workspace.yaml`.
   - Run `pnpm install` in each, one at a time (memory).
   - Confirm both succeed and `pnpm-lock.yaml` is unchanged.
   - Run the plugin tests, commit (the lockfile note in the message: "no lockfile change"), and remove the reminders here.
   
   Before that time, skip this step and come back to it at the end of the session.
2. **Session 3j: spec changes 16 and 17**, plan first.
   - At the start, confirm the sub-choices with Wyatt: for 16, refuse checkout while the bridge is silent, against ignoring the height rule; for 17, option (a).
   - Likely scope, to check against the code in the plan:
     - plugin `handle.ts`: the stored height never goes down
     - `checkout.ts`: a domain error while the last sync is older than 5 minutes (spec change 2's threshold), replacing the estimate at `checkout.ts:142`
     - the pairing response: a suggested restore height, the oldest watched invoice's `createdHeight` minus a margin (or none when nothing is watched)
     - bridge installer: use the suggestion when `--restore-height` isn't given. This means pairing before the wallet is created; check `bridge/cmd/xmr-bridge/install.go` and `internal/installer` for the order.
     - optionally, the bridge doesn't sync until its wallet is within a few blocks of the node
   - Tests first.
   - Live: a reinstall without `--restore-height` that still finds a payment mined while uninstalled. That needs Wyatt (sudo, a payment), so check his buyer wallet's unlocked balance first.
3. Phase 04 (admin page), with 3h's notes: label `confirmations: 0` on review invoices, and an admin way to clear a false `reversed`.

Carried over for Wyatt:
- Spec changes 6, 7 and 9–17 to fold into the live spec (14 is the rename text).
- Spec change 9's lookahead question.
- The mainnet second-node list.

## 2026-10-08 · Phase 03 · Session 3j, part 1: spec changes 16 and 17 implemented; live run waiting for Wyatt

Wyatt approved the plan with the recommended sub-choices: 16 refuses checkout while the bridge is silent, and the optional bridge-side wait is skipped. 17 is option (a), with a 720-block margin. A kept wallet with too new a height gets a warning only.

Done (local commits, not pushed):
- `b448231` Release-age excludes deleted, after 16:48 UTC as planned. `pnpm install` in `plugin/` and `spikes/xmr-spike/`: lockfile unchanged, supply-chain check passed. The 2026-10-03 reminder is marked done.
- `ed2cfc2` (16) `bridge/sync` stores `max(stored, reported)` and judges snapshots at that height. Without it, a re-confirmation could start at a fresh wallet's tiny height and become a false `reorg` review.
- `3562463` (16) Checkout returns `WALLET_HOST_SILENT` when the bridge never synced or last synced more than 5 minutes ago. Otherwise it uses the last sync's height, with no estimate. `SILENT_MS` moved to `core/constants.ts`.
- `c212172` (17) The pairing response carries `restoreHeight`: the oldest watched `createdHeight` − 720, left out when nothing is watched.
- `0d66a34` (17) Bridge:
  - `xmr-bridge install` pairs before creating the wallet. The restore height is the flag, else the site's suggestion, else the node's height, and is written to the config.
  - A kept wallet, or `xmr-bridge pair`, warns when its height is newer than the suggestion.
  - A wallet failure after pairing says the code is spent.
- Spec text to fold in, for both changes, is in `docs/spec-changes.md` (16 and 17).

Tests:
- Plugin: 128 pass (6 new), typecheck clean, bundle 27.9 KB validates.
- Bridge: gofmt, vet and `go test ./...` pass (new tests in syncclient, pairing, installer and `cmd/xmr-bridge`). `-race` runs in CI only (no cgo here).
- Live so far: with the dev site started and the bridge's last sync about 21 h old, checkout returned `WALLET_HOST_SILENT` (23:28 UTC). After the bridge's next sync, the stored height was 2225081, the node's height.

State:
- Dev site running in tmux `site`, with a fresh plugin build.
- Dev release `0.0.202610082327-dev.0d66a34` built and served (tmux `release`, 127.0.0.1:8099).
- Installed bridge: still `1a1ec84`, paired, syncing.
- Database backup: `baseline/data.db.before-3j`.

Next step, the live run (L4), with Wyatt:
1. Wyatt checks the buyer wallet's unlocked balance (`3j-balance-output.txt`).
2. New invoice `far5`, a pay script, the watcher.
3. Wyatt: `sudo xmr-bridge uninstall --delete-data`, pays `far5`, and it gets mined.
4. Claude issues a code (`dev-e2e.mjs --issue-code`).
5. Wyatt reinstalls **without** `--restore-height`.
6. Expect:
   - the installer prints the suggested height
   - the config holds it
   - the rescan finds `far5`, which settles
   - no false `reversed`
   - no `reorg`

Not done here: phase 03's file (line 56) still lists pairing after the wallet in the installer's steps. Fold it in with the spec text.

## 2026-10-08 · Phase 03 · Session 3j, part 2: the L4 run on stagenet (spec changes 16 and 17, live)

Evidence: `~/xmr-pay-dev-data/3h-watch.txt` (from "--- 3j run (far5)"), `3j-balance-output.txt`, `3j-uninstall-output.txt`, `3j-pay-output.txt`, `3j-install-output.txt`, `3j-checks-output.txt` (install-log lines, status, journal).

Run (Speed Standard, 2 confirmations; times UTC; the journal shows local time, UTC−6):

| Step | Result |
|---|---|
| Checkout with the bridge's last sync about 21 h old (site just started) | `WALLET_HOST_SILENT` (23:28:05) |
| The bridge's next sync | Stored height 2225081, the node's height |
| Buyer wallet | 0.1417 sXMR unlocked |
| `far5`, index 266, created 23:35:35 | `createdHeight` 2225085, `expiresHeight` 2225103 (real height, no estimate) |
| Uninstall, `--delete-data` (bridge `1a1ec84`) | Service, data, config and user removed |
| `far5` paid with no bridge installed | Tx `0c01590c…4919`, mined at 2225085 by 23:38:42 |
| Reinstall, dev release `0.0.202610082327-dev.0d66a34`, a fresh code, **no `--restore-height`** | The installer paired first, then printed "The site has open invoices from about block 2223649 on: the new wallet scans from there." That's `far3`'s `createdHeight` 2224369 − 720 (`far3` is watched until 01:37 UTC) |
| Catch-up | Wallet open 23:41:21 (height 579994), target 316, rescan; caught up at 23:41:32 (11 s) |
| `far5` | **`settled`** 23:41:45, 1849933403 atomic, 3 confirmations: **found by the rescan**. The old default ("today") would have been about 2225088, after the payment's block |
| Stored height after the fresh wallet's first sync | 2225088 = the node's; not lowered |
| New review invoices | **None** (only 3h's `far` reversed and three deliberate underpaid/late ones remain) |
| Pool | 316 rows, top 316: one top-up after the catch-up, no duplicate loop |
| `xmr-bridge status` | Paired, last sync 7 s, 50 of 50, watching 2 |

Not seen directly:
- The config's `restoreHeight` value: the grep pattern missed it (setup-friction row). The installer's message and the settlement show the suggestion was used, and `TestRestoreHeight` checks the written value.
- The "kept wallet" warning and `xmr-bridge pair`'s warning: unit tests only.

Noise, not new:
- The bridge logs `selfupdate: release.json.sig: HTTP 404` every minute while the unsigned dev release is served, and `connection refused` once it's stopped. Same as earlier sessions.

Docs:
- A setup-friction row: installer messages go to `/dev/tty`, so `tee` misses them; use the install log.
- Phase 03's installer steps now list pairing before the wallet.

State left:
- Bridge `0.0.202610082327-dev.0d66a34` installed and paired. It backs off while the site is stopped.
- Dev site, watcher and release server stopped; ports 4321, 4322 and 8099 free; no tmux sessions.
- Dev database: 3i's invoices plus `far5` (settled). Backup from before 3j: `baseline/data.db.before-3j`.

Session 3j: done. Spec changes 16 and 17 are implemented, unit-tested and passed on stagenet.

Open issues:
- **For Wyatt:**
  - approve a push of `b448231`..this entry and watch CI (the race-detector step covers the new bridge code; there's no cgo here)
  - spec changes 6, 7 and 9–17 to fold into the live spec (16 and 17 have spec text ready in `spec-changes.md`)
  - spec change 9's lookahead question
  - the mainnet second-node list
- **Later:**
  - a stored height that never goes down would keep a higher stagenet height if a site moved to mainnet. It's a non-issue unless switching networks is ever supported; note it for phase 09's docs.
  - `WALLET_HOST_SILENT` needs a buyer-facing message in the theme (phase 06).

Next step: Wyatt approves the push and CI. Then phase 04 (admin page), with 3h's notes: label `confirmations: 0` on review invoices, and an admin way to clear a false `reversed`.

## 2026-10-08 · Phase 03 · Session 3j: pushed, CI green

Pushed with Wyatt's approval: `60e22a8..f0a52da`. CI run 37861316946 passed both jobs (`bridge`, `plugin`). The race-detector step passed too: the first race run of the spec change 16 and 17 code. This entry is local.

Next step: phase 04 (admin page), with 3h's notes: label `confirmations: 0` on review invoices, and an admin way to clear a false `reversed`. Spec changes 6, 7 and 9–17 are still for Wyatt to fold into the live spec.

## 2026-10-08 · Phase 04 · Session 4a: health panel and widget (code done; live look next)

Before the phase:
- Spec change 18 (a tips-only tier with no wallet host) was added word for word from Wyatt's draft, with its "Still to decide" row (`de46b55`). It doesn't change phase 04.
- Wyatt approved the phase 04 plan (four sessions, 4a to 4d) and took the recommended answer on all four questions. They're recorded in `decisions.md`, Admin experience (`70cd78f`):
  - "Payment addresses ready" wording
  - the gap line with phase 03's remedy
  - the bridge reports `checks.wallet`
  - one recommended action per review reason

Done (local commits):
- `e96cefe` `bridge/sync` keeps the bridge's optional `checks` (node cross-check, wallet height) with the bridge state. Parsing is by hand: known states only, details cut to 300 characters, anything malformed dropped.
- `2297560` The highest paid index (`state:paidTop`, noted once per sync, never lowered) and whether checkouts carry the visitor's IP (`state:clientIp`).
- `7b9414d` The health panel:
  - one line per check, the "Payment addresses ready" meter with its hint, and the spam-limit information line
  - red and amber banners, worst first, each naming its fix
  - the gap red from `GAP_ALERT` = 150, and an unpaid-run line amber at `UNPAID_RUN_ALERT` = 10 (a constant I chose; the spec gives none)
  - the widget names the worst red problem plus the review count, and makes no price request
- `3e32e68` Bridge: `checks.wallet` is ok, behind (its node more than 5 blocks ahead) or unavailable. The node is asked at most once a minute. The node's error stays in the bridge's log, because it can hold the node's address.

Tests:
- Plugin: 149 pass (19 new, 17 of them in `admin-health.test.ts`), typecheck clean, bundle 33.7 KB validates. Mutation check: the gap threshold (`>=` to `>`) caught.
- Bridge: gofmt, vet and `go test ./...` pass, with and without `-tags devrelease` (new: `TestWalletCheck`, `TestChecksJSON`). `-race`: CI only.

Not covered:
- **Storage calls per page load:** about 14 storage and KV calls plus 0–2 price requests, counted from the code. The test host can't count them, and whether they count toward Cloudflare's 10-subrequest cap is unknown (spike 18, item 4). The dev site runs on Node.
- **Older sites:** a site from before `state:paidTop` gets it worked out once from its invoices on the first page load (tested).

Next step: the live look.
1. Build and serve a dev release with `3e32e68`.
2. Wyatt signs it, and the installed bridge updates itself.
3. Start the dev site with the new plugin build.
4. Wyatt opens `/payments` and the dashboard through the tunnel.

Then 4b (setup checklist, test address, pairing notes, the bridge key setting).

## 2026-10-08 · Phase 04 · Session 4a: live look (done)

- **Bridge update:** dev release `0.0.202610090032-dev.97f0e66`, signed by Wyatt (`4a-sign-output.txt`). The installed bridge updated itself from `0d66a34`. Its syncs now carry `checks.wallet`: `ok`, "the wallet is at block 2225127, its node at 2225126", with `checks.node` off (own node).
- **Wyatt's look through the tunnel:**
  - Wallet height line, the address meter and its hint, and the amber "4 invoices need a decision" banner (3h's `far` and the three deliberate underpaid or late invoices) were all shown.
  - No "wallet app may miss payments" line, correctly: the highest claimed and the highest paid index are both 266, so the gap is 0.
- **No spam-limit line, correctly:** no checkout since `state:clientIp` was added.
- **State left:**
  - The bridge `97f0e66` is installed.
  - Dev site and release server stopped.

Next step: session 4b (setup checklist with Get a test address, pairing notes, the bridge key read-only with the paste-by-hand fallback).

## 2026-10-09 · Phase 04 · Session 4b: setup checklist, test address, pairing notes (code done)

Pushed with Wyatt's approval: `b821886..281ef6d`. **CI run 37866556943 failed** in the plugin job: one test timed out, `checkout-route.test.ts` "site-wide cap" (5 s default; 0.7 s here; it passed in the previous run). The job log needs a signed-in account (HTTP 403), so only the annotation was read.
- Fix: `9b4dc8f`, a 30 s per-test timeout in `plugin/vitest.config.ts`. The bridge job passed, race detector included.
- Not pushed yet.

Done (local commits):
- `f69065c` Session 4b:
  - **Setup checklist** (an accordion): five items, each saying what to do next. It collapses for good once a test tip settles (`state:setupDone`).
  - **Get a test address:** an open `kind: "tip"` invoice through the admin route (`claimAndStore` and `newIds` now exported from checkout). It shows the subaddress, the 0.0001 floor and the `monero:` URI, then the payment's progress. Pressing again reuses an open one. It's refused while the wallet host is silent or no address is free.
  - **Connect wallet host:** minutes left as of page load. "Paired at HH:MM UTC" (", replacing the previous one, which no longer syncs") for a day (`state:lastPairing`, written by the sync route).
  - **Settings:** the bridge key, read-only.
  - **Page order:** banners, checklist, Connect, Health, Settings.
- `07caf81` **Spec change 19, proposed:** the "paste a key by hand" fallback has no bridge counterpart (the bridge makes its key only while pairing and never prints it). I recommend dropping it. Not built.

Tests:
- Plugin: 159 pass (10 new in `admin-setup.test.ts`, covering the checklist, the test address with reuse, refusals and an expired one, collapse, minutes left, an expired code, pairing notes and the key field).
- Typecheck clean; bundle 37.3 KB validates.

Not covered:
- A live test tip from Wyatt's buyer wallet (the checklist's last item).
- Block Kit has no live countdown or copy button, so the page shows minutes left as of load, and code blocks to select.

Next step:
1. Wyatt: approve pushing `07caf81` (CI fix included), decide spec change 19, and optionally do a live test tip.
2. Then 4c (invoice table and row actions).

## 2026-10-09 · Phase 04 · Session 4b: Wyatt's changes, CI, live test tip, key check (done)

Wyatt's decisions on the 4b report:
- **Spec change 19: (a), drop the paste-a-key fallback** (`e5f8eae`).
  - `xmr-bridge status` now prints `Bridge key: <base64>`, the admin page's form. An unreadable key file is unhealthy, with the re-pair fix.
  - The page's hint names the command.
  - `decisions.md` row; phase 04's Settings item updated.
  - **The spec's Bridge public key row isn't edited here:** `.claude/settings.json` denies edits to `docs/spec.md` (CLAUDE.md agrees). The exact new row is in spec change 19 for Wyatt to apply, in the live spec and the snapshot. No other spec line mentions pasting a key.
- **CI timeout:** back to vitest's 5 s default, with only the site-wide cap test at 30 s (`feceff2`, replacing `9b4dc8f`).
- **Pushed:** `281ef6d..feceff2`. CI run 37868656023 passed (plugin, bridge, race detector).

Live (dev site, stagenet; times UTC):

| Step | Result |
|---|---|
| Checklist before | "Setup: 4 of 5 done" |
| Get a test address (Wyatt, through the tunnel) | `inv_08a47de9…`, kind tip, index 267, min 100000000 atomic, 2 confirmations, `createdHeight` 2225154 |
| 0.0001 sXMR from the buyer wallet (`3h-pay-4btip.sh`) | Tx `04074b35…e049`, fee 0.0000304 |
| Seen | 01:21:38, confirming 0 of 2 |
| Mined | 01:22:51 at 2225155, 1 of 2 |
| Settled | 01:26:04, 2 confirmations |
| Reload | **"Setup complete"**, collapsed; `state:setupDone` true |
| Key check: the new build's `status` against the installed config (`4b-status-output.txt`) | `Bridge key: N2wSOfKJ…+B8=` equals the site's `bridgePublicKey` |

Finding for Wyatt (phase 09 or later), not acted on:
- **A self-update replaces only the service's binary** in `/var/lib/xmr-bridge/bin`. The root-owned admin copy (`/usr/local/bin/xmr-bridge`, which runs `status`, `pair` and `uninstall`) stays at the installed version, by design: the service account must not be able to write it.
- **So new status output reaches existing installs only when the installer runs again.** The key line was checked by running the dev release's binary directly. `CheckFormat` stops an outdated admin copy only when the state format changes.

State left:
- Bridge `97f0e66` installed (the `feceff2` release was built, never signed or installed).
- Dev site and release server stopped.
- Database backup before the tip: `baseline/data.db.before-4b-tip`.

Next step: session 4c (invoice table: paged products, row actions with stale-state checks, not-counted transfers, hundreds of invoices).

## 2026-10-09 · Phase 04 · Session 4c: invoice table and row actions (code done)

Pushed before the session: `feceff2..21ec032`.

Done (`aed1b84`, local):
- **Invoices table:** product invoices, newest first, 25 a page. "Load more" pages by storage cursor, and "Newest invoices" goes back. Columns:
  - status, with the review reason and "(by admin)"
  - fiat amount, XMR, received
  - confirmations: the deepest counted transfer plus what's needed, so a review invoice no longer reads "0" (3h's note)
  - created, expires
  
  Tips are left out until phase 07.
- **Row menu by state:**
  - Mark settled and Expire: final (`adminFinal`)
  - Raise confirmations to 10: open invoices only, never lower
  - Details and txids
- **Stale state:** each action re-reads the invoice and refuses, changing nothing, if its state no longer allows the action. The write is a `compareAndSet` on the revision read, so a sync landing in between isn't overwritten.
- **Details:** amounts, the payment address, buyer email, refund address and note as plain text. Each txid as copyable text, with why a transfer doesn't count (time-locked until a block or a time, or flagged as a possible double spend).

Tests:
- Plugin: 170 pass (11 new in `admin-invoices.test.ts`), typecheck clean, bundle 42.4 KB validates.
- Mutation check: "settle allowed in every state" caught by the menu and stale-state tests.
- The 300-invoice test takes 0.9 s here and has its own 30 s timeout. Everything else keeps vitest's 5 s.

Not covered:
- **The `compareAndSet` race itself** (a sync landing between the read and the write): the test host can't interleave the two. The stale-state checks are tested.
- **Sorting by column:** not offered. Columns aren't sortable.
- **After a row action, the table returns to its first page:** the menu's value doesn't carry the cursor.

Next step: session 4d (review queue with one recommended action per reason, the false-`reversed` path). Then Wyatt's click-through of the whole page on the dev site.

## 2026-10-09 · Phase 04 · Session 4d: review queue (code done; click-through led to UI changes)

Pushed before the session: `21ec032..3c69299`. CI run 37871358018 passed (plugin, bridge, race detector).

Done (`56da16f`, local):
- **Review queue,** between Health and Invoices. Each review invoice is an accordion with what happened, the recommendation, received, confirmations, buyer email and refund address, and one primary button: late → Mark settled; underpaid, reorg and reversed → Expire. Reversed also gets Mark settled behind a confirmation (3h's false reversed).
- **Wiring:** the buttons use the row-action path, so the stale-state checks and the `compareAndSet` write apply.
- **Order and limits:** oldest deadline first, at most 20, plus "N more wait". Tips in review are listed.

Tests:
- Plugin: 179 pass (9 new in `admin-review.test.ts`), typecheck clean, bundle 45.1 KB validates.

Click-through (dev site, 01:52 UTC):
- Wyatt reviewed screenshots in his planning chat and wrote UI changes to `~/xmr-pay-dev-data/04-ui/notes.md`, with four screenshots: page order, the checklist and Connect into Settings, no confirm dialog, review items as colored banners, banner wording, "Needs decision" status.
- Database backup before the click-through: `baseline/data.db.before-4d-clickthrough`.

Bug found while planning those changes (mine, 4d):
- "Late" is set whenever any payment arrived after the deadline, whether or not the total reached the price (`evaluate`, `hasLate`).
- The late item always says "Paid in full … The money is in your wallet", which is wrong for a late partial payment. Fix and recommended action: in the UI-changes plan.

## 2026-10-09 · Phase 04 · Click-through UI changes built; end of night: handoff

Wyatt's click-through decisions (from `~/xmr-pay-dev-data/04-ui/notes.md`, eight changes, plus answers Q1–Q4 and the paging choice) are recorded in `decisions.md`, Admin experience (`d5098dc`), and built.

**Plugin (`587b32a`):**
- **Page order:** before setup, banners, checklist, Connect wallet host, Health, invoices, Settings. After setup, banners, Health, invoices, Settings, with "Setup (complete)" and "Connect a new wallet host" as closed toggles at the end of Settings.
- **Connect wallet host:**
  - no confirmation dialog (EmDash 1.1.0's has no padding)
  - a line above the button when a host is paired
  - the Settings toggle opens by itself while a code shows (it gets a new `block_id`, `connect_code`, since the host keeps toggle state per `block_id`)
- **"Needs a decision (N)" above "All invoices":** one banner per review invoice, red for reversed and reorg, yellow for late and underpaid, each with a closed "Details and actions" toggle.
  - Red first: sorted in memory over up to 500 review invoices, because the reason has no index and adding one is a stop point.
  - **12 a page,** Wyatt's choice. EmDash counts every value as a node, and a full 25-row table is about 840 of the 2,000, so 60 at once can't fit (category (c)). Paged to item 60, then "N more are in All invoices below, marked Needs decision".
  - Worst case measured: 1,809 nodes.
- **Review banner:** "They're under Needs a decision, below Health, …". There's no separate "Invoices" heading, because three stacked headings looked wrong; Wyatt hasn't seen this yet.
- **Table status:** "Needs decision: <reason>".
- **Gone-payment wording:** reversed reads "No longer reported (needed N)" and "0 XMR now" (+ what was reported). Reorg reads "Not mined again (needed N)" and "X XMR, not in a block now".
- **"Open product" link** from `productRef`.
- **Fixed 4d's wording:** a late payment short of the price reads "Late payment · N% received" and recommends Expire (Q2).
- **The 4c limit test** now counts nodes as EmDash does.

**Bridge (`c76efda`):**
- Every message that sends the admin for a pairing code quotes both labels: "Connect wallet host" on the site's Monero payments page (after setup, it's "Connect a new wallet host" under Settings).
- The wording is one constant in a new package, `internal/sitetext`. Its test checks that the plugin's `admin.ts` still has both labels.

Tests:
- Plugin: 196 pass (new `admin-layout.test.ts`; `admin-review.test.ts` rewritten), typecheck clean, bundle 47.6 KB validates.
- Bridge: gofmt, vet and `go test ./...` pass, with and without `-tags devrelease`. `-race`: CI only.

Not covered:
- **Wyatt's live look at the reworked page:** the dev site was started at 03:07 UTC for it, then the session stopped for the night.
- **The `compareAndSet` race:** still untested, because the test host can't interleave a sync with the write.

Docs:
- A setup-friction row: CI job logs need sign-in; use the check-run annotations.
- Phase 04's page order.

State left:
- **Not pushed:** `56da16f..c76efda`, five commits (4d, its progress entry, the decisions, the UI changes, the bridge messages). CI last ran on `3c69299`, green.
- The bridge `97f0e66` is installed and paired, and backs off while the site is stopped.
- Dev site, release server and watcher stopped; ports 4321, 4322 and 8099 free; no tmux sessions.
- **Dev database:**
  - setup done (`state:setupDone`)
  - the 4b test tip settled
  - the four review invoices (#4 late, #6 and #7 underpaid, #261 reversed) untouched
  - backups: `baseline/data.db.before-4d-clickthrough` and `baseline/data.db.before-4d-ui`

Next steps, in order:
1. **Wyatt approves the push;** Claude checks CI (`scripts/ci-status.py`).
2. **Live look:** back up `data.db`, `cd plugin && pnpm run build`, start the dev site, wait for a sync. Wyatt clicks through the reworked page:
   - **Needs a decision (4):** red `far` first, then three yellow.
   - **The toggles:** Details and actions, Open product, and Settings' Setup and Connect toggles, with Connect showing the code after the button is pressed.
   - **Resolving the dev items (optional):** Mark settled on `far` through its confirm button; the recommended action on #4.
3. **Close phase 04** if the look passes: the progress entry, then phase 05 (setup test).

Carried over for Wyatt:
- **Spec text to fold into the live spec:** spec changes 6, 7 and 9–17, and 19's Bridge public key row. `docs/spec.md` can't be edited here (`.claude/settings.json`).
- **Spec change 18:** A in phase 06; B's spike after phase 04, decision before phase 07.
- **The mainnet second-node list** (before phase 09).
- **A self-update doesn't refresh the root-owned admin copy** (`/usr/local/bin/xmr-bridge`), so new `status` output reaches existing installs only when the installer runs again. Decide before phase 09.
- **EmDash's confirm dialog has no padding:** upstream, for Wyatt to report if he wants.

## 2026-10-09 · Phase 04 · Round 2 click-through changes (code done; live look next)

Pushed before the session: `3c69299..ac02c68`. CI run 37986414420 passed (plugin, bridge, race detector).

Wyatt's second click-through (`~/xmr-pay-dev-data/04-ui-2/notes.md`, five screenshots) asked for six changes. His decisions are recorded in `decisions.md`, Admin experience. The round 1 Connect-toggle row was updated, not contradicted.

**Plugin (`ce60feb`):**
- **All invoices as toggles** (change 1): one closed toggle per invoice, opening in place. The label is the summary on one line; inside are the details, the Actions menu and Open product.
  - **10 a page,** Wyatt's choice. Measured before building: a 25-row table was 744 nodes and the review queue's worst case 739. One invoice with its details is about 80 nodes, so 25 can't fit.
  - After an action, the invoice opens (block_id `invoice_<id>_acted`) and the page stays put (the menu value carries `|cursor`).
- **Long values** (change 2): the payment address and the refund address go in labeled code boxes, in invoices and review items.
  - Block Kit 1.1.0 has no wrapping style for these blocks: the code box is a bare `<pre>`, and the fields grid truncates.
  - The admin's `<main>` has `overflow-y: auto`, so the page scrolls sideways at narrow widths. Wyatt accepted that.
  - Wyatt asked for a copy button. Block Kit has no clipboard element, and the plugin can't add one (category (c)). Wyatt chose no hint, and may raise it upstream.
- **Settings after setup** (change 3): the button, its hint, the site line, then the code; Setup (complete) is last. Before setup nothing changes.
- **Payments** (change 4): all of an invoice's payments in one code box, each with "Transaction ID: …" under it, at most 50 listed.
- **Product ID field removed** (change 5).
- **Due and Received** (change 6): the labels; Expires reads "—" once an invoice is final.

Tests:
- **Plugin:** 205 pass.
  - `admin-invoices.test.ts` rewritten.
  - Settings tests in `admin-layout.test.ts`.
  - The worst case in `admin-review.test.ts`: 300 reversed items, 10 invoices with 16 payments and every buyer field, a pairing code showing. It comes to 1,730 nodes and 68.8 KB.
  - Typecheck clean, validate passes, bundle 48.8 KB validates.
- **Mutation checks:** "acted invoice not opened" and "expiry shown on final invoices" were both caught.
- **Bridge:** the `sitetext` label test still passes.

Not covered:
- **Narrow-width rendering:** checked in the CSS only, not on screen. That's for the live look.
- **The `compareAndSet` race:** still untested, as before.
- **Review advice for invoices on a later page:** it says "find it under All invoices below", which may need Load more.

Docs:
- **Phase 04 file:** item 5 now describes the list.
- **Spec text for Wyatt to fold in:** "invoice table" in the spec (the admin route row and line 591) is now a list of toggles. This adds to the carried-over spec text list.
- **Upstream note for Wyatt:** Block Kit has no copy-to-clipboard element and no wrapping for long values.

Database backups: `baseline/data.db.before-04-livelook` and `baseline/data.db.before-04-ui-2-look`, both with `VACUUM INTO` through Node's `node:sqlite` (there is no `sqlite3` on this box).

## 2026-10-09 · Phase 04 · Done: Wyatt's look at round 2 passed

Pushed: `ac02c68..6540cc6` (round 2 and its progress entry).

**CI on `6540cc6` failed** (run 37994601431): one plugin test timed out at vitest's 5 s default. It was "no Product field…" in `admin-invoices.test.ts`, which takes 0.7 s here. The bridge job and race detector passed. The cause is the runner's speed, not the code: CI has run 7× slower before (run 37866556943).
- Fix: `testTimeout: 20_000` for the whole plugin suite in `vitest.config.ts`, committed locally.
- Not yet pushed, so not yet confirmed green.

Wyatt looked at the round 2 page on the dev site and passed it "for now". Phase 04's done criteria are met:
- **Every block renders** in the dev site's admin. Wyatt looked at it in 4a, 4b, the round 1 click-through and round 2.
- **Every action is covered by a runtime-host test:** Connect wallet host, Get a test address, Save settings, invoice actions (settle, expire, raise, stale state, malformed values), Load more and Newest invoices, review paging.
- **Responses stay inside Block Kit's limits:** the worst case is 1,730 of 2,000 nodes and 68.8 KB.

Phase file: the page-order note now says Connect a new wallet host is in the open in Settings after setup.

State left:
- Dev site stopped; ports 4321, 4322 and 8099 free; no tmux sessions.
- The bridge `97f0e66` is installed and paired, backing off while the site is stopped.
- Dev database: the four review invoices (#4, #6, #7, #261) untouched unless Wyatt resolved them in the look. Backup `baseline/data.db.before-04-ui-2-look`.

Carried over for Wyatt:
- **Spec text to fold in:** changes 6, 7 and 9–17, 19's Bridge public key row, and "invoice table" (admin route row and Build plan step 4), which is now a list of toggles.
- **Spec change 18:** A in phase 06; B's spike after phase 04, decision before phase 07.
- **The mainnet second-node list:** before phase 09.
- **Self-update and the admin copy:** a self-update doesn't refresh `/usr/local/bin/xmr-bridge`. Decide before phase 09.
- **Upstream, for Wyatt to report if he wants:** EmDash 1.1.0's confirm dialog has no padding; Block Kit has no copy-to-clipboard element, and no block wraps a long unbroken value.
- **Review advice wording:** "find it under All invoices below" may need Load more for older invoices. Revisit if the setup test or Wyatt trips on it.

Next step: phase 05 (setup test), prep session. Read `docs/phases/05-setup-test.md`, write the plan, and wait for Wyatt's approval.

## 2026-10-09 · Phase 05 · Prep session: protocol and scripts (waiting for Wyatt's test-day setup)

Pushed before the session: `6540cc6..ad056ad` (the 20 s test limit and the phase 04 close-out). CI run 37995406578 passed (plugin, bridge, race detector), so the timeout fix worked.

Wyatt's choices (2026-10-09):
- **Install URL:** patch the test build, so the tester copies the command from the admin page.
- **Fresh install state:** a reset script, not a second dev site.
- **Wallets:** a new stagenet shop wallet in Feather on the tester's machine; Wyatt's buyer wallet sends the tip.

Done:
- **`docs/setup-test.md`:**
  - Part 1, the tester's instructions: three places, a check after every step, the installer's real prompts and finish message, `xmr-bridge status` and `install.log` for trouble, never a saved transcript.
  - Part 2, the timing sheet and confusion log.
  - Part 3, pass or fail, including the Feather check (spec change 9).
  - Runs: A, own node on the LAN (counts as own, so the cross-check is off); B, a public node.
- **Scripts (`47c0728`):**
  - `build-dev-release.sh --base`
  - `setup-test-plugin.sh`: swaps the install URL in the built `dist/plugin.mjs` only. The bundle check rebuilds `dist`, so it runs before the swap.
  - `setup-test-reset.mjs`: backs up, then removes every Coffer row and setting. `--restore` puts a backup back. It refuses while port 4321 or 4322 answers.
- **Local files, not in git:**
  - `~/xmr-pay-dev-data/05-setup/organizer.md`: addresses, the setup order, the container-side reachability check, the evidence commands, between-run and after-test steps.
  - `run-A.md` and `run-B.md`: sheet copies to fill in.
- **CLAUDE.md:** two command rows. The script-test run hint is fixed to `node --test scripts/*.test.mjs`; Node 24 doesn't take a directory.

Tests:
- **Script tests:** 10 pass, 5 of them new for the reset script. Mutation check: deleting only pool and invoices fails 2.
- **`setup-test-plugin.sh`:** checked with a documentation-range address (192.0.2.1). The URL lands in the curl command, and a plain build restores the placeholder.
- **`build-dev-release.sh --base`:** only the address check was tested. A real build overwrites `~/xmr-pay-dev-data/dev-release`, so it runs on test day.

Found while writing (for Wyatt):
- **`curl` on the container:** a minimal Debian 12 container has no `curl`, and the install command needs it. The organizer sheet recommends Ubuntu 24.04. Phase 09's install docs should name what the wallet host must already have (`curl`, `sha256sum`, `sudo` or root), or `install.sh` should say so. Raise it in triage if the run trips on it.
- **The dev-box bridge needs no `sudo` stop:** it syncs to `localhost:4321`, which stays stopped during the test, so it backs off. The restore brings its key back.

Not covered yet:
- **Steps 4 and 8's Feather menu names:** "Wallet → Keys" is from memory. Wyatt or the tester confirms it in the first run.
- **The admin menu label:** "Monero payments" is the manifest's label; the exact menu path is seen on test day.

Next step: Wyatt does organizer sheet section A (container, monerod LAN listener, Cloudflare hostname, public node, the tester's Feather wallet, unlocked buyer outputs) and says when he's ready. Claude then runs section B, Wyatt runs the reachability check on the container, then run A.

## 2026-10-09 · Phase 05 · End of night: handoff (prep done, waiting for Wyatt's test-day setup)

Pushed: `ad056ad..bc06da6` (the phase 05 prep). CI run 37997475345 passed (plugin, bridge, race detector).

Where things stand:
- **Phase 04: done.**
  - Round 2 click-through built, looked at and passed.
  - The CI timeout fix (20 s per test) confirmed green.
- **Phase 05: prep done, no runs yet.** Done:
  - the protocol, `docs/setup-test.md`
  - the scripts (`setup-test-reset.mjs`, `setup-test-plugin.sh`, `build-dev-release.sh --base`)
  - the local organizer sheet and run sheets in `~/xmr-pay-dev-data/05-setup/`
- **Nothing is half-done:** no uncommitted changes, and nothing applied to the dev site for the test yet.

State left (checked at handoff):
- **Dev site, built copy and release server stopped:** ports 4321, 4322 and 8099 free, no tmux sessions.
- **Services:** `monerod-stagenet` active. The installed bridge `97f0e66` is active and backing off while the site is stopped.
- **`plugin/dist`:** a normal build, so it holds the install-URL placeholder, not the test patch.
- **Dev database:** unchanged since the round 2 look. Backups: `baseline/data.db.before-04-livelook` and `baseline/data.db.before-04-ui-2-look`. The setup-test reset hasn't run.
- **`~/xmr-pay-dev-data/dev-release`:** still phase 03's release. The LAN-address build happens on test day.

Next steps, in order:
1. **Wyatt:** organizer sheet section A:
   - the Ubuntu 24.04 container, snapshotted `blank` (it has `curl`; minimal Debian 12 doesn't)
   - monerod's LAN listener on 38089
   - the Cloudflare hostname
   - a public stagenet node
   - the tester's new Feather shop wallet
   - several unlocked buyer outputs
   Then tell Claude it's ready.
2. **Claude:** section B, one step at a time:
   - reset (keep the first backup's name for the final restore)
   - build the LAN release; Wyatt signs it
   - serve it on the LAN
   - `setup-test-plugin.sh`
   - build the site and start `built` with `EMDASH_SITE_URL`
3. **Wyatt:** the reachability check on the container, roll it back to `blank`, then run A, then run B (section D between them).
4. **Claude:** section E (stop, restore, normal plugin build, dev site check), then the triage session from the filled-in run sheets.

To resume: "Continue phase 05. Read docs/progress.md for where we stopped, then plan the next step."

Carried over for Wyatt (unchanged from the phase 04 close-out):
- **Spec text to fold in:** changes 6, 7, 9–17, 19's Bridge public key row, and "invoice table".
- **Spec change 18:** A in phase 06; B's spike decision before phase 07.
- **The mainnet second-node list:** before phase 09.
- **The self-update admin-copy question:** before phase 09.
- **Upstream notes:** the confirm dialog's padding, no copy-to-clipboard element, no wrapping for long values.
- **Review advice "find it under All invoices below":** may need Load more.

## 2026-10-12 · Phase 05 · Run A's node container, two bridge fixes (section B waits for the node)

Pushed at the start: `aac82bb` (the 10-09 handoff). CI run 38276652301 passed (plugin, bridge, race detector).

Wyatt's notes (`~/xmr-pay-dev-data/05-setup/node-notes.md`, local) changed the plan:
- **Run A's node:** a separate pruned stagenet container on the LAN, with restricted RPC on 38089. It replaces the dev-box LAN listener, and the dev box's node is untouched.
- **Run order (Wyatt's choice (b)):** both runs after that node has caught up, run A then run B.
- **Two bridge fixes** go in before section B builds the release.

Done (local commits, not pushed yet):
- `7e26f67`, **phase file:** the own-node prerequisite allows a separate node machine. The wallet-host container comes from Proxmox's plain Ubuntu 24.04 template, not a community-scripts helper.
- **Organizer sheet** (local): run A's node address, a section 0 for the run order, the container-source rule, and a "Node caught up" check run from the dev box. Run today, it printed `FAIL … syncing`, as expected.
- `dd7aefc`, **cross-check:**
  - It never uses a second node on the configured node's host (any scheme or port, case-insensitive, trailing dot ignored).
  - It uses only a second node that says it is `synchronized`.
- `a4459af` and `9ef7118`, **spec change 20 (accepted with the plan):** a node that's still syncing passed every check. There is also a setup-friction row and a lesson.
- `6fd4bed`, **bridge:**
  - `noderpc.Info` carries `target_height` and a `Progress()` text.
  - The installer prints one line when the chosen node is still syncing. It adds no prompt and doesn't refuse.
  - The wallet check gets a `syncing` state, ahead of `ok` and `behind`.
  - The status file carries the wallet check, and `xmr-bridge status` prints it on the Wallet line. The exit code is unchanged.
- `f989a62`, **plugin:**
  - It accepts `syncing`, with no protocol version change: an older plugin drops unknown states.
  - A red health line, which the widget also shows.
  - The Wallet height text.
  - Wallet synced stays to do, so Get a test address waits.

Tests:
- **Bridge:** gofmt, vet, `go test ./...` all pass, and the static build works.
- **New bridge tests:**
  - crosscheck: the configured node on the list, the same host on another scheme or port, a syncing second node
  - noderpc: a syncing `get_info`, and the progress text
  - installer: own node, `--node` and prompt, plus no line for a synced node
  - the wallet check's `syncing` state
  - status output for each state
- **Mutation checks:**
  - With the host filter removed, 2 tests fail.
  - With the synchronized check removed, 1 test fails (3 of 3 runs).
  - With the syncing branch removed, the wallet check reads "ok" on the half-synced node.
- **Plugin:** 207 tests pass (3 new, each red first). Typecheck, validate and the bundle check pass (49.4 KB).
- **Live, read-only:** the bridge's `noderpc` read run A's node (`Synchronized:false`, block 128,191 of about 2,227,761) and the dev box's node (`Synchronized:true`, `target_height` 0). This used a throwaway test file, deleted afterwards. The address came from an environment variable.

Not covered:
- **The admin page with `syncing`:** not looked at on the dev site yet. It is covered by the runtime-host tests only.
- **The installer line on a real install:** run A uses a caught-up node, so it must show no line there.

Open for Wyatt:
- **Spec change 20, item 5, checkout during a node sync** (corrected this session; the plan said it was safe, and it isn't).
  - An invoice made while the node syncs takes its deadline from the node's low height, so a payment on the real chain goes to review as late.
  - Options: (a) refuse checkout while `syncing`, recommended; this is a checkout error code, so an API contract change. (b) Treat `expiresHeight` as unknown for those invoices.
  - The setup test isn't affected.
- **The installer's default restore height on a syncing node** is that node's low height. The scan is safe (it scans more) but slow once the node catches up. Worth a line in phase 09's docs, or use `target_height`, which comes from unverified peers. For Wyatt to decide; not changed.
- **Push** `7e26f67..9ef7118`. CI has to pass before section B's release build.

State left:
- **Dev site, built copy, release server:** stopped. Ports 4321, 4322 and 8099 are free.
- **Services:** `monerod-stagenet` and the installed bridge are active, unchanged.
- **Dev database:** untouched. The setup-test reset hasn't run.

Next steps:
1. **Wyatt:** say whether to push, then decide item 5 (it doesn't block the test).
2. **Claude:** after the push, check CI. When Wyatt says the node is near the top, run the "Node caught up" check.
3. **Once it passes:** section B (reset, `build-dev-release.sh --base`, Wyatt signs, serve, `setup-test-plugin.sh`, build and start `built`). Then Wyatt's reachability check, run A, section D, run B, section E.

## 2026-10-12 · Phase 05 · Update 2: wget fallback (spec change 21), organizer sheet, sign-in plan

Wyatt's update 2 (`~/xmr-pay-dev-data/05-setup/update-2.md`, local) and his decisions:
- Runs A then B, both after `debian-monerod-stagenet` is synchronized (14% this afternoon).
- Wyatt is the tester. The buyer and shop wallets are both in Feather on his PC. The dev-box buyer wallet is empty.
- The wget path refuses redirects. That is logged as an open item for phase 09's install host.
- Push everything together.
- Spec change 20 item 5 when convenient.
- New: with neither curl nor wget, both the command and `install.sh` say plainly what to install, and to paste the command again.

Done:
- `5380e2f`, **spec change 21 (accepted):** the install command works without curl. Also a setup-friction row and lesson, and two open items in phase 09's step 3:
  - the bridge binaries must be served from `RELEASE_BASE` without a redirect (GitHub Releases asset URLs redirect)
  - the install docs list what the wallet host needs
- `a018538`, **plugin:** `installCommand()` gives one line, curl, else `wget -nv -O-`, else the message. One downloader is chosen before anything is fetched. `setup-test-plugin.sh` now checks the swapped constant and the new command (the bundler no longer inlines the URL). `setup-test.md` step text updated.
- `6870499`, **installer:** `install.sh` uses curl with `--proto`, else `wget -q --max-redirect=0`, else the message. The checksum and version checks are unchanged.
- **Organizer sheet** (local):
  - the machine table, the Access apps, and a keep-the-live-site-out section
  - the wallets, the tip sent from Feather, and the invite step at section B
  - the container's reachability check rewritten with `wget` (`coffer-test` has no curl; checked locally)

Checked before the change (GNU Wget 1.25, a local server):
- `wget -q -O-` prints nothing on a 404.
- `-nv` prints `ERROR 404`.
- `--max-redirect=0` refuses a redirect.

Tests:
- **Bridge:** gofmt, vet, all tests, static build. New tests:
  - `install.sh` with wget only (installs; refuses a tampered, missing or redirected download)
  - curl only (still follows a redirect)
  - neither (says what to install)
  - `TestAdminInstallCommand`: runs the exact line from `admin.ts` under `sh` with curl only, wget only and neither, against a test server. Each case uses a `PATH` of links to only the allowed tools.
- **Plugin:** 207 tests pass. One asserts the exact line. Typecheck, validate and the bundle check pass (49.7 KB).
- **`setup-test-plugin.sh`:** run with 192.0.2.1, then a plain build restored the placeholder.
- **Not covered:**
  - The command on a real machine without curl. That's run A on `coffer-test`.
  - The fish shell (the line uses `if … fi`).

Sign-in plan (item 5, agreed; the script is written at section B):
- With the dev site in `astro dev` on localhost, a script creates an Admin invite for `tester@coffer-test.invalid` through EmDash's local dev sign-in.
- It reads the link from `/_emdash/api/dev/emails` and rewrites only the origin to `https://dev.wyattdilley.com`.
- It writes the link to a mode-600 file. The token is never printed.
- Wyatt registers a passkey there before the clock starts. The passkey's rpId follows `siteUrl` (EmDash 1.1.0, `getPasskeyConfig`).

Open for Wyatt:
- **Spec change 20, item 5:** checkout during a node sync.
- **Phase 09:** an install host that serves the binaries without redirects.

Next steps:
1. **Claude:** push `7e26f67..` (this morning's 7 commits, this entry, and spec change 21), then check CI.
2. **Wyatt:** says when the node is near 100%.
3. **Claude:** the "Node caught up" check, then section B with the invite step. Then Wyatt's reachability check (wget), run A, section D, run B, section E.

## 2026-10-12 · Phase 05 · Spec change 20 item 5: checkout refuses while the node syncs

Node check at 19:35 UTC: run A's node at 409,633 of 2,227,841 (about 18%). That's roughly 90,000 blocks an hour since 16:27, so probably 20 hours or more to go. Section B still waits.

Wyatt's decision: option (a), refuse, with a new code. `cc226b4`:
- **`checkoutHeight()`** returns the height, or the reason to refuse:
  - `WALLET_HOST_SILENT`, checked first, since a silent host's last check is stale
  - `WALLET_HOST_SYNCING`, while the last sync's wallet check is `syncing`
- **Checkout** refuses before the price request, so nothing is claimed.
- **Get a test address** refuses with a message saying the node is still catching up.
- **The admin page's red line** adds "Checkout is paused until then."
- **Spec change 20** records the decision and the spec text to fold in: the checkout error list gains `WALLET_HOST_SYNCING`.

Tests:
- **Plugin:** 209 pass. New:
  - checkout returns the code, with no price request and nothing claimed
  - the other wallet states don't stop checkout
  - `checkoutHeight`'s reasons and their order
  - the test-address refusal
  - each failed before the change
- **Typecheck, validate, bundle check (50.0 KB):** pass.
- **No change outside the plugin:** nothing else in the repo lists the checkout codes; the theme (phase 06) and the contract tests (phase 08) aren't built yet. Phase 06's pay page should show `WALLET_HOST_SYNCING` the same way as `WALLET_HOST_SILENT`.

Carried over for Wyatt:
- **Spec text to fold in:** changes 20 (including item 5's checkout code) and 21, added to the earlier list.

Next step: unchanged. Wyatt says when the node is near 100%. Then the "Node caught up" check and section B.

## 2026-10-12 · Phase 05 · End of day: handoff (waiting for run A's node to sync)

Pushed: everything, up to `95c42a2`. CI passed on every push today:
- run 38276652301 (`aac82bb`)
- run 38297524757 (`70f7dfb`)
- run 38300653835 (`e6fbb74`)
- run 38301056873 (`95c42a2`)

Where things stand:
- **Phases 00–04: done.**
- **Phase 05 (setup test): prep done, fixes done, no runs yet.** It waits for run A's node `debian-monerod-stagenet` to report `synchronized`.
  - Last check, 2026-10-12 20:03 UTC: block 443,267 of 2,227,856, about 20%.
  - It has been slowing: about 90,000 blocks an hour in the afternoon, about 60,000 by 20:00. Expect 30 hours or more, so late 2026-10-13 or 2026-10-14.
- **Phases 06–09: not started.** Phase 07 has one decision recorded in advance (tips stay open whatever the wallet host's state; `docs/decisions.md`).

Done today (details in the entries above):
- **Run A's node** is its own container. The phase file and the organizer sheet were updated.
- **Cross-check:** it never uses the configured node's host as its second node, and only uses a second node that is synchronized.
- **Spec change 20, a node that's still syncing:**
  - the installer says so
  - the bridge sends a `syncing` wallet check, and `xmr-bridge status` shows it
  - the admin page shows a red line
  - checkout refuses with `WALLET_HOST_SYNCING` (item 5, Wyatt's option (a))
- **Spec change 21, no curl on the wallet host:** the admin page's command and `install.sh` use curl, else wget (no redirects), else say what to install.
- **Organizer sheet** (local): machines, wallets (Wyatt is the tester, both wallets in Feather), the live-site guard, the invite step, and a wget reachability check.
- **Decision for phase 07:** recorded in `docs/decisions.md` and pointed to from `docs/phases/07-tip-mode.md`.
- **`CLAUDE.md`:** a command row for the "Node caught up" check.

Nothing is half-done:
- no uncommitted changes
- no dev-site or database changes for the test yet (the setup-test reset hasn't run)
- `plugin/dist` is a normal build, with the install-URL placeholder

State left (checked at handoff):
- **Ports and sessions:** the dev site, built copy and release server are stopped. Ports 4321, 4322 and 8099 are free, and there are no tmux sessions.
- **Services:** `monerod-stagenet` and the installed dev-box bridge (`97f0e66`, older than today's bridge changes) are active. The bridge backs off while the site is stopped. It needs no update: section B builds a new release for `coffer-test`.
- **Memory:** about 4.9 GB available, but swap is full (511 of 512 MB). Check `free -m` before each heavy step.
- **Dev database:** unchanged since phase 04's round 2 look. The backups are in `~/xmr-pay-dev-data/baseline/`.
- **Dev-box buyer wallet:** empty (Wyatt moved the funds to Feather), so `dev-invoices.mjs pay-script` has no funds.

Next steps, in order:
1. **Wyatt:** when the node is near 100%, start a session: "Continue phase 05. Read docs/progress.md for where we stopped, then plan the next step."
2. **Claude:** run the "Node caught up" check (`CLAUDE.md` says where it is). It must print PASS.
3. **Claude, section B** of the organizer sheet, one heavy step at a time:
   - reset, keeping the first backup's name
   - write and run the tester-invite script (with its test), with the dev site in `astro dev` on localhost
   - `build-dev-release.sh --base http://<dev box LAN>:8099`
4. **Wyatt:** signs the release.
5. **Claude:** serve the release, then `setup-test-plugin.sh`, the site build, and the `built` copy with `EMDASH_SITE_URL=https://dev.wyattdilley.com`.
6. **Wyatt:**
   - copies the invite with scp and registers a passkey at `dev.wyattdilley.com`
   - runs the wget reachability check on `coffer-test`, then rolls it back to `blank`
   - opens and syncs both Feather wallets
   - does run A
7. **Claude:** section D.
8. **Wyatt:** run B.
9. **Claude:** section E (stop, restore, normal build, dev-site sync check). Then the triage session from the run sheets.

Carried over for Wyatt:
- **Spec text to fold in:**
  - changes 6, 7, 9–17
  - change 19's Bridge public key row
  - "invoice table"
  - change 20 (the installer line, the second node, the admin health line, and the checkout code `WALLET_HOST_SYNCING`)
  - change 21 (the install command)
- **Spec change 18:** A in phase 06. B's spike decision before phase 07.
- **Phase 06's pay page:** show `WALLET_HOST_SYNCING` the same way as `WALLET_HOST_SILENT`.
- **Before phase 09:**
  - the mainnet second-node list
  - the self-update admin-copy question
  - an install host that serves the bridge binaries without redirects (spec change 21)
  - install docs that list what the wallet host needs
- **Open, not changed:** on a syncing node, the installer's default restore height is that node's low height. That's safe, but the first scan is slow.
- **Upstream notes:** the confirm dialog's padding, no copy-to-clipboard element, no wrapping for long values.
- **Review advice "find it under All invoices below":** may need Load more.

## 2026-10-13 · Phase 05 · Section B done (waiting for run A); tips-first plan change folded in

Started 2026-10-13 evening (US time); UTC times below.

**Node caught up:** PASS at 00:06 UTC on 10-14. Run A's node is `synchronized` at 2,228,619, the same height as the dev box's node.

Section B of the organizer sheet, done:
- **Reset:** 317 pool rows, 17 invoices, 7 KV rows and 1 setting removed. **The backup to restore after both runs:** `~/xmr-pay-dev-data/baseline/data.db.before-setup-test-20261014T004124362Z`.
- **Tester invite,** `55207d3`:
  - `scripts/setup-test-invite.mjs` makes an Admin invite for `tester@coffer-test.invalid` through EmDash's dev sign-in.
  - It takes the link from the reply, or from the dev email list (the dev console provider, which is what answered), and moves only its origin to `https://dev.wyattdilley.com`.
  - It writes the link to `~/xmr-pay-dev-data/05-setup/tester-invite.txt`, mode 600. It never prints the token.
  - Run once and checked with `stat` and a pattern count, never displayed. It works once and expires in 7 days.
  - The `CLAUDE.md` command row is added.
  - **Note:** EmDash's dev console email provider writes the first 200 characters of each email to astro's dev log, which likely includes the token. Don't read that log until the invite is used.
- **Release:** `0.0.202610140046-dev.55207d3` for amd64 and arm64, base `http://192.168.8.249:8099`. Wyatt signed it, and `check-dev-signature.sh` verifies it.
- **Release server:** tmux `release`, bound to the LAN address on 8099. The served `install.sh` matches the built file.
- **Plugin:** `setup-test-plugin.sh --base http://192.168.8.249:8099`, with the bundle check inside it. The built site's server bundle carries the LAN URL.
- **Built copy:** tmux `built` on 4322 with `EMDASH_SITE_URL=https://dev.wyattdilley.com`. Its status route answers 200.

Tests:
- **`setup-test-invite.test.mjs`:** 6 tests against a fake EmDash on 127.0.0.1, red first because the script didn't exist. They cover:
  - both link sources
  - the origin rewrite
  - mode 600, also on overwrite
  - no token in the output
  - an existing account (409)
  - a non-loopback site
  - a non-https public origin
- **Mutation checks:** removing the CSRF header fails 4 tests; the chmod on overwrite, 1; picking the newest email, 1; the loopback check, 1; the origin rewrite, 2.
- **All script tests** (`node --test scripts/*.test.mjs`): 16 pass.
- **Not covered:** the invite link in a real browser. That's Wyatt's passkey step.

Tips-first plan change (Wyatt, 2026-10-13, `docs/plan-change-tips-first.md`), folded in; docs only:
- **Spec change 22** (accepted) and a `docs/decisions.md` row. Wyatt's choices:
  - one switch keeps goods out of release 1
  - release 1 declares today's manifest as is
  - order-only threats are marked "covered in release 2" in the report
  - the sidebar icon is `coins` (EmDash 1.1.0 resolves any Phosphor name; none is declared today, so it shows a plug)
- **`docs/phases/07b-adversarial-testing.md`** (new): the note's Part 2, one file for passes 1 and 2. Changes from the note:
  - row A0 names the switch's paths
  - a pass-1 prerequisite for spec change 18's decision
  - the builder's README and phase-09 edits are marked done
- **`docs/phases/README.md`:** the table runs in release order, with rows for 07b, 08b and 09b.
- **Phase files:**
  - **06:** scoped to the pay page and `isPaid`. PayButton moves to 08. `WALLET_HOST_SYNCING` is shown like `WALLET_HOST_SILENT`.
  - **07:** turns the switch off, with tests, and moves the dev scripts to tips.
  - **08:** marked release 2. PayButton and the switch back on. Talk to Otta and DinkusKit early; DinkusKit's one-provider limit is a design input.
  - **09:** release 1, tips. It starts from the red-team findings, with a before-session checklist, a tips-scoped report, the icon and listing-image rules, and a "Release 2 (09b)" section.
- The note itself is committed as the source record.

Still waiting on Wyatt (from the note):
- **Before 07:** spec change 18's spike decision.
- **Before 07b:**
  - the security matrix in the repo as `docs/security-matrix.md`
  - decisions on C01–C06, or accepting that undecided candidates are only probed and reported
- **Before 09:**
  - the mainnet second-node list
  - the self-update admin-copy question
  - an install host without redirects
  - the Atmosphere account
  - the hand-made registry icon
- **Not blocking:** the spec text for changes 20, 21 and 22.

State left:
- **Running:** the built copy (4322) and the release server (8099), for the runs.
- **Stopped:** the dev site (4321 free).
- **`plugin/dist`:** the setup-test build with the LAN install URL. A plain `pnpm run build` restores the placeholder (section E).
- **Dev database:** reset. The dev data is in the backup above.

Next steps:
1. **Wyatt:**
   - scp the invite and register a passkey
   - the wget reachability check on `coffer-test`, then roll it back to `blank`
   - open and sync both Feather wallets
   - run A
2. **Claude:** section D (stop `built`, reset, start `built`). Then Wyatt does run B. Then Claude does section E and the triage session.

## 2026-10-13 · Phase 05 · Run A attempt 1 stopped; fixes before the rerun (spec change 23)

Pushed before this: `0e58022` (the tips-first docs). CI run 38492672200 passed (plugin, bridge, race detector).

**Run A, attempt 1** (Wyatt's notes: `~/xmr-pay-dev-data/05-setup/run-a-attempt-1.md`, local). It stopped before the install, and is recorded on `run-A.md`.
- The passkey invite was remade once: the first registration attempt hadn't created the account.
- **Tester error:** the command was pasted on run A's node container. The installer asked for the address and view key, then refused (same machine).
- **Product bug:** the command said `--site http://localhost:4321`.
- **Friction:** the one-line command widened the admin page.

Why localhost:
- EmDash 1.1.0 gives a sandboxed plugin only `emdash:site_url`. Site setup writes it once, and this site was set up under `astro dev`.
- `EMDASH_SITE_URL` and `siteUrl` don't change it; sign-in reads them first, which is why the passkey worked.
- EmDash has no settings field for it.
- Details and evidence: spec change 23.

**Where Coffer uses `ctx.site.url`** (Wyatt asked), and what localhost breaks:
1. **`admin.ts`, the install command and its site line:** broken, and now fixed by the address rule below.
2. **`admin.ts`, the Connect wallet host guard:** it only checked that some address existed, so localhost passed. It now refuses when the rule finds no usable address.
3. **Nothing else today.** Checkout, status, sync, the cron and the widget don't use it.
4. **Later:** phase 08's `returnUrl` must be on the site's own origin. A saved localhost address would refuse every real `returnUrl` (it fails closed). Phase 08 must use the same rule, or another source.

Wyatt's decision (spec change 23), with his five conditions. `37c9cab`, plugin:
- **A saved public https address** is always used. A different https browser origin only adds an alert naming both.
- **Otherwise,** the admin's browser `Origin` is used when it's a bare, public https origin, read on the private admin route only.
- **Anything else:** a red line and no command, and Connect refuses.
- **The page says which address it uses, and where it came from.**
- **The old hint is gone.**
- **The command is four short lines,** and the page says to copy all four.

`5ab0dec`, installer:
- Without `--allow-same-machine`, a loopback `--site` and a same-machine install are refused before any prompt.
- The dev flag still installs beside the site, on stagenet only.

Tests:
- **Plugin:** 218 pass. 9 are new in `admin-site.test.ts`, red first:
  - the rule's cases
  - the route with real `Origin` headers, on page load and on the button
  - F06: spoofed `Origin`, `Host` and `X-Forwarded-Host` leave the `status`, `checkout` and `bridge/sync` replies unchanged
- **Plugin:** two older tests were updated for the new wording and the four lines.
- **Plugin checks:** typecheck, validate and the bundle check pass (51.4 KB).
- **Live proof** (condition 1) on the dev site, Node runner, saved address localhost:
  - `Origin` reaches the admin route, and the page uses `https://dev.wyattdilley.com` "from your browser".
  - Without `Origin`, the red line.
  - Output: `~/xmr-pay-dev-data/05-setup/origin-probe-output.txt`.
- **Bridge:** gofmt, vet, and all 20 packages pass. New tests, red first:
  - three loopback sites refused with nothing asked
  - the same-machine refusal asks nothing
  - the dev flag with a loopback site
  - the four-line command fed to `sh` on stdin, as a paste arrives
- **Script tests:** 16 pass.
- **Not covered yet:** the built copy (its sandbox runs on workerd) in a real browser. EmDash's runtime filters headers the same way for both runners (`handleSandboxedRoute`), but only Wyatt's check of the page before the clock proves it there.

Docs:
- spec change 23, with the matrix note for F06 and an upstream note draft
- three `docs/setup-friction.md` rows and a lesson; two lessons now say "one install command" instead of "one line"
- `docs/setup-test.md` steps 2 and 3 (four lines)
- local: attempt 1 on `run-A.md`, and the organizer sheet's B7 note

**For Wyatt (the node container):**
- Nothing should be there.
- His read-only check command is in the chat.
- No need to clear the shell history: the code in it has expired, and the reset removes it.

Next steps:
1. **Push** these commits and wait for CI (Wyatt's rule: CI passes before the release rebuild).
2. **Rebuild:**
   - stop `built`
   - `build-dev-release.sh --base http://192.168.8.249:8099`; Wyatt signs it
   - `setup-test-plugin.sh`, then the site build
   - reset (it clears the stale code; the tester account stays)
   - start `built`
3. **Wyatt:**
   - the node-container check
   - roll `coffer-test` back to `blank`
   - check the page's site line on the built copy
   - rerun A (the clock starts at a fresh reload)

## 2026-10-14 · Phase 05 · Run A attempt 2 failed (wallet app); fixes proposed; end of night handoff

Before the attempt:
- Pushed `abb8955` (spec change 23's fixes). CI run 38499190185 passed (plugin, bridge, race detector).
- Rebuilt the release (`0.0.202610140208-dev.abb8955`); Wyatt signed it, and the signature verifies.
- Ran `setup-test-plugin.sh` and the site build, reset again (extra backup `…T020900344Z`), and restarted `built`.

**Run A, attempt 2: FAIL at about 16½ minutes** (Wyatt's notes: `~/xmr-pay-dev-data/05-setup/run-a-attempt-2.md`; recorded on `run-A.md`).
- **Coffer's part was well inside the limit:**
  - paired 02:18 UTC
  - test address 02:20:05 (account 0, subaddress 1)
  - settled 02:22:30 (block 2,228,686, txid `2f88c81c1fcd1521846caa9f83e7907a7880865a3c0fe0bb699d8d79ecc972ec`, 0.0001 XMR, 2 confirmations required)
- **The failure:** the tip never showed in Feather's shop wallet, a pass criterion (spec change 9).
- **Confirmed cause:** Feather 2.8.1 gave the new 16-word (Polyseed) stagenet wallet a restore height of 2,230,020, about 1,300 blocks above the chain. It scanned nothing.
- **After the run:** a re-restore with height 2,228,000 showed the tip.
- **Spec change 23's fix worked on the built copy:** the page said "from your browser, because EmDash's saved address for this site is http://localhost:4321", and the four-line command paired. That closes the "not covered" item from the entry above.
- **Smaller findings:**
  - Feather lagged the node until a restart (it routes through Tor)
  - the node address had to be looked up
  - the `monero:` link has no label
  - a settled test tip shows nowhere but "Done"

Recorded:
- **`docs/setup-friction.md`:** five rows and a lesson ("the last step happens in software you don't control").
- **`docs/spec-changes.md` 24 (proposed):** Wyatt's suggested fixes 1–7 with a when for each, and the Feather upstream note draft.
- **Local:**
  - attempt 2 on `run-A.md`, plus an "Attempt 3" heading
  - a "Wallet app prep" section in the organizer sheet, with Feather 2.8.1's re-restore steps, so the next tester finds them

**Proposal (spec change 24), for Wyatt to approve:**
- **Before the rerun of A:**
  - 1: show the settled test tip's amount, txid and block
  - 2: a "Not in your wallet app?" hint with the heights
  - 3: a wallet-app-ready line before Get a test address
  - 3b: a label for the payment link
  - 5 and 7: the prep step and separate timings in `docs/setup-test.md` and the run sheets

  All are plugin text or docs. They need no installer change, so the signed release stays valid.
- **Phase 09:** 4 and 7 in the install docs, and the node prompt's wording at the next release rebuild.
- **Phase 07:** a place to see tips (already planned).
- **Any time:** 6, the Feather note (Wyatt posts).

**Recommendation: no run B tonight.**
- Attempt 2 failed a pass criterion, so phase 05's rule needs a fix merged and run A repeated.
- Run B would take another 15+ minutes on the same wallet-app risk, and the prep step only exists in the local organizer sheet so far.
- Next session:
  1. Wyatt approves or changes spec change 24.
  2. Build items 1–3b and 5 (tests first).
  3. Push and wait for CI.
  4. Rebuild the plugin and the site (the release doesn't need rebuilding).
  5. Section D.
  6. Rerun A with the prep step.
  7. Section D again, then run B.

State left (checked at handoff):
- **Stopped:**
  - the dev site, the built copy (`dev.wyattdilley.com` gives Cloudflare's 502 until it restarts) and the release server
  - ports 4321, 4322 and 8099 are free, and there are no tmux sessions
- **Services:** `monerod-stagenet` and the dev-box `xmr-bridge` are active.
- **`coffer-test`:** still has attempt 2's install, and Wyatt is **not** rolling it back tonight. Its bridge backs off while the site is stopped. The evidence is captured but still on the container: `~/run-status.txt` and `~/run-install-log.txt`, in the home of the user who ran the command. First thing next session: copy them to the dev box (below), then roll back to `blank` in section D.
- **Dev database:**
  - It holds attempt 2's state: paired with `coffer-test`, 51 pool rows, the settled test tip.
  - Section D resets it.
  - **The backup to restore after both runs is still the first one:** `~/xmr-pay-dev-data/baseline/data.db.before-setup-test-20261014T004124362Z`.
- **`plugin/dist`:** the setup-test build with the LAN install URL. A plain `pnpm run build` restores the placeholder (section E).
- **The signed release** `0.0.202610140208-dev.abb8955` is in `~/xmr-pay-dev-data/dev-release/` and can be served again as is.
- **Memory:** about 4.9 GB available, swap full (511 of 512 MB).

Done by Wyatt at handoff (section C's evidence, on `coffer-test`; the files are still on the container):
`sudo xmr-bridge status --config /etc/xmr-bridge/config > ~/run-status.txt 2>&1; sudo cat /var/lib/xmr-bridge/log/install.log > ~/run-install-log.txt; ls -l ~/run-status.txt ~/run-install-log.txt`
Then copy both files to the dev box's `~/xmr-pay-dev-data/05-setup/` as `A2-run-status.txt` and `A2-run-install-log.txt`. Also send back the filled-in timing sheet and confusion log for attempt 2.

To resume: "Continue phase 05. Read docs/progress.md for where we stopped, then plan the next step." The first decision is spec change 24.

Carried over for Wyatt (unchanged, plus tonight's):
- **Spec text to fold in:** changes 20–23. Change 24 once decided.
- **Matrix:** spec change 23's F06 note goes into the Claude Doc.
- **Upstream notes to post:**
  - EmDash's `ctx.site.url` (spec change 23)
  - Feather's restore height (spec change 24)
  - the earlier Block Kit notes
- **Phase 08:** the `returnUrl` same-origin check must not rely on `ctx.site.url` alone (see the entry above).
- **Before 07, 07b and 09:** as listed in the 2026-10-13 tips-first entry.

## 2026-10-15 · Phase 05 · Spec change 24 built; spec change 25 recorded with answers

Evidence in:
- **From attempt 2 on `coffer-test`:** `A2-run-status.txt` and `A2-run-install-log.txt` are in `~/xmr-pay-dev-data/05-setup/`. They show:
  - paired
  - 50 of 50 addresses
  - the wallet in step with its node
  - updates on
  - the status file's `HTTP_502`, which is only the stopped site
  - the node prompt asked twice: the first answer wasn't a URL
- **Still missing:** attempt 2's timing sheet and confusion log.

**Spec change 25 (admin upkeep), `574cf28`:**
- Wyatt's proposal is appended as written, status proposed.
- Questions A–D are answered from the EmDash 1.1.0 source and this repo's bridge.
- In short:
  - the export fits Block Kit code blocks (64 KB each; no copy button)
  - the `admin` route can't return CSV, and a raw private route can't be a download link (CSRF header)
  - private routes get the signed-in user, and KV needs no manifest change
  - `email:send` reaches sandboxed plugins when a provider exists (from source, 1.1.0 only)
  - the bridge skips the update check when auto-update is off
- Nothing is built.

**Spec change 24, accepted by Wyatt 2026-10-15** (his choice: the tip's details sit at the top for 24 hours, and stay in Setup (complete) for good):
- **`8d50d0a`, plugin:**
  - item 1: the settled test tip's amount, block and txids, at the top for a day and in Setup (complete)
  - item 2: the "Not in your wallet app?" hint, with the wallet host's height and the tip's lowest block
  - item 3: the wallet-app line before Get a test address
  - item 3b: the payment link's label
- **`7c73b4a`, docs:**
  - `docs/setup-test.md` gets "Before the clock: get your wallet app ready", the split timing table (Coffer's part, the confirmation wait, the wallet app) and pass criterion 7
  - the local `run-A.md` (attempt 3) and `run-B.md` get the same rows
  - spec change 24 is marked accepted

Tests:
- **Plugin:** 220 pass. The 2 new ones in `admin-setup.test.ts` failed first:
  - the wallet-app line, and the link label under the `monero:` code
  - a settled tip with two counted transfers and one time-locked one: amount 0.0002, lowest block, both txids, the time-locked one left out; at the top within 24 hours and not after; in Setup (complete) both times
- **Plugin checks:** typecheck, validate and the bundle check pass (52.7 KB).
- **Script tests:** 16 pass.
- **Bridge:** unchanged, not run.
- **Not covered yet:** the new text on the built copy (workerd) in a browser. The settled-tip section is only proven live when attempt 3's tip settles.

Found, for phase 09 (not fixed):
- **`xmr-bridge update` doesn't exist.** The CLI has install, uninstall, version, run, pair, status and notify. The plugin's "Wallet host update available" banner (`plugin/src/admin.ts`, `bannerBlocks`) tells the owner to run it, and spec change 25 part 3 repeats it. Phase 09's self-update work must add the command or change the text.

Next steps:
1. **Wyatt approves the push.** Push, then wait for CI to pass.
2. **Rebuild** (the signed release `0.0.202610140208-dev.abb8955` stays valid):
   - `scripts/setup-test-plugin.sh --base http://<LAN>:8099`
   - the site build
   - serve the release
3. **Section D:**
   - Wyatt rolls `coffer-test` back to `blank`
   - reset (the first backup is still the one to restore)
   - start `built`
   - the node caught-up check
4. **Wyatt:**
   - B7's reachability check, then roll back again
   - "Before the clock"
   - rerun A
   - send back attempt 3's sheet, status and install log, plus attempt 2's timing sheet and confusion log

## 2026-10-15 (evening) · Phase 05 · Run A attempt 3 passed; triage items; plan for section D and run B

Before the run:
- CI run 38820484860 passed for `408a0de` (plugin, bridge, race detector).
- Rebuilt: `setup-test-plugin.sh` with the LAN install URL, then the site build (log in `05-setup/site-build-20261015.txt`).
- The signed release `0.0.202610140208-dev.abb8955` was served unchanged; all four files matched `SHA256SUMS`.
- Section D:
  - Wyatt rolled `coffer-test` back.
  - Reset: removed 51 pool rows, 1 invoice, 7 KV entries and 1 setting. Extra backup `…20261015T230212872Z`.
  - Started `built`. The status route answers 200 locally and at the public hostname.
  - Node caught-up check: PASS, both at 2,230,076.
- Wyatt: the reachability check passed, then a second rollback.

**Run A attempt 3: PASS at 13 minutes** (5:15 to 5:28 MDT; `05-setup/run-A.md`, `A3-run-status.txt`, `A3-run-install-log.txt`).
- **No help needed:** two values typed once, one command.
- **Status:** the wallet in step with its node, 50 of 50 addresses, updates on.
- **Before the clock:** took no time. The restore height was 2,228,000 against block 2,230,100.
- **The tip's timeline (UTC):**
  - test address 23:18:50
  - in the pool 23:20:00
  - mined in 2,230,085 at 23:23:17
  - the next block at 23:28:38
  - settled 23:29:01, required 2
- **The confirmation wait was 9 of the 13 minutes.** Coffer's sync added 23 s.
- **Feather** showed the tip, unconfirmed, at 5:19.
- **Spec change 24 was proven live** on the built copy: the Test tip received section and the settled time.
- **Attempt 2's timing sheet and confusion log were never filled in** (Wyatt). Nothing is waiting on them.

Triage (Wyatt asked for both):
- **Spec change 26 (proposed): the test tip needs 1 confirmation,** whatever the speed setting.
  - It would have saved about 5½ minutes here.
  - Today an owner who picks Strict waits 10 confirmations, about 20 minutes, which goes over the budget every time.
  - Nothing is fulfilled on a test tip, and it's never zero confirmations.
- **Spec change 27 (proposed): the page doesn't update by itself.**
  - In EmDash 1.1.0, a plugin admin page sends one `page_load` and never polls. The renderer reads only `blocks` and `toast`, and Block Kit has no self-refreshing element.
  - Proposed: during setup, a "Checked at … This page doesn't update by itself" line with a Check again button.
  - It must not appear on the install command view: the command is shown once, so a re-render would lose it.
  - Also an upstream note draft for EmDash.
- **`docs/setup-friction.md`:** a row for the refresh confusion.

Public stagenet nodes for run B, checked from the dev box (heights only): all six built-in ones answer, on stagenet, synchronized at 2,230,104, the dev box's height.

## 2026-10-16 · Phase 05 · Run B attempt 1 failed (https node); cause found; spec change 28 proposed

Section D before run B:
- Wyatt rolled back `coffer-test`.
- I stopped `built`, reset the data (extra backup `…20261016T003109650Z`), and restarted `built` once Wyatt's check found the site down. The 502 was mine: I was holding the restart for his go-ahead.
- kernal.eu passed the node check, at height 2,230,113.
- Run B's node was `https://stagenet.xmr.kernal.eu:38089` (Wyatt's choice).

**Run B attempt 1: FAIL** (`05-setup/B1-run-status.txt`, `B1-run-install-log.txt`):
- The tester typed the node URL wrong three times, and the first run gave up. The second run paired, then stopped at "Creating the view-only wallet" with `walletrpc: wallet-rpc error 0: .`
- No service was installed, and the pairing code was used up.
- The site showed paired and synced, 3 of 5 done.
- `coffer-test` was left as it was for this investigation.

**Cause (spec change 28):**
- For an https node the bridge starts wallet-rpc with `--daemon-ssl enabled` alone. Monero's wallet refuses that without a CA file, a fingerprint or allow-any-cert (`wallet2.cpp:431`), and the error escapes as code 0 with no message.
- Every https node fails this way.
- Reproduced with `TestLiveShopWallet` against kernal.eu over https. The local node and plain http on the same host both work.
- `TestLiveDaemonSSL` showed that the system CA bundle with `--daemon-ssl-allow-chained` works, but wallet-rpc then doesn't check the certificate's name (dialling by IP was accepted too).
- Also found: the pairing request counts as a sync, so "Wallet synced" reads Done for 5 minutes with no wallet.

Test tooling (test-only, never shipped):
- `TestLiveShopWallet` takes `XMR_BRIDGE_LIVE_NODE` and `XMR_BRIDGE_LIVE_KEEP_LOG`.
- New `TestLiveDaemonSSL` (`cmd/xmr-bridge/live_ssl_test.go`).
- Both are in CLAUDE.md's command table.
- Bridge gofmt, vet and all packages pass.
- One run hit Go's 10-minute test timeout, which skips the cleanup, so it left its temporary view-only wallet folder. I deleted it unread. The command table now says to pass `-timeout`.
- `scripts/with-shop-env.sh` refused `sh`, as designed, so the probe was written in Go instead of a shell script.

Next:
1. Wyatt decides spec change 28.
2. Build it tests first, rebuild the release (Wyatt signs), push, CI.
3. Section D (roll back `coffer-test`, reset, `built`).
4. Rerun B with the https node.
5. Ask Wyatt what was typed at the node prompt in attempt 1.

### 2026-10-16 (later) · Spec change 28 built (items 1 and 3); two more bugs found live

Wyatt's decisions:
- Item 1, the CA bundle, now.
- Run B repeated over https after the fix.
- The TLS forwarder (item 2) decided before phase 09.
- A 07b row: a man in the middle on the node link with a valid certificate for another name (section E).

Built, tests first:
- **An https node:**
  - Gets the system CA bundle plus `--daemon-ssl-allow-chained` (`supervise.CABundle`, `DefaultCABundles`).
  - With no bundle, `supervise.New` refuses, and the installer's node check refuses before pairing.
- **The installer** quotes wallet-rpc's own last log error instead of "error 0" (`explainWalletRPC`, `supervise.LastError`).
- **The first live run with the fix found a second bug:** over kernal.eu's https, `generate_from_keys` takes longer than the client's 5 s, so run B would have failed again with a timeout.
  - `generate_from_keys` and `open_wallet` now run untimed, like `rescan_blockchain`, and are bounded by their context. The installer's wallet creation gets 3 minutes; the service's open falls under the supervisor's 60 s start-up limit.
- **Making `open_wallet` untimed exposed a third:** the untimed view's separate digest state collided on the server nonce. They now share one state. The same collision was latent after `rescan_blockchain`.

Tests:
- **Bridge:** gofmt, vet and all 20 packages pass. The race detector isn't run here (no gcc); CI runs it.
- **Live, with kernal.eu over https, `TestLiveShopWallet` passes twice** (132 s):
  - wallet created and synced
  - the spike payment found
  - the rescan
  - recovery after `kill -9`
  - no leftovers
- **Live, `TestLiveDaemonSSL`:** as before.

For triage (not fixed):
- **The service's first start after creating a wallet far below the chain tip** failed `Init` once: `open_wallet` took about 33 s while wallet-rpc caught up, then `get_address` hit 5 s. It was ready 2.4 s after the restart, because wallet-rpc saves its progress, so it converges.
  - The installer creates at today's height, so run B shouldn't see it.
  - A reinstall with an older restore height (spec change 17) may restart a few times.
  - Candidate fix: `wallet.Open`'s calls bounded by `Init`'s context alone.

Next:
1. Wyatt approves the push, then CI.
2. Rebuild the dev release; Wyatt signs it.
3. Section D: Wyatt rolls back `coffer-test`; I reset and restart `built`.
4. Rerun B with `https://stagenet.xmr.kernal.eu:38089`.

Triage list after run B attempt 1 (Wyatt asked that both be triaged):
- **Spec change 29 (proposed):** a pairing request no longer counts as a sync. "Wallet synced", "Last sync" and checkout wait for the running service. This is the "Wallet synced while nothing runs" finding.
- **Spec change 30 (proposed):** the node prompt.
  - The tester typed `kernal.eu` three times. The message didn't name what was missing, and its example was a loopback mainnet address.
  - Also found: the prompt doesn't require a port, but `supervise.New` does, so a portless https address could pass before pairing and fail after it.
- **Still open from earlier:**
  - spec changes 26 (test tip at 1 confirmation) and 27 (page refresh)
  - the slow first `Init` after creating a wallet far below the tip (above)

## 2026-10-16 · Phase 05 · Run B attempt 2 passed (11 min); section E; triage for both runs

Before the run:
- Pushed `550620c`; CI run 38838086597 passed (race detector included).
- Rebuilt the release (`0.0.202610160203-dev.550620c`). Wyatt signed it, and `check-dev-signature.sh` verifies it.
- Section D: Wyatt rolled back, I reset (extra backup `…20261016T020559974Z`) and started `built`. kernal.eu PASS at 2,230,158.

**Run B attempt 2: PASS at 11 minutes** (Wyatt; `05-setup/B2-run-status.txt`, `B2-run-install-log.txt`):
- **Node:** `https://stagenet.xmr.kernal.eu:38089`, entered first time. The new prompt's example showed `:38089`.
- **Status:** cross-check `ok (checked with node.monerodevs.org:38089)`, a different host from the primary, so `dd7aefc`'s same-host rule worked; wallet in step with its node; 50 of 50 addresses; updates on.
- **Timeline from the dev database and the node (UTC):**
  - install started 02:10:37
  - paired 02:12:24
  - test address 02:14:04
  - in the pool 02:15:51
  - mined in 2,230,165 at 02:15:56
  - the next block 02:21:16
  - settled 02:21:49
- **As in run A, the second confirmation was most of the wait:** 5 min 20 s for one block.
- **`run-b-attempt-2.md` came back as the blank template** (no times, no confusion log). The total is Wyatt's, and the steps above are from the database.
- **One finding, the payment link in Feather:**
  - Pasted into Pay to, it gave "Unable to resolve OpenAlias: Address empty".
  - Cause, from Feather 2.8.1's source: only a keyboard paste of text starting with `monero:` is read as a link. Pasted any other way it stays raw text, and a dot with no spaces looks like an OpenAlias. The link itself is valid (Monero's `parse_uri`).
  - Fixed in the label (`7234299`): paste with Ctrl+V, else copy the address. Also a spec change 24 addendum, a second Feather upstream note draft, and `docs/setup-test.md` step 6.
  - Tests: plugin 220 pass, typecheck, bundle 52.9 KB.

**Phase 05's "done when" is met:** both timed runs passed under 15 minutes with no help (A attempt 3: 13 min; B attempt 2: 11 min).

Triage, both runs: every overrun, error and confusion, and where it stands.

| Run | Finding | Where it stands |
| --- | --- | --- |
| A1 | Install command had `localhost` as the site | Fixed: spec change 23 (`37c9cab`, `5ab0dec`) |
| A1 | Command pasted on the node container; asked for keys before refusing | Fixed: refusals come before any prompt (`5ab0dec`) |
| A1 | One 330-character line widened the page | Fixed: four short lines (spec change 23 work) |
| A2 | Tip settled but missing in Feather (restore height in the future) | Fixed: spec change 24 items 1–3b, 5, 7. Item 4 in phase 09's docs; item 6 is Wyatt's upstream note |
| A2 | Feather showed a stale chain until restarted | "Before the clock" step (restart) |
| A2 | Tester had to look up the node address | Organizer hands it over; phase 09 docs say where to find it |
| A2 | `monero:` box unlabelled | Fixed (3b), then reworded after B2 |
| A2 | Settled tip showed nowhere | Fixed (item 1: Test tip received) |
| A3 | Page doesn't update by itself | **Spec change 27, proposed.** EmDash 1.1.0 can't auto-refresh; a "Checked at" line and Check again button |
| A3, B2 | 2 confirmations were 9 of 13 min (A) and about 6 of 11 (B) | **Spec change 26, proposed.** Test tip at 1 confirmation; Strict today means 10 |
| B1 | https node: "wallet-rpc error 0" after pairing | Fixed: spec change 28 items 1 and 3 (`6e31869`), including the 5 s timeout on wallet creation and the shared digest state. TLS forwarder (item 2) decided before phase 09; 07b row added |
| B1 | "Wallet synced" while nothing ran | **Spec change 29, accepted, to build now** (after run B), with Wyatt's condition: no false alarm on a slow, healthy first start |
| B1 | `kernal.eu` typed three times; vague message; portless address could pass | Fixed: spec change 30 (`550620c`), proven in B2 (entered first time) |
| B1 | Slow first `Init` after a wallet created far below the tip (live test, not the run) | Open: candidate fix (`wallet.Open` bounded by `Init`'s context). Not seen in either run |
| B2 | Feather ignores a link pasted from the menu | Fixed in the label (`7234299`); upstream note draft |

Still open after triage:
- Decisions on spec changes 26 and 27.
- Build spec change 29.
- Push `7234299`.
- Whether to propose the slow first `Init` fix.
- Repeat runs aren't required: both runs passed.

Section E (Claude's part, done):
- **Stopped:** `built` and `release`.
- **Restored** the first backup (`…20261014T004124362Z`). The run B state it replaced is kept as `…before-restore-20261016T024213948Z`.
- **Plugin:** `pnpm run build` restored the placeholder install URL (no LAN address in `dist`; the new label is in).
- **Dev site:** started. The dev box's bridge synced at 02:46:26 UTC (height 2,230,176, about 3 min after the site came up).
- **Dev site:** stopped again. Ports 4321, 4322 and 8099 are free; no tmux sessions.
- **Memory:** about 5.9 GB available.

For Wyatt (section E):
- Take the `dev.wyattdilley.com` hostname down.
- Roll `coffer-test` back to `blank`. It still has run B's install, which backs off harmlessly while the site is gone.
- Run A's node container can stay, for phase 09.
- The tester account: the restore removed it (the backup predates it). Phase 09 makes a new invite.

Next:
1. Wyatt decides spec changes 26 and 27.
2. Build spec change 29 (accepted), with Wyatt's condition.
3. Push `7234299` and the docs.
4. Decide whether the slow first `Init` gets a proposal.

### 2026-10-16 (late) · Spec change 29 built

Before this:
- Pushed `2c4ae28`; CI run 38843064671 passed.

Design:
- Wyatt chose "the bridge says starting" over a longer plugin-only window. A 5-minute alarm counted from pairing could fire during a healthy first start of about 6 minutes.
- The details are in spec change 29.

Tests:
- **Bridge:** 3 new tests in `internal/bridgeloop`, failing first. gofmt, vet and all packages pass.
- **Plugin:** 227 pass (7 new, failing first), plus 3 existing exact-state checks updated for `lastHeardAt`. Typecheck clean; bundle 53.8 KB.
- **Script tests:** 16 pass.
- **Live:** `TestLiveDevSite` against the dev site with the new plugin build passes (64 s): pairing, the used code refused, the pool to 50, restart, outage, re-pair.
  - Before it: a `VACUUM INTO` backup (`…before-sc29-live-20261016T031301Z`).
  - After it: restored from that backup (the state it replaced: `…before-restore-20261016T031440337Z`), then the dev site stopped.
- **Not covered live:** a real "starting" message reaching the site. It needs a wallet-rpc slower than 30 s with the new bridge installed, which comes with the next release rebuild.

Note:
- Until the bridge half is released, the plugin half works with today's bridge, but its 5-minute line counts from pairing, with no "starting" messages.

Next:
1. Push (Wyatt's OK).
2. CI.
3. Rebuild the dev release when the bridge half should be tried on the dev box or `coffer-test`.
4. Wyatt decides spec changes 26 and 27.

## 2026-10-16 · Phase 05 · End-of-day handoff

### Phase 05 status

**Its "done when" is met.** Both timed runs passed under 15 minutes with no help:
- Run A, own node: attempt 3, 13 min.
- Run B, remote https node: attempt 2, 11 min.

Every overrun, error and confusion from both runs is in the triage table in the 2026-10-16 entry above. Each one is fixed, proposed, or recorded for a later phase.

Left before Wyatt closes the phase:
- Decide spec changes 26 and 27. They're the two run confusions without a fix yet.
- Push `8581f38`, which is done tonight with this entry.

No repeat run is required.

Spec changes from this phase:

| # | Status |
| --- | --- |
| 23, 24, 28 (items 1 and 3), 30 | Accepted and built |
| 29 | Built, both halves |
| 26, 27, 31 | Proposed |
| 28 item 2 | Decided before phase 09 |
| 25 | Proposed, answers in |

### Open decisions for Wyatt, with Claude's recommendation

1. **Spec change 26: the test tip at 1 confirmation,** whatever the speed setting.
   - Recommend: **accept.**
   - Both runs spent most of their wait on the second block: 9 of 13 min, and about 6 of 11.
   - Today, Strict means 10 confirmations, which breaks the budget every time.
   - It's never zero confirmations. Small plugin change, no release rebuild.
2. **Spec change 27: a "Checked at" line and a Check again button during setup.** EmDash 1.1.0 can't refresh a page by itself.
   - Recommend: **accept,** with the button kept off the install-command view.
   - Also post the upstream note asking for a timed refresh. Small plugin change.
3. **Spec change 31: `wallet.Open` bounded by `Init`'s 60 s, not the client's 5 s.**
   - Recommend: **accept.**
   - It removes a silent restart after a reinstall from an older height.
   - Small bridge change; needs the next release rebuild.
4. **Spec change 28 item 2: the bridge's TLS forwarder,** so the node's name is checked. Due before phase 09.
   - Recommend: decide once 07b's new man-in-the-middle row has run.
   - Lean **yes** if the cross-check doesn't catch a name-mismatched node that lies. It's standard library only and closes a gap that https users would assume is closed.
5. **Spec change 25: admin upkeep.**
   - Recommend:
     - Parts 1 and 1b (tip record and export, as Block Kit code blocks per year; answer A) and part 4 (recovery sheet) in phase 07, release 1.
     - Part 3 (versions) with phase 09's self-update work, since it needs a bridge change (answer D).
     - Part 5 (activity log) in release 2. It's feasible without a manifest change (answer B).
     - Part 2 (quiet-host email) in release 2 with receipts (answer C).
6. **When to rebuild the dev release** for spec change 29's bridge half, plus 31 if accepted.
   - Recommend: with the next bridge change, not on its own. The plugin half already works with the released bridge.
7. **Carried over, still waiting on Wyatt:**
   - **Spec text to fold in:** 14 (the rename), 20–24, 28, 29 and 30.
   - **Matrix notes:** spec change 23's F06 note and spec change 28's node-link note.
   - **Upstream notes:**
     - EmDash's `ctx.site.url` (23)
     - Feather's restore height and its menu paste (24)
     - EmDash's page refresh (27, if accepted)
     - the earlier Block Kit notes
   - **Spec change 18** (tips-only tier) is still proposed.

### What's left running

- **On the dev box:**
  - `monerod-stagenet` and the dev box's own `xmr-bridge` are active.
  - The dev site, the built copy and the release server are stopped. Ports 4321, 4322 and 8099 are free, and there are no tmux sessions.
  - The dev box's bridge backs off quietly until the dev site starts again.
- **On `coffer-test`:** run B attempt 2's install is still there, waiting on Wyatt's rollback. Its bridge can't reach the site, which is down, so it backs off.
- **`dev.wyattdilley.com`** gives Cloudflare's 502 until Wyatt takes the hostname down.
- **Dev data:**
  - Restored to the pre-test state. Spec change 29's live test used a backup and restored it.
  - The backups are in `~/xmr-pay-dev-data/baseline/`. The original baseline is `…before-setup-test-20261014T004124362Z`.
- **The signed dev release `0.0.202610160203-dev.550620c`** is in `~/xmr-pay-dev-data/dev-release/`. It has spec changes 28 and 30, but not 29's bridge half.
- **`plugin/dist`** is a plain build with the placeholder install URL, and spec change 29 is included.
- **Memory:** about 5.9 GB available.

### Wyatt's section E items (unchanged)

- Take the `dev.wyattdilley.com` hostname down.
- Roll `coffer-test` back to `blank`.
- Run A's node container stays, for phase 09.
- The restore removed the tester account; phase 09 makes a new invite.

### Next steps

1. Wyatt decides 26, 27 and 31 (above).
2. Build the accepted ones, tests first: 26 and 27 in the plugin, 31 in the bridge.
3. Push and wait for CI. Rebuild the dev release if 31 is in; Wyatt signs it.
4. Wyatt closes phase 05.
5. Start the next phase Wyatt names (per `docs/phases/README.md`, phase 06 or 07 under the tips-first plan). Read the "before 07, 07b and 09" list in the 2026-10-13 entry first.

Found for later phases (already in this log):
- **Phase 09:**
  - `xmr-bridge update` doesn't exist, but the "update available" banner names it.
  - The TLS forwarder decision.
  - Spec change 24 item 4 (the wallet-app section of the install docs).
- **Phase 08:** the `returnUrl` same-origin check must not rely on `ctx.site.url` alone.

To resume: `Continue phase 05. Read docs/progress.md (the 2026-10-16 end-of-day handoff), then plan the next step.`

## 2026-10-16 (night) · Phase 05 · Spec changes 26, 27 and 31 built

Wyatt's decisions (2026-10-16), all as recommended:
- **26:** accepted.
- **27:** accepted, with the button kept off the install-command view. The upstream note (item 4) is for Wyatt to post.
- **31:** accepted. Rebuild the dev release with it and spec change 29's bridge half; Wyatt signs.

Built, tests first (each test seen failing before its code):

| Commit | What |
| --- | --- |
| `802383a` | **26:** Get a test address locks `required` at `TEST_TIP_REQUIRED` (1) whatever the speed. The waiting line reads "Payment seen: 0 of 1 confirmation. A test tip needs one; your buyers' payments use your confirmation speed." (the second sentence is left off if an admin raised the target). `requiredConfirmations` is unchanged, so public tips and orders keep the presets. `docs/setup-test.md` step 7 says one confirmation |
| `d778890` | **27:** until setup is done, Setup ends with "Checked at HH:MM:SS UTC. This page doesn't update by itself." and a **Check again** button (`check_again`, re-render only). On the install-command view it says "Reload this page after the installer says Done." instead. Nothing after setup. No trust-contract change. `docs/setup-test.md` steps 5–7 mention it |
| `b119f3d` | **31:** `GetAddress` runs untimed like `open_wallet`, bounded by its context. Its one caller is `wallet.Open`, under Init's `ReadyTimeout` (60 s). `close_wallet` keeps its 5 s |

Tests:
- **Plugin:** 232 pass (5 new). Typecheck clean, manifest valid, bundle 54.4 KB.
  - 26: Fast, Standard and Strict all give 1. Through `bridge/sync` with Strict: time-locked and double-spend-flagged transfers don't count, 0 confirmations is `confirming`, and 1 settles it.
  - 27: the line and button, also after Get a test address. Check again gives no toast and leaves KV, pool and invoices unchanged. The install-command view has the reload line and no button. None after setup.
- **Bridge:** gofmt, vet and all 20 packages pass. `TestWalletCallsOutlastTheClientTimeout` now covers `get_address`. Without the fix it failed with "Client.Timeout exceeded", as in the live run. The race detector runs in CI only.

Not covered:
- 27 not looked at on the dev site. The renderer is EmDash's, and the blocks pass the test host's Block Kit validation.
- 31 not run against a real slow wallet-rpc (a wallet far below the tip). The candidate live check is `TestLiveShopWallet` against a remote node with an older restore height, about 2 minutes.
- Spec change 29's "starting" message reaching a site, which needs the rebuilt release installed.

Then:
- Wyatt OK'd the push and skipped both optional live checks. Pushed `e360e6c`; CI run 38916093756 passed (plugin, bridge, race detector).
- **Rebuilt the dev release `0.0.202610161433-dev.e360e6c`** on the default loopback base (`http://127.0.0.1:8099`). It has spec changes 28, 29 (both halves), 30 and 31. The build is clean, not `.dirty`, and all four files match `SHA256SUMS`.
  - It replaces `0.0.202610160203-dev.550620c` in `~/xmr-pay-dev-data/dev-release/`.
  - `release.json` is unsigned until Wyatt signs it.

- Wyatt signed it, and `check-dev-signature.sh` verifies the signature. The four files still match `SHA256SUMS`.
- **Section E, Wyatt's part, done:** the `dev.wyattdilley.com` hostname is down, and `coffer-test` is rolled back to `blank`. Run A's node container stays for phase 09, and the tester account goes with it (phase 09 makes a new invite).
- **Left open by Wyatt for now:**
  - updating the dev box's installed bridge to this release
  - the upstream notes
  - spec changes 28 item 2 (before phase 09), 25 and 18

Next:
1. Optional, when Wyatt wants spec change 29's "starting" message and 31 seen live: update the dev box's installed bridge to this release (Wyatt, sudo).
2. Wyatt closes phase 05.
3. Wyatt posts the upstream notes when he chooses: EmDash's page refresh (27), plus the earlier ones in the handoff above.

## 2026-10-16 · Phase 05 · Done: closed by Wyatt

Phase 05's done criteria are met:
- **Two timed fresh installs on a separate machine, both under 15 minutes with no help:**
  - run A (own node), attempt 3: 13 min
  - run B (remote https node), attempt 2: 11 min
- **Every overrun, error and confusion from both runs is triaged.** The table is in the 2026-10-16 "Run B attempt 2 passed" entry, and every row is fixed or decided:
  - Spec changes 23, 24, 26, 27, 28 (items 1 and 3), 29, 30 and 31 are built.
  - 28 item 2 (the TLS forwarder) is decided before phase 09.
- **CI is green** on `66a13c7` (run 38918827917).
- **The signed dev release `0.0.202610161433-dev.e360e6c`** has every bridge change from the phase.
- **Section E is done:** the hostname is down, `coffer-test` is back to `blank`, and the dev data is restored to the pre-test baseline.

State left:
- On the dev box, `monerod-stagenet` and the bridge are active. The installed bridge is an older dev build, without 29's bridge half or 31.
- The dev site, the built copy and the release server are stopped, with no tmux sessions.
- Run A's node container stays for phase 09.

Carried over for Wyatt (left open, his call):
- **Bridge update:** update the dev box's installed bridge to `e360e6c`.
- **Upstream notes:**
  - EmDash's `ctx.site.url` (23)
  - Feather's restore height and menu paste (24)
  - EmDash's page refresh (27)
  - the earlier Block Kit notes
- **Spec text to fold in:** 14, 20–24 and 26–31.
- **Matrix notes:** 23's F06 note and 28's node-link note.
- **Spec changes still open:**
  - 28 item 2 (before phase 09)
  - 25 (admin upkeep)
  - 18 (tips-only tier; option A was slated for phase 06)

Next step: phase 06 (theme kit), from the beginning. Read `docs/phases/06-theme-kit.md`, write the plan, and wait for Wyatt's approval.

## 2026-10-16 · Phase 06 · Session 6a: spec change 32, theme scaffold, vendored QR encoder

Plan approved by Wyatt (phase 06, sessions 6a–6c). His decisions:
- **Spec change 32:** `status` carries what the pay page shows.
- **QR encoder:** Nayuki's `qrcodegen`, vendored with its license, pinned commit and SHA-256.
- **Decoding:** a CI-only test decodes each QR with `zbar-tools` from apt.
- **Package name:** a placeholder at first (`coffer-astro`); later the same day Wyatt chose `@cofferhq/astro` (session 6c entry), and the earlier entries here use the new name.
- **Peer dependencies:** `emdash >=1.1.0 <2` and `astro >=7 <8`.
- **Theme devDependencies:** `astro` 7.3.5, `emdash` 1.1.0, `typescript` 5.9.3, `vitest` 4.1.11.
- **PayPage:** a CSP (`default-src 'none'`, `connect-src 'self'`, scripts by hash, `frame-ancestors 'none'`) and `nosniff`.
- **Spec change 18 A** moves to phase 07, with the tip button.
- **Live check:** Wyatt also scans the admin test tip's `/pay` QR, and pays from Feather (the CLI buyer wallet is empty).

Found while planning:
- **`status` had no address, URI, fiat amount, kind or tip floor,** so a page with only the token couldn't show the address or QR. This became spec change 32.
- **EmDash 1.1.0 gives SSR pages `getPublicPluginApiRouteHandler(Astro.locals)`** (`emdash/plugin-utils`), which calls public plugin routes in-process, with no network self-fetch.
- **`coffer` is already taken on npm.** It matters only if the plugin is ever published there (phase 09).

Built:

| Commit | What |
| --- | --- |
| `cdeeeec` | Phase 05 closed (progress) |
| `57439be` | **Spec change 32.** `status` adds `kind`, `address`, `uri`, `fiat` and `minAtomic`. Checkout stores `uriDescription` (the product title). One builder, `paymentUri`/`invoiceUri` in `plugin/src/core/uri.ts`, serves checkout, `status` and the admin test tip (the admin's `tipUri` is gone). An older invoice gets a URI without `tx_description`. No trust-contract change |
| `341181a` | **`theme/` scaffold** (`@cofferhq/astro`, set up like `plugin/`), the vendored encoder, `src/qr.ts` and CI's `theme` job |

The vendored encoder:
- It's `qrcodegen.ts` at upstream commit `3c6d0b3`, MIT. `LICENSE` is upstream's README text.
- Three lines are changed (`namespace` to `export namespace`).
- `SOURCE.md` records both SHA-256s and the diff. `tests/vendor.test.ts` checks both, so any other edit fails.

`qr.ts` encodes in byte mode with ECC M and a 4-module quiet zone. It draws inline SVG with no style attribute, ready for the CSP.

Tests:
- **Plugin:** 236 pass. Typecheck clean, manifest valid, bundle 54.7 KB.
- **Theme:** 8 pass, typecheck clean.
  - The 6 zbar round-trip tests are skipped on the dev box: `zbarimg` isn't installed, and I didn't install it.
  - **So the QR has not been decoded anywhere yet.** CI is the first real run (`COFFER_REQUIRE_ZBAR=1` makes a missing decoder fail).

Tooling note: `theme/tests/node.d.ts` declares the few Node APIs the zbar test uses, by hand, instead of adding `@types/node`.

Then:
- Wyatt installed `zbar-tools` (0.23.93) on the dev box. With `COFFER_REQUIRE_ZBAR=1`, theme tests: 13 pass, and all 5 QR round trips decode to the exact URI. The 1 skip is the "zbarimg missing" guard.
- Pushed `f5e2bc5`. CI run 38932491988 passed: plugin, theme (the zbar round trip in CI), bridge and the race detector.
- CLAUDE.md's command table has the theme tests, and its CI row covers the theme job.

Next:
1. Session 6b: `PayPage.astro` (its own document, headers, CSP by hash), `isPaid`, `status.ts`, the polling state machine, and container-API tests.

## 2026-10-16 · Phase 06 · Session 6b: PayPage, isPaid, polling, CSP

Built (`4fd8a35`, all in `theme/`):
- **`PayPage.astro`** is the `/pay/<token>` page as a complete HTML document of its own.
  - **Status:** read on the server in-process (`status.ts`, through EmDash's `getPublicPluginApiRouteHandler`).
  - **Shows:**
    - the amount in XMR and fiat (an open tip shows "Any amount from 0.0001 XMR")
    - the QR of `status.uri` as inline SVG
    - the address and amount with Copy buttons
    - Open in wallet
    - a countdown
    - one status line per state (waiting, partial, checking, confirming, settled, reconfirming, expired, review)
    - not found (404), unavailable (503)
  - **Headers, set from the component:**
    - `Cache-Control: private, no-store`
    - `Referrer-Policy: no-referrer`
    - `X-Robots-Tag`
    - `nosniff`
    - Wyatt's CSP: `default-src 'none'`, `connect-src 'self'`, script and style by SHA-256 (style also `'self'`), and `frame-ancestors`, `base-uri` and `form-action` all `'none'`.
- **`client.ts`:** `payState` maps a status reply to the view, and the server render and the browser use the same function. The inline script is `clientMain`'s and `payState`'s own source text, so the CSP hash comes from exactly what's sent.
  - It polls every 5 s until a final state, and not while the tab is hidden.
  - It keeps the countdown and counters current.
  - Copy appears only when the browser has a clipboard.
- **`isPaid(Astro, token)`:** settled only, read on the server.
- **`messages.ts`:** `checkoutErrorMessage` for phases 07 and 08. The silent and syncing errors read the same (spec change 20, item 5).
- **Package exports:** `./PayPage.astro`, `./isPaid`, `./messages` and `./qr`.

Tests:
- **Theme:** 34 pass and 1 skips (the "zbarimg missing" guard). Typecheck clean.
- **Rendering:** through Astro's container API, with a fake runtime in `locals`:
  - every state
  - headers and meta
  - the CSP hashes checked against the inline script and style as sent
  - no third-party URL, `src`, `link`, `img`, `@import` or `url()`
  - the token appears once (the relative status URL)
  - malformed tokens never reach the plugin
  - no runtime, or a failing or throwing handler, gives 503
- **`clientMain`:** against a fake DOM: polling, the stop at a final state, network errors, a hidden tab, the countdown and Copy.
- **The script text runs on its own,** with only the browser's globals.

Found:
- **Under Vite dev, Astro adds `data-astro-source-file` attributes** with the server's file paths to every element.
  - That's dev only, and never in a build. The tests turn it off (no dev toolbar).
  - The dev site has the toolbar off too, so check the live page there for these attributes.
  - Astro dev also injects Vite's client script, which this CSP blocks. So check for CSP violations on the built copy (port 4322), not under `astro dev`.
- **`tsc` doesn't check `.astro` frontmatter.** That needs `@astrojs/check`, which isn't a dependency. The frontmatter is thin; its logic lives in typed `.ts` files.

Not covered yet (session 6c):
- the page in a real site (headers through the node adapter, the inline script in a real browser, Copy, the QR from a phone)
- a live stagenet payment
- the install text

Changed before 6c (Wyatt, 2026-10-16): **he has no phone wallet.** So the QR check is:
- He scans each QR (the product's and the admin test tip's `/pay` page) with his phone's camera, and compares the decoded text with the `monero:` URI. I give him the expected URIs in a file.
- On his PC he opens "Open in wallet", which should open Feather with the address and amount filled in.
- He pays from Feather (the CLI buyer wallet is empty, so no `pay-script`).

What this covers:
- The camera scan, plus CI's zbar round trip, checks that the QR holds the exact URI.
- Feather checks that a wallet reads the link.
- No wallet reads the QR itself.

Next: session 6c, the dev site end to end. Steps:
1. Back up `data.db`. In the dev site, `npm install file:../../xmr-pay/theme`, and add `src/pages/pay/[token].astro` (the two-line snippet).
2. Build the plugin, then the site, and start the built copy (4322). The CSP is checked there, because `astro dev` injects a script it blocks.
3. Make a product checkout (`dev-invoices.mjs new p6`) and a test tip (Get a test address on the admin page). Write both expected URIs to a file for Wyatt.
4. **Wyatt:**
   - opens both `/pay` pages through his tunnel
   - compares the camera scans with the URIs
   - checks the console for CSP errors
   - opens "Open in wallet" in Feather
   - pays the product from Feather and watches the page reach Paid with no reload
5. **Me:**
   - `curl -I` for the headers
   - the HTML for third-party references
   - `isPaid` through a temporary test page, deleted afterwards
6. Write the `sections.installation` text and show it to Wyatt before committing.

## 2026-10-16 · Phase 06 · Session 6c: the dev site, end to end

Setup:
- **Backups:** `data.db` with `VACUUM INTO` (`baseline/data.db.before-06c-20261016T170701Z`, integrity ok, 341 Coffer rows), and the site's `package.json` and `package-lock.json` as `baseline/*.before-06c`.
  - **My mistake:** the first copy overwrote two older files, `baseline/package.json` and `package-lock.json`, without my looking at them first. They were probably the phase 01 pre-spike copies; no doc referred to them, and no other copy exists.
- **Dev site:**
  - `npm install file:../../xmr-pay/theme`. The lockfile only gained the link.
  - Added `src/pages/pay/[token].astro`.
  - Built the plugin with spec change 32.
- **Built copy on port 4321,** not 4322 (tmux `built`, `HOST=localhost PORT=4321`): the dev box's bridge syncs to `localhost:4321`, and it's the CSP-clean server.
- **Test tips:** made through the dev sign-in under `astro dev` (a scratch script that presses Get a test address), since the built copy has no dev sign-in.

**Found and fixed: a component's headers never reach the browser** (`c8abad2`).
- **What happened:** in a real Astro site, headers and the status code set inside a component are dropped, because the response has started. The 6b page went out with none of its headers, EmDash's default `Referrer-Policy: strict-origin-when-cross-origin`, and 200 for unknown tokens.
- **Why the tests missed it:** Astro's container API renders the component as the page.
- **The fix:**
  - The page file calls `preparePayPage(Astro, token)` (`@cofferhq/astro/page`), which sets the headers and the 200/404/503 status. EmDash's middleware only fills headers that are missing.
  - `PayPage` fails closed without it.
  - Tests render through a fixture page shaped like the snippet.
  - The install snippet is four lines.

Live checks:
- **On the built copy:**
  - every header present
  - the CSP hashes match the inline script and style as sent
  - no `data-astro-source` attributes, no third-party references, the token once per page
  - Wyatt: **no console errors** on either page
- **QR:**
  - The QR from both built pages (product `p6`, admin test tip) decodes with zbarimg to the exact URI from `status`.
  - **Wyatt's phone-camera scans of both matched the expected URIs exactly** (`~/xmr-pay-dev-data/06-pay/expected-uris.txt`).
  - The first test tip expired before he scanned it, so he scanned a second one on `astro dev`, also checked with zbarimg first.
- **Copy:** works (Wyatt).
- **Open in wallet: didn't work on Wyatt's PC.** Windows said no app is associated, because Feather isn't registered for `monero:` links, so he copied the fields into Feather instead.
  - Fixed per his suggestion (`8bc736a`): a "Nothing opened? Copy the address and amount above into your wallet." line under the button.
  - **So no wallet has read the link from the button yet.**
- **Product payment, `p6`** (`test-sticker`, 0.001821360921 XMR, 2 confirmations), paid from Feather, reached **Paid without a reload** (Wyatt):

  | Event | UTC |
  | --- | --- |
  | Checkout | 17:11:40 |
  | Payment seen | 17:22:00 |
  | 1 of 2 | 17:25:40 |
  | Settled | 17:27:01 |

- **Open-tip end to end (unplanned):** Wyatt paid 0.001 sXMR to the second test tip by mistake (`S3DEq…`, pool #270, open amount, floor 0.0001, 1 confirmation).
  - created 17:49:38
  - first seen 17:55:43, already 1 confirmation
  - settled 17:56:45 UTC
- **`isPaid`,** through a temporary page on `astro dev` (deleted afterwards): true for `p6` and the paid tip; false for the expired tip, an unknown token, a malformed one and none.

### 2026-10-16 (later) · Phase 06 · 6c finished: package name, install text, site stylesheet

Wyatt's decisions:
- **npm name `@cofferhq/astro`** (`~/xmr-pay-dev-data/npm-scope-cofferhq.md`; npm org `cofferhq`, since `coffer` was taken). Renamed everywhere, and logged in `docs/decisions.md` (`3ea176d`).
  - For phase 09: the first publish needs `--access public`, through GitHub Actions trusted publishing (OIDC, with provenance), never a stored token. Added to `docs/phases/09-release.md`.
  - The EmDash listing stays `@<atmosphere-handle>/coffer`.
- **The registry's Installation section** (`208ed44`), as Wyatt approved it.
  - `plugin/docs/installation.md` holds the text, through `sections.installation`.
  - It covers the Setup checklist, the four-line pay page, the headers and restyling, and the access-rule note.
  - **Gated content (`isPaid`) is left out of release 1** (Wyatt: it's selling); it comes back in release 2.
  - Sections are profile text, inlined at publish, with a 2,000-grapheme cap; this one is 1,261 characters.
- **Site stylesheet through the CSP:**
  - On the built copy, the page linked a real same-origin `/your.css` through the README's `<link slot="head">`.
  - The CSP sent `style-src 'self' 'sha256-…'`, and the site served the file as `text/css`.
  - **Wyatt saw it applied** (yellow background, purple heading), with no console errors.
  - The test stylesheet is removed and the page is back to the plain snippet.

**Phase 06's done criteria are met:**
- A stagenet product payment went end to end through the package's `/pay` page, reaching Paid without a reload (`p6`). An open tip also did, unplanned.
- The page meets every privacy rule: headers, CSP, no third-party assets, the token only in the polling URL, `noindex`, no Referer.
- The QR encodes the exact URI: zbarimg in CI and on the dev box, and Wyatt's camera scans of both the product and the test tip.
- The installation snippet is written.

Not covered:
- **No wallet has read the link through Open in wallet,** because Feather isn't registered for `monero:` on Windows. The hint now covers that case.
- **No wallet app has scanned the QR;** Wyatt has no phone wallet.
- `tsc` doesn't check `.astro` frontmatter.

For phase 07:
- **On a tip, the Paid card should show the amount received** (Wyatt). Today it says only "Paid. Thank you!".
- Spec change 18 A (the static tip button) is moved there.
- The tip button uses `checkoutErrorMessage` (`@cofferhq/astro/messages`).

State left:
- **Dev site:**
  - stopped
  - `@cofferhq/astro` installed from `../../xmr-pay/theme`
  - `src/pages/pay/[token].astro` is the four-line snippet
  - `dist/` rebuilt from that page
  - no `public/` folder (as before)
- **Ports and memory:** 4321, 4322 and 8099 are free, with no tmux sessions. Memory is about 5.4 GB available.
- **Dev data:** kept, with this session's invoices:
  - `p6` settled
  - the first test tip expired
  - the second test tip settled with 0.001 sXMR
  - The backup from before 6c is `baseline/data.db.before-06c-20261016T170701Z`.
- **Scratch files:** `~/xmr-pay-dev-data/06-pay/` (the expected URIs and status replies, mode 600).

Next: Wyatt closes phase 06, then phase 07 (tips). Read the "before 07, 07b and 09" list in the 2026-10-13 entry first, plus the phase 07 notes above.

## 2026-10-16 · Phase 06 · Done: closed by Wyatt

Phase 06's done criteria are met (the 6c entries above):
- **End to end:** a stagenet product payment through `@cofferhq/astro`'s `/pay` page reached Paid without a reload, on the dev site's built copy. An open tip also did.
- **Privacy rules,** all checked on the built copy:
  - `Cache-Control: private, no-store`
  - `Referrer-Policy: no-referrer`
  - `X-Robots-Tag` and meta `noindex`
  - `nosniff`
  - Wyatt's CSP, by hash, with no console errors
  - no third-party assets
  - the token only in the polling URL
- **The QR's exact URI:** zbarimg in CI and on the dev box, and Wyatt's camera scans.
- **The installation snippet:** `plugin/docs/installation.md`, the registry's Installation section.
- **CI is green** on `a87da24` (run 38950113916).

Carried over:
- **For phase 07:**
  - the Paid card on a tip shows the amount received
  - spec change 18 A (the static tip button)
  - the tip button uses `checkoutErrorMessage`
- **For release 2 (phase 08):**
  - `isPaid`, gated content, back in the installation text
  - PayButton
- **For phase 09:** publish `@cofferhq/astro` with trusted publishing.
- **Not covered:** a wallet opening a link from Open in wallet, and a wallet app scanning a QR.
- **Still open for Wyatt:**
  - the upstream notes
  - spec text to fold in (now also 32)
  - spec changes 28 item 2, 25 and 18
  - updating the dev box's bridge

Next step: phase 07 (tip mode), from the beginning. Read `docs/phases/07-tip-mode.md`, write the plan, and wait for Wyatt's approval.

## 2026-10-16 · Phase 07 · Session 7a: tip checkout, the switch, tip lifecycle (stopped at the watch-list scan)

Plan approved by Wyatt with conditions:
- notes in plain text only
- report the bot exposure
- `RATE_UNAVAILABLE` falls back to an open tip
- the 18 A address is checked
- the 18 A fallback also shows on `TOO_MANY_OPEN`
- report on the per-client cap on Node

Decisions are in spec changes 33 and 34, and 18 is updated (`0d3d7f7`, `a299574`).

Built (all local; nothing pushed since `a87da24`):

| Commit | What |
| --- | --- |
| `6100485` | Phase 06 closed |
| `a211262` | **The release-1 switch** (`GOODS_ENABLED = false`). Product and order checkouts get the unknown kind's reply; the admin page has no All invoices. `vitest.goods.config.ts` builds a copy with the switch on and runs the switch-dependent files, and the `__COFFER_GOODS__` define tells shared files which build they're testing. CI runs both. Bundle 51.2 KB (the bundler drops the code behind the constant) |
| `7833fa7` | **Tip checkout:** fiat or XMR amount, entry (`ENTRY_NOT_FOUND`, a new code), note (cleaned, 140 characters). Taken while the host is silent or syncing. No price means an open tip. A visitor's open tip has no amount in its link. Visitor tips are marked `via: "checkout"` and kept apart from test tips |
| `e4b9920` | **Tips never late** (pure core). Watched 7 days; an untouched tip leaves once the host has reported it empty for 24 hours past its window (`seq`) |

Tests: default 221 and switch-on 69 pass (one skip each). Typecheck clean, bundle 53.2 KB.

**Per-client cap on Node** (Wyatt's question): EmDash's `extractRequestMeta` trusts `CF-Connecting-IP` only on Workers (with a `cf` object). Elsewhere it trusts only the headers in `trustedProxyHeaders` (or `EMDASH_TRUSTED_PROXY_HEADERS`).
- **Behind a Cloudflare Tunnel on Node:** the cap works with `trustedProxyHeaders: ["cf-connecting-ip"]`, but only if the origin is reachable only through the tunnel.
- **`Astro.clientAddress`** isn't passed to plugins (and behind a tunnel it's loopback).
- **Logged:**
  - phase 09 setup docs: the config line and its condition
  - 07b: a spoofing test with the origin exposed
  - 7c: the tip endpoint must forward `cf` and the headers

**Stopped at the plan's stop point: the watch-candidate scan** (not widened for tips yet). Measured with a temporary test, not committed, on the dev box's workerd test host:
- **Setup:** 15,000 expired tips spread over 8 days.
- **Result:** one sync took 183–230 ms. Node enforces no CPU limit.
- **The watch list had exactly 1,000 entries,** where about 3,750 fall in the 2-day lookback:
  - `collect()` in `plugin/src/store.ts` reads at most 10 pages of 100 per query (`MAX_PAGES`), unordered.
  - **That's a silent truncation, already true today for products:** under a flood of over 1,000 invoices in two days, some recent final invoices drop off the watch list unseen, so a late payment or a reorg on them could go unnoticed.
- **Cloudflare's runner allows 50 ms CPU and 10 subrequests per plugin call** (EmDash docs, "Configure the plugin sandbox"). The docs don't say whether storage calls through the plugin bridge count as subrequests. If they do, checkout and sync are already over 10 today.
  - **Coffer has never run on the Cloudflare runner:** the spike and every test since used Node.

Waiting on Wyatt:
1. The watch-list design (proposal in the report).
2. A Cloudflare Workers test, which needs his Workers Paid account (Worker Loader).

Not started: 7a step 5 (dev scripts to tips).

### 2026-10-16 (later) · 7a continued while the spike waits

- **Wyatt's decision:** a Cloudflare spike first, before redesigning the watch scan. He'll set up the Workers Paid account.
  - Plan in `spikes/cf-runner/PLAN.md` (`e2ed6f6`): the questions, the method, every account step as his, and what needs approval first (the working area `~/sites/xmr-cf-spike`; `wrangler`, `@astrojs/cloudflare` and `@emdash-cms/cloudflare` for the throwaway site only; how deploys are authorized).
- **Step 5, the dev scripts to tips** (`89bf859`):
  - `dev-e2e.mjs`: the product is refused, then a $1.00 tip goes from below the floor to settled.
  - `dev-invoices.mjs new`: a tip by default (`--xmr` or `--fiat`, `--entry`, `--note`), and `--product` only with the switch on.
  - **Live:**
    - `dev-e2e` 31 of 31 on `astro dev`, after a reset (backup `…20261016T200224592Z`), restored after
    - against the restored site and the real bridge: an open tip (#271) and a 0.002 XMR tip (#272); both stay unpaid and will expire
    - Script tests: 17 pass.
- **State:**
  - dev site stopped, ports free
  - dev data restored, plus those two tips (the state the restore replaced: `…before-restore-20261016T200252737Z`)

Left in 7a, after the spike:
- the watch-list scan: widen it for tips, or redesign it (the spike decides)
- the timing check on the Cloudflare runner itself

Then 7b (the admin tips view) and 7c (theme and live) as planned.

### 2026-10-16 (night) · Phase 07 · The Cloudflare spike: Coffer can't pair there

- **Setup:**
  - Wyatt set up the Workers Paid account, the scoped token (option A), R2, and Cloudflare Access (site Allow; `/_emdash/api/plugins/*` Bypass). He finished the throwaway site's setup wizard.
  - The site is deployed from `~/sites/xmr-cf-spike` through `scripts/with-cf-env.sh`.
  - Checked: the root, the admin, the manifest and both `../` forms redirect to Access; plugin routes answer.
  - Snags (in `SETUP.md`):
    - the env file's lines (fixed by Wyatt)
    - the token's start date set to its end date
    - R2 needing enabling
    - the session KV namespace from the first failed deploy, now pinned in `wrangler.jsonc`
- **Measured** (`docs/spike-findings.md`, "Phase 07 spike"; `bcda64c`):
  - Every bridge call counts as a subrequest, and the 11th per invocation throws.
  - `getMany` handles up to 98 ids in one call; `putMany` costs about 47 ms a row.
  - CPU allowed about 0.5 s and refused about 1 s.
  - **Coffer's pairing sync fails even with 0 addresses.** Coffer works only on Node-hosted EmDash sites.
  - **A mistake of mine:** the limits plugin's parser accepted at most 7 digits, so the first CPU run fell back to 1M iterations above 5M. Fixed and rerun; the results above are the rerun.
- **Spec change 35 proposed:**
  - A: redesign to 10 calls per route before release 1, as phase 07c
  - B: release 1 for Node sites only
  - C: an upstream note
  - Recommended: A, with C now.
- **State:**
  - The spike site stays deployed for A's checks. Its token expires 2026-10-30.
  - Teardown in `SETUP.md` steps 11–13.
  - Phase 07 is paused after 7a, waiting on Wyatt's choice.

### 2026-10-16 (night, later) · Spec change 35: B with Wyatt's conditions, built

Wyatt chose B for release 1 (Node-hosted sites), with three conditions; A (the 10-call redesign) is planned for release 1.x or 2. Recorded in spec change 35 (`7d50ab6`).

1. **Cloudflare detected; refused cleanly before any storage call:**
   - **Plugin** (`4585aef`): detection by `requestMeta.geo`, which EmDash sets only from Cloudflare's `cf` object. Checked live: present on the spike site; null on Node.
     - `bridge/sync` and `checkout` answer `UNSUPPORTED_PLATFORM`.
     - The admin page and widget show one banner, "Not supported on Cloudflare Workers yet".
   - **Bridge hint and theme message** (`3139f79`).
   - **Live:**
     - Cloudflare (spike site, new build): a signed 10-address pairing gets `UNSUPPORTED_PLATFORM` (HTTP 200, not a route error), and the pairing code stays unused (D1: `used` 0, no pool or invoice rows); checkout is refused the same way; status still works.
     - Node (dev site, `astro dev`): the bridge synced normally at 2,230,815, and a tip checkout made an invoice.
   - **Not yet seen:** the admin banner in a browser (Wyatt, on the spike site), and the bridge's hint in a real install (needs the next dev release).
2. **The watch truncation affects Node too; fixed for release 1** (`84cc02d`):
   - `collect()` pages to the end under a 200-page safety cap, and says when the cap is hit.
   - Tips are candidates for 8 days.
   - Health warns for a day if the cap is reached.
   - Test: 1,200 recent tips plus a touched 5-day-old one all watched (the old code stopped at 1,000).
3. **`getMany`/`putMany` where it's cheap:** for 7b and 7c.

Tests:
- **Plugin:** default 230 and switch-on 69 pass (one skip each). Bundle 54.4 KB.
- **Bridge:** all pass.
- **Theme:** 36 pass.

Next:
- Wyatt looks at the admin banner on the spike site.
- Push.
- 7b (the admin tips view, with `getMany`/`putMany` where cheap), then 7c.
- The next dev release rebuild carries the bridge hint.

## 2026-10-16 · Phase 07 · Session 7b: the admin Tips view

Before it:
- **The Cloudflare banner** lost its storage-calls clause (Wyatt).
- **Guard tests** cover an EmDash upgrade filling `geo` on Node: two tests through EmDash's own request handling, one with `CF-*` headers.
- **`docs/emdash-upgrade-checklist.md`** is new, and CLAUDE.md's Dependencies section points to it (`8208582`).
- Pushed `38225e7..8208582`; CI run 38986880116 passed.

Built (`6b010ba`), a **Tips** section after Needs a decision (All invoices follows only with the switch on):
- **Received** and the number of settled tips: settled visitor tips, counted payments only; admin test tips never count.
- **By entry:** the top 10, then "Other entries", and "Whole site" for tips without an entry. Names come from the title stored at tip time, so no content lookups; each tip links to its entry.
- **Newest tips:** the 10 newest, each with its date, amount or what was asked, entry, status, and the note as given.
  - EmDash 1.1.0's Block Kit renders all text as plain React text (no `dangerouslySetInnerHTML` or markdown in `@emdash-cms/blocks`), so notes show literally. This is now in the upgrade checklist.
- **The scan reads the newest 1,000 visitor tips,** and the page says so beyond that.
- **`getMany`/`putMany`:** there was nowhere in 7b where they'd save a call; the view is one indexed query.

Tests:
- **`admin-tips.test.ts`:** 7 tests:
  - no tips yet
  - totals that exclude unsettled tips, not-counted transfers and test tips
  - links, markdown, HTML and Block Kit-like notes kept literally
  - the 10 newest
  - the 1,000-tip bound
  - notes gone after the purge
  - the worst case under Block Kit's limits
- **Overall:** default 239 and switch-on 69 pass. Typecheck clean, bundle 56.8 KB.

Not done:
- **Wyatt's look at the page.** The dev site has no settled visitor tips yet (only the expired 7a dev tips), so the look fits better in 7c, after real tips from the button.

Next: push; then 7c (TipButton, the tip endpoint, the 18 A fallback, the pay page's tip lines, live tips from Feather, the installation text).

### 2026-10-16 (late night) · Before 7c: Wyatt's four items

- **(1)** With goods off, the Health banners say tips are still taken (silent, starting, node syncing), "Tips can't be taken" (no addresses), and fiat tips become open tips (price feed down). `admin-health` runs under both configs.
- **(2)** Tips says "Test tips from Setup aren't counted here."
- **(3) `inv_5ca6c02ecf6cc249` is a session 3h test, though not the dedicated underpay one.**
  - The dev scripts' state file names its token `two-part`, and 3h's table says "A first two-part attempt whose second part couldn't come in time did the same".
  - It's a product with 60% received (1,068,585,371 of 1,780,975,619) on 2026-10-05 at 23:34 UTC, in review as underpaid since its window ended.
  - The dedicated 90% underpay test is the invoice named `underpaid`.
- **(4)** Confirmations of invoices the bridge no longer watches read "when last checked (date)".
- **Commits and tests:** `a48d0b2`. Default 240, switch-on 92.
- **Found:**
  - **A cold-start flake:** `admin-health`'s first test sometimes hangs when it's the first test after a fresh build, on old and new code alike. The test host's D1 isn't migrated yet ("no such table" at plugin load). It passes in full runs.
  - **A leftover `astro dev`** (about 1.9 GB) from my Node check was still running after I thought I'd stopped it; the stop had hit an older instance. Stopped now, and two `admin-health` failures under that memory pressure didn't reproduce afterwards.

## 2026-10-17 (UTC; evening of 10-16 MDT) · Phase 07 · Session 7c: tip button, endpoint, live tips; end-of-night handoff

Pushed before 7c: `8208582..04f6c55`; CI run 38993398046 passed.

Built (theme; local, not pushed):

| Commit | What |
| --- | --- |
| `2cfcfcb` | **`TipButton.astro`:** a plain form, no script: $3, $5 and $10 (the middle one chosen), another amount in the currency or XMR, any amount, a note of up to 140 characters, hidden entry and `returnTo`. **`tip.ts`, `tipEndpoint()`:** form to checkout body, BigInt only; checkout in-process with the visitor's headers (minus cookies, credentials and Origin) and `cf`; 303 to `/pay/<token>`; error pages. **Spec change 18 A fallback,** see below. **The pay page for tips:** "Tip received: <amount> XMR. Thank you!", the "below the 0.0001 XMR minimum" line, and the confirmation-timing line. **Messages:** Wyatt's empty-pool line, plus `INVALID_REQUEST` and `ENTRY_NOT_FOUND`. **Exports:** `./TipButton.astro` and `./tip` |
| `b97f3fc` | **Found live:** a cross-site form post to `/pay/tip` made a tip; Astro didn't refuse it, and the endpoint skips EmDash's CSRF check by calling checkout in-process. Now 403 for a cross-site `Sec-Fetch-Site`, or an `Origin` for another host (or `null`). Confirmed live |
| `36384b6` | **EmDash's editor toolbar** (unstyled under our CSP, Wyatt) is skipped on the pay and tip pages: an empty `<div id="emdash-toolbar" hidden>` hits EmDash's dedupe marker; added to the upgrade checklist. **README:** the pay page has its own look; match it with `--coffer-*` or a same-origin stylesheet |

**A change from the plan, for safety: the 18 A fallback address lives in the site's endpoint file,** `tipEndpoint({ address, network })`, not in a TipButton prop.
- A form field would let anyone put their own address on the shop's domain.
- **`address.ts`** decodes Monero base58 by block and checks 95 characters and the network byte (mainnet 18/42, stagenet 24/36, testnet 53/63). The checksum isn't checked (no Keccak in WebCrypto).
- **A bad address** is logged at start and shows an error for the site's admin instead of a QR.
- The decoder also read three real stagenet subaddresses correctly (a local check, not committed).

Tests:
- **Theme:** 56 pass and 1 skips (the zbar guard), with zbarimg required. Typecheck clean.
  - address 4
  - tip endpoint 10
  - TipButton 3
  - pay page +3
- **Plugin:** unchanged since `a48d0b2`: default 240, switch-on 92.

**Live on the dev site's built copy** (TipButton under the "Welcome" post; backups `…before-07c-20261017T021448Z`):

| Tip | Pool address | Received | Settled (UTC) |
| --- | --- | --- | --- |
| A, $3 set amount | #277 | 0.008995718039 XMR | 02:32:30 |
| B, any amount | #279 | 0.0001 XMR (the minimum) | 02:50:48 |

- Paid from Feather. Both pay pages reached "Tip received" without a reload and showed the timing line (Wyatt).
- Two more $3 tips (#276, #278), my two curl posts and the 7a dev tips expired unpaid, as expected.
- **No JavaScript:** the form submitted and the pay page opened (Wyatt).
- **Console:** no CSP errors on the post page (its look is the starter theme's).
- **The admin Tips view,** read through the dev sign-in under `astro dev` (`~/xmr-pay-dev-data/07c-tips-view.txt`):
  - "Test tips from Setup aren't counted here."
  - Received 0.009095718039 XMR, 2 settled
  - Welcome: 2 tips, 0.009095718039 XMR
  - the newest 10 with notes as given and "Open entry" links
  - **Wyatt hasn't looked at it in a browser yet.**

### Phase 07 against its done criteria

- **A stagenet tip from the dev site's tip button settles:** done (A and B).
- **The release-1 switch is off and tested both ways:** done (`vitest.goods.config.ts` and CI).
- **Per-entry totals on the admin page:** done in the data; Wyatt's look in a browser is pending.
- **Tests cover every amount mode and the purge:** done (plugin `tip-checkout` and `admin-tips`; theme `tip.test.ts`).

Left before Wyatt closes phase 07:
1. **The installation text gets the tip button** (`plugin/docs/installation.md`; shown to Wyatt before committing). Draft in tonight's summary.
2. **Wyatt looks at Tips in the admin.**
3. **Push** `2cfcfcb`, `b97f3fc`, `36384b6` and these docs; then CI.
4. **Optional:** the 18 A fallback seen live (a stagenet address in the dev site's endpoint).

### State left

- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions; no `astro dev` running
  - about 5.8 GB available
  - `monerod-stagenet` and the bridge active
- **Dev site:** keeps the TipButton (`posts/[slug].astro`) and `pay/tip.ts` for the next session. The pre-07c copies are in `baseline/`. The dev data holds the 7c tips.
- **Cloudflare spike site:** still deployed behind Access (`~/sites/xmr-cf-spike`), running an older Coffer build with the longer banner. Token expires 2026-10-30. Teardown: `SETUP.md` steps 11–13 (Wyatt), when the spike's no longer needed.
- **Dev release:** `0.0.202610161433-dev.e360e6c` (signed) doesn't have the bridge's `UNSUPPORTED_PLATFORM` hint (`3139f79`). Rebuild with the next bridge change.

### Open for later

- **Before 07b** (2026-10-13 list):
  - the security matrix in the repo as `docs/security-matrix.md`
  - decisions on C01–C06
  - 07b's rows include the tip endpoint's cross-site refusal, the `trustedProxyHeaders` spoofing test, and the Cloudflare refusal
- **Before 09:**
  - spec change 28 item 2
  - the mainnet second-node list
  - trusted publishing for `@cofferhq/astro`
  - the setup docs line for `trustedProxyHeaders`
- **Release 1.x or 2:** spec change 35 A (the 10-call redesign).
- **Test flake:** `admin-health`'s first test can hang when it's the first test after a fresh build (the test host's D1 isn't migrated yet). Not fixed.

Next session: `Continue phase 07. Read docs/progress.md (the 7c handoff), then plan the next step.` Steps:
1. Wyatt approves the installation text, and looks at Tips.
2. Push and CI.
3. Wyatt closes phase 07.
4. Phase 07b.

## 2026-10-18 · Phase 07 · Session 7d: three spec notes logged; installation text drafted

- **Wyatt's three notes** (`~/xmr-pay-dev-data/notes/`) logged as proposed spec changes, nothing built (`66dc75b`):
  - **36:** store adapter and coexistence with other payment plugins
  - **37:** same-machine wallet host
  - **38:** FCMP++ / Carrot readiness spike
  - **Where they went:** each has a row under "Still to decide" in `docs/decisions.md`. The coexistence note asked for `docs/decisions.md`, but that file holds made decisions only (CLAUDE.md), so the entry itself is in `docs/spec-changes.md`.
- **Spec change 36's release-1 checks, read-only** (details in the entry):
  - **R2 breaks today:** the pay page is at `/pay/[token]`, the tip endpoint at `/pay/tip`. The fix is small: two theme defaults, the snippets, the tests, and the dev site's two files.
  - **R4 and R5 are met:** headers, CSP and the toolbar placeholder sit only on Coffer's own responses; no global CSS or scripts. No test pins it yet; one is proposed.
  - **The plugin never learns the network,** and stored invoices have no asset field. Fix: derive the network from the subaddress's network byte at checkout. No protocol or trust-contract change.
  - **The note uses "network" for both** the test tier and the chain.
  - **The note's C2 state names match neither the code nor the spec's five contract statuses.**
  - **The note meets the spec's contract** (no webhooks, no shared secret, DashCommerce first) in three places, for Wyatt.
- **Spec change 38 needs two ground rules adjusted:**
  - CLAUDE.md allows stagenet and regtest only, not testnet or stressnet.
  - The beta binaries are probably not signed by the pinned Monero key.
- **Installation text:** step 3 (the tip button) is in the working tree, **not committed**, waiting for Wyatt.
  - 1,772 of the registry's 2,000-grapheme cap (`SECTION_MAX_GRAPHEMES` in `@emdash-cms/plugin-cli`).
  - `emdash-plugin validate` passes.
  - If R2 is approved, the paths in steps 2 and 3 change.
- **`.claude/settings.json`:** the committed file isn't valid JSON (a missing comma and a trailing one in `deny`). The working tree's uncommitted fix is presumably Wyatt's; it waits for his confirmation before the push.
- **Tests:** none run (docs only).
- **State:** dev site and built copy stopped; nothing pushed since `04f6c55`.

Next:
1. Wyatt answers spec change 36's four questions in the plan (R2 path and timing, how network is stored, the settings fix, the installation text).
2. Commit the installation text and the settings fix.
3. Wyatt looks at Tips in the admin (dev site under `astro dev`).
4. Push and CI.
5. Wyatt closes phase 07.
6. If R2 is approved for release 1, a session 7e (R2, asset and network on invoices, `asset`/`decimals` on status) before 07b.

### 2026-10-18 (later) · Wyatt's answers; session 7e set

- **Decided** (spec change 36 and `docs/decisions.md`):
  - The default pay path is `/pay/coffer/[token]`, in a session 7e before 07b.
  - The coin is stored as three separate fields: asset, chain (`"monero"` for now) and network. A missing value reads as `xmr` / `monero` / `mainnet`.
  - Method IDs use asset and chain, never the network. The exact string is still open, before phase 08.
- **The settings fix is Wyatt's,** committed (`01bd8ad`). The committed file hadn't parsed before; it does now.
- **The installation text's tip-button step waits for 7e,** so its paths are written once. The 7d draft was taken out of the working tree; its text is in this session's plan, with the paths to change to `/pay/coffer/`.

Session 7e (plan first):
1. **R2:**
   - theme defaults: `tipEndpoint` `payPath` `/pay/coffer`, `TipButton` `action` `/pay/coffer/tip`
   - `theme/README.md`
   - `plugin/docs/installation.md`: steps 2 and 3, with the tip button; shown to Wyatt before committing; under 2,000 graphemes
   - theme tests
   - the dev site's `pay/[token].astro` and `pay/tip.ts` moved under `pay/coffer/`
2. **Stored coin fields:** `asset`, `chain` and `network` on new invoices. The network comes from the subaddress's network byte (port the theme's `address.ts` decoder to the plugin, with its tests). Readers default a missing value.
3. **The status route:** `asset`, `chain` and `decimals`, if Wyatt confirms in 7e's plan. This was raised in 7d's report, not decided.
4. **The R5 test:** `TipButton` renders no `<script>` and no unscoped selector.
5. **Then:**
   - Wyatt looks at Tips in the admin.
   - Push and CI.
   - Wyatt closes phase 07.
   - Phase 07b.

**Not pushed yet:** `2cfcfcb`..HEAD (Wyatt's OK needed).
- **Method-ID format decided** (spec change 36, decision 3; built in phase 08):
  - The format is `coffer:<asset>`, with `-<chain>` only when the chain isn't the asset's home chain: `coffer:xmr`, `coffer:eth-base`, `coffer:usdc-base`.
  - Assets with no home chain, such as stablecoins, always include it.
  - The ID is made from the stored fields and never parsed back.
- **Pushed on Wyatt's OK** (2026-10-18): `04f6c55..ff7041f`.
  - **CI run 39177556608 passed:** bridge (with the race-detector tests), plugin and theme. This is the first CI run of 7c's theme code.
  - `scripts/ci-status.py` needs the full SHA: a short one finds no runs and waits about 23 minutes.

## 2026-10-18 (evening MDT; 2026-10-19 UTC) · Phase 07 · Session 7e: /pay/coffer/, the stored coin fields

Plan approved by Wyatt with one change: `coinOf()` reads a missing network from the invoice's stored subaddress first, and falls back to mainnet only if that fails. Refusing a pool that mixes networks stays recorded for 07b.

Built (local, not pushed):

| Commit | What |
| --- | --- |
| `38f1d84` | `subaddressNetwork()` (`plugin/src/core/address.ts`): Monero base58, copied from the theme. Subaddress bytes only: 42, 36, 63. `tests/addresses.ts` makes valid-format fakes (zero checksum) |
| `c4f1048` | **The test fixtures switch to `fakeSubaddress()`:** the old `7…padStart(94, X)` shape decodes to byte 38 for most filler letters. No behavior change |
| `bf938b1` | **Sync drops a pool address whose network can't be read,** the same silent drop as a malformed one |
| `06bc905` | **Invoices store `asset`, `chain` and `network`; `coinOf()` fills in older rows; status adds the four fields.** `claimAndStore` claims an unreadable row with no invoice and skips it. The theme's `InvoiceStatus` type gains the fields, optional |
| `b99e664` | **Theme:** `payPath` defaults to `/pay/coffer` and `action` to `/pay/coffer/tip`; README; a `payPath` override test; the R5 test (TipButton: no script, one style block, every selector `.coffer-tip*`, no `:global`, sets no custom property) |
| `4585742` | **`dev-e2e`:** its fakes now carry byte 36 (the old ones didn't decode at all); new checks for a dropped byte-38 address and the coin in status. `dev-invoices` prints `/pay/coffer/<token>` |
| `f129d6f` | **Docs:** spec change 36's "Built (7e)" and the spec text to fold in; phase 08's PayButton path |

Tests (from this session's output):
- **Plugin:** default 251 and switch-on 92 pass (one skip each). Typecheck clean, `emdash-plugin validate` passes, bundle 58.3 KB.
- **Theme:** 58 pass and 1 skips, with zbar required. Typecheck clean.
- **Scripts:** 17 pass.
- **Two of my own test cases were wrong at first, not the code:**
  - `"7".repeat(95)` and the `B`-filler fixture both decode as real stagenet subaddresses (byte 36).
  - The tests now use `fakeAddress(38, …)`, which no network uses by construction.

Live, dev site (`astro dev`):
- **Before:** all 329 pool rows and 29 invoices decode to stagenet (read-only tally), so no real row gets skipped.
- **Fresh install:** reset with backup `baseline/data.db.before-setup-test-20261019T012350096Z`, then `dev-e2e` 32 of 32 (`~/xmr-pay-dev-data/7e-e2e.txt`):
  - the top-up of 40 plus one byte-38 address left 50 free (the bad one dropped)
  - status reported `xmr/monero/stagenet, decimals 12`
  - a $1.00 tip settled
  - **Restored after;** the state it replaced is `…before-restore-20261019T012426004Z`.
- **The real bridge's sync was accepted on the new build** at 01:25:31 UTC, height 2,232,639. It added real address #330 to the pool.
- **The tip at the new paths** (`7e-live-paths.txt`):
  - `POST /pay/coffer/tip` (0.0002 XMR) answered 303 to `/pay/coffer/<token>`, and that page answered 200.
  - Status: `xmr` / `monero` / `stagenet`, `decimals` 12. The invoice (#280) stores the three fields.
  - The old `/pay/<token>` and `/pay/tip` answer 404.
  - The Welcome post's form posts to `/pay/coffer/tip`.
  - That tip stays unpaid and will expire.
- **The dev site's files** moved to `src/pages/pay/coffer/`; the pre-7e copies are in `baseline/*before-07e*`.

Not covered:
- **A pool mixing networks:** not refused (07b).
- **The bridge:** not changed.
- **Wyatt's look at Tips in a browser:** still pending.
- **The Cloudflare spike site:** still runs an older build with the old paths.

State:
- dev site stopped; ports 4321, 4322 and 8099 free
- about 5.1 GB available
- `xmr-bridge` and `monerod-stagenet` active
- **`plugin/docs/installation.md`:** steps 2 and 3 with the `/pay/coffer/` paths, **uncommitted, waiting for Wyatt.** 1,786 of 2,000 graphemes; `emdash-plugin validate` passes.

Next:
1. Wyatt approves the installation text, which is then committed.
2. Wyatt looks at Tips in the admin. Start the site with `tmux new -d -s site -c ~/sites/xmr-dev-site 'npm run dev; exec bash'`, then sign in through the tunnel. Stop it with `tmux kill-session -t site`.
3. Push and CI.
4. Wyatt closes phase 07.
5. Phase 07b (its list includes refusing a pool that mixes networks).

### 2026-10-18 (later) · Wyatt's three new notes

- **`step3.md` done** (`7b079fe`): installation step 3 is Wyatt's text, the tip endpoint required.
  - **The snippet drops `currency="USD"`:** `TipButton`'s prop is optional (default USD) and not tied to the admin page's setting; checkout prices a fiat tip in the form's currency, whatever the site's (`tip-checkout` test).
  - **For Wyatt:** a EUR site still needs `currency="EUR"` on the button, or its suggested amounts show in dollars. The text no longer says so.
  - 1,789 of 2,000 graphemes; `emdash-plugin validate` passes.
- **Spec change 39, the return link:** logged, for release 1 before 07b. **Found:** `TipButton` already sends `returnTo` (path only), used today only for the tip endpoint's error and fallback pages. Proposed: one field, with the shared validator replacing `backPath()`. Waiting for Wyatt's decisions A–C and plan approval.
- **Spec change 40, the tip overlay:** logged for release 1.x or 2, nothing built.
- **The dev site** is running under `astro dev` (started by Claude, in the background) for Wyatt's click-through. Stop it with `npx astro dev stop` in the site folder.

Next:
1. Wyatt's decisions on spec change 39.
2. Session 7f builds it, plan first.
3. Then Wyatt's look at Tips, the push, closing phase 07, and 07b.

## 2026-10-18 (night MDT; 2026-10-19 UTC) · Phase 07 · Session 7f: a way back from the pay page (spec change 39)

Wyatt's choices:
- the top link only, in every state
- an optional `siteName`
- theme only, with the path in the URL
- reuse `returnTo`

Built (theme only; local, not pushed):

| Commit | What |
| --- | --- |
| `ee482fb` | `safeReturn()` (`theme/src/back.ts`): a same-origin `pathname + search`, or null. Refuses other origins, schemes, `//`, `\`, control characters, over 512 characters, and `/pay/coffer` or `/_emdash`, also through dot segments and percent-encoding. 5 tests, the note's list |
| `16eebee` | TipButton's `returnTo` carries the query; `tipEndpoint` checks it in place of `backPath()` (its error pages follow the same rules) and adds `?return=` to the 303 |
| `46757a7` | `preparePayPage` checks `?return=` again; PayPage's top link in every state: "← Back", or "← Back to {siteName}" (default "the site"). One `.coffer-back` CSS rule |

Tests (from this session's output):
- **Theme:** 65 pass and 1 skips, with zbar required. Typecheck clean.
- **Plugin and scripts:** unchanged, not rerun.

Live, on the running dev site (`~/xmr-pay-dev-data/7f-live-back.txt`):
- The Welcome post's form carries `returnTo=/posts/welcome`.
- A tip post answered 303 to `/pay/coffer/<token>?return=%2Fposts%2Fwelcome`, and that page links `href="/posts/welcome"` "← Back".
- A hand-edited `?return=//example.com`, and no `return` at all, both give `href="/"` "← Back to the site".
- A post with `returnTo=//example.com` gets no `return` in its 303.
- **Two more unpaid tips** (0.0002 XMR and any amount) will expire.
- **Wyatt's click-through in the browser:** pending.

For 07b's pass 1: open-redirect attempts through `returnTo` and `?return=`, double encoding, and Unicode look-alike slashes (spec change 39). Tested now: `%2F`, `%5F` and `%70`, plus dot segments.

State:
- **The dev site** is still running under `astro dev` (Claude-started, in the background) for Wyatt. Stop it with `cd ~/sites/xmr-dev-site && npx astro dev stop`.

Next:
1. Wyatt clicks through: the tip button, the pay page's back link, and Tips in the admin.
2. Push and CI.
3. Wyatt closes phase 07.
4. Phase 07b.
- **Pushed** `ff7041f..24a067e` on Wyatt's OK; **CI run 39189564660 passed** (plugin, theme, bridge with the race-detector tests).

## 2026-10-18 · Phase 07 · Done: closed by Wyatt

Phase 07's done criteria are met:
- **A stagenet tip from the dev site's tip button settles:** tips A and B in 7c, paid from Feather, reached "Tip received" without a reload.
- **The release-1 switch is off and tested both ways:** `vitest.goods.config.ts` locally and in CI.
- **Per-entry totals on the admin page:** the Tips view (7b). Wyatt clicked through it in a browser on 2026-10-18, along with the tip button and the pay page's way back.
- **Tests cover every amount mode and the purge:** plugin `tip-checkout` and `admin-tips`, theme `tip.test.ts`.
- **CI is green** on `24a067e` (run 39189564660). The last counts: plugin default 251 and switch-on 92 (7e), theme 65 and 1 skip (7f), scripts 17.

Built in phase 07 beyond the phase file:
- **Spec changes 33, 34 (deferred) and 35 B:** Node-only for release 1, a clean refusal on Cloudflare, and the watch-scan fix.
- **The tip endpoint's cross-site refusal and the toolbar placeholder** (7c).
- **Spec change 36's release-1 items** (7e): `/pay/coffer/` paths; the network byte checked at sync; asset, chain and network stored; four new status fields.
- **Spec change 39, the way back** (7f).
- **The installation text** with the required tip button (`7b079fe`, Wyatt's wording).

Carried over:
- **For 07b:** the surfaces added during phase 07 are listed for the setup session in `docs/phases/07b-adversarial-testing.md`, "For the builder". They include refusing a pool that mixes networks (not built; Wyatt decides whether pass 1 fixes it or reports it).
- **Release 1.x or 2:**
  - spec change 35 A (the 10-call redesign for Cloudflare)
  - spec change 40 (the tip overlay)
  - spec change 37 (same-machine wallet host; release 1 or 1.1 is Wyatt's call)
- **Phase 08:**
  - spec change 36's adapter, method IDs and coexistence test
  - the PayButton at `/pay/coffer/<token>`
- **Phase 09:**
  - spec change 28 item 2
  - the mainnet second-node list
  - trusted publishing for `@cofferhq/astro`
  - the `trustedProxyHeaders` setup line
  - EUR sites need `currency="EUR"` on TipButton; the installation text no longer says so (Wyatt's step 3)
- **Timing for Wyatt:** the FCMP++ spike (spec change 38), recommended after 07b pass 1. Two ground rules need his word first: testnet or stressnet use, and verifying beta binaries not signed by the pinned key.
- **Dev release:** `0.0.202610161433-dev.e360e6c` lacks the bridge's `UNSUPPORTED_PLATFORM` hint (`3139f79`). Rebuild with the next bridge change.
- **Cloudflare spike site:**
  - It runs an older build: the long banner, and the old `/pay/` paths.
  - Its token expires 2026-10-30.
  - Teardown is Wyatt's, in `spikes/cf-runner/SETUP.md` steps 11–13.
- **Spec text for Wyatt to fold into the live spec:**
  - 14 (the Coffer rename)
  - 32 (the pay page's status fields)
  - 33 (tips never late)
  - 35 (Cloudflare)
  - 36 (paths, stored coin fields, status fields, the sync's network byte)
  - 39 (the pay page's way back)
- **Test flake, not fixed:** `admin-health`'s first test can hang when it's the first after a fresh build (the test host's D1 isn't migrated yet).

## 2026-10-18 · End-of-night handoff

State:
- **Git:** `main` at `24a067e` on GitHub (CI green). This handoff's docs commit is local, to push at the start of the next session.
- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions; no `astro dev` running
  - about 5.2 GB available
  - `xmr-bridge` and `monerod-stagenet` active
- **Dev site:**
  - pay files at `src/pages/pay/coffer/` (pre-7e copies in `~/xmr-pay-dev-data/baseline/`)
  - dev data restored after 7e's `dev-e2e` run, plus the 7e and 7f test tips (unpaid; they expire)
  - the plugin build in `plugin/dist` is 7e's (`06bc905`); 7f changed only the theme, which the site links

Before 07b pass 1 (Wyatt; from the phase file's checklist):
1. Put the security matrix in the repo as `docs/security-matrix.md` (export the Claude Doc "Coffer — Security Traceability Matrix" as Markdown). Its first audit runs first, if it hasn't yet.
2. Decide C01–C06 in `docs/spec-changes.md`, or accept that undecided candidates are only probed and reported.
3. Feather's buyer wallet: at least eight separate unlocked stagenet amounts.
4. Snapshot the dev box in Proxmox as `pre-redteam-1`.
5. Optional: decide now whether pass 1 should fix the mixed-network pool or only report it.

Next session (after the checklist): phase 07b setup, the builder session.

    Phase 07b, adversarial testing pass 1, setup. Read docs/phases/07b-adversarial-testing.md and docs/progress.md, then plan the setup work in "For the builder".

## 2026-10-20 · Between phases: the repo rename (spec change 41 item 10) and spec change 41 logged

Wyatt's note `~/xmr-pay-dev-data/notes/spec-change-release-readiness.md`, read against EmDash's updated plugin docs. He renamed the GitHub repository to `dwightsabeast/coffer` (decision E) before the session; GitHub's API resolves the old name to the same repository.

Done:

| Commit | What |
| --- | --- |
| `ddc05e2` | **Rename, tests first.** Three failing tests first: the manifest's `repo` and `security` URLs (`plugin/tests/manifest.test.ts`), the unit's `Documentation=` (`TestUnit`), and the new `scripts/repo-name.test.mjs` (no tracked file but the history names the old repository). Then the manifest, the Go module path (`github.com/dwightsabeast/coffer/bridge` and `…/oracle`, 50 files' imports; no `go.sum` change), the unit, `scripts/ci-status.py`, CLAUDE.md and the phase 00 links, and a decided row |
| `2db9fef` | **Spec change 41 logged** (proposed): items 1–10, the check against the code, and four still-to-decide rows (A–D) |

Dev box: `origin` is now `git@github.com:dwightsabeast/coffer.git` (kept on SSH, not the note's https URL, which has no credentials here); `git fetch` works through the deploy key.

Tests (run 2026-10-20):
- **Bridge:** gofmt and `go vet` clean, `go test ./...` all packages ok. The oracle module: gofmt and vet clean, tests ok (gpgv 2.4.7). Static build: statically linked; `go version -m` shows `github.com/dwightsabeast/coffer/bridge/cmd/xmr-bridge`; the old name appears 0 times in the binary.
- **Plugin:** default 252 and switch-on 92 pass (one skip each); typecheck clean; `emdash-plugin validate` passes; bundle 58.3 KB across 3 files.
- **Scripts:** `node --test scripts/*.test.mjs`, 18 pass.
- **Not run locally:** the theme (untouched) and the race-detector tests.
- **CI on `2db9fef`** (run 39515411441, after Wyatt's push OK): bridge (with the race-detector tests and the oracle checks), plugin and theme all success, read with `scripts/ci-status.py` at its new URL.

Open:
- **Push: done.** Wyatt approved; `24a067e..2db9fef` pushed to `dwightsabeast/coffer` (last night's handoff `977b6b6`, the rename, the docs commit), and CI is green (above).
- **Wyatt's PC clone:** `git remote set-url origin <its scheme>…dwightsabeast/coffer.git` (the old URL keeps working through the redirect meanwhile).
- **The dev box's installed bridge** keeps the old `Documentation=` URL until its next install or update (harmless).
- **Dates:** plugin-cli 0.13.4 passes the 7-day age on 2026-10-22; EmDash 1.3.1 on 2026-10-25.
- **The `INVALID_PLUGIN_UI_CONTEXT` icon bug** (item 4) has no record here; a setup-friction row from Wyatt's details.

**Wyatt's decisions (later the same day):** A, automated releases with provenance required and approval for every release; B, wait for EmDash 1.3.1 to come of age on 2026-10-25 (no exclude); C, release 1 is 1.0.0; D, the listing text approved as written, and item 3's ranges with Astro's floor at the tested 7.3.5 (`env:astro >=7.3.5 <8.0.0`). Recorded in `docs/decisions.md` (decided rows) and spec change 41.

Next step: on or after 2026-10-25, before 07b, the "7g: EmDash 1.3 check" session (items 3, 4, 9: the upgrade checklist against 1.3.1, plugin-cli 0.13.4, `release.requires`, the listing text). The phase 09 file now carries items 1, 2, 5–8 and decisions A and C (steps 3, 4 and 6, the checklist, and release 2's version). The 2026-10-18 handoff's before-07b checklist still stands.

## 2026-10-20 · End-of-session handoff

State:
- **Git:** `main` at `a165ded` on GitHub, CI green on every commit pushed today (`2db9fef`, `5baf369`, `a427c60`, `a165ded`). This handoff's commit is local, to push at the start of the next session.
- **Repository:** `dwightsabeast/coffer` (renamed from `EmDash-MoneroPay`; GitHub redirects the old name). The dev box's `origin` is `git@github.com:dwightsabeast/coffer.git`. Wyatt's PC clone still to repoint (any time; the redirect covers it meanwhile).
- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions; no `astro dev` running
  - about 5.0 GB available
  - `xmr-bridge` and `monerod-stagenet` active (the installed unit keeps the old `Documentation=` URL until its next install or update; harmless)
- **Dev site:** unchanged since the 2026-10-18 handoff.

Today: the repo rename (spec change 41 item 10, `ddc05e2`); spec change 41 logged and accepted with Wyatt's A–E (automated releases with required provenance and approval per release; wait for EmDash 1.3.1 until 2026-10-25; release 1 is 1.0.0; the listing text as written, Astro's floor at the tested 7.3.5; the repo name `coffer`); phase 09 updated to match (`a427c60`).

Dates:
- 2026-10-22: `@emdash-cms/plugin-cli` 0.13.4 passes the 7-day age.
- 2026-10-25: EmDash 1.3.1 passes it; 7g can start.
- 2026-10-30: the Cloudflare spike's token expires (teardown is Wyatt's, `spikes/cf-runner/SETUP.md` steps 11–13).

Open for Wyatt:
- The `INVALID_PLUGIN_UI_CONTEXT` icon bug (spec change 41 item 4) has no record in the repo: its details, for a `docs/setup-friction.md` row and 7g's check.
- The 2026-10-18 handoff's before-07b checklist still stands (the security matrix in the repo, C01–C06, Feather's buyer amounts, the `pre-redteam-1` snapshot).

Next session (on or after 2026-10-25, before 07b): 7g, the EmDash 1.3 check (spec change 41 items 3, 4, 9). No phase file exists for it yet; the plan comes from spec change 41.

    Session 7g, EmDash 1.3 check. Read docs/progress.md and spec change 41 in docs/spec-changes.md (items 3, 4, 9 and Wyatt's decisions), then docs/emdash-upgrade-checklist.md, and plan the upgrade to EmDash 1.3.1 and plugin-cli 0.13.4, release.requires, and the listing text.

## 2026-10-23 · Between phases: publisher account and icon logged

Wyatt's note `~/xmr-pay-dev-data/notes/publisher-and-icon.md` contains information for release 1, not a design change. The publisher DID was already in the manifest, so there's no new spec change.

Done:

| Commit | What |
| --- | --- |
| `52f809f` | **Logged.** `plugin/images/coffer-icon.png`, Wyatt's pixel-art chest (256×256 PNG, 855 bytes, sha256 `d345be91…`, the same as the note's copy), not declared in the manifest yet. Phase 09: the Atmosphere account (`dwightsabeast.tngl.sh` on Tangled's PDS, `publisher` stays the DID, listing `@dwightsabeast.tngl.sh/coffer`), the headless login through an SSH tunnel, automated publishing enabled (create-only grant), release setup waiting for 7g and 1.0.0, its answers, the required logout, and the first tagged run. `docs/decisions.md`: a decided row, and a note on decision A. `docs/setup-friction.md`: the headless login row |

Wyatt's decisions (same day): logging out of `emdash-plugin` on the dev box is **required** once release setup is committed and working; the icon goes into the repo now; phase 09 gives `pnpm exec emdash-plugin release setup` (the note's "this repo uses npm" was a slip: `plugin/` is pnpm, and `npx --no-install` runs the same pinned CLI). Committed SSH steps say "your SSH shortcut to the dev box", never an alias or an address.

Tests (run 2026-10-23): `emdash-plugin bundle --validate-only` 58.3 KB across 3 files before and after (the icon isn't packed); `emdash-plugin validate` passes; `node --test scripts/*.test.mjs` 18 pass. Docs and an image only, so the plugin, theme and bridge suites weren't run.

Open:
- **An Atmosphere CLI session is on the dev box** (Wyatt's login, 2026-10-23) until the logout after release setup. Claude doesn't read or use it.
- Release setup waits for 7g (plugin-cli 0.13.4, `release.requires`) and for phase 09's manifest work (1.0.0, `release.artifacts.icon`).
- Not pushed: `52f809f` and this entry wait for the start of 7g (Wyatt, 2026-10-23).

Next step: session 7g on 2026-10-25 (Wyatt), before 07b. Push these two commits first, with Wyatt's OK, then the 2026-10-20 handoff's 7g prompt. 7g also does the manifest side of this note where it falls in 7g: plugin-cli 0.13.4 and `release.requires`. Version 1.0.0, `release.artifacts.icon` and release setup stay in phase 09.

## 2026-10-23 · End-of-session handoff

State:
- **Git:** `main` at `9e9a1b7`, clean. GitHub has `5e6f084`; this session's `52f809f` and `9e9a1b7`, and this handoff's commit, are local and wait for the start of 7g (Wyatt).
- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions; no `astro dev` running
  - about 5.9 GB available
  - `xmr-bridge` and `monerod-stagenet` active
  - Wyatt's `emdash-plugin` login session is saved here until the required logout after release setup (phase 09). Claude doesn't read or use it.
- **Dev site:** unchanged since the 2026-10-18 handoff.

Today: Wyatt's publisher-and-icon note logged (`52f809f`, `9e9a1b7`). Publisher account `dwightsabeast.tngl.sh` (the DID stays in `publisher`). Icon at `plugin/images/coffer-icon.png`, not in the manifest yet. Phase 09 has the headless login, release setup's answers and the required logout. Plus a decided row and a setup-friction row. No code changed.

Dates:
- 2026-10-25: EmDash 1.3.1 passes the 7-day age; 7g runs that day (Wyatt).
- 2026-10-30: the Cloudflare spike's token expires (teardown is Wyatt's, `spikes/cf-runner/SETUP.md` steps 11–13).

Open for Wyatt:
- The push of the three local commits, at the start of 7g.
- The `INVALID_PLUGIN_UI_CONTEXT` icon bug (spec change 41 item 4): its details, for a `docs/setup-friction.md` row and 7g's check.
- The 2026-10-18 handoff's before-07b checklist still stands.

Next session (2026-10-25): 7g, the EmDash 1.3 check (spec change 41 items 3, 4, 9). Push first, with Wyatt's OK. No phase file exists for it; the plan comes from spec change 41.

    Session 7g, EmDash 1.3 check. Read docs/progress.md and spec change 41 in docs/spec-changes.md (items 3, 4, 9 and Wyatt's decisions), then docs/emdash-upgrade-checklist.md, and plan the upgrade to EmDash 1.3.1 and plugin-cli 0.13.4, release.requires, and the listing text.

## 2026-10-25 · Session 7g: EmDash 1.3 check (spec change 41 items 3, 4, 9)

Coffer moves from EmDash 1.1.0 to 1.3.1, with `release.requires` and the listing's description. Wyatt raised the floor to 1.3.1 at the start (amending decision D), decided spec change 37 A (release 1.x), and put spec change 42's wording in phase 09.

Done:

| Commit | What |
| --- | --- |
| `ed05338`, `8ece26a` | **Docs, before the installs.** Spec change 42 proposed: since EmDash 1.2.0 (#3744) a plugin's `ctx.site.url` follows `siteUrl` and the Site URL setting before the setup address. Decided rows: the 1.3.1 floor; spec change 37 A (the same-machine option in release 1.x; B and C open) |
| `80309b8` | **Plugin dev dependencies:** `emdash` 1.3.1, plugin-cli 0.13.4, plugin-test 0.2.10. Strict 7-day age, no exclude (installed after 19:20 UTC). The EmDash family only, plus one emnapi variant. Bundle unchanged |
| `4db9a53` | **Manifest:** `release.requires` (`env:emdash >=1.3.1 <2.0.0`, `env:astro >=7.3.5 <8.0.0`), the peer `>=1.3.1 <2.0.0`, the new short `description`, and `sections.description` from `plugin/docs/description.md` (Wyatt's approved text). Two new tests in `manifest.test.ts` (written first, failing until this commit). Trust contract unchanged |
| `b404907` | **Theme:** `emdash` 1.3.1; peers `astro >=7.3.5 <8`, `emdash >=1.3.1 <2`; a comment in `status.ts` |
| (this commit) | **Docs:** `walletHostSite`'s comment in `plugin/src/admin.ts` gives the 1.3.1 order (spec change 42 item 2). `docs/emdash-upgrade-checklist.md`: rows for the site address, storage and the toolbar rewritten, a new row for stored cursors, and a "Checked against" section with each row's result on 1.3.1 (item 4). Spec change 41: D's amendment, items 3, 4, 9 built. Spec change 42: items 2 and 4 built. `docs/setup-friction.md`: four rows (the age rule counts from the UTC publish time; the dev site's npm install changed 86 versions; the changelog findings; the icon bug) |

**Dev site:** now on `emdash` 1.3.1 and `@emdash-cms/sandbox-workerd` 0.9.5 (`npm install … --before=2026-10-18T20:30:00Z`). It stays there for 07b.
- **The install:** 86 versions changed through the site's `^` ranges, all published before the 7-day cutoff (each checked). `npm audit signatures`: 3,439 verified. `npm audit`: 17 findings before, 14 after (the critical `dompurify` gone, none new). `workerd` unchanged.
- **Backups** in `~/xmr-pay-dev-data/baseline/`: `data.db.before-7g-20261025T2033Z`, `package.json.before-7g` and `package-lock.json.before-7g`. Also the reset's `data.db.before-setup-test-20261025T203749001Z` (restored after `dev-e2e`) and `data.db.before-restore-20261025T203828149Z`.

Tests (all run 2026-10-25, on 1.3.1):
- **Plugin:** typecheck clean; validate passes; bundle 58.3 KB across 3 files, before and after. `pnpm test` 252 passed + 1 skipped and 92 + 1 after the bump (the same as on 1.1.0), then 254 + 1 and 92 + 1 with the manifest tests. The workerd tests' 45 "uncaught exception" lines are the same on 1.1.0 (checked in a temporary worktree, removed after). This commit changes only a comment in `admin.ts`: typecheck and the bundle check rerun, the suites not.
- **Theme:** `COFFER_REQUIRE_ZBAR=1 pnpm test` 65 passed + 1 skipped; typecheck clean.
- **Scripts:** `node --test scripts/*.test.mjs` 18 of 18.
- **Live, `astro dev`:**
  - `dev-e2e.mjs` 32 of 32 after a reset; the dev data restored after (`~/xmr-pay-dev-data/7g-e2e.txt`)
  - signed in, the pay page has one `id="emdash-toolbar"` (the placeholder) and no client toolbar bootstrap; CSP set
  - the admin page: setup address `http://localhost:4321`, so the red banner; with an `Origin` of `https://pay.example.invalid`, that origin is used (spec change 42, as on 1.1.0)
- **Live tip:** #288 (`7g-tip2`, 0.002 XMR) from Wyatt's Feather wallet: seen at 21:18:13 UTC, 1 confirmation at 21:22:17, settled at 21:23:17 with the installed bridge. Tx `3705be8d…f837`, height 2,236,597, pool index 288. The first try, #287, expired unpaid at 21:09 while Wyatt was away.
- **Built copy (4322, workerd):** the pay page for #288 answered 200 with "Paid" and no third-party references. `curl -I`: CSP, `cache-control: private, no-store`, `referrer-policy: no-referrer`, `permissions-policy`, `nosniff`, `x-robots-tag: noindex, nofollow`.
- **Wyatt in the browser:** the "Plugin pages" icon still fails with `INVALID_PLUGIN_UI_CONTEXT` on 1.3.1; the Monero payments page looks right.
- **Not run:** the bridge suites (no bridge change), the Cloudflare spike (row read only, as Wyatt chose), CI (nothing pushed yet).

Open:
- **Not pushed:** `ed05338` to this commit wait for Wyatt's OK. CI last ran green on `37b046b`.
- Spec change 42 item 3 (the admin page's wording and the Settings › General fix): phase 09, exact text to approve then.
- Spec change 37 B and C: open.
- The icon bug's upstream issue: Wyatt's to post.
- Optional cleanup, any phase: Coffer's 98-id batches in storage reads are no longer needed on the 1.3.1 floor.
- `npm audit` on the dev site still lists 14 findings through EmDash's own dependencies (`zod`, `undici`, `vite`, `sharp` and others); dev site only, nothing shipped.
- Feather's buyer wallet paid 0.002 XMR today: 07b's checklist wants at least eight separate unlocked amounts.

Next step: push, with Wyatt's OK, and check CI on the new head. Then the 2026-10-18 handoff's before-07b checklist (the security matrix in the repo, C01–C06, Feather's buyer amounts, the `pre-redteam-1` snapshot), then 07b's setup session.

## 2026-10-25 · End-of-session handoff

State:
- **Git:** `main` at this commit. GitHub has `37b046b`. `ed05338` through this commit are local and wait for Wyatt's OK.
- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions besides Claude's; no `astro dev` running
  - about 4.9 GB available
  - `xmr-bridge` and `monerod-stagenet` active
  - Wyatt's `emdash-plugin` login session is still saved here until the logout after release setup (phase 09). Claude doesn't read or use it.
- **Dev site:** EmDash 1.3.1, sandbox-workerd 0.9.5. Dev data restored after `dev-e2e`, plus #287 (expired) and #288 (settled). The plugin build in `plugin/dist` is from `4db9a53`'s source.

Dates:
- 2026-10-30: the Cloudflare spike's token expires (teardown is Wyatt's, `spikes/cf-runner/SETUP.md` steps 11–13).

Next session: 07b setup, after the before-07b checklist.

    Phase 07b, adversarial testing pass 1, setup. Read docs/phases/07b-adversarial-testing.md and docs/progress.md, then plan the setup work in "For the builder".

## 2026-10-25 · Before 07b: the security matrix's tagging session

Wyatt's `docs/security-matrix.md` (audited at `37b046b`) is now the live copy in the repo. This session tagged the tests behind each row, corrected the rows that disagreed with the code at `eb63872`, logged C02–C06 as spec change 43, and added the matrix rule to CLAUDE.md. No feature or test logic changed; only test names did.

Done:
- **Tags.** 155 plugin tests, 29 theme tests and 50 Go tests carry `[ID]` tags (each vitest name differs only by its tag, checked against the diff). Every T, P, R and F row has at least one, except P01 (no test yet). Several IDs are written as `[T03][F01]`. Go: the body goes inside one tagged `t.Run`; top-level names are unchanged, so `-run TestName` still works. C rows aren't tagged. `grep -rn '\[T05\]' plugin/tests theme/tests bridge` lists a row's tests.
- **Matrix corrections:**
  - **T01:** `release.requires` is tested (manifest, added in `4db9a53`).
  - **T02:** the token's shape is tested (22 base64url characters); its random source is in code only.
  - **T03:** Partial → **Covered**. "a new pairing replaces the old key" checks the old key's next sync gets `BAD_SIGNATURE`.
  - **T04:** the tested boundaries are 300 s (accepted) and 301 s (refused), not 299 and 301.
  - **T10:** `TestStartsAndBecomesReady` checks `--rpc-bind-ip 127.0.0.1`.
  - **T15:** `TestSameMachine` refuses the dev flag on mainnet, so the stagenet-only condition is tested. Other same-machine and config tests added.
  - **T20:** the address, claim and theme tip tests added.
  - **R09:** `TestRestoreHeight` exists in both installer and syncclient; both are named.
  - **C02:** `TestBridgeNothingToDo`'s "older version" case already tests the downgrade.
  - New count: 32 Covered, 15 Partial, 1 Planned, 1 Gap.
- **Spec change 43** (proposed): C02–C06 with the evidence and the matrix's suggested decisions; a still-to-decide row in `docs/decisions.md`.
- **CLAUDE.md:** the matrix in "Where the truth lives". "How we work" item 3, as Wyatt worded it after review: a test that covers a matrix row carries its ID; layout and wording tests need none; a new test of security behavior with no row gets its row first; a phase closes only after its rows are updated. Also a decided row in `docs/decisions.md` and a line under the matrix's "Tagging tests".

Tests (all run 2026-10-25, after the tags; counts match the run before them):
- **Plugin:** typecheck clean; validate passes; bundle 58.3 KB across 3 files (unchanged); `pnpm test` 254 passed + 1 skipped, then 92 + 1 with the switch on (the same as 7g).
- **Theme:** `COFFER_REQUIRE_ZBAR=1 pnpm test` 65 passed + 1 skipped; typecheck clean.
- **Bridge:** gofmt clean, `go vet` clean. `go test -json ./...`, before and after: the same 238 top-level tests passed and 9 skipped (the live tests), with identical names and results. Subtests 118 → 168: the 50 tagged wrappers, all passing.
- **Not run:** scripts' `node --test` (no script changed), live and stagenet checks, CI (nothing pushed).

Rows still not Covered, with the smallest test that would close each:

| Row | State | Smallest closing test |
| --- | --- | --- |
| T01 | Partial | Host test: `ctx.http.fetch` to a host outside `allowedHosts` is refused, and reading an undeclared storage collection throws. Provenance and passkey approval: phase 09's first release run |
| T02 | Partial | 07b's data-at-rest scanner after a full payment: no view key, wallet-rpc login or plaintext code in storage, KV or settings |
| T08 | Partial | Pass 1: 07b's manual admin-page injection check, recorded. Pass 2: Block Kit tests for the email and refund address with the tip note's hostile strings |
| T10 | Partial | Manual, recorded: `ss -tlnp` on the wallet host (wallet-rpc on 127.0.0.1 only, nothing from the bridge) and `ss -tnp` over a sync cycle (only the site, node(s) and release hosts) |
| T15 | Partial | 07b's scanner (as P01) |
| T20 | Partial | Host test: a sync carrying a mainnet subaddress to a stagenet site's pool is refused. It fails today (needs code; 07b, written first) |
| T21 | Partial | Host test with the switch off: every route and admin action, including product checkout's body and the All invoices action, reaches no order path |
| T23 | Partial | Theme test: rendering TipButton on a page sets no response header, and only `preparePayPage` sets the CSP and privacy headers |
| T18 | Gap | Theme or host test: two checkouts from one `requestMeta.ip` with different `X-Forwarded-For` / `CF-Connecting-IP` land in the same per-client bucket, and a spoofed header can't fill another visitor's bucket |
| P01 | Planned | 07b's scanner: no view key in storage, KV, settings, logs or the site's database after setup and a payment |
| P03 | Partial | 07b's scanner, after checkouts with `requestMeta.ip` set: no raw IP anywhere |
| R04 | Partial | Live stagenet: one invoice paid in two parts (`dev-invoices.mjs pay-script` with two fractions), recorded here |
| R05 | Partial | Live stagenet: restart the bridge, then the site, between "seen" and "settled"; one payment, counted once, recorded here |
| R11 | Partial | Runtime test: one sync over a 20,000-row backlog on the Node runner, timed under 30 s |
| F01 | Partial | Protocol tests: a body with a duplicate JSON key (`{"seq":1,"seq":2}`), and a seeded loop of random bytes; Go fuzzing in 07b |
| F03 | Partial | Host test: `status` with a 10,000-character token gets the same `INVOICE_NOT_FOUND` reply as an unknown one, with no stack or internal ID |
| F04 | Partial | Runtime test: the admin route called anonymously, as a non-admin, and without `X-EmDash-Request` is refused (EmDash's checks, guarded here) |

Open:
- **Not pushed:** `ed05338` through these commits wait for Wyatt's OK. CI last ran green on `37b046b`.
- Spec change 43 (C02–C06): Wyatt's decision, before 07b.
- R06–R09's 3h evidence is still to attach to the matrix from this file's 3h entries (07b setup).

Next step: push, with Wyatt's OK, and check CI on the new head. Then the rest of the before-07b checklist (spec change 43's decisions, Feather's buyer amounts, the `pre-redteam-1` snapshot), then 07b's setup session.

### 2026-10-25 (later) · Spec change 43 decided; pushed

Wyatt accepted spec change 43's suggested decisions:
- **New rows:** C02 → T26 (Covered), C03 → T27 (Partial), C04 → T28 (Planned), C06 → T29 (Partial).
- **C05** is deferred to release 1.x and reported as a known limit.
- **Newly tagged** (existing tests only, nothing new written): `TestBridgeNothingToDo`'s "older version" case and `TestNewer` [T26]; `TestPlainHTTPRefused` [T16][T27]; `TestNeverPrinted`, `TestWalletErrorsDontLeakSecrets` and `TestInstallLog` [T29].
- **Matrix:** 33 Covered, 17 Partial, 2 Planned, 1 Gap.

More rows not yet Covered:

| Row | State | Smallest closing test |
| --- | --- | --- |
| T26 | Covered (bridge) | The `monero-wallet-rpc` update path's downgrade case isn't checked: a `TestWalletRPCUpdate` case offering an older signed wallet-rpc |
| T27 | Partial | Go: the sync client and the downloader each refuse an `httptest.NewTLSServer` whose certificate isn't in the trust store (07b) |
| T28 | Planned | CI steps: `govulncheck` (dependency ask first: `golang.org/x/vuln`, the Go team) and `pnpm audit` (built into pnpm; scope and level to set, since EmDash's dev dependencies already carry advisories) |
| T29 | Partial | 07b: scan the journal and the install transcript after a real install for the view key, the wallet-rpc login and the pairing code |

Tests: `go test -json ./...` after the new tags: 238 top-level passed and 9 skipped, the same as before. Subtests 168 → 172 (four more wrappers). gofmt and vet clean. Plugin and theme unchanged since the run above.

Next step: CI on the pushed head, then the before-07b checklist (Feather's buyer amounts, the `pre-redteam-1` snapshot), then 07b's setup session. T28's dependency ask goes to Wyatt when its CI steps are built.

## 2026-10-25 · End-of-session handoff (the tagging session)

State:
- **Git:** `main` at this commit. GitHub has `4da98fc`. CI run 40240444825 on `4da98fc` passed: bridge (with the race-detector tests), plugin and theme. GitHub already had `eb63872` before this push, so the earlier entry's "Not pushed: `ed05338` through these commits" was out of date: the push carried only this session's five commits.
- **Dev box:**
  - dev site and built copy stopped; ports 4321, 4322 and 8099 free; no tmux sessions besides Claude's; no `astro dev` running
  - about 4.9 GB available
  - `xmr-bridge` and `monerod-stagenet` active
  - Wyatt's `emdash-plugin` login session is still saved here until the logout after release setup (phase 09). Claude doesn't read or use it.
- **Dev site:** unchanged this session (EmDash 1.3.1, sandbox-workerd 0.9.5; #287 expired, #288 settled).

Today:
- `docs/security-matrix.md` is in the repo as the live copy.
- 184 vitest names and 55 Go tests carry matrix tags (54 `t.Run` wrappers and one table case).
- The matrix rows were corrected against the code.
- Spec change 43 was decided: C02, C03, C04 and C06 are now T26–T29, and C05 is deferred to release 1.x.
- The tagging rule is in CLAUDE.md and `docs/decisions.md`.
- The matrix now stands at 33 Covered, 17 Partial, 2 Planned and 1 Gap.
- No feature or test logic changed.

Dates:
- 2026-10-30: the Cloudflare spike's token expires (teardown is Wyatt's, `spikes/cf-runner/SETUP.md` steps 11–13).

Open for Wyatt:
- The rest of the before-07b checklist: Feather's buyer amounts (at least eight separate unlocked amounts; 0.002 XMR went on #288) and the `pre-redteam-1` snapshot.
- T28's dependency ask (`govulncheck`, `golang.org/x/vuln`) and `pnpm audit`'s scope and level, when its CI steps are built.
- Still open from 7g: spec change 37 B and C, and the icon bug's upstream issue.

For 07b, from the matrix:
- The rows not yet Covered are listed in the two tables above, each with the smallest test that would close it.
- 07b brings the data-at-rest scanner (P01, P03, T02, T15), the journal scan (T29), T27's certificate test, T20's mixed-network test (written first, failing) and the fuzzing (F01).
- R06–R09's 3h evidence is still to attach to the matrix.
- Each new test that covers a row carries its tag (CLAUDE.md, "How we work" item 3).

Next session: 07b setup, after the before-07b checklist.

    Phase 07b, adversarial testing pass 1, setup. Read docs/phases/07b-adversarial-testing.md, docs/progress.md and docs/security-matrix.md, then plan the setup work in "For the builder".

## 2026-10-26 · Phase 07b pass 1 · Session 1: setup (builder)

Branch `redteam-1` (local, not pushed). The setup list in `docs/phases/07b-adversarial-testing.md`, "For the builder". No Coffer code changed (`plugin/src`, the bridge's non-test files, the theme): only docs, scripts, test helpers and the canary spike. Wyatt's ruling at the start: the mixed-network pool (T20) is fixed in pass 1 through the normal finding flow (`docs/decisions.md`).

Done:

| Commit | What |
| --- | --- |
| `f185c85` | **Docs.** The catalog's matrix IDs brought up to date: C01 is now T22, C02/C03/C04/C06 are T26–T29, and C05 is probed and reported as a Known limit. New catalog section L for the surfaces added in phase 07, each mapped to an existing row: the tip endpoint (T17, F07); IP-header spoofing (T18); the Cloudflare refusal (T19); the way back (T22); the mixed-network pool (T20); coexistence (T23); the watch scan's cap (R11, R13). Matrix: R06–R09 carry their 3h and 3i evidence; T20 notes the ruling |
| `845f833` | **`scripts/redteam/lib.mjs`**, moved out of `dev-e2e.mjs`, which now imports it. Loopback guard (no user info, redirects not followed), RFC 8032 test keys, signed syncs, fake addresses, the KV-shortcut code, cleanup, `flood()` (at most 50 in flight, stops under 1.5 GB available), evidence paths, `VACUUM INTO` backups (`backup.mjs`) |
| `309492a` | **`plugin/tests/redteam/`**: `random.ts`, a seeded sfc32 with hostile generators (`REDTEAM_SEED` reproduces a failure), and `harness.ts`, `redteamHost()` with signed and tampered syncs, raw checkout, status, a price stub, and `checkoutAs(meta, …)`. The test host's `transport.invokeRoute` takes `meta.ip` and `meta.geo`, so the IP and Cloudflare attacks can run at the Host layer |
| `5d9a9db` | **`bridge/internal/hostile`**: scripted hostile servers (stream, drip, hang, cut, redirect, untrusted TLS, JSON-RPC, a rewriting proxy), test-only. Wiring in `hostile_test.go` beside syncclient, crosscheck (the offline dishonest-node proxy), noderpc, walletrpc and selfupdate (the release host over https). monerodl's test server is already https |
| `cd3cfc3`, `bfa177d` | **Sandbox canary** `spikes/sandbox-canary/` (slug `coffer-canary`, Coffer's exact manifest, 14 probes and a spin route). It builds with `plugin/`'s toolchain through a symlink, so nothing is installed. `canary-site.mjs on\|off\|status` loads it on the dev site and restores `astro.config.mjs` byte for byte. `canary.mjs` runs the probes; the network probes aim at a loopback listener the driver runs, so nothing reaches another machine. `bfa177d` came out of the first live run: the probes had aimed at example.com, and "allowed" was too coarse |
| `fabb937` | **`scripts/redteam/scan-at-rest.mjs`**, run under `with-shop-env.sh`. It scans a `VACUUM INTO` copy (cell by cell, then raw), the live `-wal` and the dev log for the view key in six encodings, `--code-file` codes, `--secret-file` secrets, `--ip` addresses in their spellings, and IP-shaped text in Coffer's rows. A FAIL gives the location, never the value |
| (this commit) | CLAUDE.md: five red-team command rows; the script-test command now includes `scripts/redteam/`. This entry |

Baseline: `~/xmr-pay-dev-data/redteam/baseline-1.db` (`VACUUM INTO`, mode 600), taken before anything touched the dev database: 38 invoices, 338 pool rows, 8 KV rows, 1 setting.

Tests (all run 2026-10-26):
- **Scripts:** `node --test scripts/*.test.mjs scripts/redteam/*.test.mjs` 41 pass (18 before, plus lib 14, canary-site 3, scan-at-rest 6). Mutations caught: the user-info check, the memory stop, a value printed in a FAIL line, a missing encoding.
- **Plugin:** typecheck clean; validate passes; bundle 58.3 KB across 3 files (unchanged); `pnpm test` 260 passed + 1 skipped (254 + the 6 harness tests), then 92 + 1 with the switch on.
- **Bridge:** gofmt and vet clean; `go test ./...` all packages ok (`internal/hostile` 3 runs with `-count=3`, no flakes); static build statically linked; `go list -deps ./cmd/xmr-bridge` has no `hostile`.
- **Live, dev site (`astro dev`):**
  - Reset with `setup-test-reset.mjs`, then the canary on, then the site started.
  - `dev-e2e.mjs` 32 of 32 after the move to `lib.mjs` (`~/xmr-pay-dev-data/redteam/07b-setup-dev-e2e.txt`).
  - The canary's 14 probes each answered, and a 3 s spin ran.
  - The scanner gave PASS on the reset database (a smoke run only; the real scan after a payment and a pairing is the attacker's row I).
  - Then the site stopped, the canary off (hash-checked), and the dev data restored: the same counts as the baseline. Ports 4321, 4322 and 8099 are free; no `astro dev` running; no tmux sessions.
- **Not run:** the theme (untouched), the race-detector tests (CI only), CI (nothing pushed).

**Canary smoke results, recorded as seen and not graded** (the attacker judges them in G1 and G2; `~/xmr-pay-dev-data/redteam/canary-2026-10-26T151549273Z.txt`):
- Raw `fetch`: EmDash's "Direct fetch() blocked in sandbox" with HTTP 403. The listener got nothing.
- `ctx.http` to 127.0.0.1, through user info, and to `api.kraken.com.localhost`: refused by the host check.
- `ctx.http` over **plain http to an allowed host** answered (Kraken's `/0/public/Time`, HTTP 200).
- With only `content:read`, `ctx.media` and `ctx.taxonomies` exist and carry **write methods** (media upload, delete and updateMetadata; taxonomy createTerm, addEntryTerms and removeEntryTerms). The probe lists them but doesn't call them, so whether a call succeeds is still to test.
- No `content.create`, undeclared storage throws, Coffer's rows, KV and setting are invisible to the canary, no `process`, and no `node:fs`.
- **Spin, 3 s:** the only status request, sent as the spin started, took 3039 ms. That suggests other routes wait behind a spinning one; the 60 s run (G2) measures it.

Open:
- **Not pushed:** `redteam-1` stays local until the fixes and the retest are done (Wyatt, 2026-10-26). Don't push it before then; Wyatt merges and pushes after the retest. He took the Proxmox snapshot `pre-redteam-1b` of the dev box at the end of this session, with setup done, in place of a push.
- **Wyatt, before round 1:**
  - Feather's buyer wallet needs at least eight separate unlocked amounts.
  - ~~The `pre-redteam-1` Proxmox snapshot~~: done as `pre-redteam-1b` (2026-10-26, after setup). Roll back to it if a flood or fuzzing run leaves the box in a bad state.
- **Left for the attacker or fix sessions, not built here:**
  - fuzz targets (none yet in syncclient, walletrpc or noderpc)
  - T27's certificate tests (the TLS helpers are ready)
  - T20's failing test
  - floods
  - the wallet-host `sudo` scan wrapper (T29; the scanner's `--secret-file` and `--log` are ready for it)
  - the live TLS proxy for the spec change 28 man-in-the-middle row (a builder session adds it if the plan needs it)

Next session: the attacker's plan round, in a fresh session.

    Phase 07b attacker, pass 1, plan. Start with the Attacker brief in docs/phases/07b-adversarial-testing.md; its reading order replaces the usual one.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 2: plan (attacker)

Branch `redteam-1` (local, not pushed). Fresh attacker session. No Coffer code read for the attack design yet (that waits for round 2 white box); the plan is built from `docs/spec.md`, `docs/security-matrix.md` and the catalog. After Wyatt's approval I read spec changes 33 and 34 and confirmed the theme exposes no public tip surface (`PayPage.astro`, `TipButton.astro` only; per-entry totals live in `admin.ts`, admin-only).

Done:
- **`docs/redteam-plan.md`** — pass 1 section. Every pass-1 matrix row (T01–T31, P01–P04, R01–R13, F01–F07, C05 as probe-and-report) mapped to concrete attacks in catalog groups A–L, each with layer, steps and a break condition. Coverage checklist maps every row to its attacks. Rounds: round 1 black box (A, B, C, D-via-route, G, H, L, plugin-side F); round 2 white box re-aims E/F/G/J from the source.
- **`docs/security-matrix.md`** — two new rows added (Wyatt approved): **T30** (per-entry tip totals count only settled tips; Planned, covered by attack A11) and **T31** (forged-tip total inflation bounded; Planned, covered by D6). A proposed public-display row was dropped: spec change 34 deferred and no public tip surface exists, so A12 checks that absence under T08/P03.

Wyatt's decisions (2026-10-26), folded into the plan:
- E5 (live TLS MITM): Go `httptest` approximation this pass; T27 covered by one self-signed-server test per client; the live MITM row deferred to phase 09, recorded as deferred not a pass.
- `govulncheck` (T28): run ad hoc, outside the repo's `go.mod`, pinned ≥7 days old; no CI change this session.
- Fixed-amount tips: TipButton sends set amounts, so R04 underpay (settles at floor) and overpay run live in pass 1 (spec change 33) — attacks K6, K7.
- Heavy runs: keep caps (≤50 in flight, stop <1.5 GB, one at a time); fuzzing 10 min/target; large backlog once to the 20,000-row cap; stop and tell Wyatt before rolling back to `pre-redteam-1b` if the box degrades.
- G1: at most one confirming sandbox write on the dev site; if it lands, write it up for Wyatt to report to EmDash privately and don't probe further.

Tests: none run this session (planning only; no code changed).

Open:
- **Not pushed:** `redteam-1` stays local until the fixes and retest are done (Wyatt, 2026-10-26).
- Wyatt, before round 1: Feather's buyer wallet needs at least eight separate unlocked amounts (for group K). `pre-redteam-1b` snapshot is the roll-back point.

Next session: round 1, black box, in a fresh session.

    Phase 07b attacker, pass 1, round 1. Start with the Attacker brief in docs/phases/07b-adversarial-testing.md; its reading order replaces the usual one.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 3: round 1, black box (attacker), interim note

Branch `redteam-1` (local). Written mid-session at Wyatt's instruction for safety stops; the full session entry follows at the end of the session.

- Committed so far: `af6f5c4` (checkout, status and IP-cap attacks; RT-01 to RT-05) and `23fcdce` (bridge/sync without the key; RT-06, RT-07). Findings in `docs/redteam-findings.md`.
- **Safety stops:** two responses were stopped by a safety classifier. The first came right after `23fcdce`, at the end of group C, before any later group's work began; nothing was lost. The second came while writing the **B2 suite** (admin row actions, `plugin/tests/redteam/admin.test.ts`). Per Wyatt (2026-10-26): commit what's done, note the group here, and move on to the next group without retrying. The partial B2 file was deleted, not committed. **B2 is not run this round**; its plan rows (F04, T07, T13 through the admin page) stay open for round 2 or the retest, and Wyatt decides how.

### Round 1 checkpoint (Host and Theme layers done)

Committed, all green (no Coffer code changed):

| Commit | Group(s) | Suite | Findings |
| --- | --- | --- | --- |
| `af6f5c4` | A, L2, L3 | `plugin/tests/redteam/checkout.test.ts`, `ipcap.test.ts` | RT-01 to RT-05 |
| `23fcdce` | C | `plugin/tests/redteam/sync.test.ts` | RT-06, RT-07 |
| `120c59c` | D (D1–D6 only, Wyatt's limit) | `plugin/tests/redteam/stolen-key.test.ts` | RT-08, RT-09 |
| `d0a0d7a` | L1, A9/L4, L6, A5 | `theme/tests/redteam.test.ts` | RT-10 |
| `7bd450f` | L5 | `plugin/tests/redteam/network.test.ts` | RT-11 |

Findings (`docs/redteam-findings.md`): RT-11 High (mixed-network pool, the pre-agreed one); RT-05, RT-07, RT-08 Medium; RT-01–04, RT-06, RT-09, RT-10 Low. All open.

Full suites after the new files: plugin **308 passed, 13 expected fail, 1 skipped**; goods config **92 passed**; theme **73 passed, 1 expected fail, 1 skipped**; typecheck and bundle (58.3 KB) clean. The 13 + 1 expected-fail are the RT it.fails, one per landed attack (RT-06 covers three: unknown fields, duplicate keys, out-of-range numbers).

**Not yet run in round 1** (all need the running dev site, and some need Wyatt), left for the live stretch or a follow-up:
- **B1** — call `admin` anonymously, as a logged-in non-admin, and without `X-EmDash-Request`. Needs Wyatt to create one lowest-role non-admin user through the dev sign-in (he agreed); remove it or let `setup-test-reset.mjs` remove it at the end.
- **B2** — admin row-action abuse. Skipped after a safety stop (see the interim note above); not retried. Open for round 2 or the retest.
- **A3 render** — Wyatt views hostile tip notes on the admin page through the tunnel (his check; the checklist is handed over when the notes are seeded).
- **Live:** C4 (proxy-added Origin/Authorization on a signed sync), A6/F06 (spoofed Host/X-Forwarded-Host), C5 (a ~60 s drip body vs. the 30 s wall), the live half of L2 (EmDash's real IP-header handling), A8/C6 on the Node runner.
- **Canary:** G1, G2 (`scripts/redteam/canary-site.mjs on`, start the site, `canary.mjs`, then off).
- **Heavy:** H2 (checkout/status flood, to name a rate-limit number) and H1/L7 (large backlog, watch-scan cap). `free -m` first, one at a time, `pre-redteam-1b` is the roll-back point.
- **K** payments stay for round 2 (plan).

No safety stop since the B2 one. This checkpoint is a durable point before the live stretch; the full session entry follows at the session's end.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 3 continued: round 1 live stretch (attacker)

Branch `redteam-1` (local). After the Host/Theme checkpoint (`bb7bf3f`), the live dev-site attacks that need EmDash's own runtime. The dev DB was backed up first (`~/xmr-pay-dev-data/redteam/round1-live-2026-10-26T185213579Z.db`, VACUUM INTO) and restored to baseline (38 invoices, 338 pool rows) at the end. The box is clean: ports 4321/4322/8099 free, no tmux, no `astro dev`.

Done (committed):

| Commit | Group(s) | What |
| --- | --- | --- |
| `4943cd3` | G1, G2 | Sandbox canary. G1: network isolation and capability gating hold; a one-write follow-up (a `taxonomy-write` probe added to the canary) was refused `Missing capability: taxonomies:write`, so the exposed write methods don't work under `content:read`. G2: the 30 s wall stops a 60 s spin, but a concurrent `status` was blocked the full 30 s → **RT-12** (plugin requests serialize on the Node runner). Also recorded for Wyatt: plain http to an allowed host is accepted (EmDash enforcement, upstream). Canary turned off, `astro.config.mjs` restored and hash-checked |
| `5255821` | A6/F06, L2 live, C5 | New `scripts/redteam/round1-live.mjs`. A6/F06: a spoofed `Host`/`X-Forwarded-Host` is never reflected. L2 live: 8 tips from one spoofed IP all go through, no `state:buckets` written → a Node site's cap is site-wide only (as the spec states). C5: a slow drip body is read past the 30 s wall → **RT-13** (Low), but the event loop isn't blocked so the site stays responsive (slowloris, proxy territory). C4 stays covered by `dev-e2e`'s header checks |
| (this entry) | H2 | Observation only (no finding): the site sustained a capped status flood (≤50 concurrent, 300 req) at ~250–320 req/s with no outage or memory pressure. Consistent with RT-12 |

Findings now RT-01…RT-13 (`docs/redteam-findings.md`). High: RT-11. Medium: RT-05, RT-07, RT-08, RT-12. Low: the rest. All open.

**Gotcha for later sessions:** `cleanupCofferRows` (lib.mjs) deletes **all** `pool` and `invoices` rows, not just a run's, so the live scripts wiped the dev DB's baseline fixtures; restored from the start-of-session backup with `setup-test-reset.mjs --restore`. Back up and restore around any live run that calls it.

**Round 1 still not run** (need Wyatt and/or a dedicated run):
- **B1** — anonymous / non-admin / no-`X-EmDash-Request` calls to `admin`. The anonymous and no-session cases are already exercised by `dev-e2e` (401/403); the **logged-in non-admin** case needs Wyatt to create one lowest-role user through the dev sign-in.
- **B2** — admin row-action abuse. Skipped earlier after a safety stop; not retried. Open for round 2.
- **A3 render** — Wyatt views hostile tip notes on the admin page through the tunnel.
- **H1/L7** — large-backlog sync timing and the 200-page watch-scan cap (heaviest; seed thousands of invoices, time each sync under 30 s). Best with Wyatt watching memory; `pre-redteam-1b` is the roll-back point.
- **K** — real stagenet payments (round 2, per the plan).

No safety stop in the live stretch. Next: round 2 (white box, fresh session) per the plan, or the remaining live items (B1 non-admin, A3, H1) with Wyatt. The full session entry / sign-off is this plus the checkpoint above.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 4: round 1 leftovers (attacker), interim note

Branch `redteam-1` (local). The items not run in round 1 were B1, A3, B2 and H1/L7. Plan approved by Wyatt: the script inserts the B1 test users, H1 seeds just past the 200-page cap, and A3 runs this session.

- **B2 done:** `39d177d`, `plugin/tests/redteam/admin.test.ts`. Filed **RT-14** (Low, F04): a forged Mark settled or Expire on an open tip, which the release-1 page doesn't offer, is accepted. Everything else held (details under RT-14). Plugin 322 passed, 14 expected fail, 1 skipped; goods config 92 passed, 1 skipped; typecheck clean; bundle 58.3 KB.
- **Session helpers:** `db6d9fe`, `scripts/redteam/lib.mjs` (`cookieOf`, `magicTokenFrom`, `devAdminSession`, `magicLinkSession`, `adminCall`), lib tests 16 passed.
- **Safety stop:** a response was stopped by a safety classifier after the helpers' tests passed and before the B1/A3 live script was written. Following Wyatt's rule from the B2 stop, what was green is committed and B1/A3 is not retried this session. **B1 (non-admin sign-in) and A3 (seeded hostile notes and Wyatt's admin-page check) stay open** for round 2 or the retest, and Wyatt decides how. Nothing touched the dev site or `data.db`: no users were inserted, no backup was needed, and the site wasn't started.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 4 continued: H1/L7 large backlog (attacker)

Branch `redteam-1` (local). After the B2/helpers commits and the B1/A3 safety stop, the heaviest round-1 item: a large backlog on the live dev site. New script `scripts/redteam/backlog-live.mjs` (`seed`/`run`). `data.db` backed up (`~/xmr-pay-dev-data/redteam/round1-h1-20261026T195027Z.db`), seeded 20,100 settled stagenet tips + 1 open probe (~20,139 invoice rows), ran, then restored to baseline (38 invoices, 338 pool, bridge key present). Box clean: ports free, no `astro dev`, ~4.9 GB available.

Found a snag while building it (recorded so later sessions don't relearn it): the pairing sync must be **under 4 KiB** (the spec's parse-before-signature limit), so a pair body carrying 60 addresses is verified against the *old* key and gets `BAD_SIGNATURE`; pair with an empty body first, then push addresses in a second signed sync. Also the plugin caps each sync at **100 addresses and 100 snapshots, and 32 transfers per snapshot** (101/101/33 → `INVALID_BODY`); over any cap the whole sync is refused (measured exactly after the run, correcting the “~128” first seen live).

Results (evidence `~/xmr-pay-dev-data/redteam/h1-2026-10-26T195804512Z.txt`):
- **RT-15 (Medium, R11/R13), filed:** every sync's watch scan took **~28 s** at 20,100 invoices (pair 27.7 s, first 27.9 s, under-flood 28.6 s) — all under the 30 s wall but within ~2 s of it. Spec change 35 estimated ~0.2 s at 15,000. Measured in `astro dev`; the built copy should be measured before trusting a production number (follow-up). Likely dominated by building/bounds-checking the ~20,000-entry `watch` response.
- **Cap and warning hold (R13):** the watch truncated to 20,001 of ~20,103 candidates, and the admin Health banner fired ("The watch list hit its safety cap… more recent invoices existed than Coffer reads in one sync (20,000)…").
- **L7 passed:** during a 28.6 s sync, 35/40 capped checkouts got an address (the 5 refusals are the site-wide 40-open cap), slowest 2.1 s — async paging doesn't block the event loop like RT-12's CPU spin did.
- **Not truly exercised:** the probe (highest index) landed *inside* the capped watch, so a genuine past-cap late-payment wasn't produced (the 102 dropped candidates were others). Noted in RT-15 as a follow-up.

Matrix updated: R11 coverage now notes the live 30 s-wall measurement and RT-15; R13 notes the cap banner verified live. CLAUDE.md gained a command row for `backlog-live.mjs`.

Findings now RT-01…RT-15. High: RT-11. Medium: RT-05, RT-07, RT-08, RT-12, RT-15. Low: the rest. All open.

**Round 1 still not run:** B1 (logged-in non-admin to `admin`) and A3 (Wyatt's admin-page render check of hostile tip notes) — both stopped by a safety classifier this session and not retried; open for round 2 or the retest, Wyatt decides. B2 was done earlier this session. K (real stagenet payments) stays for round 2 per the plan.

Next: round 2 (white box, fresh session) per the plan, or B1/A3 with Wyatt.

## 2026-10-26 (later) · Phase 07b pass 1 · Session 4: follow-ups logged (attacker)

Two follow-ups from the H1 run, at Wyatt's instruction:
- **RT-15 built-copy re-measure (pending, next session).** RT-15's ~28 s/sync was measured in `astro dev` (dev mode) on this loaded box. Re-measure on the **built copy** (`npm run build` then the `built` tmux session on port 4322, workerd) before the production number is trusted: seed the same ~20,100 backlog, run `scripts/redteam/backlog-live.mjs run --site http://127.0.0.1:4322`, and record the per-sync time there against the dev-mode number. One heavy run, `free -m` first, restore `data.db` after.
- **Snapshot/address per-sync caps → matrix C07.** Pinned exactly with the plugin test host: 100 addresses, 100 snapshots, 32 transfers per snapshot; 101/101/33 give `INVALID_BODY`. Added as candidate **C07** in `docs/security-matrix.md` (the bridge–plugin batching contract) for a fix-phase decision — not a finding (the caps are intentional and the bridge already batches), but the two sides' numbers aren't tied to a shared constant. Script comment and the note above corrected from the imprecise live "~128".

## 2026-10-28 · Phase 07b pass 1 · Session 5: round 2, white box (attacker), interim note

Branch `redteam-1` (local). Fresh attacker session; plan approved by Wyatt (order: record A3/B1, then the live block with K and I2, then `coffer-test` F1/F4, then the plugin and bridge white-box attacks, the built-copy re-measure and the dependency checks).

- **A3 and B1 recorded** from Wyatt's manual run (2026-10-29 UTC, dev site, EmDash 1.3.1) as round 1 Manual-layer evidence in `docs/redteam-findings.md`: both PASS. Three Low findings filed from his note: **RT-16** (Coffer's sidebar link and dashboard widget show to a Subscriber, with no data), **RT-17** (the refusal shows raw JSON in EmDash's banner), **RT-18** (a Zalgo note's marks spill outside its line). RT-16 and RT-17 look like EmDash's admin shell (no per-role field for plugin pages or widgets); round 2 checks the installed package. Matrix T08 and F04 coverage notes updated.
- **The baseline has moved.** Wyatt's A3 checks added 7 tip invoices (2026-10-29, 01:00 to 01:24 UTC) and used pool addresses; they stay as evidence. The "38 invoices, 338 pool rows" baseline from the setup session is out of date: this session's first backup sets the new one, recorded below when it's taken.

**Round 2, Step 1 (live block) done, 2026-10-29 UTC.** Baseline backup `~/xmr-pay-dev-data/redteam/round2-k.db`: 45 invoices (tips 12 settled, 16 expired; products 10 settled, 6 expired, 1 review), 345 pool rows (295 claimed, 50 free, top index 345), 8 KV rows, 1 settings row (the bridge key). All of K and A13 passed on stagenet with Wyatt's Feather payments (K4 is the stated untouched-tip watch limit), I1 passed, J1 passed, A8 didn't reproduce RT-04 on the Node runner, C6 reproduced RT-07 live; details in `docs/redteam-findings.md`, "Pass 1, round 2". Post-payment backup `round2-post-k.db` (55 invoices, 355 pool rows: 305 claimed, 50 free); the dev site was restored to it after the live runs and checked row for row, and the dev box's bridge synced again with its own key. Site stopped. Snag: Feather has no "Pay to many"; several destinations go in its Pay to field as `address, amount` lines (wording fixed in the docs). I2 (journal scan) is with Wyatt for review.

## 2026-10-28 · Phase 07b pass 1 · Session 5: round 2 (attacker), paused for the night: handoff

Branch `redteam-1` (local, not pushed). Paused at Wyatt's request after the plan's Step 0 and Step 1. The approved plan is `/home/dev/.claude/plans/phase-07b-attacker-pass-shimmering-kahn.md` (outside the repo); its order (Wyatt): Step 0, Step 1 with I2, **Step 4 (`coffer-test`) next**, then Steps 2, 3, 5, 6, 7.

Done (commits `7e4d745`, `394169b`, `139c761`, and this entry's):
- **Step 0:** Wyatt's manual A3 and B1 (2026-10-29 UTC) recorded as round 1 Manual-layer evidence, both PASS; **RT-16** (sidebar link and dashboard widget shown to a Subscriber), **RT-17** (raw JSON refusal banner), **RT-18** (Zalgo marks spill outside a note's line) filed, all Low. RT-16/17 look like EmDash's admin shell (no per-role field for plugin pages or widgets); Step 2 confirms in the installed package.
- **Step 1, live block:** K1–K7 and A13 on stagenet from Wyatt's Feather wallet, all PASS (K4 is the stated untouched-tip watch limit); I1 at-rest scan PASS; J1 (SIGKILL mid-sync) PASS; A8 on Node doesn't reproduce RT-04; C6 reproduces RT-07 live 3 of 3. Results in `docs/redteam-findings.md`, "Pass 1, round 2".
- **Matrix** coverage updated for T02, T05, T13 (now Partial: RT-07), P01 (now Covered), P03 (now Covered), R01, R02, R03, R04 (now Covered for tips), R05, R06, R12.
- **Docs:** "Feather's pay-to-many" corrected (Feather takes several `address, amount` lines in its Pay to field) in the phase file, the tips-first plan change and the attack plan. CLAUDE.md gained rows for `round2-live.mjs` and the two dev-only helpers.
- **New script:** `scripts/redteam/round2-live.mjs` (`a8`, `c6`, `j1`). Dev-only helpers kept outside the repo in `~/xmr-pay-dev-data/redteam/tools/`: `feather-paylist.cjs` (Feather payment lists; stops on a missing address) and `counts.mjs` (read-only row counts).
- **Two feedback memories** saved: baseline counts drift (take them from the session's backup), and `sudo` scripts are shown to Wyatt first with secrets passed on stdin.

Tests run this session: live scripts only (A8 all checks PASS; C6 6 expected FAILs, the RT-07 race; J1 all checks PASS; I1 scan exit 0). No plugin, theme or bridge suite was run: no Coffer, test or harness code changed. `node --check` on the new script.

State at the pause:
- **Dev site** stopped, `data.db` restored to `~/xmr-pay-dev-data/redteam/round2-post-k.db` (55 invoices: tips 21 settled, 17 expired; products 10 settled, 6 expired, 1 review; 355 pool rows: 305 claimed, 50 free; 8 KV rows; the bridge key), checked row for row; the dev box's bridge synced again with its own key at 02:55 UTC. No tmux sessions; ports 4321, 4322 and 8099 free.
- **The baseline** for this round is `round2-k.db` (45 invoices, 345 pool rows); the setup session's 38/338 is retired.
- An unused pairing code (for I1) was issued at 02:51 UTC; it expired at 03:06 and is in the restored backup as an expired code. It unpaired nothing.

Open, for the next session:
1. **I2** (T29, T02): `~/xmr-pay-dev-data/07b-i2.sh` is written and tested against planted fake secrets; **Wyatt is reviewing it** before he runs it (`~/xmr-pay/scripts/with-shop-env.sh ~/xmr-pay-dev-data/07b-i2.sh`; output `07b-i2-output.txt`). The wallet-rpc login lives only in memory after start-up (`supervise.go` deletes its file), so the script looks for its shape (`xmr-bridge:` + 43 characters, `rpc-login`) and checks the file is gone; a bare password without its user name isn't caught (Go `TestNeverPrinted` covers that path).
2. **Step 4 (`coffer-test`, F1 and F4), waiting on Wyatt:** (a) the Cloudflare tunnel route for `dev.wyattdilley.com` back up, pointed at the built copy on 4322 (the installer needs an https public site); (b) whether run A's node container (CT 107) is running, then the organizer's read-only "Node caught up" check. Then the plan's Step 4 order: reset (that backup is the restore point), build and serve the dev release on the LAN (Wyatt signs it), patch the plugin and start the built copy, Wyatt installs with the phase-05 tester shop wallet from Feather, F1, then F4 (installed files' hashes compared before and after a refused tampered install), then restore, rebuild the plugin, check the dev box's bridge, Wyatt takes the route down and rolls `coffer-test` back to `blank`. Each `sudo` script is shown to Wyatt first.
3. **Steps 2, 3, 5, 6, 7** as planned. Leads already noted from reading `plugin/src/core/invoice.ts`, `sync/merge.ts`, `sync/handle.ts`, `sync/protocol.ts` and `sync/pairing.ts` (Step 2 turns them into tests):
   - **C2's "seq far above the last accepted" was never run** (catalog T04). `seq` isn't tied to the signed `x-xmr-ts`; one signed snapshot with a far-future `seq` would make every later honest snapshot for that invoice be ignored (`mergeSnapshot`: `at.seq <= inv.seq`), and push an untouched tip off the watch. Needs the bridge key.
   - **`height` has no bound** but `Number.isSafeInteger`, and the stored height never goes down (`Math.max`): a huge reported height would stick, and feed every later invoice's `createdHeight` and a pairing's suggested `restoreHeight`. With a key that's beyond Wyatt's D1–D6 limit, so ask before attacking it that way; Step 3 checks whether a dishonest remote node can push the bridge's reported height (E4), which needs no key.
   - Snapshots apply to any invoice their index names, watched or not; K4 shows the bridge doesn't report unwatched indexes. Step 3 confirms from `bridgeloop`.
   - RT-07's cause: `pairingCodeMatches` then `setPublicKey`/`setPairing` aren't atomic.
4. Step 5 (RT-15 built-copy re-measure) and Step 6 (`pnpm audit`, `govulncheck`: name the exact version to Wyatt first) unchanged.

Next session's first step: ask Wyatt for the I2 result (or run it with him), then Step 4's two questions (tunnel route; CT 107 running), and carry on from the plan.

    Phase 07b attacker, pass 1, round 2 (continued). Read the "Session 5 … handoff" entry at the end of docs/progress.md and the plan at /home/dev/.claude/plans/phase-07b-attacker-pass-shimmering-kahn.md, then carry on from Step 4.

## 2026-10-30 · Phase 07b pass 1 · Session 6: round 2 continued (attacker), interim note

Branch `redteam-1` (local). Plan: `/home/dev/.claude/plans/phase-07b-attacker-pass-shiny-cerf.md` (Step 4 `coffer-test`, then Steps 2, 3, 5, 6, 7 of the Session 5 plan, with Wyatt's changes).

- **I2 recorded: PASS** (Wyatt ran it 2026-10-30 15:03 UTC; 0 failures, positive control found, journal 40,941 lines). `docs/redteam-findings.md`; matrix T29 (Covered for pass 1) and T02. Setup-friction row: the script had no execute bit.
- **For pass 2, fix `07b-i2.sh` before reusing it:** report an unreadable source as "not checked" instead of hiding `grep`'s error; search transcripts in subfolders (`05-setup/` and others); check each transcript once (`3g-reinstall-output.txt` was listed twice).
- **Step 4 checks done in planning (read-only):** run A's node is caught up (PASS, 2,239,997), but F1 uses run B's remote node so the cross-check runs (a LAN node counts as the shop's own and switches it off). The dev site's `data.db` matches `round2-post-k.db` (55 invoices, 355 pool rows), which holds the dev box bridge's key (same fingerprint in every round 2 backup; last accepted sync 2026-10-29 02:55:22 UTC). `~/xmr-pay-dev-data/redteam/tools/counts.mjs` looked for the key in KV rows, where it never is; it's in `options` (`plugin:coffer:settings:bridgePublicKey`).

## 2026-10-30 · Phase 07b pass 1 · Session 6: Step 4 (`coffer-test`, F1 and F4) done

Branch `redteam-1` (local). Plan: `/home/dev/.claude/plans/phase-07b-attacker-pass-shiny-cerf.md`.

- **Code under test:** `main` `e8e195a`. The dev release `0.0.202610301609-dev.2d7a29d` was built from `2d7a29d`, byte-identical to `main`'s build with a fixed version (only test files differ in `bridge/`). Hashes are in `docs/redteam-findings.md`, "Install layer: F1 and F4".
- **F1 (T10): PASS.** Listeners, wallet-rpc's 401, flags, file modes and unit sandboxing as expected. Every outbound peer is explained; second nodes appeared only after the test tip was mined. Matrix T10 is Covered for pass 1.
- **F4 (T16, T15): PASS.**
  - A tampered binary was refused at the checksum, and the working install stayed byte-for-byte the same.
  - F4c on a blank container: Ctrl-C at the view-key prompt left the machine unchanged, both with Enter only and with the person carrying on.
- **New findings:**
  - RT-19 (Low): the pairing code is checked last.
  - RT-20 (**Medium, proposed: Wyatt rules**): behind a proxy that ends https, the tip endpoint refuses every tip as cross-site. Expected-fail theme test.
  - RT-21 (Low): the dev flag's mainnet refusal comes after the view-key prompt.
  - RT-22 (Low): Ctrl-C at an installer prompt is ignored, then a misleading node error.
  - RT-23 (Low): `Node check: ok` with nothing checked, or stale.
- **Observations:**
  - What the cross-check's second nodes learn (new matrix row P05).
  - Cloudflare's injected analytics beacon blocked by Coffer's CSP (T09/T23 working; the install docs could mention it).
- **Lost or void runs, my script errors:** the first F1 watch (cleanup trap on Ctrl-C) and the first F4(a) (empty script). Both were re-run. Two installs failed on the pairing code (RT-19). Two setup-friction rows added.
- **Restore:**
  - The route is down and `coffer-test` rolled back to blank (Wyatt), before the built copy stopped.
  - The site was restored from `baseline/data.db.before-setup-test-20261030T160842897Z`: 419 Coffer rows, 0 different; 55 invoices, 355 pool rows; the dev box's bridge key `2c00d25866f4`.
  - The plugin was rebuilt with the placeholder.
  - The dev box's bridge synced at 20:08:49 UTC.
  - Site stopped. No tmux sessions; ports 4321, 4322, 8099 and the temporary forwarder's 4399 are free.
  - The test state before the restore is kept in `~/xmr-pay-dev-data/redteam/round2-f1-after.db`.

Tests run: theme `pnpm test` (73 passed, 2 expected fail, 1 skipped) and `pnpm run typecheck` (clean). No plugin or bridge code changed.

Open, for the next steps:
1. **Step 3 adds Go tests** for RT-21 (prompt order), RT-22 (Ctrl-C with the context cancelled), RT-23 (the status text), and P05 (exactly what a second node is sent). Step 3 also checks whether the site's admin page shows RT-23's stale "ok".
2. **Wyatt rules on RT-20's severity.**
3. **Steps 2, 3, 5, 6, 7 as planned**, including the far-future `seq` finding and the chain-height lead.

Next step: Step 2 (plugin white box), site stopped.

## 2026-10-30 · Phase 07b pass 1 · Session 6: Step 2 (plugin white box) done

- **RT-20 ruled (Wyatt):** Medium, **blocks release 1**.
  - **Fix for the fix phase:** also accept EmDash's configured public origin (`siteUrl`), the way EmDash's own CSRF check does, keeping every existing refusal. The expected-fail theme test is the https-Origin-over-plain-http case; its fixture gets `siteUrl`, plus a twin with none configured that is still refused.
  - **Phase 09 item:** check the tip button live through a real proxy that ends https.
  - **T17 now says a post with no `Origin` passing is intended.** It's non-browser clients, held by the same caps as the checkout route. Correction to the premise: on a Node site with no trusted-proxy setup there is no per-client bucket (round 1, live L2), so only the site-wide cap applies.
- **New tests**, `plugin/tests/redteam/whitebox.test.ts`:
  - **RT-24 (Low, T04):** a far-future `seq` freezes an invoice and drops an untouched expired tip from the watch. 2 expected fails.
  - **E4, plugin side (T14/R09):** a high reported height sticks and moves later invoices' heights and a re-pair's suggested restore height into the future. 3 passing tests recording this, as evidence for Step 3.
  - **J4 (R10):** a confirming tip whose payment vanishes goes back to `new`, raises no alert and expires normally. Matrix R10's wording was corrected to the spec: `reversed` is for settled invoices.
  - **J3 (R05, T07):** an admin expire racing a settling sync kept the admin's decision in all 42 test-host rounds, either request first. It's a guard, not a proof: the Node runner interleaves requests (RT-07).
  - **RT-25 (Low, P04):** an undecided review loses its buyer data 30 days after review began. Expected fail.
- **Root causes added:**
  - **RT-02:** `rates.ts:42–43` takes Kraken's only entry, whatever its key.
  - **RT-07:** check and burn are two writes (`handle.ts:102–107`).
  - **RT-16 and RT-17, confirmed upstream in EmDash 1.3.1:** no role field on admin pages and widgets; the admin UI prints the raw refusal in its "Plugin Error" banner.
  - **RT-06 and RT-14** already had theirs.
- **J2:** covered by round 1's C2 tests. The missing Health line for clock skew is C05 (deferred). I3's base case is the existing admin-tips purge test.

Tests:
- **Plugin `pnpm test`:**
  - **First run:** 3 failures, all in `tests/redteam/checkout.test.ts`. The T19 L3 checkout tests hit the 30 s wall-time limit, with the known "no such table" cold-start errors in the log. The L3 test passes alone in under 1 s.
  - **Second full run:** green. Default config: 327 passed, 17 expected fail, 1 skipped. Goods config: 92 passed, 1 skipped.
  - Recorded as a flake, not fixed.
- **Plugin checks:** `typecheck` clean, `validate` valid, bundle 58.3 KB, validation passed.

Next step: Step 3 (bridge white box). It includes the RT-21, RT-22, RT-23 and P05 Go tests, the chain-height question (can a dishonest remote node push the reported height; read `wallet2`'s refresh in `~/work/monero-v0.18.5.1`), and the release build's update constants.

## 2026-10-30 · Phase 07b pass 1 · Session 6: Step 3 (bridge white box) done

- **RT-25 ruled (Wyatt):** the matrix's reading. For an invoice in review, the 30-day clock starts at the admin's decision.
- **RT-26 (Medium proposed, T14/R09):** a dishonest remote node can push the reported chain height without the key.
  - **How:** wallet-rpc's `get_height` is the length of the chain its node served (`wallet2.h:1230`), and `wallet2` appends blocks without a proof-of-work check (`wallet2.cpp:3023–3056`).
  - **On the site:** the height sticks (`Math.max`), and a re-pair's suggested restore height, which the installer uses as given, lands in the future.
  - **Tests:** Go test, skipped until fixed; Step 2's plugin tests show the consequence.
- **RT-27 (Medium proposed, T15/new F08):** the bridge takes the site's `poolTop` (up to 2^32−1) and `poolTarget` unbounded. One reply starts a catch-up toward 4.29 billion subaddresses, and a billion-sized target makes every sync create 100 more. Go tests, skipped.
- **Go tests for RT-21, RT-22 and RT-23**, skipped until fixed. Each skipped test (and RT-26's and RT-27's) was run once without its skip and failed for its finding's reason.
- **Passing tests:**
  - P05: exactly what a second node is sent.
  - T27 (now Covered): untrusted certificates refused by the sync client, the updater and the Monero downloader.
  - F08/E2: 100 MB, drip, hang and cut replies.
  - T10: the release build's update schedule.
- **Observation:** `moneroaddr` doesn't check the checksum (by design). A checksum-only typo fails only at wallet creation, after pairing.
- **Fuzz:** new `FuzzParseReply` (9,799,866 runs) and `FuzzParse` (46,843,150 runs), 10 minutes each. No crasher.
- **Matrix:** new row F08 (bridge reading the site's replies). T27 is Covered. Notes on T10, T14, T15, R09, R13 and P05.

Tests: bridge gofmt clean, `go vet ./...` clean, `go test ./...` all packages ok; `go list -deps ./cmd/xmr-bridge` has no `hostile`.

Not done from the old plan's Step 3 list, for the next session or pass 2:
- **E4/E5 beyond what exists:** both nodes lying, both unreachable, a reordered block. Round 1's `TestLiarHarness` and the cross-check tests cover one liar.
- **E6/E7:** covered by `TestGetTransfersRefusesBadValues`.
- **F2/F3:** covered by the selfupdate and monerodl tests (T16, T26), apart from T26's still-open wallet-rpc downgrade case.
- **J1, bridge side:** covered by `TestPendingSurvivesFailureAndRestart`.

Next step: Step 5 (RT-15's built-copy re-measure), then Step 6 (`pnpm audit`, `govulncheck`: name the exact version to Wyatt first), then Step 7 (close the round).

## 2026-10-30 · Phase 07b pass 1 · Session 6: Step 5 (built-copy re-measure) done

- **RT-26 and RT-27 ruled Medium (Wyatt).**
- **RT-15 on the built copy** (production build on loopback port 4322, 20,100 seeded settled tips plus a past-cap probe):
  - **Timing:** every sync took 27.0–27.5 s, the same as dev mode's ~28 s, so the ~2.5 s margin under the 30 s wall is real.
  - **L7:** 40 of 40 checkouts got an address during a 27.3 s sync.
  - **New detail:** the cap drops the newest invoices first, because an unordered scan reads oldest first (`created_at`, `id`). The expired probe, written last, stayed unwatched through 40 drain syncs. Recorded in RT-15 with a fix direction.
  - **Evidence:** `~/xmr-pay-dev-data/redteam/h1-2026-10-30T213904728Z.txt`.
- **Script:** `scripts/redteam/backlog-live.mjs` gained `seed --past-cap` and `run --built`. Script tests: 43 pass.
- **Restore:**
  - `data.db` restored from `~/xmr-pay-dev-data/redteam/round2-step5.db`: 419 Coffer rows, 0 different; the dev box's bridge key `2c00d25866f4` back.
  - The built copy was stopped; ports 4321 and 4322 are free.
  - The dev site's `dist` was rebuilt from the placeholder plugin build.

Next step: Step 6. `pnpm audit` in `plugin/`, `theme/` and `contract/`, plus the lockfile check against the tiers. For `govulncheck`, I name the exact version to Wyatt before running it.

## 2026-10-30 · Phase 07b pass 1 · Session 6: paused for the night (handoff)

Branch `redteam-1`, local, 36 commits ahead of `main`, not pushed. Plan: `/home/dev/.claude/plans/phase-07b-attacker-pass-shiny-cerf.md` (extends `…-shimmering-kahn.md`). **Steps 4, 2, 3 and 5 are done; Steps 6 and 7 remain.**

**State at the pause (checked):**
- **Dev box:**
  - Git tree clean.
  - No tmux sessions; no `astro dev` running.
  - Ports 4321, 4322, 8099 and 4399 free.
  - `xmr-bridge` and `monerod-stagenet` active. The dev box's bridge backs off quietly while the site is stopped.
- **Dev site:**
  - `data.db` matches `~/xmr-pay-dev-data/redteam/round2-step5.db`, itself equal to `round2-post-k.db`: 55 invoices, 355 pool rows, 8 KV rows, bridge key `2c00d25866f4`. Checked row for row (419 rows, 0 different).
  - The plugin `dist` and the site's `dist` are built with the install-command placeholder.
- **`coffer-test`:** rolled back to `blank`, and the `dev.wyattdilley.com` tunnel route is down (Wyatt). No pairing-code files are left on the dev box.
- **Evidence kept outside the repo:**
  - `~/xmr-pay-dev-data/07b-f1-output.txt`, `07b-f1w-output.txt`, `07b-f4-output.txt`, `07b-f4-output-run1.txt`, `07b-f4c-output.txt`;
  - the void runs, `07b-f1-void-output.txt` and `07b-f1-failed-install-log.txt`;
  - `redteam/round2-f1-after.db`, the coffer-test test state;
  - `redteam/h1-2026-10-30T213904728Z.txt`, Step 5.
  
  `dev-release/` still holds the signed `0.0.202610301609-dev.2d7a29d` release, its `f4/` tampered copy and the `redteam/` scripts. It's no longer served.

**Findings this session**:
- **Medium:** RT-20 (**blocks release 1**), RT-26 and RT-27. Wyatt ruled all three.
- **Low:** RT-19, RT-21, RT-22, RT-23, RT-24 and RT-25. RT-25 follows the matrix's reading.
- **Observations:**
  - what the second nodes learn (new row P05);
  - Cloudflare's beacon blocked by Coffer's CSP;
  - the address checksum isn't checked;
  - RT-15's cap drops the newest invoices first.
- **Totals:** 27 findings, all open. 1 High (RT-11), 8 Medium (RT-05, 07, 08, 12, 15, 20, 26, 27), 18 Low.
- **New matrix row F08**, the bridge reading the site's replies. T27 is now Covered and T10 is Covered for pass 1.

**Open, needs Wyatt:**
1. **Step 6 go-ahead.** Proposed: `golang.org/x/vuln/cmd/govulncheck@v1.9.0` (Go team, BSD-3-Clause, proxy timestamp 2026-10-11, commit `e672cbe8fbc8c76e28fcb6db0efd9ce354e0dac5`), run as `go run …@v1.9.0 -C ~/xmr-pay/bridge ./...` from an empty scratch folder. It downloads Go's vulnerability database from `vuln.go.dev`. Plus `pnpm audit` in `plugin/`, `theme/` and `contract/`, which sends package names and versions to npm's audit service. Nothing is added to the repo or CI.
2. **Upstream reports (Wyatt's):** RT-16 (EmDash admin pages and widgets have no role field) and RT-17 (the admin UI prints the raw refusal), both confirmed in EmDash 1.3.1.
3. **Spec questions for the fix phase, Wyatt's call:**
   - whether the spec's Privacy list should say what remote nodes learn (P05);
   - RT-19's three fix options (pairing order);
   - RT-26's and RT-27's fix ideas.

**For pass 2 (also listed in earlier entries):**
- **Fix `07b-i2.sh`:** report unreadable sources as "not checked", search subfolders, check each transcript once.
- **Not done from Step 3's old list:** both nodes lying, both unreachable, a reordered block.
- **T26:** the wallet-rpc downgrade case is still open.
- **A plugin-suite flake:** `tests/redteam/checkout.test.ts` T19 L3 hit the 30 s wall once in a full run; it passes alone and in a re-run.

**Phase 09 items noted this session:**
- a live check of the tip button through a real https proxy (RT-20);
- the install docs could mention Cloudflare's injected analytics on pay pages.

**Next session's first step:** read this entry, then ask Wyatt for the Step 6 go-ahead (version above). After Step 6 comes Step 7, closing the round:
- T24 and T25 spot-checked from the source;
- a findings summary for "Pass 1, round 2";
- the coverage column for every row round 2 touched;
- the session entry, whose next step is the fix sessions: highest open finding first, RT-11, then the Mediums, with RT-20 ahead of the rest because it blocks release 1.

## 2026-10-31 · Phase 07b pass 1 · Session 7: Steps 6 and 7 done, round 2 closed

Branch `redteam-1`, local, not pushed. Plan: `/home/dev/.claude/plans/phase-07b-attacker-pass-stateless-rivest.md` (Wyatt approved it with his changes). Code under test is unchanged. One new skipped Go test (RT-28); the rest is docs.

**Step 6, F5 dependency checks (T28).** Evidence in `~/xmr-pay-dev-data/redteam/step6-*`. Nothing was added to the repo's dependencies or CI, and no lockfile changed.
- **The tool, checked before it ran:**
  - Go settings all default (`go env -changed` empty).
  - govulncheck v1.9.0's commit `e672cbe8fbc8…` was first taken from proxy.golang.org on 2026-10-30. It matched `go mod download -json` (sum.golang.org) and `git ls-remote` on go.googlesource.com, and Wyatt's own check on GitHub's mirror.
  - Database updated 2026-10-27 21:16 UTC.
  - No run failed. Under `go run`, the tool's exit code shows as `exit status N`.
- **Bridge, source mode (go1.27.1):** 10 called standard-library vulnerabilities, all fixed in go1.27.2, except GO-2026-6809, fixed in go1.27.3. Two reach the bridge, which is an HTTP client only: 6809 (x509 distrust list) and 6611 (HTTP/2 client CPU). The other called ones are server, proxy or multipart paths.
- **Binary mode on both dev-release binaries:** go1.27.1, not stripped, 9 by symbol each. The installed dev bridge is go1.27.1 too.
- **bridge/oracle:** 0 called, also with `-test`. Nothing in go-crypto, circl, x/crypto or x/sys.
- **RT-28 (Low, T28/T27), new.** Go test `TestRedteamToolchainFloor`, skipped. Run once without its skip, it failed for the finding's reason.
- **Release 1's bridge build location isn't decided.** Tier 3 says CI, phase 09 says "a script", and the only existing path, `build-dev-release.sh`, runs on the dev box. Both the box and `ci.yml` (`go-version: 1.27.1`) give go1.27.1, while go1.27.3 is current. **For Wyatt.**
- **`pnpm audit`** (each a parsed audit report):
  - plugin: 63 (1 critical, 22 high);
  - theme: 25 (1 critical, 7 high);
  - `spikes/xmr-spike`: 63;
  - `spikes/cf-runner/limits`: 23.

  All are in dev tooling and EmDash 1.3.1's own tree (DOMPurify critical; undici, seroval, MCP SDK, sharp and others high). Nothing ships, by tier 1, so this is an observation, not a finding. EmDash 1.4.0 (2026-10-29) passes the 7-day rule on 2026-11-05. Whether it clears these wasn't checked; moving to it goes through the upgrade checklist.
- **Not audited:** `spikes/sandbox-canary` (no dependencies, so no lockfile) and `contract/` (no package yet).
- **Lockfile check, passed (plugin and theme):**
  - exact pins, with specifiers matching `package.json`;
  - every package has an sha512 integrity hash (829 of 829, and 694 of 694);
  - registry sources only, and no overrides, patches or release-age exclusions;
  - `strictDepBuilds`, `allowBuilds` (esbuild and workerd only) and `minimumReleaseAge: 10080` present.
- **Matrix T28:** the one-off run is noted, and the row stays Planned for CI.

**Step 7, closing the round:**
- **T24:** upstream `qrcodegen.ts` at `3c6d0b3`, fetched fresh, hashes to `1dc03fb5…cda9c`, the vendor test's `UPSTREAM_SHA256` (Wyatt matched it independently). The vendored file is that file once the three `export` edits are undone.
- **T25, from the source:** holds. The address comes only from `ctx.site.url`, then the private admin route's browser `Origin`, never `Host`; no usable address means no command and no code. Edges, no finding: `0.0.0.0` and IPv4-mapped IPv6 aren't on the loopback list, and a saved address with a path counts as unusable.
- **`docs/redteam-findings.md`:**
  - "Pass 1, round 2: summary": 10 findings this round, 3 Medium and 7 Low.
  - Totals: 28, all open: 1 High, 8 Medium, 19 Low. The table and sections match (28 each).
  - Not covered, split into tips scope (each gap with a home before release 1) and orders scope (pass 2).
- **Matrix:** T15 (P01 is no longer waiting), T17 (round tag), T24, T25, T27 (RT-28), T28. Every other row round 2 touched already had its round 2 note.
- **`CLAUDE.md`:** a command row for `scripts/redteam/round1-live.mjs`. It clears every Coffer row and the bridge key at the start and at the end.

Tests (final check, one at a time; output in `~/xmr-pay-dev-data/redteam/step7-*.txt`):
- **Plugin `pnpm test`:**
  - Default config: 327 passed, 17 expected fail, 1 skipped (345).
  - Switch-on `vitest.goods.config.ts`: 92 passed, 1 skipped (93). The T19 L3 flake didn't show.
  - Typecheck clean, manifest valid, bundle 58.3 KB, validation passed.
- **Theme `COFFER_REQUIRE_ZBAR=1 pnpm test`:** 73 passed, 2 expected fail, 1 skipped. The skipped one is the "zbarimg is installed" guard, which runs only when zbar is missing. All five QR round trips ran. Typecheck clean.
- **Bridge:** gofmt clean, `go vet ./...` clean, `go test -count=1 ./...` 21 of 21 packages ok. `hostile` isn't in `go list -deps ./cmd/xmr-bridge`.
- **Scripts:** `node --test scripts/*.test.mjs scripts/redteam/*.test.mjs`, 43 passed.

State at the end: tree clean after the commit, no tmux sessions, no `astro dev`, ports 4321, 4322, 8099 and 4399 free. `xmr-bridge` and `monerod-stagenet` active. `data.db` untouched this session.

**Open, needs Wyatt:**
1. **RT-08:** is it High? And the rewording of T03's and the spec's "free goods, not lost funds" line, which feeds the public security report: a stolen bridge key can route new tips to the attacker.
2. **Release 1's bridge build:** where (CI or the dev box), and with which Go. RT-28's fix is go1.27.3 or later there: the dev box's `/usr/local/go` (sudo) or `ci.yml`'s `go-version`.
3. **T28 in CI:** `pnpm audit`'s scope and level, and the govulncheck dependency ask for CI.
4. **EmDash 1.4.0** (eligible 2026-11-05): whether to take it through the upgrade checklist, given 1.3.1's npm advisories.
5. **Upstream reports:** RT-16 and RT-17 (EmDash 1.3.1).
6. **Spec questions:** P05 in the Privacy list, RT-19's three options, and RT-26's and RT-27's fixes.

**Phase 09 items:**
- **New:** rerun `govulncheck -mode binary` on the final release binaries and `pnpm audit` on the release packages just before publishing, since T28 stays out of CI until item 3 is decided.
- **From earlier:** the tip button through a real https proxy (RT-20), and the install docs could mention Cloudflare's injected analytics.

**Round 3 (after the fix sessions, before phase 09):** retest every fix; T26's wallet-rpc downgrade; fix `07b-i2.sh` and rerun I2 (T29); the Astro `base` case if supported. Both-nodes-lying, both unreachable and a reordered block go with RT-26's fix session; the T19 L3 flake goes with RT-12's.

**Next step:** the fix sessions, highest open finding first: RT-11 (High), then the Mediums with RT-20 ahead of the rest (it blocks release 1), then RT-05, 07, 08, 12, 15, 26, 27.

## 2026-10-31 · Phase 07b pass 1 · Session 7: Wyatt's rulings recorded

Recorded in `docs/decisions.md` (five rows), `docs/redteam-findings.md`, `docs/security-matrix.md`, `docs/spec-changes.md` (change 44), `docs/phases/09-release.md` and `docs/emdash-upgrade-checklist.md`.

1. **RT-08 is High** (was Medium): gated only by a stolen bridge key, with a Critical-class outcome.
   - **Fix sessions:** look for detection (for example the honest bridge checking the site's pool against its own wallet) and fast re-pairing. If nothing holds, it becomes an accepted limit with honest wording.
   - **Wording:** Wyatt's draft is in spec change 44 and now in T03's pass condition. Wyatt applies it to the live spec. `docs/spec.md` is unchanged.
   - **Totals now:** 2 High (RT-08, RT-11), 7 Medium, 19 Low.
2. **Release 1's bridge is built in CI.**
   - Wyatt signs on the dev box, and the signing key never goes to CI. Before signing he rebuilds on the dev box with the same Go and flags and confirms the hashes match. Phase 09's "A script produces…" now says so, plus the pre-publish govulncheck and `pnpm audit` rerun.
   - **RT-28 fix:** go1.27.3 (released 2026-10-20), pinned in one place CI reads, and the same version on the dev box.
3. **T28 in CI:**
   - `govulncheck@v1.9.0` on `bridge/` in source mode, failing on exit 3;
   - `pnpm audit --prod --audit-level high` in `plugin/` and `theme/`, failing;
   - no failing audit of the dev tree.

   Built in a fix session. Found while recording it: both packages have only dev and peer dependencies, so `--prod` today audits 15 packages, pnpm's own `packageManager` pin and its platform builds (`step6-audit-prod-*.json`: 0 advisories). It's a guard against a runtime dependency appearing, not an audit of EmDash.
4. **EmDash 1.4.0** goes through the checklist after 2026-11-05, in the fix phase before phase 09's final tests. Wyatt's three checks from the 1.4 notes are in the checklist.
   - **DOMPurify** (GHSA-cg2g-xh64-v4q7, fixed in 3.4.17): `pnpm why dompurify` puts it on EmDash's runtime path, `@emdash-cms/admin@1.3.1` (a regular dependency) ← `emdash@1.3.1`.
   - **1.4.0 doesn't clear it by itself:** `@emdash-cms/admin@1.4.0` keeps `dompurify ^3.3.2`. It depends on what the lockfile resolves.
5. **The rows round 2 touched were not all current. Fixed now:**
   - **P04** didn't record the RT-25 ruling (the clock starts at the admin's decision).
   - **R05** still called the bridge-side kill "round 2's Go step". Step 3 covered it with `TestPendingSurvivesFailureAndRestart`.
   - **R09** still said whether a remote node can push the height "is Step 3's". It can (RT-26).
   - **T29** said "fix before pass 2". Its home is now round 3.
   - **F08** lacked RT-26's and RT-27's ruled severities.
   - **Punctuation:** T04, T10, T14, T15, R05, R09 and R13 had sentences run together where an edit dropped a full stop.

   T13, T16 and P05 were current.
6. **T25's edges are Low hardening on the fix list** ("Hardening, round 2" in the findings), checked with a scratch script:
   - **Plugin:** accepts `0.0.0.0`, `[::]`, `[::ffff:127.0.0.1]` and `localhost.`.
   - **Installer:** refuses `::ffff:127.0.0.1` (Go maps it), but accepts `0.0.0.0` and `[::]` (neither loopback nor the same-machine check catches them). `localhost.` and `127.1` aren't refused by its loopback check; `localhost.` is caught by the same-machine DNS lookup only if the resolver maps it, and `127.1`'s DNS case wasn't tried.
   - **A trailing slash isn't a path:** `https://shop.example/` is used as `https://shop.example` (an existing [T25] test).

**RT-28, the dev box part (Wyatt, sudo):**
- **Download:** `~/xmr-pay-dev-data/go1.27.3/go1.27.3.linux-amd64.tar.gz`. SHA-256 `65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40` matches go.dev's release list and dl.google.com's `.sha256`. `VERSION` says go1.27.3, 2026-10-19T22:20:36Z.
- **Script:** `~/xmr-pay-dev-data/go1273-install.sh`. It checks the checksum and the archive's layout, stages, then swaps with two renames. The old Go stays at `/usr/local/go1.27.1-old`. Output goes to `go1273-install-output.txt`.

After that, the repo part:
- `bridge/go.mod` (and `bridge/oracle/go.mod`) `go 1.27.3`, and `ci.yml`'s `setup-go` reads it with `go-version-file`, so the pin lives in one place;
- RT-28's skip comes off;
- govulncheck rerun (source and a fresh binary build), expecting nothing called;
- the bridge suite.

No tests run for this docs-only commit; none of the changed files are code.

Next step: Wyatt runs the go1.27.3 install, then the RT-28 repo change above. Then the fix sessions, highest first: RT-08 and RT-11 (High), then RT-20 (blocks release 1), then the other Mediums.

## 2026-10-31 · Phase 07b pass 1 · Session 7: RT-28 fixed

- **Dev box:** Wyatt installed go1.27.3 with `~/xmr-pay-dev-data/go1273-install.sh`.
  - Output: checksum OK, `go version go1.27.3`, `root:root 755`, the old Go kept at `/usr/local/go1.27.1-old`, PASS at 21:59:42 UTC.
  - Rollback: `sudo rm -rf /usr/local/go && sudo mv /usr/local/go1.27.1-old /usr/local/go`. The old copy can go once CI has passed on go1.27.3.
- **Repo:**
  - `bridge/go.mod` and `bridge/oracle/go.mod` now say `go 1.27.3`.
  - `ci.yml`'s `setup-go` reads `go-version-file: bridge/go.mod`, so the pin lives in one place.
  - With `GOTOOLCHAIN=local`, go1.27.1 refuses the module: "go.mod requires go >= 1.27.3".
  - RT-28's test is unskipped and passes.
  - Decision 72 notes the new pin source. RT-28 is marked fixed in the findings and the matrix (T27, T28).
- **govulncheck v1.9.0 afterwards** (database updated 2026-10-27 21:16 UTC): "No vulnerabilities found", exit 0, in all three runs:
  - source mode on `bridge/`;
  - binary mode on a fresh amd64 static build (`-trimpath`, `CGO_ENABLED=0`, go1.27.3);
  - binary mode on a fresh arm64 build, the same way.

  Evidence: `~/xmr-pay-dev-data/redteam/rt28-*.txt`.

Tests (go1.27.3, `GOTOOLCHAIN=local`, `GOFLAGS=-mod=readonly`):
- bridge gofmt clean, `go vet ./...` clean, `go test -count=1 ./...` 21 of 21 packages ok;
- `bridge/oracle` gofmt, vet and tests ok, with `go.sum` unchanged.

Not run:
- **`go test -race`:** the dev box has no `gcc`, which cgo needs. CI's runner has it, so CI covers it.
- **CI itself:** the `go-version-file` change is untested until a push.
- **The `bridge/oracle` govulncheck rerun:** skipped, since it had 0 called before and its only change is the standard library, which is now clean.

Still go1.27.1: the dev releases in `~/xmr-pay-dev-data/dev-release/` and the dev box's installed bridge, both stagenet only. The next dev release picks up go1.27.3.

Totals: 28 findings, 27 open. RT-28 is fixed.

Next step: the fix sessions, highest first: RT-08 and RT-11 (High), then RT-20 (blocks release 1), then the other Mediums. The first push after this checks CI's bridge job on go1.27.3.

## 2026-10-31 · Phase 07b fix sessions · Plan for the first fix: RT-11 with RT-29 (spec change 45)

Branch `redteam-1`, local. Planning only: no code changed. The build is the next session's.

**Background:**
- `main` got the Go 1.27.3 pin alone (`191802c`, pushed by Wyatt's request). CI run 41246807865 succeeded: bridge, plugin and theme jobs, with the race-detector tests and the oracle check. The bridge job's log needs a login, so the version is inferred: `GOTOOLCHAIN=local` plus `go 1.27.3` in `bridge/go.mod`, which refuses anything older and is what `setup-go` installs.
- `redteam-1` is unchanged by that push, and a test merge of `main` into it has no conflicts.

**Decided (Wyatt, 2026-10-31):**
- **Network:** recorded in the plugin only. The first address after a pairing is signed by the newly paired bridge, so it's as trustworthy as the bridge declaring its network. No bridge rebuild for this part.
- **Admin page:** shows the stored network next to the pairing status.
- **No migration:** an install with no stored network is treated like a fresh pairing (nobody runs Coffer yet).
- **RT-29 filed (Medium) and fixed whole with RT-11:** every new pairing drops all unused pool addresses and clears the stored network.
- **Reporting:** refused addresses are reported in RT-08's Health line (spec change 46), not on their own.
- **Spec change 45 accepted** with three changes: keep item 4 (checkout skips a row on another network); the order inside the pairing request (drops before the key, plus a test for a failure after the drops); and the different-wallet address gap (below) recorded in 45 and fixed in 46.

**Found while costing it:** a re-pair to a different wallet starts the new wallet's pool above the old wallet's highest claimed number, expired checkouts included.
- Past about 200 old checkouts, its tips are beyond a wallet app's lookahead. The Health warning is blind to it, because `state:paidTop` belongs to the old wallet.
- This was true before 45 as well.
- **Spec change 46** fixes it: the bridge says at pairing whether it's the same wallet; a different wallet gets fresh numbering and a reset baseline; the same wallet re-offers its own unused subaddresses (Wyatt took that option).
- **Until then,** the switch-wallets steps say to raise the wallet app's lookahead. No such steps exist yet in the user-facing docs. The places are the spec's "View key leaked" row (live spec, Wyatt) and phase 09's install docs.

**Build plan for the next session (plugin only; tests first, each step green and committed):**
1. **Failing tests first.** Tag them [T20], [P02], and [T03]/[R08] where re-pairing is involved; add RT-29's tag where it applies:
   - RT-29: a re-pair to another same-network wallet hands out only the new wallet's addresses.
   - A stagenet-to-mainnet re-pair: the old unused addresses are gone, checkout hands out mainnet, and claimed rows and invoices are untouched.
   - No stored network: the next address sets it.
   - A mixed first batch: only the first readable address's network is kept, and the rest are dropped.
   - The two RT-11 `it.fails` flip to `it`.
   - Checkout skips a free row whose network differs from the stored one.
   - A re-pair keeps claimed rows, and `poolTop` falls to the highest claimed one.
   - A pairing that fails after the drops: the old key still syncs, the new key is refused, and the code still pairs on a retry. This needs a fault-injecting store in the test host.
   - The admin page shows the network ("Paired · stagenet", or "not known yet"). **Exact wording to Wyatt before it's written.**
2. **Code:**
   - **Pairing step** (`plugin/src/sync/handle.ts`, step 2), after `pairingCodeMatches` and `verifySignature`: drop the free pool rows, clear the network KV, then `setPublicKey`, then burn the code.
   - **Store** (`plugin/src/store.ts`): a `KV.network` key, `poolDropFree()` (a query on the `status` index, `where: { status: "free" }`) and network get/set.
   - **Sync apply** (step 4): an address on another network is dropped; with none stored, the first readable one sets it.
   - **Checkout** (`checkout.ts` `claimAndStore`): skip and claim-without-invoice a row on another network, as for an unreadable one.
   - **Admin page** (`admin.ts`): the network next to the pairing line.
3. **Checks:** plugin `pnpm test` (both configs), typecheck, `emdash-plugin validate`, `bundle --validate-only`. Bridge untouched.
4. **Docs:** matrix T20 (Covered once green), P02, T03 and R08. Findings RT-11 and RT-29 → fixed. Progress.

**Then RT-08 (spec change 46, to write and get approved before building).** It must cover:
- the bridge checking the site's pool against its own wallet;
- the same-wallet flag at pairing, with fresh numbering for a different wallet, re-offered unused subaddresses for the same wallet, and the gap baseline;
- **no lock-out by far-future sequence numbers** from a stolen key (RT-24's `seq` reach), so the honest bridge's check always runs;
- a refused sync from the honest bridge itself raises the red Health line;
- refused wrong-network addresses reported in that same line.

**Then RT-20** (blocks release 1).

**Next step:** a fresh session builds spec change 45 (RT-11 with RT-29) from the plan above, starting with the failing tests.

## 2026-10-31 · Phase 07b fix sessions · Spec change 45 built (RT-11, RT-29)

Branch `redteam-1`, local commits only (`ffe6e2a` to `8080e6b`).

**Decided by Wyatt this session:**
- **The window a running sync leaves is closed, not filed as RT-30.** A sync already past its signature check can write after a re-pairing's drop, and a thief can time bursts through a re-pair. Every pool row carries the key ID of the sync that added it, and checkout skips other pairings' rows. The stored network also carries the key ID. The re-check of the key before writing ((b)) stays too.
- **Mark-then-delete** for the drop (his preference over the suggested tag-only design), and every reader of a pool row's status was checked.
- **Wording:** "Paired · stagenet" and "Paired · network not known yet", without the bracket.
- **`--code` on the command line** is accepted for the dev box's stagenet re-pair. A stdin option for `xmr-bridge pair` goes into spec change 46 (T29/C06).

**Found while building:**
- **`updateIf` doesn't change a row's revision** (EmDash 1.3.1, `context-…mjs:644–667`). So the planned `getVersioned` plus `compareAndDelete` would have deleted a row a checkout claimed in between. The drop instead marks `free → dropped` with an `updateIf` guarded on `status: "free"` (checkout's own guard), then deletes.
- **`compareAndDelete` does reach a sandboxed plugin** (sandbox-workerd 0.9.5 bridges `storage/compareAndDelete` on both sides), but isn't used.
- **The "dropped" status, reader by reader:**
  - not counted as free: checkout's query, `poolFreeCount`, Health's meter;
  - not in the gap warning: it reads claimed rows only;
  - not in `poolTop`: now free and claimed rows only, a deliberate change;
  - `poolHas` counts it as present, which is fine because no bridge re-sends a number;
  - uninstall deletes every status;
  - the data-at-rest scanner doesn't read status, and the counts tool groups by it.

  One is left behind in a route test.
- **Fixtures:** a site with a pool now needs a paired key whose ID its rows carry. The checkout-route and platform fixtures now pair test1, and 11 test files tag their seeded rows. The redteam harness stores the network for a seeded pool.

**Built** (plugin only; the bridge is untouched):
1. `ffe6e2a`: `keyId()` (the base64 key's first 16 characters), and fixtures tag their rows.
2. `d6e8942`: the network per pairing on sync (items 2 and 3), key IDs on new rows, a sync whose key was replaced while it ran refused, and the RT-11 `it.fails` turned into passing tests.
3. `b8a5982`: the pairing drop (item 1) in Wyatt's order, mark-then-delete, `poolTop` ignoring dropped rows.
4. `3045295`: checkout skips another network's or another pairing's rows (item 4 and the tag).
5. `f169690`: Health's "Wallet host" line (item 5).
6. `8080e6b`: docs. Matrix T20 Covered; P02, T03 and R08 updated; Threats counted from the table: 20 Covered, 7 Partial, 3 Planned, 1 Gap. RT-11 and RT-29 fixed (29 findings, 26 open). Spec change 45 marked built, with these decisions; 46 gains the `pair` stdin option.

**Tests**, the last full run, at `f169690`:
- **Plugin, default config:** 354 passed, 15 expected fail, 1 skipped (35 files).
- **Plugin, goods config:** 95 passed, 1 skipped.
- **Checks:** typecheck, `emdash-plugin validate` and `bundle --validate-only` clean, bundle 59.5 KB (58.3 KB before).
- **New test files:** `tests/routes/repair.test.ts` (route-level re-pairs, the leftover window, a leftover dropped row) and `tests/routes/pool-drop.test.ts` (the claim racing the drop).
- **Changed test files:** handle, claim, uninstall, admin-health, admin-route, platform, network.

Notes on the runs:
- A full run takes about 10 minutes now (468 s default, 139 s goods), so it goes in the background.
- In step 4's first run, a `grep` pipe hid three failing platform tests from the exit code. They were caught in the output and fixed by the fixture. The later runs used `pipefail`.
- In step 5, two admin-health tests ("[P03] spam limits", 33 s; "an outdated wallet host", 52 s) failed alongside the step's expected failures. They passed alone and in both later full runs. Worth watching.

**Not covered:**
- the bridge (no change; spec change 46 is next);
- `go test -race` (no `gcc` here);
- CI (nothing pushed);
- the live re-pair below, pending.

**Dev box:**
- Two orphaned workerd processes from the dev site (parent PID 1, about 570 MB, up nearly 3 days, probably round 2's j1 SIGKILL run) were stopped.
- `data.db` backed up to `~/xmr-pay-dev-data/redteam/45-before-repair.db`: 55 invoices; pool 355 rows (305 claimed, 50 free, indexes 306–355, none tagged); bridge key fingerprint `2c00d25866f4`.
- The plugin is built and the dev site runs in `astro dev` (background).
- The installed bridge synced at 23:56:54 UTC with its old key; no network is stored yet.
- Under the new checkout rule, untagged rows can't be handed out until a re-pair (the "no migration" decision).

**Release note for phase 09:** EmDash's plugin guidance asks for a `package.json` version bump when runtime behaviour changes. This build changes it.

**Live re-pair: done, all pass** (2026-11-01 00:52 UTC):
- **The re-pair:** Claude issued a code at 00:52:01 UTC. Wyatt ran `sudo sh ~/xmr-pay-dev-data/45-repair.sh`: pair exited 0, the service stayed active, PASS, and the code file was deleted.
  - The script's before and after "Bridge key" lines came out empty. The installed bridge (the 8 October dev release) probably predates `status`'s `Bridge key:` line. The key change was checked from the database instead.
- **The after-check**, a scratch script, output in `~/xmr-pay-dev-data/45-after-repair-output.txt`, 19 s after pairing. Every check passed:
  - **Key and pairing:** a new key is stored (the fingerprint changed from `2c00d25866f4`), and `lastPairing` says it replaced the old one.
  - **Network:** `state:network` is stagenet with the new key's ID.
  - **Pool:** 50 free rows, indexes 356–405, all carrying the new key's ID; no "dropped" row; the 305 claimed rows untouched.
  - **Health:** "Paired · stagenet", the meter at 50 of 50, the gap at 0.
  - **A public tip** got index 356, a new-key row (invoice `inv_e266ef9e2e436bd0`, an unpaid stagenet tip left to expire).
- **The cost was as predicted:** numbers 306–355 were skipped, since the host keeps its wallet (spec change 45's costs; 46 removes it).
- **After:** 56 invoices; pool 355 rows (306 claimed, 49 free, highest 405). The bridge last synced at 00:52:26 UTC. The dev site was stopped afterwards (ports free); the bridge backs off quietly. The backup `45-before-repair.db` holds the pre-re-pair state, but restoring it would put back the old key, which the bridge no longer has.

**Next step:** RT-08's spec change 46 (write it, get it approved, then build), then RT-20.

## 2026-11-01 · Phase 07b fix sessions · Leftover shells, bundles, spec change 46 written

- **Leftover shells, both stopped:**
  - One of this session's background wait loops: `until ! pgrep -f "vitest.goods.config"` matched its own command line, so it never ended. It's what Wyatt's status bar showed.
  - A 28-day-old orphaned shell from phase 01's spike (PPID 1): a `while sleep 1; do free -m …` logger whose `kill` never ran. Its log, `/tmp/claude-1000/-home-dev/a8cbdf86-…/scratchpad/mem.log` (12 MB, an old session's scratchpad), is left in place.
- **Bundles (Wyatt):** every session now ends with a verified full-history bundle of its branch in `~/xmr-pay-dev-data/bundles/`, named `coffer-<branch>-<UTC date>-<short sha>.bundle`. Its name and SHA-256 go in the closing message, and into the next progress entry, since a bundle can't hold its own hash.
  - The first, at `3906fc1`: `coffer-redteam-1-2026-11-01-3906fc1.bundle`, SHA-256 `821df4a19ad7b70c1ccbdffd9db9c8f278114d6223bcda52e35e471e9b29ff74`, 1,709,001 bytes, verified (complete history).
- **Spec change 46 written, proposed** (`ec74a16`):
  - the honest bridge's pool check (RT-08 detection);
  - refused syncs shown on Health;
  - a same-wallet probe at pairing;
  - per-wallet numbering (`wallet × 2³² + index`, no index change), with the same wallet re-offering its unused subaddresses;
  - old-wallet open invoices;
  - RT-24's `seq` bound;
  - `xmr-bridge pair --code -`.

  Wyatt's test case is in it: the dev site's 306 claimed rows, where a different wallet would start at 357 today. The live check is planned too: a go1.27.3 dev release Wyatt signs, `xmr-bridge update` replacing the 8 October build, then a forged row, a same-wallet re-pair and a different-wallet re-pair with a real stagenet tip.
- **Two facts corrected while writing it:**
  - Tips aren't refused while the wallet host is silent; only product checkout is (`checkout.ts:266`). After a pairing, the empty pool is what stops them.
  - The bridge's catch-up is `bridgeloop.go:443–447`.

No tests run: docs only.

**Next step:** Wyatt decides 46's D1–D7. Then a fresh session builds it, plugin first (tests first), then the bridge, then the dev release and the live check.

### Wyatt's draft answers for 46 (not yet approved)

D1. wallet × 2^32 + index, split in one helper that every reader uses (poolTop, the gap warning, invoiceForIndex, the sync's index check), with an assert that the value stays a safe integer.
D2. As recommended for release 1. Note for release 2 (pass 2): a buyer who pays an old wallet's address after a switch gets an expired order, so orders need a "paid to a previous wallet" path.
D3. As recommended, plus: list only the current wallet's addresses (otherwise a re-pair to a different wallet flags the old wallet's open invoices as foreign); every handed-out address gets checked at least once, including invoices that closed between checks (a thief can report its own invoice paid within seconds); Health shows when the pool check last passed ("never" for a bridge without it). Banner: "Coffer found addresses on this site that aren't from your wallet. Someone may have your wallet host's key. Payments to those addresses don't reach you, so Coffer has stopped handing them out. Re-pair your wallet host now, then check Review."
D4. Keep it. Wording: "A wallet host using your previous pairing is still contacting this site. If you replaced it, shut the old one down. If you didn't, someone else may have its key; your re-pair has already locked it out."
D5. No bump.
D6. Add to T03 and R08.
D7. A new Feather stagenet wallet I make and hold the seed for, restore height set by hand to the current height.
Open check: can a wallet's rows all disappear (tip purge, plugin uninstall and reinstall)? If so, a returning wallet looks new and restarts at index 1 over paid addresses; start a new wallet above the highest index it has received on.

## 2026-11-01 · Phase 07b fix sessions · Spec change 46 accepted

Branch `redteam-1`. Docs only.

- **Spec change 46 accepted.** Wyatt's draft answers (D1–D7 and the open check) were reviewed against the code, four points were put to him, and he amended the rest. The decisions are in 46's "Wyatt's decisions (2026-11-01)", and the proposal text is rewritten to match.
- **From the review (the code facts behind the questions):**
  - Today's sync response carries indexes only (`handle.ts:208–209`). So the `check` list and the probes send digests (the first 16 bytes of SHA-256 of the address), not addresses.
  - An "ok" report can't mark a row as checked, since a thief can send "ok" too. Coverage is a 24-hour window on a new `addedAt`, with a rotation that moves every 30 s.
  - Rows disappear only on uninstall with "delete data", which also clears KV (`store.ts:153–163`); the 30-day purge clears buyer data only. Hence a re-offer only on a match.
  - The UI's labels are "Connect a new wallet host" and "Needs a decision".
- **Wyatt's own additions:**
  - the index bound in `parseSyncBody`;
  - the 45 s wait before hand-out (prevention, while the wallet host runs);
  - the free cap at `POOL_TARGET`;
  - status `bad`;
  - every invoice on a bad row to review, closed ones included;
  - display text for the new reasons;
  - "on a machine you trust" in the banner;
  - no addresses, watch list or snapshots before the probe answer, with no fallback;
  - the three-case D4 wording;
  - `receivedTop` for the baseline;
  - live steps 6 (a fresh unpaid tip) and 7 (357 first).
- **Later work, pass 2:**
  - **Orders paid to a previous wallet:** they need a "paid to a previous wallet" path (D2).
  - **Address reuse on a "no match" for a wallet with history** (both sides rebuilt, or a reused wallet): a restored wallet hands out old addresses again, already-paid ones included, and a payment to one settles the new invoice. A known limit for release 1; for orders, free goods. (Corrected 2026-11-01, below: a restored wallet stops at the first 200-address gap.)
- **At build time:** CLAUDE.md's list of stored items gains the previous bridge key (D4), with Wyatt's OK.
- **Approved by Wyatt as written (same day):** Claude's two additions to 46. One is item 1's "What's left": the 45 s wait protects only while the wallet host runs, and a stopped host's window is listed afterwards. The other is the matching example wording for spec change 44.

No tests run: docs only.

**Next step:** a fresh session builds spec change 46 from its accepted text: plugin first (failing tests first, tagged T03/R08 and the rest of 46's matrix list), then the bridge, then the dev release and the live check.

## 2026-11-01 · Phase 07b fix sessions · Spec change 46, plugin side built

Branch `redteam-1`, local commits only (`6451809` to `d834c63`, then this docs commit). The plan was approved by Wyatt as written, including its wording and the three choices noted in it. The bridge is untouched.

**Built, step by step** (each step: failing tests first, then code, then both configs green, then a commit):
1. **`6451809`, steps 1–2, the protocol and the numbering helper:**
   - an address or snapshot index outside 1..2³²−1 → `INVALID_BODY` (address index 0 was skipped before);
   - `SEQ_OUT_OF_RANGE` for |seq − ts·1000| > 300 s, on both paths (RT-24);
   - `checks.pool` and the `wallet` answer are parsed;
   - `core/walletindex.ts`.
2. **`e7e394e`, step 3, the probe and per-wallet numbering:**
   - `state:wallets`;
   - the wait after a re-pair on a site with history: probes, `poolTop` 0, an empty watch list, no addresses, no snapshots;
   - the answer, with `receivedTop` as the baseline;
   - own indexes on the wire and on the admin page;
   - the gap per wallet;
   - uninstall deletes each wallet's baseline.
3. **`acff4e0`, step 4, D2:** another wallet's open invoices go to review or expire with `wallet_changed`, and they aren't watched again. The new review cards and labels use Wyatt's wording.
4. **`011f585`, step 5, the pool check:**
   - the `check` list;
   - the free cap;
   - `addedAt`;
   - the report: `bad` rows, `not_your_wallet` review, the sticky mismatch;
   - the 45 s hand-out wait;
   - the test address's "being checked" message.
5. **`2ac40ec`, step 6:** refused current-key syncs and the previous key's requests are recorded, at most once a minute.
6. **`d834c63`, step 7, the admin page:** the mismatch banner, the refusing line, the previous-host line, and the "Address check" field.
7. **Docs:**
   - matrix rows T03, T04, P02, T20 and R08;
   - RT-24 fixed (29 findings, 25 open), and RT-08's status says the plugin side is built;
   - 46's status updated.

**Tests**, the last full run, at `d834c63`:
- **Plugin, default config:** 416 passed, 12 expected fail, 1 skipped (41 files, 485 s).
- **Plugin, goods config:** 101 passed, 1 skipped (144 s).
- **Checks:** typecheck, `emdash-plugin validate` and `bundle --validate-only` clean. Bundle 70.0 KB (it was 59.5 KB before 46's build).
- **New test files:**
  - `tests/core/walletindex.test.ts`;
  - `tests/sync/wallets.test.ts`, `poolcheck.test.ts` and `refused.test.ts`;
  - `tests/routes/handout.test.ts` and `admin-46.test.ts`.
- **Run outputs:** `~/xmr-pay-dev-data/46-step*-test.txt`.

**Not red first,** reported as it happened:
- the own-index test in `admin-invoices` (the display change went in with the gap code);
- the first two `handout.test.ts` tests (written after step 5's checkout code);
- the two review-card tests in `admin-review` (written before the code but not run before it).

All the others failed before their code.

**Existing tests changed, and why:**
- **Spec change 45's re-pair tests** (handle, repair) now answer the probe.
- **Route tests that sync and then check out** age their rows with the harness's new `agePool()`, since a test can't wait 45 s.
- **Red-team C2:** the skewed sender sends a `seq` from its own clock.
- **Red-team C3:** "no state change" allows the refusal record and checks it's there.
- **The row-shape test** includes `addedAt`.
- **The uninstall fake** has `get`.
- **The it.fails tests:**
  - RT-24's two `it.fails` now pass, plus a test of the 5-minute edge;
  - RT-08's D2 `it.fails` is replaced by two passing tests: prevention while the honest host runs, and the limit while it's stopped.

**Found while building:**
- **A wrong claim, corrected:** I said the sandbox's `ctx.kv` has no `list()`. The error came from the uninstall test's hand-made fake, not the sandbox. Uninstall now deletes `state:paidTop:<w>` by number from `state:wallets` either way, and doesn't need `list()`.
- **Wording that differs from the plan's examples, for Wyatt to check:**
  - The Health field reads "OK, less than a minute ago" (the page's existing `ago()`), not "OK, 12 s ago".
  - The mismatch banner splits Wyatt's text: its first sentence is the title, the rest the description.
  - Times are `HH:MM UTC` with no date, as elsewhere on the page.

**Open:**
- **CLAUDE.md:** its list of what the plugin stores gains "and the previous bridge's public key" (D4). That needs Wyatt's OK; it isn't edited.
- **Dev scripts to update before the live check** (not in the plugin suite):
  - `scripts/dev-e2e.mjs` pairs a fake bridge on a site with history, so it must answer the probe, and it checks out a tip seconds after topping up, which the 45 s wait refuses;
  - the red-team live scripts (`round1-live`, `round2-live`, `backlog-live`) need the same.
- **Not covered:** the bridge (spec change 46's Go side), `contract/` (the new fields), CI (nothing pushed), the live check.
- **Phase 09:** a `package.json` version bump, since runtime behaviour changed.

**Next step:** a fresh session builds 46's bridge side (Go, tests first):
- the pool check by digest and its report, with the immediate re-sync on a mismatch;
- the probe answer with `receivedTop`;
- re-offering unused subaddresses after a match, and the no-match start;
- `pair --code -` and `install --pair -`;
- the `seq` and timestamp agreement.

Then `contract/` documents the fields, the dev scripts are updated, and the live check follows.

## 2026-11-01 · Phase 07b fix sessions · Spec change 46, bridge side built (with Wyatt's review)

Branch `redteam-1`, local commits only (`4619904` to the docs commit after `259981e`).

**Decided by Wyatt this session:**
- **CLAUDE.md** gains the previous bridge key in its list of stored items (D4), committed as `4619904`.
- **RT-27 is folded into 46.**
- **His review of the bridge plan** (recorded in spec change 46):
  1. **Numbering cues only from handed-out rows:** the new `claimedTop`, never `poolTop`. The catch-up goes no further than `claimedTop + 50`, and a mismatch is reported at once, even mid catch-up.
  2. **Probes are always index 1,** by the bridge's `probeDigest`, sent until a sync carrying it succeeds. A bridge answering a probe creates at most index 1, and a probe at any other index is a malformed response.
  3. **A shared digest test value.**

**Built** (tests first; each step green):
1. **`fad272f`, plugin (Part A):**
   - `claimedTop` in every response;
   - index-1 probes from `probeDigest`, or wallet 0's row 1 read before the drop;
   - a site with claimed rows but no probe waits with `probes: []`;
   - the contract's digest vector and its generator.

   Two re-pair route tests now answer the probe "no match" (wallet 0 has no row 1 in one, a probe in the other).
2. **`259981e`, bridge (Part B):**
   - **syncclient:** the new fields, validation (a probe only at index 1), `AddressDigest`, the `SEQ_OUT_OF_RANGE` hint.
   - **walletrpc:** `SubaddressAddresses` and `ReceivedIndexes`.
   - **bridgeloop:**
     - numbering from `claimedTop` (RT-27 fixed, its tests unskipped);
     - the pool check by digest, with a report-only sync for a mismatch;
     - the probe answer;
     - `probeDigest` until delivered;
     - the re-offer after a match;
     - addresses a waiting response didn't take stay pending.
   - **status:** "Address check".
   - **Commands:** `pair --code -` and `install --pair -`; `install.sh` pipes the code in.
   - **The live test:** `TestLiveShopWallet` gains the new calls.
   - **Tests whose expectations changed with the design:**
     - `TestAtMost100AddressesPerSync` expects the pool to stop at 50 (RT-27's cap);
     - the wget `install.sh` test expects `--pair -`;
     - two loop tests allow the one index-1 probe;
     - the fake site's `claimedTop` is capped at its own pool.
3. **This docs commit:**
   - `contract/` documents the new fields;
   - the dev scripts (`lib.mjs` helpers `answerProbes`, `handoutWait` and `addressDigest`, the cleanup of 46's KV keys, `dev-e2e.mjs` and the three red-team live scripts) answer the probe and wait out the 45 s;
   - matrix rows T03, T04, T15, T29, F08 and R08;
   - findings: RT-27 fixed (29 findings, 24 open), RT-08's bridge side built;
   - 46's record of the review.

**Tests:**
- **Plugin, at `fad272f`:** default 422 passed, 12 expected fail, 1 skipped; goods 101 passed, 1 skipped. Typecheck, validate and bundle (70.3 KB) clean.
- **Bridge, at `259981e`:** gofmt and vet clean; `go test ./...` passes in every package; the static build is fine.
- **Red first:** the new Go tests failed against the old code (a stash run: the syncclient, walletrpc and bridgeloop tests didn't compile; the `install.sh` tests failed on behaviour). The Part A plugin tests failed before their code (7 red).
- **Live:** `TestLiveShopWallet` against stagenet wallet-rpc PASS (52 s; output in `~/xmr-pay-dev-data/46-live-shopwallet.txt`).
  - `get_address` by index works on the view-only wallet, and an index past the top is refused.
  - `ReceivedIndexes` found 35 indexes, from 1 to 305.
  - The freshly restored wallet's next index was 10, though it holds payments up to 305, found only after creating to 1110 and rescanning. That's the restored-wallet case behind Wyatt's known limit.
  - The temporary wallet was deleted.
- **Scripts:** `node --test scripts/*.test.mjs scripts/redteam/*.test.mjs` 47 passed. The live scripts were only syntax-checked (they need the dev site).

**Not covered:**
- `-race` (no gcc here);
- CI (nothing pushed);
- running `dev-e2e.mjs` and the red-team live scripts against the dev site;
- the live check (the dev release, `xmr-bridge update`, the forged row, the same-wallet and different-wallet re-pairs).

**Next step:** the live check, in a session with Wyatt (46's "Live check", steps 1–8):
1. **Back up `data.db`, build the plugin, start the dev site.**
2. **The dev release:** `scripts/build-dev-release.sh`. Wyatt signs it and runs `sudo xmr-bridge update`.
3. **The live steps:** the forged row, the same-wallet re-pair with `--code -`, the different-wallet re-pair, then back to the shop wallet.

## 2026-11-01 · Phase 07b fix sessions · Spec change 46's known limit corrected

- **Corrected (Wyatt), from `TestLiveShopWallet`:**
  - **What a restore finds:** a wallet restored from keys stops at the first gap of 200 unused subaddresses. The live test's restored shop wallet had its next index at 10 while holding payments up to 305.
  - **So on a "no match" for a wallet with history** (both sides rebuilt, or a reused wallet), `create_address` can hand out addresses that already received payments, not only unpaid ones, and `receivedTop` can be far too low.
  - **A match is fine:** the catch-up creates up to `claimedTop` and rescans.
- **Updated:**
  - spec change 46 (item 4's known limit, and the open-check line);
  - the earlier pass-2 note above;
  - a note under RT-29 in the findings (recorded there, not filed as a new finding);
  - phase 09's install docs: "use a wallet made for this shop, not one with history".
- **Answered (Wyatt's question):** the address digest uses WebCrypto `crypto.subtle.digest("SHA-256")`.
  - `dist/plugin.mjs` holds three `subtle.digest` calls and no SHA-256 round constants, so no SHA-256 code is bundled.
  - The bundle's growth (59.5 to 70.3 KB) is 46's own source. From `8080e6b` to `fad272f`, `handle.ts` went from 10.4 to 28.0 KB, `admin.ts` grew 5.7 KB, `store.ts` 4.2 KB and `protocol.ts` 3.0 KB.

## 2026-11-01 · Phase 07b fix sessions · Live check started: the dev scripts (stopped at the usage limit)

- **Before:** `data.db` backed up to `~/xmr-pay-dev-data/redteam/46-before-scripts.db`: 56 invoices; pool 356 rows (306 claimed, 50 free, highest 406); bridge key `b08969872a2d`. The plugin was built at `1ef3686`, and the dev site ran in `astro dev`.
- **`dev-e2e.mjs`:** 32 PASS, 0 FAIL, "ALL AS EXPECTED", including the 46 s hand-out wait (`~/xmr-pay-dev-data/46-dev-e2e.txt`).
  - It needs a clean site, so `--cleanup-only` ran first. The pairing therefore didn't wait for a probe answer; `backlog-live` would cover that path.
- **`round1-live.mjs`:** 7 PASS, 1 FAIL (`~/xmr-pay-dev-data/46-round1-live.txt`). **Not yet looked into.**
  - C5: "the drip request ends at or before the 30 s wall" got HTTP 200 after 41,023 ms, with `BAD_SIGNATURE`.
  - Possibly the dev box's installed bridge interfering, or a timing change; check whether C5 passed in round 1's own run before treating it as a regression.
- **Not run yet:** `round2-live.mjs` (a8, c6, j1) and `backlog-live.mjs`.
- **After:** the site was stopped (ports free, no astro running), and `46-before-scripts.db` restored (the state it replaced is in `~/xmr-pay-dev-data/baseline/data.db.before-restore-20261101T200828222Z`). The installed bridge syncs again with its own key once the site runs.

**Next step:**
1. Look into C5 (compare with round 1's evidence, `~/xmr-pay-dev-data/redteam/round1-*`).
2. Run `round2-live.mjs` (a8, c6, j1; check for orphaned workerd after j1) and `backlog-live.mjs` (seed with the site stopped), each with a backup first and a restore after.
3. Then 46's live check steps 1–8.

## 2026-11-02 · Phase 07b fix sessions · Spec change 46: the dev-script runs finished

**State at the start** (after the 2026-11-01 usage-limit stop): tree clean at `2d959ee`, no leftover vitest, astro, workerd or node processes. Swap was full (511/512 MB); all of it is `monerod`'s (about 503 MB, the system service), with about 4.9 GB available. Wyatt approved the plan with changes (C5's label narrowed; two forged rows in live step 4; steps 5–7's expectations; see the steps below).

**Done:**
- **`42379e6`:** `round1-live.mjs` prints C5's wall check as `KNOWN RT-13`, not FAIL, only for RT-13's exact result (HTTP 200 `BAD_SIGNATURE`, past 33 s). Any other failing result stays FAIL; the check's PASS cases are unchanged. `isKnownRt13Drip` in `lib.mjs` and the label name RT-13, so both go when RT-13 is fixed.
- **Last session's C5 FAIL is RT-13, not a regression:** round 1 (2026-10-26) got the same 41 s and `BAD_SIGNATURE`.
- **Live runs** on the dev site in `astro dev`, plugin built after `fad272f`; backup `~/xmr-pay-dev-data/redteam/46-before-round2.db` (56 invoices; pool 356 rows, 306 claimed and 50 free, highest 406; bridge key `b08969872a2d`), restored after each:
  - `round2-live a8`: 6 PASS (`46-round2-a8.txt`).
  - `round2-live c6`: 6 FAIL, RT-07 (open) reproduced 3 of 3, as on 2026-10-29. The winning key varied this time (1, 2, 1), where 10-29 always kept the second: a race either way (`46-round2-c6.txt`).
  - `round2-live j1`: 8 PASS (`46-round2-j1.txt`). The killed astro's `workerd` was left behind (parent pid 1); I stopped it.
  - `backlog-live seed` (20,100 settled tips and one open probe), then `run`: all PASS, including "answered the wallet probe", the path `dev-e2e` didn't cover (`46-backlog-seed.txt`, `46-backlog-run.txt`, `redteam/h1-2026-11-02T150028940Z.txt`). Times are as in RT-15 (open): pair 28.4 s, first backlog sync 28.0 s, the sync under L7's checkouts 28.9 s (10-26: 27.7, 27.9 and 28.6 s; 10-30: 27.4, 27.1 and 27.3 s). L7: 32 of 40 checkouts got an address (10-26: 35, 10-30: 40); the check passes.
- **Script tests:** `node --test scripts/*.test.mjs scripts/redteam/*.test.mjs` 49 passed, 0 failed.
- **After:** the site was stopped (ports free, no astro or workerd left) and `46-before-round2.db` restored; counts as above.

**Next step:** spec change 46's live check with Wyatt, steps 1–8, as amended on 2026-11-02 (plan `~/.claude/plans/phase-07b-fix-sessions-jaunty-sifakis.md`).

## 2026-11-02 · Phase 07b fix sessions · Spec change 46 live check: before step 2

- **Built:** dev release `0.0.202611021505-dev.37742ab` (go1.27.3) in `~/xmr-pay-dev-data/dev-release/`; unsigned until Wyatt signs it.
  - `build-dev-release.sh` wipes the folder first, so 30 October's `f4/` and `redteam/` went with it. They were filled copies for the `coffer-test` red-team run; the masters `~/xmr-pay-dev-data/07b-f1.sh` and `07b-f4.sh` are kept, so nothing is lost.
- **Live evidence for the open self-update admin-copy question (decide before phase 09):** a self-update never refreshes the admin copy.
  - The dev box's service runs `/var/lib/xmr-bridge/bin/xmr-bridge`.
  - Root's `/usr/local/bin/xmr-bridge` is still the 8 October install's `0.0.202610082327-dev.0d66a34` (go1.27.1), through every self-update since.
  - So that copy doesn't know `pair --code -` or `install --pair -`, and its `status` doesn't print 46's "Address check" or the bridge key. The state format is still 1, so it runs without the format refusal and just shows less.
  - Its only refresh is re-running the installer, which needs a new pairing code (the bridge's own `CheckFormat` message says so).
- **Spec change 46's live check named a command that doesn't exist:** step 2's `sudo xmr-bridge update`. No build has an `update` subcommand. Dev builds check `127.0.0.1:8099` 20 s after starting and every minute after that, and a newer signed release swaps itself in (3g's V2 path).
- **Wyatt's choice (2026-11-02), steps 2–5:**
  - **Step 2:** Wyatt only signs; the service updates itself. Before step 3, the journal must show the service running the new version.
  - **Steps 3–4:** checked from the site's database and the journal. The bridge logs "created pool addresses", "catching the wallet up…" and "the site holds addresses that aren't from this wallet" with the indexes.
  - **Step 5a:** re-run `install.sh` from the new release with a code. It's the same wallet, it refreshes the admin copy, and the code goes in as `--pair -`.
    - If the installer restores the view-only wallet from keys, check that the bridge answers "match" and catches up to `claimedTop` without creating anything past it (a preview of step 7).
  - **Step 5b:** `sudo xmr-bridge pair --config /etc/xmr-bridge/config --code -` with the refreshed copy, then status's Address check line.
  - **Both 5a and 5b:** the pool banner clears at the pairing, and no "previous wallet host" line appears. If one does, that's a finding.

## 2026-11-02 · Phase 07b fix sessions · Spec change 46 live check: steps 1–4

Backup before the live check: `~/xmr-pay-dev-data/redteam/46-before-live.db` (as `46-before-round2`). The plugin was built at `6789715` (70.3 KB, validate passed), and the dev site ran in `astro dev`. The 9 October service accepted a sync from the 46 plugin at 15:16:19 UTC before the update. Evidence: `~/xmr-pay-dev-data/46-live-step*.txt`.

1. **The release:** Wyatt signed `0.0.202611021505-dev.37742ab`. `check-dev-signature.sh` verified it with the public key only. It was served on 127.0.0.1:8099 from 15:20:49 UTC.
2. **The self-update** (`46-live-step2-output.txt`, Wyatt's sudo run): PASS.
   - 15:21:02 UTC: "updating the bridge from `0.0.202610090032-dev.97f0e66` to `0.0.202611021505-dev.37742ab`", exit 75, and a systemd restart 10 s later.
   - "starting version=…37742ab", then "update confirmed" 15 s after the start. No rollback and no warnings since.
   - The admin copy is still `0.0.202610082327-dev.0d66a34`, and its `status` has no Address check line (the evidence above).
   - The service the update replaced was a 9 October build, not the 8 October install.
3. **The honest pool check:** PASS (site side).
   - The updated bridge's first sync, 15:22:01, recorded `poolCheck.lastOkAt`.
   - Health shows "Address check: OK", with no pool banner and no bad or dropped rows.
   - The bridge's own Address check line waits for the new admin copy (5a).
4. **RT-08, live, two forged free rows** (`46-step4.mjs`, outside the repo, beside `46-live.mjs`, which reads Health and the pool): site side PASS.
   - **The rows:** both tagged `keyId` `eb18uYYYYekANLBG` (the current key), with made-up addresses, at 15:28:05.440 UTC.
     - **a.** Index 306, held by the wallet but missing on the site, since 45's re-pair dropped 306–355 (checked: the only gap).
     - **b.** Index 100,356, which is `claimedTop` 356 + 100,000.
   - **Both were `bad` after 512 ms,** my polling step. The bridge's regular sync landed about 400 ms after the write; its response carried the new `check` list, and the report-only sync followed 43 ms later (`mismatch.at`). The worst case is one sync interval (12 s plus up to 3 s of jitter), inside the 45 s wait.
   - **A tip checkout at +46 s got index 357,** neither forged row. The bad rows were never claimed, and `poolTop` stayed 406.
   - **Health:** the banner "Coffer found addresses on this site that aren't from your wallet" (D3's wording) and "Address check: Failed at 15:28 UTC". `lastOkAt` keeps advancing while the mismatch stays.
   - **The pool:** 307 claimed, 50 free (358–407: the bridge's top-up for 357), and 2 bad.
   - **Still to read:** the bridge's journal for 4b (no catch-up, only the top-up) and the reported indexes.
- **Step 4, the bridge's side** (`46-live-step4-output.txt`; the first run left no file, and the second, run as `dev`, did): PASS.
  - 15:28:05.882 "the site holds addresses that aren't from this wallet" `indexes="[306 100356]"`, 0.44 s after the write.
  - 15:28:59 "created pool addresses" `count=1` (the top-up for 357).
  - No catch-up and no rescan, so row b made the bridge create nothing.
5. **5a, the installer re-run with the same wallet:** PASS (`46-live-step5a-output.txt`, `46-live-step5a-site.txt`, `46-live-watch.txt`).
   - **Two refused attempts first:** the address typed was another valid wallet's (`58WW…eSZP`), while the installed host and `SHOP_ADDRESS` are `59nA…etgQ` (`46-live-addrcheck*.sh`, yes/no only). The installer refused before changing anything, and both unused codes were deleted.
     - **A possible proposal for Wyatt:** the refusal "already hosts a wallet for another address" could name the installed address in short form. Not having it cost two codes.
   - **The third attempt:**
     - The install started at 16:09:08 and kept the existing view-only wallet (no restore from keys, so the restore case waits for step 7). The admin copy is now `…37742ab`.
     - Journal: the new service started at 16:09:21, answered `match=true receivedTop=305`, then "re-offering this wallet's unused addresses" `from=358 count=50`.
     - `status`: "Address check: ok" and the new bridge key.
   - **The site** (2 s watcher):
     - **At the pairing** (between 16:09:16.9 and 16:09:20.9): new key `jW55uagv…`, wallet `null` while waiting, `poolCheck` reset (**the banner cleared**), `previousKey` the old key, and the 50 free rows dropped.
     - **16:09:26:** wallet 0 matched, and free rows 358–407 re-offered (`addedAt` 16:09:25), nothing skipped above `claimedTop` 357.
     - **`previousSeen` none, so no "previous wallet host" line.** The old service stopped at 16:09:20.83, within about 4 s of the pairing.
     - Rows 306 and 100,356 stay `bad`.
   - **5b, `sudo xmr-bridge pair --code -` (code on stdin only), service left running:** PASS (`46-live-step5b-pair-output.txt`, `46-live-step5b-output.txt`, `46-live-step5b-site.txt`, `46-live-watch-2.txt`).
     - **The bridge:** pair took 16:14:22.23–.43 and exited 0, with the service's PID unchanged. Its next sync (16:14:26.3) used the new key `Bq93c58Q…`: `match=true receivedTop=305`, then a re-offer `from=358 count=50`. `status`: "Address check: ok".
     - **The site:** waiting from the pairing, wallet 0 matched at 16:14:26.6, and free rows 358–407 (`addedAt` 16:14:26), nothing skipped. Health "Address check: OK", `previousSeen` none, so **no "previous wallet host" line**.
     - **Not proven:** the pool banner had already cleared at 5a, so 5b only shows that none appeared. The old-key race (a sync signed in the ~0.2 s before the key swap, arriving after it) wasn't hit: the last old-key sync was 16:14:13.3, about 9 s before the pair. That's roughly a 1–2% chance per pair, so its absence here isn't evidence against it.
6. **Step 6, the switch to a second wallet: stopped before the payment** (Wyatt, 2026-11-02). Evidence: `46-live-step6-*.txt`.
   - **The procedure:** the installer refuses another address, so step 6 became `sudo xmr-bridge uninstall --delete-data` (16:20:44) and then a fresh install (16:28:09–16:29:31). That leaves no "re-run": step 7 will be the same pair.
   - **Before it:** shop-wallet tip `inv_0eebd504fb0ec85f` (index 358, 0.001 XMR, unpaid) opened at 16:20:12, expiring 16:50:12, for D2's `wallet_changed` check.
   - **The switch as designed:**
     - "no match", so wallet 1, with its own probe;
     - its pool is 2³²+1 to 2³²+50, its own index 1 (not 359);
     - Health's gap "0";
     - "Address check: OK";
     - no banner, `previousSeen` none.
   - **Found:**
     - **The second wallet wasn't new.** `58WW…eSZP` is very likely phase 05's setup-test shop wallet: three earlier test tips on its index 1.
     - The probe was answered 35 ms after the wallet opened, at wallet height 579,994 against the node's 2,242,155, so `receivedTop=0`. Index 1 went into the pool.
     - A test tip handed 2³²+1 at 16:30:41 **settled at 16:30:42 on those three old transfers** (heights 2,230,085 to 2,240,100; its `createdHeight` 2,242,155), with nothing paid.
     - Filed as **RT-30** (bridge: answer the probe only after the wallet has scanned; proposed Medium) and **RT-31** (plugin: old transfers count toward a new invoice; a height floor needs RT-26's fix first; proposed High). Wyatt rules on both. No code changes this session.
   - **579,994 isn't a restore height:** the dev box's 8 October install logged the same "wallet open" height. The restore height actually used is in `/etc/xmr-bridge/config` (Wyatt to read; no `--restore-height` was passed).
   - **The payment proof waits** for the fix and a wallet that's truly new.
   - **The restore height was 2,230,020** (`46-live-step6-restore.txt`). No installer line names the site's suggestion (about 2,241,429), so it came from `--restore-height`; being below the suggestion, it drew no warning. With the suggestion, the old payments would have been outside the scan and step 6 would have looked clean. Added to RT-30's record.
   - **D2 live: PASS.** The shop tip `inv_0eebd504fb0ec85f` (index 358, nothing received) expired with `expiredReason: "wallet_changed"` at 16:50:22.8, 10 s after its 16:50:12.3 deadline (the next sync). The status route shows `expired` (`46-live-step6-shoptip-expiry.txt`).
7. **Step 7, back to the shop wallet:** PASS (`46-live-step7-output.txt`, `46-live-step7-site.txt`, `46-live-step7-before.txt`).
   - **The procedure:** uninstall (16:55:11), then install of `59nA…etgQ` with no `--restore-height`. The installer took the site's suggestion ("open invoices from about block 2241400") and restored the wallet from keys.
   - **The bridge:**
     - 16:57:39.56: `match=true receivedTop=0`, 35 ms after the wallet opened at 579,994, so again before any scan (RT-30's timing).
     - "catching the wallet up" `target=358`, a rescan of 358 addresses, caught up at 16:57:49: **the catch-up stopped at `claimedTop` 358.**
     - "re-offering" `from=359 count=0` (nothing above 358 in the restored wallet), then "created pool addresses" `count=50`.
   - **The site:**
     - 16:57:32: the pairing (key `+ckxCG2o…`, waiting, wallet 1's 50 free rows dropped).
     - 16:57:40: matched wallet 0.
     - 16:57:50: free rows **359–408**, the first new address `claimedTop` + 1, with nothing skipped.
     - Health "Address check: OK", no banner, `previousSeen` none.
     - **Wallet 0's baseline is back** ("Unpaid addresses since the last payment: 53", 5a's 52 plus the expired shop tip), so the pre-scan `receivedTop=0` didn't reset it.
8. **The record:**
   - **Matrix:** live notes on T03, T04, T29 and R08, and the RT-30/RT-31 gap on P02.
   - **Spec change 46:** status, plus a "Live check, as run" list. `docs/spec.md` is unchanged.
   - **Findings:** RT-08 (its live result; still open for Wyatt), RT-29's 46 note, and RT-30 and RT-31 (above).

**Results, the live check:**

| Step | Result |
| --- | --- |
| 1 | PASS |
| 2 | PASS (self-update) |
| 3 | PASS |
| 4 | PASS (both sides) |
| 5a, 5b | PASS (5b's old-key race wasn't hit, so it isn't proven absent) |
| 6 | the switch PASS; D2 PASS; RT-30 and RT-31 found; payment proof not run |
| 7 | PASS |

**Not covered:**
- step 6's payment to a truly new wallet;
- CI (nothing pushed);
- `-race`;
- mainnet.

**Open, for Wyatt:**
- **Severities:** RT-30 (proposed Medium) and RT-31 (proposed High).
- **RT-31's floor depends on RT-26.**
- **The installer refusal:** it could name the installed address (cost two codes in 5a).
- **The admin-copy question:** live evidence above.
- **Whether to restore `46-before-live.db`:** the installed bridge is now paired with key `+ckxCG2o…`, which that backup doesn't know.

**Next step:** Wyatt rules on RT-30 and RT-31. Then a fix session, tests first:
- the bridge answers the probe only after the wallet has scanned to its node's height;
- the plugin's height floor, after or with RT-26's fix.

Then step 6's payment proof with a truly new wallet.

## 2026-11-02 · Phase 07b fix sessions · Wyatt's decisions after 46's live check

1. **Site data:** keep it as is, no restore. It holds the RT-31 tip and the bad rows, and the installed bridge is paired with key `+ckxCG2o…`.
2. **Severities:** RT-31 High. RT-30 Medium, and it **blocks release 1**: until RT-31's height floor exists, RT-30's fix is the only thing stopping an honest admin's switch to a used wallet from crediting old payments.
3. **RT-31's floor and RT-26: option A, both in release 1** (Wyatt, asked separately after the decisions message arrived without a choice). The two options were:
   - **A:** both in release 1.
   - **B:** both before release 2 (orders). Release 1 records RT-31 as a known limit, for tips only: a false "Tip received" and an old payment counted twice, no goods, no lost funds.
4. **The wallet:** `58WW…eSZP` is the phase 05 setup-test wallet. 2,230,020 is the restore height Feather gave it in run A attempt 2, and Wyatt passed it.
5. **The next fix session also tests 5b's unproven case:** a sync signed by the previous key arriving right after a same-machine re-pair. If it raises the "previous wallet host" line, that line gets a short grace period after a pairing.
6. **Step 6's rerun uses the same phase 05 wallet** with `--restore-height 2230020`, not a new wallet. Expected after RT-30's fix:
   - the probe is answered only after the wallet has scanned to its node's height;
   - `receivedTop` covers its paid index;
   - the first pool address is above every index that has received;
   - a fresh tip shows nothing received;
   - Wyatt pays it from the Feather buyer wallet, and it settles and shows in that wallet's own Feather history.

   That tests RT-30's fix and the payment proof together.

**Next step:** a fix session, tests first:
- RT-30: the bridge answers the probe only after the wallet has scanned to its node's height;
- 5b's previous-key race test (and the grace period if it fails);
- RT-31's height floor with RT-26's fix (option A: both in release 1).

Then step 6's rerun as in decision 6.

## 2026-11-02 · Phase 07b fix sessions · RT-30's fix, 5b's race test and grace, spec change 47 drafted

**Plan:** `~/.claude/plans/phase-07b-fix-sessions-agile-whistle.md`, approved by Wyatt with his decisions:
- an offline node counts as not ready;
- a 60 s grace;
- the bridge's key reload, with his change: a body built under the old pairing is dropped, never re-signed;
- `go test -race`, now that the box has gcc 14.2.0 and libc6-dev.

**Done:**
- **`73781ec`, RT-30 (bridge):**
  - **When it answers:** the probe is answered only once the node has answered, is synchronized and online, and the wallet's height has reached the node's (no slack).
  - **The node:** read fresh while the site waits, not from the wallet check's 60 s cache. With no node to ask, there's no answer.
  - **Until then:** the site keeps waiting, syncs keep their normal pace, and the bridge logs why at most once a minute.
  - **Found while building:** index 1, created to answer the probe, sat in pending and would still have been sent. Answering now drops pending addresses that have received, and after a no-match every pending one at or below `receivedTop`.
- **`307c104`, 5b (plugin):**
  - **The race test** (old-key sync signed 0.2 s before the pairing, arriving 0.1 s and 28 s after it) **was red:** `previousSeen` was recorded at +0.1 s, so the "previous wallet host is still running" line would show.
  - **The fix:** a 60 s grace (`PREVIOUS_GRACE_MS`). `state:previousKey` becomes `{ publicKey, pairedAt }` in one write. A legacy string reads as `pairedAt` 0, so it gets no grace.
  - **D4's existing tests** moved past the grace.
- **`b33fc21`, 5b (bridge, Wyatt's rule):**
  - The per-pairing state (watch list, answer, pool report, re-offer) is tagged with its key and dropped when the key differs at a sync's start.
  - The key is re-read just before the main send and the mismatch fast path. If it changed, the body is dropped (nothing counts as delivered) and a fresh sync follows at once.
  - Pending addresses stay. The "starting" message holds nothing from a pairing, so it goes out under the current key.
- **`4df39ca`, docs:**
  - **Spec change 46:** a "Fix sessions" note, and D4 amended, with a spec line to fold in.
  - **Spec change 47** (proposed, nothing built), with decisions D1–D7 and recommendations, and a still-to-decide row in `decisions.md`:
    - RT-26's height bound: the bridge against the cross-check's second node, plus a loose plugin backstop;
    - the restore-height clamp;
    - healing an inflated height at a pairing;
    - RT-31's floor and its margin (10, 30 recommended, or 720 blocks);
    - showing ignored transfers.
  - **Findings:** RT-30 "fixed in code; live at step 6's rerun", with its known limit (a node that says "not synchronized" forever stalls the answer). 5b's result is under RT-08.
  - **Matrix:** P02, R09, T03 and R08.

**Results (this session's output):**
- **Red first:**
  - **RT-30:** 5 of the 6 new Go cases failed on the old code. The wallet-ahead-of-node case passes either way, as it should.
  - **5b:** the plugin race test failed (`previousSeen` `{ at: 1790000000100 }`).
  - **The key change:** all 3 new Go cases failed on the old code (old-key body sent after the pairing; the stale report and answer sent under the new key).
- **Bridge, at `b33fc21`:** gofmt and vet clean; `go test ./...` and **`go test -race ./...`** pass in every package (the first `-race` run on this box; go1.27.3). The static build is fine.
- **Plugin, at `307c104`:** typecheck clean, validate passed, bundle 70.4 KB.
  - `pnpm test`, default: 424 passed, 12 expected fail, 1 skipped (last session 422: plus the 5b race and legacy-string tests).
  - `pnpm test`, goods: 101 passed, 1 skipped.

**Not covered:**
- live: RT-30 on the dev box's installed bridge (step 6's rerun), and the 5b race on a real same-machine `pair`;
- CI (nothing pushed);
- mainnet.

**Bundles:** the newest in `~/xmr-pay-dev-data/bundles/` is `coffer-redteam-1-2026-11-01-e7ff9ae.bundle` (2026-11-01). The 2026-11-02 sessions before this one made none. This session's bundle follows this commit; its name and SHA-256 are in the closing message.

**Next step:**
1. **Wyatt's decisions on spec change 47** (D1–D7).
2. **Step 6's rerun** (decision 6): a dev release with `73781ec`–`b33fc21`, signed by Wyatt; the phase 05 wallet with `--restore-height 2230020`. Expected:
   - the probe is answered only after the scan;
   - `receivedTop` covers index 1;
   - the first pool address is above every paid index;
   - a fresh tip shows nothing received;
   - Wyatt's Feather payment settles.
3. **RT-20** (blocks release 1): accept an `Origin` equal to EmDash's `siteUrl` in the tip endpoint, with its twin test.
4. **The RT-26 + RT-31 build** once 47 is decided (option A: both in release 1).

**Wyatt, after the session (2026-11-02):** confirmed the extension of his key rule. The per-pairing state is tagged with its key and dropped on any key change, between syncs as well as mid-sync, as built in `b33fc21`. No code change; recorded in spec change 46's "Fix sessions" note. The closing bundle follows this commit.

**Wyatt's decisions on spec change 47 (2026-11-02, recorded the same day; nothing built):**
- **D1:** the bridge against the second node only; no plugin rise limit.
- **D2:** the second node's height, a 10-block tolerance, "mismatch" only after a few minutes.
- **D3:** the clamp on both sides.
- **D4:** a pairing resets the height only to a bounded node height, and the floor uses `min(createdHeight, site height) − 30`.
- **D5:** 30 blocks.
- **D6:** the admin line with the amount; the floor doesn't apply to the paid-top.
- **D7:** as drafted, plus three tests.

Full text in 47's "Wyatt's decisions". `decisions.md` gains a Design row, and its still-to-decide row is gone.
- **Found while recording D4:** both pairing paths (`install.go:84–88`, `pairstatus.go:74–79`) send the node's `get_info` height, which isn't checked for being synchronized or against a second node, and is 0 when the node doesn't answer. The build bounds it first, and the site leaves its height alone for a 0 or unbounded one (47's part 4).
- **Pass 2's list (release-2 note, D2):** while the height is held because no second node answers, product checkout refuses, as when the node is syncing.
- **Open for the build plan:** D2's "few minutes" as an exact span.

**Next step:** unchanged, with 47 decided:
1. step 6's rerun (dev release, Wyatt signs);
2. RT-20;
3. the RT-26 + RT-31 build, tests first, from 47 as accepted.

The closing bundle follows this commit.

**Wyatt, later on 2026-11-02:**
- **D2's span is 5 minutes,** for Health's "mismatch" only. The clamp to the second node's height applies from the first sync where the wallet is more than 10 blocks ahead. Recorded in 47 and in `decisions.md`.
- **The order, which replaces the next step above:**
  1. **The RT-26 + RT-31 build,** tests first, from 47 as accepted.
  2. **RT-20.**
  3. **One dev release and one live session** (one signing round), covering:
     - **step 6's rerun:** RT-30, plus the floor. The phase 05 wallet's three old payments show as ignored on the admin page, and a fresh tip shows nothing received until Wyatt pays;
     - **the installer's restore-height clamp;**
     - **RT-20 live.**

**Next step:** plan the RT-26 + RT-31 build session (plan mode; the matrix rows T14, R09, P02 and their new tests first). The closing bundle follows this commit.


## 2026-11-02 · Phase 07b fix sessions · RT-26 and RT-31 built (spec change 47), then RT-20

**Plan:** `~/.claude/plans/phase-07b-rt26-rt31-build.md`, with Wyatt's answers:
1. **(a):** the ignored-payment line is derived when shown, and the old RT-31 tip is its live view.
2. **Fail closed with no second node,** with two additions: the refusal covers tips too, and spec change 13 item 4 is amended to hold confirmations. The mainnet list is a release-1 blocker.
3. **The pairing height** is bounded both ways.

RT-20 followed, at Wyatt's request.

**Done:**
- **`4615ceb`, the bridge (RT-26):**
  - **The height bound:** with a remote node, the bridge reports the wallet's height while it's at most 10 blocks above a second node's, else the second node's, from the first sync. Health shows "mismatch" after 5 minutes.
  - **No second node:** height 0 and "unavailable", with mined transfers held at 0 confirmations. The same holds when a block can't be fetched (spec change 13 amended).
  - **Pairing:** both pairing paths send `crosscheck.BoundedHeight`.
- **`889d652`, the installer:**
  - A suggested restore height above the bounded height becomes that height − 720, with one line.
  - With nothing suggested, a new wallet starts at the bounded height. The raw node height was also an RT-26 path.
- **`300fa80`, the plugin (RT-31 and the site side of RT-26):**
  - **The floor:** `min(createdHeight, site height) − 30`, through `totals(inv, siteHeight)`.
  - **D6's admin line**, with the amount: under Newest tips and on the invoice and review views.
  - **The reset at a pairing,** and the healed restore suggestion.
  - **Checkout at height 0:** refused, tips included when the host has reported without a height.
  - Admin fallback wording for "unavailable".
- **`de558a1`, the theme (RT-20):** the tip endpoint also accepts an `Origin` equal to EmDash's configured public origin, through EmDash's own `getPublicOrigin` from `emdash/api/route-utils` (an existing peer, no new package). Every other refusal stays.
- **`853dded`, `2c6f39e`, the docs:**
  - spec change 47's "Built" note, and spec change 13 item 4 amended;
  - findings RT-26, RT-31 and RT-20 marked "fixed in code; live at the combined session";
  - matrix rows T14, R09, P02 and T17.

**Results (this session's output):**
- **Red first:**

  | What | On the old code |
  | --- | --- |
  | crosscheck | 7 failed (3 existing Unavailable tests now expecting 0 confirmations, and 4 new) |
  | bridge loop | RT-26's reshaped test and 4 of 5 new cases failed |
  | `pair` command | sent 94,954 from a node still catching up |
  | installer clamp | 3 of 4 failed |
  | plugin floor tests | 6 of 10 failed; the other 4 are guards that pass on either version |
  | theme RT-20 | the main case answered 403 |

  `BoundedHeight`'s table test was written together with the function, which had no earlier version to fail against.
- **Bridge, at `889d652`:** gofmt and vet clean; `go test ./...` and `go test -race ./...` pass; the static build is fine.
- **Plugin, at `300fa80`:**
  - typecheck clean, validate passed, bundle 71.4 KB;
  - `pnpm test`, default: 434 passed, 12 expected fail, 1 skipped;
  - `pnpm test`, goods: 101 passed, 1 skipped.
  - The first full run had 5 failures in existing tests, and they changed:
    - **Three platform tests and R12's "never synced" case:** the tip refusal now applies only when the bridge has reported with height 0. A never-synced site still answers `NO_ADDRESS_AVAILABLE`.
    - **`handle.test.ts`'s restore-height pairing** now carries a height above its invoices.
- **Theme, at `de558a1`:** `COFFER_REQUIRE_ZBAR=1 pnpm test` 76 passed, 1 expected fail (RT-10), 1 skipped (was 73 passed, 2 expected fail); typecheck clean.

**Not covered:**
- live: everything below;
- CI (nothing pushed);
- mainnet: the second-node list is still empty, so a remote mainnet node now holds every payment, a release-1 blocker.

**Found while building:**
- **The installer's no-suggestion path** used the node's raw height.
- **Visitor tips** skip checkout's height rule (spec change 33). Height 0 is now their one exception.
- **The dev site's `astro.config.mjs` sets no `siteUrl`.** RT-20's fix relies on `EMDASH_SITE_URL`, which the public built copy already sets.

**Next step: one dev release and one live session with Wyatt (one signing round):**
1. **Build and sign:** `scripts/build-dev-release.sh` at `2c6f39e` or later. It wipes `~/xmr-pay-dev-data/dev-release/`. Wyatt signs it, and the installed bridge updates itself.
2. **Step 6's rerun** (decision 6): the phase 05 wallet with `--restore-height 2230020`. Expected:
   - the probe is answered only after the scan, and `receivedTop` covers index 1;
   - the first pool address is above every paid index;
   - the old tip `inv_f7ea94de1471f114` shows "Older payments to this address were ignored: 0.003 XMR in 3 transfers, …";
   - a fresh tip shows nothing received until Wyatt pays from Feather, then it settles.
3. **The installer's clamp,** shown on a run where it applies.
4. **RT-20 live:** the tip button on `https://dev.wyattdilley.com` through the tunnel, with the built copy started with `EMDASH_SITE_URL=https://dev.wyattdilley.com`.
5. **Back to the shop wallet**, as in step 7.

The closing bundle follows this commit.

**Wyatt, before the live session (2026-11-02):**
- **Pushed:** `redteam-1` to GitHub at `9cb9bd3`, a new branch.
  - **CI didn't run:** `ci.yml` runs only on pushes to `main` and on pull requests, and there's no PR for `redteam-1`.
  - Opening one (GitHub offered `https://github.com/dwightsabeast/coffer/pull/new/redteam-1`) runs CI. Then `python3 -I scripts/ci-status.py <full SHA>` in the background.
- **The 13 expected-fail tests** (12 plugin, 1 theme). The release gate (`docs/phases/07b-adversarial-testing.md`): no Critical or High open, and each Medium fixed or accepted in `decisions.md`; Lows have no gate.

  | Test | RT | Severity | Release target |
  | --- | --- | --- | --- |
  | `ipcap` L2 (IPv6 /64) | RT-05 | Medium | release 1: fix or accept |
  | `sync` C6 (two pair requests, one code) | RT-07 | Medium | release 1: fix or accept |
  | `stolen-key` D2b (duplicate pool address) | RT-09 | Low | not set |
  | `whitebox` I3 (review keeps buyer data) | RT-25 | Low | not set |
  | `sync` C3 × 3 (duplicate keys, out-of-range values, unknown fields) | RT-06 | Low | not set |
  | `admin` B2 (forged Mark settled/Expire on a tip) | RT-14 | Low | not set |
  | `checkout` A0 (product wording in release 1) | RT-01 | Low | not set |
  | `checkout` A2 (Kraken pair) | RT-02 | Low | not set |
  | `checkout` A3 (lone surrogate) | RT-03 | Low | not set |
  | `checkout` A8 (30 concurrent tips) | RT-04 | Low | not set |
  | theme A9 (prefixes case-insensitive) | RT-10 | Low | not set |

  Two other open Mediums have no expected-fail test: RT-12 (one slow request blocks the Node runner) and RT-15 (backlog sync near the 30 s wall). The same gate applies.
- **`getPublicOrigin` isn't documented.** `emdash/api/route-utils` is in the package's `exports` and typed, but the docs never mention it or that entry point. Added to `docs/emdash-upgrade-checklist.md` (`0842f25`).
- **Mismatch, from the code:** no, the bridge doesn't try another second node before holding. Each sync picks one second node, in random order, and checks every transfer against it.
  - A mismatch holds that transfer at 0 for this sync, and a failed block fetch makes the whole check "unavailable".
  - A mismatched transfer isn't cached as verified, so the next sync checks it again, possibly against another node. One lagging or lying second node therefore holds a payment for a sync or two, and a dishonest one flips the result each time it's picked.
  - The height bound asks one second node at most once a minute.
- **Mainnet candidates, probed read-only at Wyatt's request:**
  - An exception to "never mainnet": daemon RPC only (`get_info`, `get_block` by height), no wallet, nothing sent but a height. Evidence: `~/xmr-pay-dev-data/mainnet-second-nodes-probe-2026-11-02.txt`.
  - **All seven** were mainnet, synchronized and restricted, at height 3,797,801 with no spread, with the same block hash at 3,797,781. `get_block` works in restricted mode on every one.
  - **Valid TLS:** monerodevs, cakewallet, ravfx. **Self-signed, so http only:** sethforprivacy, rucknium, stormycloud, monero.love.
  - **Seven operators, one host each.** Proposal in `decisions.md`'s row.
  - **Open, found while checking "skip the configured node's operator":** the bridge skips only the configured node's exact host. The stagenet list already holds `node.` and `node2.monerodevs.org`, one operator.

**The live session, revised:**
- **Step 3's node:** the dev box's own stagenet node, `127.0.0.1:38081`. There the clamp can't show: the pairing carries that node's bounded height, the site resets to it (D4), and the suggestion it returns is already below the node's height.
- **The clamp shows only when the pairing carries no bounded height.** So it moves into a new public-node step.

Runbook:
1. **The dev release, and Wyatt signs.** The installed bridge updates itself.
2. **Step 6's rerun** (own node, the phase 05 wallet, `--restore-height 2230020`):
   - the probe is answered after the scan, and `receivedTop` covers index 1;
   - the first pool address is above every paid index;
   - the old tip `inv_f7ea94de1471f114` shows the ignored line;
   - a fresh tip shows nothing received, then Wyatt pays and it settles.
3. **New: the bridge on a public stagenet node** (configured `https://stagenet.xmr.kernal.eu:38089`; its second nodes are then the other five built-in ones):
   - **a. Inflate the site's height (Claude):** with the site stopped, back up `data.db`, then set `state:bridge.height` 1,000,000 above the real one through the KV shortcut. Start the site and open one tip, so its `createdHeight` is inflated.
   - **b. Block the second nodes (Wyatt, sudo):** a script adds `/etc/hosts` lines sending the five other built-in hosts to 127.0.0.1 and saves a copy first. The configured node stays reachable.
   - **c. Install on the public node (Wyatt):** uninstall with `--delete-data`, then install with `--node https://stagenet.xmr.kernal.eu:38089` and no `--restore-height`. Expected:
     - the pairing carries no height, and the site keeps the inflated one;
     - **step 3's clamp line:** "The site suggested scanning from block S, above the node's height H; the new wallet scans from block H − 720 instead.";
     - Health shows "Remote-node cross-check unavailable", with the bridge's detail that it reports no chain height and holds mined payments at 0 confirmations.
   - **d. Unblock, then re-pair the same wallet** (`pair --code -`): the pairing carries the bounded height, the site's height heals, and the inflated tip's floor heals with it.
   - **e. Payments held:** block again, and Wyatt pays a fresh tip. It stays at 0 confirmations while Health shows the held message. Unblock, and it settles.
   - **Restore:** `/etc/hosts` from its copy, and `data.db` if Wyatt wants the pre-step state.
4. **RT-20 live:** the tip button on `https://dev.wyattdilley.com` through the tunnel, with the built copy started with `EMDASH_SITE_URL=https://dev.wyattdilley.com`.
5. **Back to the shop wallet on the own node,** as in step 7.

**Note for 3c:** while the second nodes are blocked, an inflated site height can't heal, because the bridge reports none and the pairing carries none. A tip created then has an inflated floor, so an honest payment to it would be ignored until 3d's pairing. That's fail-closed by design. It's why 3e makes its payment only after the height has healed.

**CI (2026-11-02):** Wyatt opened the PR for `redteam-1`. Run 41518972271 on `77d52ea` passed: the theme, plugin and bridge jobs, the bridge's race-detector tests included (`python3 -I scripts/ci-status.py`).

**Wyatt's second-node rules (2026-11-02), built in `1162b8f`, recorded in `36ec6bb`:**
- **Mainnet is https only,** with the certificate checked and redirects refused. The three that made the list: `node.monerodevs.org:18089`, `xmr-node.cakewallet.com:18081`, `ravfx.its-a-node.org:18081`. The other four, sethforprivacy, rucknium, stormycloud and monero.love, use self-signed certificates.
- **Second nodes are skipped by operator,** taken as the host's last two labels.
- **On a mismatch,** one more node from a different operator is asked before the payment is held.
- **Stagenet: not applied.** An https probe of the six built-in hosts (`~/xmr-pay-dev-data/stagenet-second-nodes-https-probe-2026-11-02.txt`) found a verifying certificate only on `stagenet.xmr.kernal.eu`, the public-node step's configured node. An https-only list would leave that step with no second node.
  - The operator skip and the second opinion do apply on stagenet. With kernal configured, the second nodes are five hosts from four operators (monerodevs counts once), and step 3b blocks all five.
- **Release checklist** (phase 09): the mainnet list is ticked, and "Grow the HTTPS second-node list" is added.
- **Tests:** `operators_test.go`, 9 cases: 7 failed on the old code, and 2 are guards that pass either way. Bridge gofmt, vet, `go test ./...`, `go test -race ./...` and the static build pass.

**Before the live session (2026-11-02, Wyatt's request):**
- **Dev release `0.0.202611022057-dev.1df3c4d`** (go1.27.3, no `.dirty`) in `~/xmr-pay-dev-data/dev-release/`, unsigned and not served yet.
  - **Shipped code:** the same as `6dd4ef6`. `1df3c4d` adds only `bridge/internal/crosscheck/live_mainnet_test.go` (a test file, not compiled into the binary) and a `CLAUDE.md` row.
  - **SHA-256:** amd64 `50c86d9c9ca3705414e907f860890e69950018a2693647455ed7fe6742c052ab`; arm64 `ed6d55ee8d335bcf7f72022a7be798d0621b97e118dd583f5e668a76d8015925`; `install.sh` `53bde9267cac7b08823c91012d929fd838f51b08470677a47b308bad0a0ee969`; `release.json` `6519625a3a5f7b92b624d915e40ea7d3e2a279d78f209ede14440b1c41b83f60`.
  - **Signing waits for CI on `6dd4ef6` to pass** (Wyatt).
- **New live step, read-only: the mainnet second-node list over https** (`1df3c4d`, `TestLiveMainnetSecondNodes`, opt-in by variable; command in `CLAUDE.md`).
  - **How it works:** each built-in mainnet node in turn is the configured node and gives one recent block with a transaction. The bridge's own `Checker` checks that block against each other node as the only second node, so every node's https path vouches at least once: certificates verified, redirects refused, a different operator vouching.
  - **Run 2026-11-02:** 6 of 6 pairs ok at block 3,797,792, confirmations 20 → 20 (`~/xmr-pay-dev-data/mainnet-second-nodes-live-2026-11-02.txt`).
  - **A first version** picked the second node at random and never used `ravfx` as a voucher, hence the pairwise form.
  - **In the live runbook:** step 0, re-run at the session, before the signing.

## 2026-11-02 · Phase 07b fix sessions · Combined live session: steps 1 and 0

- **CI on `6dd4ef6`:** run 41523399005 (`pull_request`) passed: plugin, bridge (race detector included) and theme.
- **Step 1, the release:**
  - Wyatt signed `0.0.202611022057-dev.1df3c4d`. `check-dev-signature.sh` verified it with the public key only, and `release.json` is unchanged since the build (`6519625a…3f60`).
  - Served on 127.0.0.1:8099 (tmux `release`) from 21:07:10 UTC.
  - **The self-update:**
    - **21:07:41:** the release server logged the installed bridge fetching `release.json`, its signature and the amd64 binary.
    - **21:07:41:** "updating the bridge from `0.0.202611021505-dev.37742ab` to `0.0.202611022057-dev.1df3c4d`", exit 75.
    - **21:07:52:** systemd restarted it, "starting version=…1df3c4d" on `127.0.0.1:38081`, and wallet-rpc was ready 7 s later (Wyatt's journal: `~/xmr-pay-dev-data/live-step1-update.txt`).
  - **Not yet "update confirmed":** the dev site is stopped, so syncs get "connection refused". `selfupdate.Decide` waits in that state. It rolls back only on a wallet that never opened or a site that refuses, so the update confirms at the first sync once the site is up.
  - **Observation:** one "wallet-rpc refused the login" 7 s after start, right after "wallet-rpc ready". The next attempts got past the wallet to the site, so it was transient. Not looked into further.
- **Step 0, the mainnet second-node check** (read-only, `TestLiveMainnetSecondNodes`): 6 of 6 pairs ok at block 3,797,800, confirmations 20 → 20 (`~/xmr-pay-dev-data/live-step0-mainnet-seconds.txt`).

**Next:** step 2 (step 6's rerun). Back up `data.db`, build the plugin at `01f6f08`, and start the dev site in `astro dev`; the bridge's update confirms at its first sync. Then the phase 05 wallet with `--restore-height 2230020`, with Wyatt at the terminal and the pairing code issued then.

## 2026-11-02 · Phase 07b fix sessions · Combined live session: step 2 (stopped), then wrap-up for the night

**Step 2, step 6's rerun** (the phase 05 wallet with `--restore-height 2230020`, own node, dev release `0.0.202611022057-dev.1df3c4d`):
- **Before:** backup `~/xmr-pay-dev-data/redteam/live-before-step2.db`. The bridge's first sync on the site at 21:15:44 UTC confirmed the self-update ("update confirmed", 21:15:52). Wyatt uninstalled with `--delete-data` (22:54 UTC), and I issued the code then, with him at the terminal. The install ran at 22:55:14 UTC.
- **What it proved (RT-30, live):**
  - **The wait:** the wallet opened at 579,994 at 22:56:35. 28 ms later the bridge logged "waiting for the wallet to scan before answering the site's wallet probe" (reason "the wallet is still scanning", node 2,242,369). On the site, the new key `UZK9rV9a…` showed `wallet: null` and no addresses while it scanned.
  - **The answer:** at 22:57:29, after 54 s of scanning, a match with **wallet 1** (its stored probe), with `receivedTop` 2 (`state:paidTop:1` 2). So the phase 05 wallet had also been paid at index 2.
  - **Paid indexes kept out of the pool:** the pool started at index 3, above both paid indexes, 1 and 2.
- **What it found:**
  - **RT-32 (proposed Medium, release-1 blocker):** a re-pair started an endless address loop. `checkPool`'s bound, `claimedTop + 50` = 51, is below where the top-up's 50 addresses end (52), so each new address came back bad. 137 rows (52 to 188) were bad by 22:58:26, with a false sticky "not from your wallet" warning. I stopped the dev site at 22:58:27, which ended it.
  - **RT-33 (proposed Low):** the height floor moved the settled old tip `inv_f7ea94de1471f114` to review as "reversed", with an alert, against Wyatt's answer 1(a). The build plan's premise was wrong (corrected in `docs/decisions.md`): a settled invoice stays watched until its payment is 10 blocks deep, for up to 24 hours, and with the floor its counted depth was 0.
- **Not done:** the old tip's "ignored" line (it went to review instead) and the fresh tip. Both wait for step 2's rerun.
- **Evidence:**
  - the loop's database, `~/xmr-pay-dev-data/redteam/live-step2-loop.db`, SHA-256 `a0e7a7b991159462f1e23266cf60497257134eaedc0b3bb1b76b374ad5a57616` (`integrity_check` ok);
  - `~/xmr-pay-dev-data/live-step2-watch.txt` (the watcher) and `~/xmr-pay-dev-data/live-step2-output.txt` (service, installer log, journal to 22:56:42, status);
  - the uninstall's output, `~/xmr-pay-dev-data/live-step2-uninstall-output.txt`.
  - the bridge's journal for 22:54 to 23:10 UTC, saved by Wyatt after the wrap-up: `~/xmr-pay-dev-data/redteam/live-step2-bridge-journal.txt`, 304 lines, SHA-256 `18c82b47008250f9684e54324e302add8a8c691c7bdd9a3ffd41bf9b44c29b39`. Its timeline is in RT-32.

**Wrap-up (Wyatt: stop for the night; no step 3, no fixes, no dev site):**
- **Stopped:** the watcher (tmux `watch`), the release server (tmux `release`, 127.0.0.1:8099), the leftover tmux `site` shell and the wait loop. `astro dev status` reports none running. 4321, 4322 and 8099 are free.
- **The database restored:** with the site stopped, `setup-test-reset.mjs --restore ~/xmr-pay-dev-data/redteam/live-before-step2.db`.
  - **Before:** `data.db` `83708c2983d544fd512ae9c17c987b91e601544b1f63acd68eb45f1409b5c383`, `data.db-wal` `9e622e1c900fe1143cabf8dc926ee5b582aff1ea378eff5388712207841eb72b`, `data.db-shm` `bc007fd4ae321bd62bf0287b125330ad6e6560b5463cbe6706847d7cf8cf15df`; the backup `a46a7baa0dde0a8f55c8faaf0738603ecdd2d4dc2bcf9c8d982116582e8b0f69`.
  - **After:** `data.db` `a46a7baa0dde0a8f55c8faaf0738603ecdd2d4dc2bcf9c8d982116582e8b0f69`, the same as the backup, which is unchanged. No `-wal` or `-shm` files.
  - The state it replaced (the loop's, with its WAL) is saved again at `~/xmr-pay-dev-data/baseline/data.db.before-restore-20261102T230616612Z`.
- **Checks for the push:** since `6dd4ef6` (CI run 41523399005 passed), the only changes are a test file (`live_mainnet_test.go`), `CLAUDE.md` and docs. Bridge gofmt, vet and `go test ./...` pass at HEAD, as does `go test -race ./internal/crosscheck/`; the live mainnet test skips without its variable. Plugin and theme are unchanged since `6dd4ef6`.

**The state I leave:**
- **The site is stopped.** The live database is the restore of `live-before-step2.db`.
  - It holds the shop wallet's key `+ckxCG2o…`, with wallet 0 current, the previous key `/w+5RXvB…`, and both wallets' probes.
  - The old tip is settled, and there's no pool-check mismatch.
  - The pool: wallet 0 has 308 claimed, 50 free (359–408) and 2 bad; wallet 1 has 1 claimed (index 1).
- **The installed bridge is still running.** It holds key `UZK9rV9a…` and the **phase 05 wallet** (wallet 1), whose view-only copy now has subaddresses up to 189 from the loop. With the site down it backs off. The release server is stopped, so its update checks fail quietly.
  - If the site starts before step 3's uninstall, the bridge's key is unknown to the restored site, so its syncs are refused (no loop; the site may record a refusal).
  - **Step 3 starts where it did:** Wyatt's `uninstall --delete-data`. The release server has to be served again first.
- **Commits:** this entry's commit and the three before it (`1df3c4d`, `01f6f08`, `321715b`) are pushed to `origin/redteam-1` at wrap-up: the tree was clean and the checks above passed. CI for the pushed HEAD was started and its result is left for next session (`python3 -I scripts/ci-status.py <HEAD's full SHA>`).

**Next session, in order:**
1. Serve the release again (`tmux new -d -s release 'cd ~/xmr-pay-dev-data/dev-release && python3 -m http.server 8099 --bind 127.0.0.1'`). Read the CI result for the pushed HEAD, if it was pushed. Back up `data.db`, build the plugin and start the dev site, with the watcher on (stop the site at once if any bad row appears).
2. **Step 3** (the public node; runbook above, 3a–3e). Wyatt runs the uninstall.
3. **Step 4** (RT-20 live, the built copy with `EMDASH_SITE_URL=https://dev.wyattdilley.com`).
4. **Step 5** (back to the shop wallet on the own node).
5. Wyatt rules on RT-32's and RT-33's severity. Then plan both fixes, tests first: RT-32's live shape (`claimedTop` 1, `receivedTop` 2) and RT-33's (a settled tip from before the floor stays settled).
6. One dev release, which Wyatt signs, then **step 2's rerun**: the old tip's "ignored" line, and a fresh tip that shows nothing received until Wyatt pays it.

## 2026-11-06 · Phase 07b fix sessions · Combined live session: step 3 (public node)

**Checks before starting (Wyatt's list):**
- **Hashes, re-taken:** `data.db` and `live-before-step2.db` `a46a7baa0dde0a8f55c8faaf0738603ecdd2d4dc2bcf9c8d982116582e8b0f69`; `live-step2-loop.db` `a0e7a7b991159462f1e23266cf60497257134eaedc0b3bb1b76b374ad5a57616`; the bridge's journal `18c82b47008250f9684e54324e302add8a8c691c7bdd9a3ffd41bf9b44c29b39` (304 lines). All match the 2026-11-02 entry. Its "before" hashes for `data.db`, `-wal` and `-shm` can't be rechecked: those files no longer exist.
- **CI on `8cab888`:** run 41543313890 passed (plugin, theme, bridge with the race detector).
- **Shipped code:** no diff under `bridge`, `plugin` or `installer` between `1df3c4d` (installed) and `8cab888`.

**Before the site:**
- **Backup:** `~/xmr-pay-dev-data/redteam/live-before-step3.db`, SHA-256 `82146e67ec49f4ab7cb11176ae9c7539ecdd2ecd33d74b430083a7558fd9e76f`. Counts from it: 59 invoices, 361 pool rows (309 claimed, 50 free, 2 bad).
- **`/etc/hosts` before the first block:** SHA-256 `1d3d9611532c6edb88c7c2aeaf0bc44ac2fe8e4ea34fd2de74783d96ecd6ea2c`.
- **Block target:** 127.0.0.2, not the runbook's 127.0.0.1. The dev box's `monerod` listens on `127.0.0.1:38081`, and two of the five blocked nodes use that port, so it would have answered as a second node (Wyatt's check; plan approved with this).

**3a:** `state:bridge.height` set from 2,242,172 to 3,245,092 (node 2,245,092 + 1,000,000) through the KV shortcut, site stopped. `lastSyncAt` not touched: the public tip path has no silence check. Tip `inv_ca1ec50afd39fb95` (index 359, wallet 0, nobody pays it) has `createdHeight` 3,245,092.

**3b, `block 1` (21:26:03 UTC):** the script printed FAIL for `xmr-lux.boldsuck.org`; the block itself is good and the check was wrong.
- **The false FAIL:** `getent hosts` asks for IPv6 first, finds no IPv6 line in `/etc/hosts`, and goes to DNS, so it returned the host's AAAA record. `curl` exited 7 because it used 127.0.0.2.
- **What the bridge does:** a throwaway static Go client (`CGO_ENABLED=0`, as `/usr/local/bin/xmr-bridge` is built) resolved all five hosts to 127.0.0.2 only, and all five failed to connect. `stagenet.xmr.kernal.eu` answered with HTTP 200. `getent ahosts` also gives 127.0.0.2.
- **Why it mattered to check:** this box has working IPv6. `curl -6` straight to that host's address got HTTP 200 (one `get_info`), so the block holds only because the hosts file wins in Go's and glibc's combined lookups. A client asking for IPv6 alone would get past it.
- **Script changed for `block 2`:** `getent hosts` to `getent ahosts`.

**3c, install on the public node** (phase 05 wallet, `--node https://stagenet.xmr.kernal.eu:38089`, no `--restore-height`; install log from 21:31:49 UTC, service up 21:33:51; evidence `~/xmr-pay-dev-data/live-step3-output.txt`, watcher `live-step3-watch.txt`):
- **Passed:** the site's height stayed at the inflated 3,245,092 through the pairing. `checks.node` is `unavailable` ("no second node answered…"), and `status` says the same. At 21:35:09 "answering the site's wallet probe" `match=true receivedTop=0`, after 70 s of scanning. Wallet 1 is current, the pool is 2–51 (50 free), the address check is ok, and bad rows are still 2. RT-32 didn't fire.
- **Not as expected: no clamp line.** The installer said "The site has open invoices from about block 2241400 on". The code is right: the site's suggestion is the minimum over every wallet's watched invoices, and two empty expired wallet-0 tips from 2 November are still watched (`inv_79311d2f506ce6e1`, index 357, `createdHeight` 2,242,120; `inv_0eebd504fb0ec85f`, index 358, 2,242,149). 2,242,120 − 720 = 2,241,400. They would leave the watch at 15:58 and 16:50 UTC on 9 November, and until then no report can move them: wallet 0 isn't reporting. The runbook, written on 2 November, didn't allow for them.
- **Index 2 is back in the pool:** paid on 2026-10-30 at 2,240,130, below this scan's start, so the wallet doesn't know. Known limit (a restored wallet misses what it didn't scan); no wrong credit, a privacy cost.
- **RT-32's reach, wider than I told Wyatt:** a default install scans back to the oldest watched invoice − 720, which can be days. So a payment inside that span can fire the loop with no `--restore-height` at all (traced, not run).

Stopped here for Wyatt's call on the clamp; 3d not started.

**3c, second install, for the clamp (Wyatt chose to redo it before 3d):**
- **Edit:** site stopped, backup `~/xmr-pay-dev-data/redteam/live-before-clamp-edit.db` (SHA-256 `533716c0cf1b81ebb72af752a73a1d4667ca8243c97c694df85ce0aaafef6d45`), then `seq` set to `expiresAt` + 24 h on `inv_79311d2f506ce6e1` and `inv_0eebd504fb0ec85f`, so they leave the watch. A dev-only edit to two evidence rows; `live-before-step3.db` has the originals. The only watched invoice was then the inflated tip.
- **Clamp, PASS** (installer log, install from 21:39:28 UTC; evidence `~/xmr-pay-dev-data/live-step3-output-2.txt`): "The site suggested scanning from block 3244372, above the node's height 2245099; the new wallet scans from block 2244379 instead." 3,245,092 − 720 = 3,244,372 and 2,245,099 − 720 = 2,244,379.
- **The rest, PASS:** the height stayed at 3,245,092 through the pairing; the node check is `unavailable`; the wallet answered at 21:41:55 UTC with `match=true receivedTop=0` after 55 s; wallet 1 is current; the pool is 2–51; bad rows are still 2.

**3d, unblock and re-pair the same wallet:**
- **`unblock 1` (21:44:45 UTC):** `/etc/hosts` back to `1d3d9611…ea2c`. The node check went from `unavailable` to `ok` by 21:45:37.
- **Height before `pair`:** 3,245,092, both at 21:45:37 (first read with the check `ok`) and at 21:46:24, right before the code. Ordinary syncs with a second node answering didn't lower it.
- **`pair --code -`, PASS:** at the watcher's 21:46:43 read the height was 2,245,102, the dev box's node's height then, under the new key `lChpFHckCep9yt5h`. So the heal came from the pairing. The inflated tip's floor is now 2,245,072 (`min(3245092, 2245102) − 30`), and that floor moves up with the site's height (RT-34).

**3e, payments held:**
- **`block 2` (21:47:36 UTC):** all five hosts PASS with the corrected check; `before-block-1` unchanged.
- **Wyatt's keep-alive prediction, confirmed:** `checks.node.state` was still `ok` at 21:49:50, 2 min 14 s after the block, and the site's height rose once after it. After `sudo systemctl restart xmr-bridge` (service up 21:50:38) it read `unavailable` at the first read, 21:50:47. So a hosts-file block doesn't reach a running bridge's open connection; only a restart cut it. A test-method lesson, with no effect on a shop.
- **Fresh tip:** `inv_bf39dc72bcab799f` (0.001 XMR, wallet 1 index 2, `createdHeight` 2,245,104), opened only after the precondition held. Index 2 had received a payment on 2026-10-30, below this wallet's scan start.
- **Payment:** tx `bd9d1605f25d…`, 0.001 XMR, on the site at 21:59:15 UTC as `confirming`, 0 of 2 (`classify`: the full amount seen, under the required depth).
- **The hold, PASS** (log `~/xmr-pay-dev-data/live-step3e-held.txt`): mined at 2,245,107. At 22:02:14 the dev box's node and the bridge's wallet were at 2,245,110, 3 real confirmations against 2 required, while the site held the transfer at 0, the tip and the public status route said `confirming` 0 of 2, the site's height stayed at 2,245,104, and the node check read `unavailable`. The admin page's alert itself wasn't viewed: read from `checks.node`, which it renders.
- **`unblock 2` (22:02:34 UTC):** `/etc/hosts` back to `1d3d9611…ea2c`, no marker. **Settled at 22:02:41**, 7 s later, 3 of 2, no restart.
- **Observation:** Health kept saying "held at 0 confirmations" for 47 s after the tip settled (cleared at 22:03:28, height 2,245,110). The payment check asks a second node every sync, but the height bound only once a minute and its "unavailable" overrides. Cosmetic, up to a minute; not filed.

**Step 3 result: 3a–3e pass.** The clamp, no height on a pairing with no second node, the heal by pairing only, the hold and the release are shown live on `0.0.202611022057-dev.1df3c4d`.

**Not covered:** RT-34 live (nobody paid the inflated tip); the admin page's alert by eye; the IPv6-only client path around a hosts-file block (the bridge doesn't use one).

**Findings:** RT-32 corrected and its reach widened, RT-33 noted, RT-34 added, a setup-friction row. No code changed.

**The state I leave:** the dev site, the release server and the watcher are running, the bridge is on `https://stagenet.xmr.kernal.eu:38089` with key `lChpFHckCep9yt5h` and the phase 05 wallet (wallet 1). `data.db` still holds step 3's changes, including the `seq` edit and tip `inv_ca1ec50afd39fb95`; `live-before-step3.db` is the restore point, if Wyatt wants it.

**Next:** Wyatt says whether to restore `data.db`, then step 4 (RT-20 live), step 5 (back to the shop wallet), his rulings on RT-32, RT-33 and RT-34, the fixes tests first, one dev release, and step 2's rerun. That rerun can't show RT-33 live: the old tip's 24-hour watch has ended, so RT-33 needs a test.

## 2026-11-06 · Combined live session: step 4 (RT-20 live), before the handoff

- **The watcher:** its stop action is now `tmux kill-session -t built` (Wyatt approved the command), then a check that 4322 is free, with SIGTERM to the pid `ss` names on that port as the fallback, and a log of any workerd left.
- **Dev site stopped, then `npm run build`** at `f1f016f` (the old `dist` was from 2026-10-30, before RT-20's fix). The new `tip_BJmho54D.mjs` holds `crossSite` with `getPublicOrigin`.
- **The stop command, tried once for real:** built copy up with `HOST=0.0.0.0 PORT=4322 EMDASH_SITE_URL=https://dev.wyattdilley.com`, home and status route 200, workerd running. `tmux kill-session -t built` exited 0, the port was free after about 2 s, and no workerd was left. Started again: home and status route 200.
- **Wyatt's question: what does `de558a1` accept as the site's own origin? (from the code, EmDash 1.3.1; not run.)** The request's own origin, or `getPublicOrigin`: `config.siteUrl`, then `EMDASH_SITE_URL` / `SITE_URL`, then the request's origin. It does **not** read Settings › General's Site URL (`site:url`). `locals.emdash.config` is the build-time config; `site:url` only reaches `resolveSiteOrigin` and `getChosenSiteOrigin`, which feed `ctx.site` and outbound links. So an admin who sets only the Site URL gets the right address for plugins and a 403 on the tip button. A gap in RT-20's fix against spec change 42 item 3's proposed banner text; Wyatt decides whether release 1 needs it. The second pass he described applies only if the fix read the whole chain, so it isn't run.

### Passkey sign-in behind a proxy with only the Site URL set (from the code, EmDash 1.3.1, Astro 7.3.5; no browser run)

Wyatt's question, before choosing how to close RT-20's gap. **Corrected the same day:** my first version called Astro's `createRequest`, which the Node adapter doesn't use, and wrongly said the `rpId` becomes `localhost`.

- **Result: a passkey can't sign in at the public address.** `passkey/options.ts:59` and `passkey/verify.ts:41` use `getPublicOrigin`, which doesn't read `site:url`. The adapter (`@astrojs/node` `serve-app.js:64`) calls `createRequestFromNodeRequest`: host from `Host`, protocol from the socket. An in-memory call of that function with a proxy that keeps `Host` gave `http://shop.example.com`, so the `rpId` is right but the accepted origin is http. `@emdash-cms/auth` `authenticate.ts:226` refuses the browser's `https://` origin. Registering a passkey there fails the same way (`register.ts:173`). `EMDASH_ALLOWED_ORIGINS` needs `siteUrl`. A proxy that rewrites `Host` gives `http://localhost:4322` and an `rpId` of `localhost`.
- **Exception, no gap:** with `security.allowedDomains` in the site's own Astro config and `X-Forwarded-Proto` sent, Astro's `FetchState` (`fetch-state.js`, `#applyForwardedHeaders`) moves both the URL and the request to https, so passkeys and the tip both pass with no `siteUrl`. From reading; the in-memory call stops before that step.
- **Exception, the gap's real reach:** a production build can't run setup without a configured address (`setup/index.ts:72`, `SITE_URL_REQUIRED`), so a site with none was set up under `astro dev` on loopback. Its admin can keep using a passkey through a tunnel to loopback, or a magic link if email is set up, or a handover session. With only the Site URL set, Coffer's install command is right and every tip gets a 403.
- **Not traced:** Cloudflare Access on a self-hosted Node site, and whether a session at the old address survives setting `EMDASH_SITE_URL` and restarting.
- **Wyatt's decision (2026-11-06): option 2.** The tip keeps refusing, the limit is recorded, and the banner stops telling admins to change EmDash's address settings. Exact text and the toast are in spec change 42; built in phase 09.
- **Built:** the owner's message on that refusal (`theme/src/tip.ts`, `proxyNotSetUp`; two new T17 tests). The built copy on 4322 is still `f1f016f` and doesn't have it; no live run of the message yet.

### Step 4 result: RT-20 first pass passed

Wyatt pressed the tip button on `https://dev.wyattdilley.com/posts/welcome` through his tunnel and reports a pass. The watcher logged one new invoice and one newly claimed address at 00:14:34 UTC on 2026-11-07 (17:14 local, the evening of 2026-11-06), bad rows still 2, no stop. The tip stays unpaid; the bridge points at `localhost:4321`, so it can't settle here. The second pass doesn't apply.

**Next:** step 5 (back to the shop wallet on the own node), on Wyatt's word. Then his rulings on RT-32, RT-33 and RT-34.

### Step 5 result: back to the shop wallet on the own node, passed (second install)

**First install (00:33:51 UTC):** Wyatt's Feather wallet `58WW…eSZP`, not the shop wallet. My hand-off said only "the shop wallet", a name the records also use for his Feather wallet; `docs/setup-friction.md` has the row. The site correctly matched wallet 1: `match=true receivedTop=2`, catch-up to 3, free rows 4–53, no loop. Output kept as `live-step5-output-1.txt`.

**Second install (00:48:48 UTC):** `59nA…etgQ`, no `--node`, no `--restore-height`; evidence `live-step5-output.txt`, `live-step3-watch.txt`.
- **Installer:** own node on 127.0.0.1:38081; scan from 2,244,396 (the first-pass tip's 2,245,116 − 720); no clamp line.
- **Bridge:** 00:50:49 `match=true receivedTop=0`, catch-up to 359, caught up 00:50:58, re-offer from 360 with count 0, created 50.
- **Site:** key `gcczMoiL0O46qhtJ`, wallet 0, height 2,245,206 with the node at 2,245,207, free rows 360–409 with nothing skipped, 312 claimed, 2 bad (306 and 100356, the baseline), address check OK, no watcher stop.
- **First-pass tip `inv_cbaca928ccb6a291`:** expired `wallet_changed` at 00:50:49. **My prediction was wrong:** I said that after its 00:44:32 deadline it would expire normally on wallet 1 first. It stayed `new` past the deadline with no evidence coming in, as the expire-on-evidence rule says, and expired at the switch.
- **Settled tip `inv_bf39dc72bcab799f`:** still settled with its transfer. Recorded under RT-33.
- **`/etc/hosts`:** still the recorded hash.

**Not covered:** a new payment to wallet 0 (none was made), and the admin page by eye.

**CI:** run 42318147527 passed on `d381cbe` (plugin, theme, bridge with the race detector).

**Running:** dev site, watcher (baseline 2), release server, and the bridge on `59nA…etgQ`.

**Next:** Wyatt's rulings on RT-32, RT-33 and RT-34; the fixes, tests first; one dev release he signs; step 2's rerun.

## 2026-11-06 · Phase 07b fix sessions · RT-32, RT-33, RT-34 fixed in code (spec change 48)

**Wyatt's rulings:** RT-32 Medium, blocks release 1. RT-33 Low, doesn't block, closed with RT-34's fix. RT-34 Medium, fix in release 1; unit-tested, not live, by his decision. Plan approved with his changes; the record is spec change 48.

**RT-32 (bridge):** `checkPool` compares digests for every index the wallet holds; the bound applies only to indexes it doesn't hold. The wallet is saved after every create. A failed save warns on Health and in the log, the addresses still go out, and every sync tries again. A circuit breaker has two triggers: `bad_created` and `too_many` (100 created for the pool without `claimedTop` rising; catch-up doesn't count).

**Test 7, real wallet-rpc, view-only shop wallet copy (`TestLiveStoreSurvivesKill`):**
- Without `store`, as Wyatt asked first: FAIL, index 50 forgotten after `kill -9`. So the test can fail, and the address count didn't survive a crash.
- With `store`: PASS, index 50 kept.

**RT-33, RT-34 (plugin):** `settledFloor` and `floorPin`, with the estimate from the time since creation. The ignored line uses the same floor as totals. Mutation check: putting back my plan's flaw (Wyatt's catch) fails 2 tests in `rt34.test.ts`, including "nothing counted in totals ever appears on the ignored line". The one exception, by his ruling: a settled invoice with no stored floor counts its old payments and still lists them.

**Test results:**
- Bridge: gofmt and vet clean; all 21 packages pass; race detector passes on `bridgeloop` and `cmd/xmr-bridge`; the static build works. New: 15 subtests in `rt32_test.go`, `TestStore`, `TestStatusBreaker`.
- Plugin: typecheck clean, validate passes, bundle 73.0 KB. Default config 454 passed, 12 expected fail, 1 skipped; goods config 101 passed, 1 skipped. New: `rt34.test.ts` and `admin-48.test.ts`.
- No existing test changed, apart from `Store` on the bridge's shared fake wallet.

**Not covered:** nothing here has run on the dev site or through a real bridge yet. Theme and contract tests weren't rerun; neither changed.

**Text for Wyatt to review (spec change 48):** my additions to his banner, for one and for no free addresses, and the amber line for a failed save.

**State:** dev site, watcher and release server stopped. The bridge is on `59nA…etgQ` and backs off while the site is stopped. These commits are local; `origin/redteam-1` is at `d381cbe`.

**Next:** Wyatt pushes or says to, CI on the tip, a dev release he signs, then step 2's rerun: restore `live-before-step2.db`, install the Feather wallet `58WW…eSZP` with `--restore-height 2230020`. Expected: no bad rows, no loop, the old tip's ignored line, and a fresh tip showing nothing received until he pays.

### Before the dev release (Wyatt's list, 2026-11-06)

- **Pushed** `b21ad5b`, `427049e`, `04de32d`, `0d6d7b6` to `origin/redteam-1`.
- **Shared vector:** `contract/test-vectors/bridge-checks.json`, read by `TestBridgeChecksVector` and `plugin/tests/sync/vectors.test.ts`: both stop reasons, a failed save, both together, neither. Renaming a reason on either side fails its test (tried once on each, then restored).
- **Banner with no free addresses:** Wyatt's text. Checked: an empty pool gives `NO_ADDRESS_AVAILABLE`, which the theme treats as a fallback case (`theme/src/tip.ts`, `FALLBACK_CODES`), so a site with an 18 A address still shows it.
- **Failed-save line:** Wyatt's text.
- **Known limit:** now names a failed save followed by a crash.

**Step 2's rerun, in order (updated):**
1. Build the plugin for the dev site. Wyatt uninstalls the bridge.
2. **Both banners by eye:** with the site stopped and no bridge running, `python3 -I ~/xmr-pay-dev-data/live-banners.py` writes the two checks into `state:bridge` (dry run on a copy passed; it refuses while the site or the bridge runs). Start `astro dev`, Wyatt looks at the admin page through his tunnel, then stop the site. The restore in step 3 removes the write.
3. Restore `live-before-step2.db`, start the site, the watcher on (bad rows baseline from that backup).
4. Install the Feather wallet `58WW…eSZP` with `--restore-height 2230020`. Expected: no bad rows, no loop.
5. **After the pool fills:** Wyatt runs `sudo systemctl restart xmr-bridge` once. Expected: still no bad rows.
6. The old tip's ignored line, and a fresh tip showing nothing received until he pays.

**Test results after this list:** bridge gofmt and vet clean, all 21 packages pass. Plugin typecheck clean, validate passes, bundle 73.1 KB; default config 459 passed, 12 expected fail, 1 skipped; goods config 101 passed, 1 skipped. CI run 42329784544 passed on `0d6d7b6`, before these changes. The commit below is local until Wyatt says to push it.

**CI and the dev release:** CI run 42331090673 passed on `82ac08d` (plugin, theme, bridge with the race detector). Dev release `0.0.202611070301-dev.82ac08d` built from a clean tree, in `~/xmr-pay-dev-data/dev-release/`, unsigned until Wyatt runs `scripts/sign-dev-release.sh`. SHA-256: `release.json` `05ff9dfeb2dea14a66685456976f85979d723d14673de962c37ad51ab399115e`, `install.sh` `a073a0da3648c951e955efbd70fb52821c6de38ecd3699381c43a17edc359b0a`, amd64 `bcd6ca396c2a17ff08c24fe9d31882f4365619093170d6f78655c8e41a798e19`, arm64 `9f8f6a1a592d68b902af60ffe48a86b0a99d706d0c93535f68d528cead628abc`.

### Step 2's rerun on dev release `0.0.202611070301-dev.82ac08d`: passed

Times UTC, 2026-11-07. Restored `live-before-step2.db` (hash `a46a7baa…`); Wyatt's Feather wallet `58WW…eSZP`, own node, `--restore-height 2230020`. Evidence: `live-rerun-output-install.txt`, `live-rerun-output-restart.txt`, `live-step3-watch.txt`, `live-rerun-feather.txt`.

- **The signed update:** the old bridge updated itself to this release at 03:34:02, just before the uninstall, so the real updater accepted Wyatt's signature. Not planned.
- **Both new banners by eye (Wyatt):** both show on the dev site. Written with `live-banners.py`; one stop reason (`too_many`) and the failed-save line. Before the restore, so the restore removed the write.
- **RT-32, the shape that looped on 2026-11-02:** 03:45:56 `match=true receivedTop=2`, re-offer `from=2 count=0`, `created pool addresses count=50`, once. Free rows 3-52, consecutive; index 52 is above the old bound of 51. Still 2 bad rows (306, 100356), address check OK, no mismatch, no loop, the watcher never stopped the site.
- **The restart (Wyatt's item):** `sudo systemctl restart xmr-bridge` at 03:48:53, so `receivedTop` is gone from memory. Nothing created, rows still 3-52, still 2 bad rows, address check OK.
- **RT-33's symptom:** the old tip `inv_f7ea94de1471f114` stayed settled, with no new alert. Its 24-hour window has ended, so it wasn't being watched; the unit tests are what cover RT-33.
- **RT-31's line (spec change 47):** Wyatt read it on the admin page. It says the older payments "were ignored", which is false for this tip because they count. Recorded under spec change 48; not changed during the live check.
- **The fresh tip `inv_78bc3086b267cac7`** (wallet 1, index 3, `createdHeight` 2,245,295), paid by Wyatt from the Feather buyer wallet through its pay page:
  - before payment: `new`, 0 received on the status route;
  - 04:08:02: seen, `confirming`, 0 of 2; the pool topped back up to 50;
  - 04:15:26: settled, mined at 2,245,306, 2 confirmations, `settledFloor` 2,245,265 (`createdHeight` − 30), no `floorPin`;
  - the status route agrees and shows no floor fields; no new alert.

**Not covered:** the fresh tip in the `58WW…` wallet's Feather history (Wyatt's to check); RT-34 live (unit-tested, not live, his decision); `bad_created` and "none left" by eye (tests cover the wording); the breaker tripping live, and a failed save live.

**Wyatt's finding:** the admin page can't tie a person to a row. Logged as spec change 49 (proposed, not built). My view: it doesn't block release 1.

**Waiting on Wyatt:** the older-payments wording; whether items 1-3 of spec change 49 go in phase 09; whether to go back to step 5's state (`live-before-step2-rerun.db`, then the shop wallet).

## 2026-11-06 · Combined live session: handoff

**Tonight's result:** step 2's rerun passed on dev release `0.0.202611070301-dev.82ac08d`. RT-32 is fixed and live-checked. RT-33 and RT-34 are fixed in code and unit-tested. RT-20's first pass passed. Wyatt confirmed the fresh tip (txid `2cc3ae6e…`, 0.001 XMR) is in the `58WW…` wallet's Feather history.

**CI:** run 42340203092 passed on `7918bc3` (plugin, theme, bridge with the race detector). `origin/redteam-1` is at `7918bc3`; this entry's commit, with tonight's spec notes, is local and in the bundle.

**The state I leave (Wyatt, 2026-11-06: no swap tonight):**
- **The bridge:** installed, running `82ac08d` on **Wyatt's Feather wallet `58WW…eSZP` (wallet 1)**, own node, key `Px6/BDHqOl3kPXto`, `--restore-height 2230020`. It backs off while the site is stopped, and logs failed update checks while the release server is stopped.
- **`data.db`:** from after step 2's rerun, matching that bridge: wallet 1 current, height 2,245,323, 310 claimed, 50 free, 2 bad; 26 expired, 1 review, 33 settled. Read-only copy: `redteam/live-after-step2-rerun.db` (SHA-256 `b18068c4e0918a973f0aa8efee946e6c572662efded14fcde301a1888840f112`).
- **Stopped:** dev site, built copy, watcher, release server. The release in `~/xmr-pay-dev-data/dev-release/` is signed. `/etc/hosts` has its recorded hash. Wyatt's tunnel route to 4322 is down.
- **Wallet names, from here on:** the dev box CLI wallet (`59nA…etgQ`, `~/stagenet-wallets/shop`, wallet 0) and Wyatt's Feather wallet (`58WW…eSZP`, wallet 1). Both have been called "the shop wallet". A separate Feather buyer wallet pays the tips.

**Next session, in order:**
1. **Swap back to wallet 0.** With the site stopped: restore `redteam/live-before-step2-rerun.db` (SHA-256 `1572b9019496663940a9b921a44f7fc066db2ee8601848bb853b8f712d59788c`), then Wyatt uninstalls (`sudo xmr-bridge uninstall --delete-data`). Only then start the site and the release server: a site restored under a running bridge would refuse its key. Issue a code when he's at the prompt; he installs `59nA…etgQ`, reading its details himself with `nano -v ~/.config/xmr-pay-dev/stagenet.env`. Expected: wallet 0, `claimedTop` 359, free rows 360-409, no bad rows beyond 2.
2. **The Mark settled fix (spec change 48), tests first.** Mark settled stores the floor. Wyatt decides whether the no-floor line then goes (Claude's recommendation) or takes his approved wording. Not built tonight; found by reading the code, not run.
3. **Spec change 49:** items 1-3 go in phase 09; items 4-5 block release 2.

## 2026-11-08 · Phase 07b fix sessions · Step 1 of the handoff: back to wallet 0, passed

Plan approved with Wyatt's changes: push the handoff first; hash and WAL checks after the restore; the bridge's data folder confirmed gone; the watcher's stop action shown and tried before the install; `--pair "$(cat <file>)"` instead of typing the code; push this entry and check CI. Times UTC.

- **Pushed** `3f4f4c6` to `origin/redteam-1`. CI run 42514858815 passed (plugin, theme, bridge with the race detector).
- **Before the restore:** backup `redteam/live-before-swap0.db`, SHA-256 `b18068c4e0918a973f0aa8efee946e6c572662efded14fcde301a1888840f112`. That's the same hash as `live-after-step2-rerun.db`, so nothing changed while the site was stopped.
- **Restore (19:24):** `setup-test-reset.mjs --restore redteam/live-before-step2-rerun.db`; the state it replaced is in `baseline/data.db.before-restore-20261108T192424799Z`. Checked before the site started:
  - `data.db` SHA-256 `1572b9019496663940a9b921a44f7fc066db2ee8601848bb853b8f712d59788c`, equal to the backup;
  - no `-wal` or `-shm`, before and after the count read;
  - counts equal to the backup: 62 invoices, 364 pool rows (312 claimed, 50 free, 2 bad), wallet 0, key `gcczMoiL…`.
- **Uninstall (Wyatt, `--delete-data`):** `swap0-uninstall-output.txt`. Checked without sudo:
  - the service is inactive;
  - `/var/lib/xmr-bridge` (the view-only copy of `58WW…eSZP`), `/etc/xmr-bridge`, the unit file and `/usr/local/bin/xmr-bridge` are gone;
  - there's no `xmr-bridge` user, and no bridge or `monero-wallet-rpc` process is left.
- **The watcher's stop action, shown to Wyatt and tried:** `npx astro dev stop` in the site folder, then up to 15 s for 4321 to be free, SIGTERM to the pids `ss` names as the fallback, and a log of any workerd left. Step 4's `tmux kill-session -t built` is gone since step 5.
  - **Proof run:** a scratchpad copy that logs to the scratchpad, with a baseline of 1, against the agent-started `astro dev`. It tripped at 19:26:57; the stop exited 0; 4321 was free at 19:27:00; `astro dev status` reported none running and no workerd was left.
  - The site was started again, and the real watcher (`live-step3-watch.py 2`) started at 19:27:25.
- **Install:**
  - **Wallet:** the dev box CLI wallet `59nA…etgQ`, details read by Wyatt with `nano -v`.
  - **The code:** issued at 19:28:12 into `swap0-pair-code.txt` after Wyatt said he was ready; then he pressed Enter.
  - **Installer:** the log starts at 19:29:14. Own node 127.0.0.1:38081; scan from 2,244,396 (the same as step 5's second install); no clamp line.
  - **Bridge (journal):** `82ac08d`, up at 19:31:46. Then 19:32:30 `match=true receivedTop=0`, catch-up to 359, caught up 19:32:39, re-offer `from=360 count=0`, `created pool addresses count=50`, once.
  - **`status`:** paired, key `UZep0Y+m…`, node check off (own node), address check ok, 50 of 50 addresses ready.
- **Site (read-only):**
  - wallet 0 current, key `UZep…`; the previous key is kept;
  - `claimedTop` 359, free rows 360–409, consecutive;
  - 2 bad rows (306, 100356); wallet and pool checks ok;
  - invoices unchanged (28 expired, 1 review, 33 settled); no new alert (the one `reversed` alert was already in the backup);
  - the watcher logged no STOP.
- **A snag:** the collect script's first run left no output file and its cause isn't known; it's a row in `docs/setup-friction.md`. The script now refuses root, uses an absolute path and prints where it wrote. The second run gave `swap0-output.txt`.
- **After:** `redteam/live-after-swap0.db`, SHA-256 `9135c05296ab9afd85ed8fdc31450b8026dce23c5b61b88a8c78e14ce5d43eb0`. Its counts match the restore.
- **Tidied:**
  - deleted the used `swap0-pair-code.txt` and the expired `3i-pair-code.txt` and `3j-pair-code.txt`;
  - stopped the watcher, the dev site (`astro dev status`: none) and the release server;
  - 4321, 4322 and 8099 are free, and no tmux sessions or leftover shells remain.

**Not covered:** a new payment to wallet 0, and the admin page by eye.

**State:** the bridge is installed on wallet 0 (`59nA…etgQ`, key `UZep…`, own node, `82ac08d`). It backs off while the site is stopped and logs failed update checks while the release server is stopped.

**Next:** step 2, the Mark settled fix (spec change 48), tests first. First Wyatt decides whether the no-floor line goes once Mark settled stores the floor (my recommendation), or keeps his approved wording.

## 2026-11-08 · Phase 07b fix sessions · Step 2 of the handoff: Mark settled stores the floor (spec change 48)

**Wyatt's decisions (2026-11-08):**
- Drop the ignored line's no-floor wording and the no-floor fallback. 1.0.0 can't create a settled invoice without a floor once Mark settled stores one.
- Marking settled changes the status, not the money. Totals count only transfers at or above the floor, never the requested amount, and the settled count rises by one.
- A test for a missing or non-number `state:bridge` height.
- Answer 1(a) no longer applies (`docs/decisions.md`, the RT-33 record).
- No live look now; he checks the admin page by eye after spec change 49's rows are built.

**What the code did before the change, run with the new tests:**
- A checkout tip in review (`wallet_changed`) with 0.0007 XMR, all below its floor, marked settled: Received went from 0.001 to **0.0017 XMR**, and no floor was stored.
- One transfer above the floor and one below: both added (0.0017).
- A pre-floor settled row: its old payments counted (0.0013).
- The requested amount was never added; totals only sum transfers.

**Built:**
- **`core/invoice.ts`:** `storeSettledFloor` (the pin, else the moving floor), used by a sync's settle and by Mark settled.
- **The fallback removed:** `floorHeight` is `settledFloor ?? floorPin ?? movingFloor`, and `ignoredOld` is `belowFloor` alone.
- **The height guard:** `movingFloor` treats a site height that isn't a positive whole number as unknown, so the floor is `createdHeight − 30`.
- **`admin.ts`:** the settle verb stores the floor from `state:bridge`'s height. A reversed tip keeps its first floor.

**Tests:**
- **New:** `plugin/tests/routes/admin-settle-floor.test.ts`, 15 tests: Wyatt's case, the case with a later heal, one transfer above and one below, the stored floor and the pin, a reversed tip, 10 bad `state:bridge` heights, and the `inv_f7ea…` shape.
- **Replaced:** `rt34.test.ts`'s two RT-33 tests checked the removed fallback.
- **Mutation checks:**
  - **Without the admin's floor store:** 11 fail. Wyatt's case at first didn't; with the fallback gone, the moving floor gave the same answer at the test's height. So I added the heal (the site drops below the old payments' blocks). It then fails with 0.0017.
  - **Without the height guard:** 3 fail (heights 1.5, `true`, `"12"`). The other bad values never pass `> 0`.
- **Results:**
  - Typecheck clean, validate passes, bundle 73.1 KB.
  - Default config: 472 passed, 12 expected fail, 1 skipped (459 before, +15 −2).
  - Goods config: 101 passed, 1 skipped.
  - Log: `~/xmr-pay-dev-data/plugin-tests-48-settle.txt`.

**What old dev rows show:** simulated on `live-after-swap0.db` at height 2,246,511, and tested on the row's shape. Only `inv_f7ea94de1471f114` changes.
- **Admin page:** settled, 0 XMR, with "Older payments to this address were ignored: 0.0003 XMR in 3 transfers, mined at blocks 2,230,085 to 2,240,100, before this tip."
- **Tips Received:** drops from 0.023095718039 to 0.022795718039 XMR. The settled count stays at 21.
- **Status route:** it re-evaluates without storing, so it answers `review` with 0 received.

**Docs:** spec change 48 (floor items 1 and 3, and the decision), `docs/decisions.md`, the RT-33 record, and matrix rows T14, R10 and P02.

**Not covered:** nothing live (Wyatt's decision). Theme and contract tests weren't rerun; neither uses the floor.

**CI:** run 42515955689 passed on `32aad54` (step 1). This commit is pushed and its CI is checked below.

**Next:** step 3, spec change 49: items 1–3 go in phase 09, and items 4–5 block release 2. Then the session-end bundle.

## 2026-11-08 · Phase 07b fix sessions · Step 3 of the handoff: spec change 49 placed, then the session-end handoff

**CI:** run 42520126113 passed on `a6e58ce` (step 2: plugin, theme, bridge with the race detector).

**Wyatt's decisions (2026-11-08):** phase 08 builds items 4 and 5. Before 1.0.0's storage contract is frozen, phase 09 decides whether item 4's txid lookup needs a new index. Feather's check in 09b pays through the full `monero:` link or QR.

**Written (docs only):**
- **`docs/phases/09-release.md`:**
  - a Wyatt checkbox, and a step 1 bullet for the txid decision (index plus a day-one field in 1.0.0, or a bounded scan measured on the dev site);
  - a step 3 bullet for items 1–3, with the pay token never on a row (tested under T09), Wyatt's by-eye check, and the newest-10 limit for step 1's review;
  - a 09b gate for items 4–5 with the Feather check.
- **`docs/phases/08-store-adapter.md`:** a section for items 4 and 5.
- **`docs/spec-changes.md` 49:** where each part is scheduled. **`docs/decisions.md`:** a row for the split.

**Wyatt's question, not built: could a "show older tips" control that reads only stored data fit phase 09 without a contract change?** From the code, yes.
- **An existing pattern:** All invoices already pages with a storage cursor (`invoices_page` and `invoices_newest` actions on the private `admin` route, `plugin/src/admin.ts:793-799`).
- **The query already exists:** the Tips view already queries `where: { kind: "tip" }, orderBy: { createdAt: "desc" }` (`admin.ts:743`), which is covered by the declared `["kind", "createdAt"]` index.
- **Nothing in the contract changes:** a `tips_page` action with a cursor adds no route, collection, index, capability, page or widget. Its value is checked the way `invoices_page`'s is, under F04.
- **Caveats:**
  - Test tips (no `via`) are filtered out after the query, so a page can show fewer than 10 visitor tips.
  - Tips past the 30-day purge show without notes.
  - Each page costs the same Block Kit budget as today's 10.
- **Effect:** with items 1–3 on each row, any tip can be matched by eye, which eases the newest-10 limit in release 1. It doesn't search by txid.
- It's a new admin action, so it's Wyatt's call whether phase 09 takes it.

**The state I leave:**
- **The bridge:** installed on **wallet 0**, the dev box CLI wallet `59nA…etgQ`, own node, key `UZep…`, `82ac08d`. It backs off while the site is stopped and logs failed update checks while the release server is stopped.
- **`data.db`:** the after-swap state, `redteam/live-after-swap0.db` (SHA-256 `9135c052…3eb0`).
- **Stopped:** dev site, built copy, watcher, release server. No pairing-code files are left in `~/xmr-pay-dev-data/`.
- **`origin/redteam-1`:** this entry's commit, pushed. A session-end bundle follows; the next session's entry records its name and hash.

**Next session:**
1. Wyatt says whether "show older tips" goes in phase 09.
2. Then the rest of 07b's fix sessions or phase 09, as Wyatt names.

### Addendum: "show older tips" goes in phase 09 (Wyatt, 2026-11-08)

- **Written (docs only):**
  - `docs/phases/09-release.md` step 3: the `tips_page` action, with tests first: [F04] a malformed or forged cursor, [F04] a non-admin request refused, [T30] test tips filtered, [T09] no pay token.
  - Step 1's security review lists it as new admin surface after 07b pass 1.
  - A row in `docs/decisions.md`.
- **CI on `07c8796`:** run 42525837313 passed (plugin, theme, bridge with the race detector), checked before this commit was pushed. A fresh bundle follows; the next session's entry records its name and hash.
- **Next session:** phase 09 or the rest of 07b's fix sessions, as Wyatt names.

## 2026-11-08 · Phase 07b fix sessions · Triage of the open findings, and the handoff before phase 09

Docs only: no live runs, no sudo. About 45 minutes, by Wyatt's limit.

**Wyatt's rulings (all of my calls taken; recorded in `docs/decisions.md` and the findings table):**
- **RT-08: accepted limit** (was High).
  - Prevention holds while the honest wallet host runs (live 2026-11-02).
  - A thief who took the key from the wallet host can also stop it. Then new tips can go to the thief's wallet until the host is back or the admin re-pairs.
  - The final wording is in spec change 44, with Wyatt's correction: a thief there has the view key too, so can see incoming payments.
- **RT-12: accepted limit** (was Medium): a docs line; re-checked at the EmDash 1.4.0 check.
- **Fix before release 1:**
  - **RT-05:** put an IPv6 /64 in one bucket; about ½ session.
  - **RT-07:** claim the code first with `ctx.kv.compareAndSet`, then a live `c6` rerun; about 1 session. Not changed by spec changes 45–48; 45 moved the burn to the end of pairing, which widened the window.
  - **RT-15:** scan newest first, then cut the per-sync cost; 1–2 sessions. The session starts with a re-measure on the built copy, since spec changes 46–48 added per-sync work after the 10-30 figure.
  - **The Lows** RT-02, RT-03, RT-10, RT-14, RT-22 and RT-23, together; about 1 session.
- **Left for release 1:** RT-01, RT-04, RT-06, RT-09, RT-18 and RT-21. RT-13 and RT-19 get docs lines in phase 09.
- **Release 2 list:** RT-25 (phase 09's 09b section). **Wyatt's upstream list:** RT-16 and RT-17.

**Question for later (in `docs/decisions.md`, "Still to decide"):** could RT-08's re-check after an outage cover every row added since the bridge's last check, not only the last 24 hours? If that's small, it narrows the accepted gap.

**What's left before phase 09** (its first checkbox: 07b done, no High open, every Medium fixed or accepted):
1. RT-07 (1 session, plus live `c6`).
2. RT-15 (1–2 sessions, re-measure first; built copy, no sudo).
3. RT-05 (½ session).
4. The six Lows (about 1 session).
5. **The EmDash 1.4.0 check** through `docs/emdash-upgrade-checklist.md` (decided 2026-10-31; its 7-day mark has passed). It re-checks RT-12 and RT-13 there; a dependency upgrade, so Wyatt approves it first.
6. Wyatt's answer to the RT-08 re-check question, if it's to go in before phase 09.

**Not done this session:** matrix T03's text isn't updated to the final wording yet (spec change 44 holds it). The next fix session does that with RT-07's matrix row.

**State:** unchanged from the step 3 entry: the bridge on wallet 0, with everything else stopped. A bundle follows.

## 2026-11-13 · Phase 07b fix sessions · RT-07 fixed (spec change 50), live `c6` passed

**The last session's bundle:** `~/xmr-pay-dev-data/bundles/coffer-redteam-1-20261108-07c2bba.bundle`, SHA-256 `2c1e7fa04ef170912be6cdfbcf61628aec2fc04880ae88933c981f19d255468f`.

**Wyatt's ruling (2026-11-13, in `docs/decisions.md`):** release on error. The pairing code is claimed first; a failed write puts it back, so spec change 45's retry holds. Only a site killed mid-pairing leaves the code spent.

**Built (commits `7aa7b57` spec change 50, `c05c815` the fix):**
- **`plugin/src/sync/handle.ts`:** after the code and signature checks, `store.claimPairing` before any other write; a lost claim returns `PAIRING_REJECTED`. 45's steps run in a `try`; a throw calls `store.releasePairing`, then rethrows. The final write of the pairing state is gone.
- **`plugin/src/store.ts`:** `claimPairing` (`ctx.kv.getVersioned`, then `compareAndSet` on that revision) and `releasePairing` (a conditional write on the claim's revision; never throws). `setPairing` is removed from `SyncStore`.
- **No trust-contract change:** the same KV key and fields; no route, collection, capability, setting or dependency.
- **`scripts/redteam/round2-live.mjs c6`:** every round also checks that the keys that sync are exactly the ones told they paired.
- **Docs:** spec change 50; a decisions row; matrix T13 Covered (21 Covered, 6 Partial, 3 Planned, 1 Gap, counted from the table); matrix T03 now carries spec change 44's final wording and RT-08 as an accepted limit (left over from 11-08); RT-07's finding; an upgrade-checklist row for `ctx.kv.compareAndSet`.

**Tests, written first and seen red (8 failing before the fix):**
- `handle.test.ts`: two pair requests held at the first write after the claim: one `ok`, one `PAIRING_REJECTED`, the winner's key stored, the loser's sync `BAD_SIGNATURE`; a second request while one is in flight is refused and writes nothing; a code issued during a pairing stays active; a release never revives a code over a newer one; a failure at the wallet-state write leaves the code usable. 45's "fails after the drops" test passes unchanged.
- `store.test.ts`: the claim on a KV with revisions (two at once, one applied; missing, used and replaced codes; release; a failing release doesn't throw).
- `redteam/sync.test.ts`: C6's race is a normal test now, 5 rounds.

**Results:**
- Plugin: typecheck clean, validate passes, bundle 73.5 KB. Default config 482 passed, 11 expected fail, 1 skipped (45 files); goods config 101 passed, 1 skipped.
- Script tests: 49 passed.
- **Live `c6` on the dev site (`astro dev`, Node runner): 3 of 3 rounds PASS.** One `ok` each round; the other got `PAIRING_REJECTED` and its next sync `BAD_SIGNATURE`. Evidence: `~/xmr-pay-dev-data/redteam/round2-c6-2026-11-13T164250177Z.txt`.
- Not run: theme and bridge suites (nothing of theirs changed). CI hasn't seen these commits: not pushed.

**Not covered:** a site killed between the claim and the end of a pairing (the code is spent; stated in spec change 50). The Cloudflare runner (release 1 is Node only).

**The state I leave:**
- `data.db` restored from `redteam/rt07-before.db` (SHA-256 `9135c052…3eb0`, the same as `live-after-swap0.db`): 62 invoices, 364 pool rows, the bridge's key present. The state the run left is in `baseline/data.db.before-restore-20261113T164521510Z`.
- The dev site is stopped (ports 4321 and 4322 free, no tmux sessions). The site's `node_modules` plugin build is the new one. The bridge is still installed on wallet 0 and backs off while the site is stopped.
- `redteam-1` is two commits plus this entry ahead of `origin/redteam-1` (`07c2bba`). A bundle follows.

**For Wyatt:**
1. A nod on spec change 50, item 4: a code issued while another pairing is in flight stays valid (it used to be overwritten).
2. Whether to push `redteam-1` (then CI).

**What's left before phase 09:** RT-15 (re-measure first), RT-05, the six Lows, the EmDash 1.4.0 check, and the RT-08 re-check question.

**Next step:** RT-15, starting with a re-measure of the per-sync cost on the built copy (`scripts/redteam/backlog-live.mjs`).

### Addendum: Wyatt's answers (2026-11-13)

- Spec change 50, item 4 accepted: a code issued while another pairing is in flight stays valid. The entry's status is updated; no code change.
- Push `redteam-1`: done with this commit. CI's result and this commit's bundle go in the next session's entry.

## 2026-11-13 · Phase 07b fix sessions · RT-15: the re-measure (Part 1 of its plan), no fix yet

**CI:** run 43467574210 passed on `4e23bea` (RT-07's fix: plugin, theme, bridge with the race detector). That commit's bundle: `~/xmr-pay-dev-data/bundles/coffer-redteam-1-20261113-4e23bea.bundle`, SHA-256 `48fcd8c175c1729f9c9b8fae6782698742813f5734d7a1889f229ac57f3b45a4`.

**What was run** (built copy on loopback port 4322, Node; no sudo, no money; `data.db` backed up to `redteam/rt15-before.db` first):
1. **Baseline on today's code,** `backlog-live.mjs run --built` at 20,100 seeded tips with the past-cap probe: pairing sync 27.9 s, first sync 27.8 s, 40 drain syncs all `ok`, slowest 28.1 s. About 0.5 s slower than 10-30 (27.0–27.5 s); about 1.9 s under the 30 s wall. The probe stayed unwatched through all 40. L7: 40 of 40 checkouts answered, slowest 2.1 s. All checks PASS (`h1-2026-11-13T171720106Z.txt`).
2. **Stage timings,** from a temporary build that wrote each stage's time to one KV key (the patch was never committed; it's gone from the tree and from `plugin/dist`, checked). Three syncs each at 5,000, 10,000 and 20,100 rows:

   | Rows | Whole sync | "Recent" scan | Tips scan | Everything else |
   | --- | --- | --- | --- | --- |
   | 5,000 | 1.9 s | 0.9 s | 0.9 s | 0.08 s |
   | 10,000 | 6.4 s | 3.1 s | 3.2 s | 0.15 s |
   | 20,100 | 27.6 s | 13.3 s | 13.9 s | 0.35 s |

**What it shows** (details and evidence files in RT-15's finding):
- The two scans in `watchCandidates` are about 99% of a sync, and they read the same rows twice. The watch list, the check list, the response and spec changes 46–48's work are all small.
- The cost is quadratic in the rows a scan matches. EmDash 1.3.1 runs one SQL query per 100-row page, and SQLite sorts every matching row for each page (`USE TEMP B-TREE FOR ORDER BY`).
- An `orderBy` doesn't avoid that sort and costs more per page (34.6 ms against 9.2 ms in SQLite alone at 10,000 rows). So "newest first" through `orderBy` fixes which rows the cap drops but not the time. Not yet measured through the plugin.
- Caveat: the seed gives every row one `created_at`, which may overstate the "recent" scan on a real flood. The tips scan's sort doesn't depend on it.

**Script changes (`scripts/redteam/backlog-live.mjs`):**
- A `time` mode (`--syncs`, `--kv`), in CLAUDE.md's table.
- The seed's index range moved to 200,000: a "bad" pool row at 100356, left by spec change 46's live tests, collided with it (the first seed attempt failed and wrote nothing).
- **A fault fixed:** `seq` counted up from the start time, and spec change 46's bound refuses a `seq` 5 minutes off the clock. Today's first run had its drain syncs refused after the seventh and still printed PASS for the drain timing and L7. `seq` now follows the clock, and both checks need an `ok` answer. The 2026-11-02 run wasn't affected (no drain syncs, under 5 minutes).
- No test covers this live script's own logic (none did before). Script tests: 49 passed.

**Not run:** plugin, theme and bridge suites (no shipped code changed). A seed with spread-out `created_at` values. The wallet host's own cost of watching 20,000 addresses. Cloudflare.

**The state I leave:** `data.db` restored from `redteam/rt15-before.db` (62 invoices, 364 pool rows, the bridge's key present). Built copy and dev site stopped, ports free, no tmux sessions. `plugin/dist` and the site's `dist` are clean builds of the committed code. The bridge is on wallet 0. This entry's commits are local; a bundle follows.

**For Wyatt, before Part 2 (the fix):**
- "Newest first" as decided needs a second look: through `orderBy` it makes each page dearer. Two other ways to get the same result are in the closing message; the fix plan will measure them.
- Which cost fix: read each row once (about half), a time budget, or an index on a "watched until" field (a storage contract change, before 1.0.0).

**Next step:** plan RT-15's fix with Wyatt's choice, tests first.

### Addendum: Wyatt's decisions for RT-15's fix, the other live scripts, and the index question (2026-11-13)

- **Decisions** (row in `docs/decisions.md`): time slices walking back from now, half-open bounds, no `orderBy`; read-once, slices and a required scan budget of about 12 s (oldest rows cut, Health warning); no "watched until" index for 1.0.0; the seed gets a flood shape and a dense-burst shape with spread `created_at` before measuring; a boundary test.
- **Pushed:** `origin/redteam-1` at `0c0f4a9`; CI was still running when this was written.
- **Do the other live scripts treat a refused sync as a failure?**
  - `round1-live.mjs`: yes. Its one real sync (the pairing) is checked for `ok`.
  - `round2-live.mjs`: yes. `freshSite` throws on a refused pairing or address push; C6 and J1 check each sync's answer.
  - `dev-e2e.mjs`: **two checks didn't,** both of the "nothing changes" kind, which a refused sync also satisfies: "a time-locked transfer of the full amount isn't counted" and "an older seq with the payment gone changes nothing". Both now also need the sync's `ok`, as does "the rest arrives". Run live on the dev site after the change: ALL AS EXPECTED, exit 0 (backup `redteam/e2e-20261113.db`, restored: 62 invoices, 364 pool rows, the bridge's key present).
  - All three count `seq` up from their start time, as `backlog-live` did. None runs for 5 minutes, and in each a refused sync now fails loudly, so they're left as they are.
- **Does adding an index in a 1.x need more than a backfill?** From EmDash's docs (Storage, "Adding indexes"; Manifest, "Trust contract"; the admin's update flow) and 1.3.1's code; not tried on a site:
  - EmDash creates an added index the next time the plugin loads (`CREATE INDEX IF NOT EXISTS` on the JSON field), over the rows already there.
  - It needs a new plugin version. A major version is asked for "when the change breaks an existing query or uniqueness assumption"; a plain added index breaks neither. The Manifest page says "a major version for a broadened contract" without saying whether an added index broadens it.
  - The update flow asks the admin to confirm again when permissions or MCP tools are added or a route goes from private to public. An index isn't on that list.
  - So beyond the version bump: **the backfill is ours,** since old rows lack the new field and a range query on it won't match them (the old scan has to stay as the fallback until the backfill finishes); a downgrade drops the index; and CLAUDE.md's own rule ("any broadening is a major version") is Wyatt's to read for this case.
