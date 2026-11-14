// Phase 07b pass 1, round 1: H1 and L7 — a large backlog on the live dev site, so the watch scan's 200-page cap
// (spec change 35, condition 2) and its drain are exercised at scale. Two steps, run with the dev site stopped for the
// seed and running for the run. Back up data.db first; restore it afterward (the seed writes ~40k rows).
//
//   node scripts/redteam/backlog-live.mjs seed [--count 20100]   with the site stopped: clone settled tips + one open
//                                                                 probe, all watch candidates, into _plugin_storage
//                                             [--shape flood]    expired, untouched tips spread evenly over the tips'
//                                                                 8-day lookback, each row's created_at its own: what an
//                                                                 unpaid-checkout flood leaves (default count 15,360:
//                                                                 40 per 30 minutes, the spam cap)
//                                             [--shape burst]    the same tips packed inside one minute two hours ago,
//                                                                 several to a millisecond (default count 5,000)
//                                             [--past-cap]       the probe is an expired tip in its late window instead,
//                                                                 so it isn't in the open query and the cap can drop it
//                                                                 (an unordered scan reads oldest rows first: round 2)
//   node scripts/redteam/backlog-live.mjs run                     with the site running: pair, time syncs, check the
//                                                                 cap and its Health warning, drain, settle the probe
//                                            [--built]           the built copy: no dev sign-in, so the Health read is skipped
//   node scripts/redteam/backlog-live.mjs time [--syncs 3]        with the site running: pair, then time that many empty
//                                              [--kv <key>]       syncs and nothing else (no drain, no flood). --kv logs
//                                                                 one of the plugin's KV values after each sync, for a
//                                                                 temporary build that records its own stage timings there
//                                              [--max-ms <n>]     FAIL a timed sync slower than this (the EmDash upgrade
//                                                                 checklist's run: a 20,100-row flood seed, --max-ms 5000)
//
// Loopback only. The run step pairs a fresh in-memory key through the KV shortcut and reads the admin Health line
// through EmDash's own dev sign-in (dev mode). It never calls cleanupCofferRows (that wipes the baseline fixtures);
// restore from the backup instead. PASS/FAIL per check; exit 1 on any FAIL.
import { randomBytes } from "node:crypto";

import { DEFAULT_DB, DEFAULT_SITE, PLUGIN, adminCall, assertMemory, devAdminSession, evidencePath, fakeAddress, flood, loopbackUrl, memAvailableMiB, newKey, openSiteDb, route as routeOn, send, signedHeaders, syncBody, writePairingCode, handoutWait } from "./lib.mjs";
import { appendFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const cmd = args[0];
const value = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
if (cmd !== "seed" && cmd !== "run" && cmd !== "time") {
	console.error("usage: node scripts/redteam/backlog-live.mjs seed [--count 20100] [--shape settled|flood|burst] [--past-cap] | run [--site <loopback URL>] [--built] | time [--site <loopback URL>] [--syncs 3] [--kv <key>] [--max-ms <n>]");
	process.exit(2);
}

const site = loopbackUrl(value("--site", DEFAULT_SITE));
const route = (name) => routeOn(site, name);
const SHAPE = value("--shape", "settled");
if (!["settled", "flood", "burst"].includes(SHAPE)) throw new Error("--shape must be settled, flood or burst");
const COUNT = Number(value("--count", { settled: "20100", flood: "15360", burst: "5000" }[SHAPE]));
const PAST_CAP = args.includes("--past-cap");
const BUILT = args.includes("--built");
const SYNCS = Number(value("--syncs", "3"));
const KV_KEY = value("--kv", null);
if (cmd === "time" && (!Number.isInteger(SYNCS) || SYNCS < 1 || SYNCS > 50)) throw new Error("--syncs must be 1..50");
const MAX_MS = Number(value("--max-ms", "30000"));
if (!Number.isInteger(MAX_MS) || MAX_MS < 1 || MAX_MS > 30_000) throw new Error("--max-ms must be 1..30000");
// A height well above the real stagenet height (2236600 at the baseline), so the seed can't be confused with real
// payments. Seeded transfers sit a few blocks below it, so settled tips start shallow and stay watch candidates.
const H = 2_300_000;
const BASE_INDEX = 200_000; // above wallet 0's pool rows on the dev site (a "bad" row sits at 100356 since spec change 46's live tests), so addrIndex/subaddress stay unique
const CAP_ROWS = 20_000; // 200 pages of 100 (spec change 35, condition 2)

const OUT = evidencePath(`h1-${new Date().toISOString().replace(/[:.]/g, "")}.txt`);
const log = (line) => {
	console.log(line);
	appendFileSync(OUT, `${line}\n`);
};
let failures = 0;
const check = (label, pass, got = "") => {
	if (!pass) failures++;
	log(`${pass ? "PASS" : "FAIL"}  ${label.padEnd(66)} ${got}`);
	return pass;
};

const db = openSiteDb(DEFAULT_DB);

// ---- seed ----
if (cmd === "seed") {
	if (!Number.isInteger(COUNT) || COUNT < 1 || COUNT > 25_000) throw new Error("--count must be 1..25000");
	const now = Date.now();
	const insert = db.prepare(
		"INSERT INTO _plugin_storage (plugin_id, collection, id, data, revision, created_at, updated_at) VALUES (?, ?, ?, ?, '0', ?, ?)",
	);
	const stamp = new Date(now).toISOString();
	const LOOKBACK_MS = 7.9 * 24 * 3_600_000; // just inside the tips scan's 8 days, so the oldest rows don't age out mid-run
	// When row n was created, for the spread shapes. flood: evenly over the lookback, newest first. burst: inside one
	// minute two hours ago, in 5 ms steps, so rows share milliseconds.
	const createdFor = (n) => (SHAPE === "flood" ? now - Math.round(((n + 0.5) / COUNT) * LOOKBACK_MS) : now - 2 * 3_600_000 + Math.floor((n * 60_000) / COUNT / 5) * 5);
	// An expired tip nobody paid: a watch candidate for 7 days while the wallet host hasn't reported its address empty
	// for a day (seq stays at its creation), which is what a flood during an outage leaves.
	function unpaid(n) {
		const index = BASE_INDEX + n;
		const id = `inv_rt_h1_${n.toString(16).padStart(10, "0")}`;
		const subaddress = fakeAddress(index);
		const createdAt = createdFor(n);
		const inv = {
			id,
			token: `rt${randomBytes(15).toString("base64url")}`.slice(0, 22),
			kind: "tip",
			asset: "xmr",
			chain: "monero",
			network: "stagenet",
			fiat: null,
			rate: null,
			expectedAtomic: null,
			minAtomic: "100000000",
			required: 2,
			subaddress,
			addrIndex: index,
			status: "expired",
			createdAt,
			expiresAt: createdAt + 30 * 60_000,
			createdHeight: H - 10,
			expiresHeight: H - 4,
			seq: createdAt,
			finalAt: createdAt + 30 * 60_000,
			transfers: [],
			uriDescription: "Tip",
			via: "checkout",
		};
		const at = new Date(createdAt).toISOString();
		insert.run(PLUGIN, "invoices", id, JSON.stringify(inv), at, at);
		insert.run(PLUGIN, "pool", String(index), JSON.stringify({ addrIndex: index, address: subaddress, status: "claimed", invoiceId: id }), at, at);
		return index;
	}
	// A settled stagenet tip whose one transfer is shallow (3 confirmations), so it is still watched (settled until
	// 10 deep). Pool row claimed so a snapshot's index resolves to this invoice.
	function settled(n) {
		const index = BASE_INDEX + n;
		const id = `inv_rt_h1_${n.toString(16).padStart(10, "0")}`;
		const subaddress = fakeAddress(index);
		const inv = {
			id,
			token: `rt${randomBytes(15).toString("base64url")}`.slice(0, 22),
			kind: "tip",
			asset: "xmr",
			chain: "monero",
			network: "stagenet",
			fiat: null,
			rate: null,
			expectedAtomic: null,
			minAtomic: "100000000",
			required: 2,
			subaddress,
			addrIndex: index,
			status: "settled",
			createdAt: now - 60_000,
			expiresAt: now - 30_000,
			createdHeight: H - 10,
			expiresHeight: H - 4,
			seq: now - 1000,
			settledAt: now - 20_000,
			finalAt: now - 20_000,
			transfers: [{ txid: n.toString(16).padStart(64, "0"), amountAtomic: "100000000", confirmations: 3, height: H - 3, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", seenAt: now - 25_000, poolTs: null }],
			uriDescription: "Tip",
			via: "checkout",
		};
		insert.run(PLUGIN, "invoices", id, JSON.stringify(inv), stamp, stamp);
		insert.run(PLUGIN, "pool", String(index), JSON.stringify({ addrIndex: index, address: subaddress, status: "claimed", invoiceId: id }), stamp, stamp);
		return index;
	}
	// One open (unfinished) tip, a watch candidate too, used as the past-cap probe: nobody has paid it yet.
	function openProbe() {
		const late = PAST_CAP ? { status: "expired", createdAt: now - 40 * 60_000, expiresAt: now - 10 * 60_000, seq: now - 5 * 60_000, finalAt: now - 5 * 60_000 } : {};
		const index = BASE_INDEX + COUNT; // the very last index, so it sorts past the others
		const id = "inv_rt_h1_probe";
		const subaddress = fakeAddress(index);
		const inv = {
			id,
			token: "rtprobeAAAAAAAAAAAAAAA",
			kind: "tip",
			asset: "xmr",
			chain: "monero",
			network: "stagenet",
			fiat: null,
			rate: null,
			expectedAtomic: null,
			minAtomic: "100000000",
			required: 2,
			subaddress,
			addrIndex: index,
			status: "new",
			createdAt: now,
			expiresAt: now + 25 * 60_000,
			createdHeight: H,
			expiresHeight: H + 18,
			seq: now,
			transfers: [],
			uriDescription: "Tip",
			via: "checkout",
			...late,
		};
		insert.run(PLUGIN, "invoices", id, JSON.stringify(inv), stamp, stamp);
		insert.run(PLUGIN, "pool", String(index), JSON.stringify({ addrIndex: index, address: subaddress, status: "claimed", invoiceId: id }), stamp, stamp);
		return { index, id, subaddress };
	}

	db.exec("BEGIN");
	const indexes = [];
	for (let n = 0; n < COUNT; n++) indexes.push(SHAPE === "settled" ? settled(n) : unpaid(n));
	const probe = openProbe();
	db.exec("COMMIT");
	const total = db.prepare("SELECT COUNT(*) c FROM _plugin_storage WHERE plugin_id = ? AND collection = 'invoices'").get(PLUGIN).c;
	log(`seeded ${COUNT} ${SHAPE === "settled" ? "settled tips" : `expired unpaid tips (${SHAPE})`} + 1 ${PAST_CAP ? "expired (past-cap)" : "open"} probe (index ${probe.index}); invoices now ${total}`);
	log(`probe id ${probe.id} at index ${probe.index}`);
	db.close();
	process.exit(0);
}

// ---- run ----
const key = newKey();
let seq = Date.now();
// seq follows the clock: the site refuses a seq more than 5 minutes from the request's timestamp (SEQ_OUT_OF_RANGE),
// and a run lasts longer than that.
const body = (fields) => syncBody(fields, { seq: (seq = Math.max(seq + 1, Date.now())), height: H });
const sync = async (fields, extra = {}) => {
	const bytes = body(fields);
	const t0 = performance.now();
	const r = await send(route("bridge/sync"), { body: bytes, headers: { ...signedHeaders(bytes, { key }), ...extra } });
	return { ...r, ms: performance.now() - t0 };
};
const SEEDED = db.prepare("SELECT COUNT(*) c FROM _plugin_storage WHERE plugin_id = ? AND collection = 'invoices' AND id LIKE 'inv_rt_h1_0%'").get(PLUGIN).c;
const probeIndex = BASE_INDEX + SEEDED;
const invCount = () => db.prepare("SELECT COUNT(*) c FROM _plugin_storage WHERE plugin_id = ? AND collection = 'invoices'").get(PLUGIN).c;
const probeRow = () => {
	const row = db.prepare("SELECT data FROM _plugin_storage WHERE plugin_id = ? AND collection = 'invoices' AND id = 'inv_rt_h1_probe'").get(PLUGIN);
	return row ? JSON.parse(row.data) : null;
};
const watchOf = (r) => (Array.isArray(r.data?.watch) ? r.data.watch : null);

writeFileSync(OUT, `H1/L7 backlog run ${new Date().toISOString()}  site ${site.origin}  invoices ${invCount()}\n`);
assertMemory();

try {
	if (!probeRow()) throw new Error("no seeded probe found; run `seed` first (with the site stopped)");
	// Site is up?
	let r = await send(`${route("status")}?token=${"A".repeat(22)}`, { method: "GET" });
	if (!check("site up: status unknown token -> INVOICE_NOT_FOUND", r.code === "INVOICE_NOT_FOUND", `${r.status} ${r.code ?? ""}`)) throw new Error("dev site not answering");

	// Pair a fresh key. The pair body must stay under 4 KiB (the spec's parse-before-signature limit), so pair with no
	// addresses, then add the free addresses for the L7 checkout flood in a second sync signed with the paired key.
	const code = writePairingCode(db);
	r = await sync({ pair: { code, publicKey: key.publicB64 } });
	if (!check("pair (empty body) -> ok", r.data?.ok === true, `${r.status} ${r.code ?? ""} ${r.ms.toFixed(0)}ms`)) throw new Error("pairing failed");
	// Spec change 46: the seeded backlog is wallet 0's, so this test key answers the site's probes as wallet 0 (a
	// stand-in: it holds no wallet), or "no match" when the site has no probe for it.
	if (Array.isArray(r.data?.probes)) {
		r = await sync({ wallet: { match: r.data.probes.some((p) => p.wallet === 0) ? 0 : null, receivedTop: 0 } });
		check("answered the wallet probe", r.data?.ok === true && !Array.isArray(r.data?.probes), `${r.status} ${r.code ?? ""}`);
	}
	if (cmd === "time") {
		const kvValue = () => db.prepare("SELECT data FROM _plugin_storage WHERE plugin_id = ? AND collection = '__kv' AND id = ?").get(PLUGIN, KV_KEY)?.data ?? "(none)";
		log(`the sync before the timed ones (the pairing, or the probe answer) took ${r.ms.toFixed(0)}ms${KV_KEY ? `  ${KV_KEY}: ${kvValue()}` : ""}`);
		for (let n = 1; n <= SYNCS; n++) {
			r = await sync({});
			check(`time: sync ${n} of ${SYNCS} finishes under ${MAX_MS} ms`, r.status === 200 && r.data?.ok === true && r.ms < MAX_MS, `${r.ms.toFixed(0)}ms status ${r.status} ${r.code ?? ""} watch ${watchOf(r)?.length ?? "?"}`);
			if (KV_KEY) log(`  ${KV_KEY}: ${kvValue()}`);
		}
		log(`evidence: ${OUT}`);
		db.close();
		process.exit(failures === 0 ? 0 : 1);
	}
	const freeBase = probeIndex + 1;
	const freeAddrs = Array.from({ length: 60 }, (_, i) => ({ index: freeBase + i, address: fakeAddress(freeBase + i) }));
	r = await sync({ addresses: freeAddrs });
	check("add 60 free addresses -> ok", r.data?.ok === true, `${r.status} ${r.code ?? ""} poolFree ${r.data?.poolFree ?? "?"}`);

	// --- First sync: time it, and look at the watch the plugin asks us to keep reporting ---
	r = await sync({});
	const w1 = watchOf(r);
	check("H1: first backlog sync finishes under 30 s", r.status === 200 && r.ms < 30_000, `${r.ms.toFixed(0)}ms status ${r.status} ${r.code ?? ""}`);
	check("H1: the sync returns a watch list", w1 !== null || r.status !== 200, w1 ? `watch length ${w1.length}` : `status ${r.status} ${r.code ?? ""} ${JSON.stringify(r.data ?? r.json).slice(0, 120)}`);
	const candidates = SEEDED + 1; // seeded settled tips + the open probe (the baseline adds a couple more)
	if (w1) {
		log(`watch length on the first sync: ${w1.length} (seeded candidates: ${candidates}, 200-page cap: ${CAP_ROWS})`);
		// The cap bounds the watch at ~CAP_ROWS: it must be truncated (fewer than every candidate) and sit at the cap,
		// not run away to the full candidate count. Observed: 20001 from 20103 candidates — 102 dropped.
		check("R11/R13: the watch is truncated at ~the 200-page cap, not the whole backlog", w1.length < candidates && w1.length <= CAP_ROWS + 100, `watch ${w1.length}, candidates ${candidates}, cap ${CAP_ROWS}`);
		log(`probe (index ${probeIndex}, the newest row, status ${probeRow()?.status}) inside the capped watch: ${w1.includes(probeIndex)}${probeRow()?.status === "expired" ? " (expired: only the capped scans can find it, so false means the cap dropped it)" : " (open: found by the open-invoice query whatever the cap)"}`);
	}

	// --- Health warning for the cap, read through the dev admin sign-in (a plain page read) ---
	let capWarned = null;
	if (BUILT) log("admin Health read not run: the built copy has no dev sign-in (round 1's dev-mode run showed the warning)");
	else try {
		const cookie = await devAdminSession(site);
		const page = await adminCall(site, { type: "page_load", page: "/payments" }, { cookie, "x-emdash-request": "1" });
		const text = JSON.stringify(page.data ?? page.json ?? {});
		capWarned = /cap|200 page|too many|more than|reached|backlog/i.test(text) && /watch|address|scan|report/i.test(text);
		const health = (page.data?.blocks ?? []).find((b) => b.block_id === "health");
		log(`admin Health fields: ${JSON.stringify(health?.fields ?? "none").slice(0, 400)}`);
	} catch (e) {
		log(`admin Health read skipped: ${String(e).slice(0, 120)}`);
	}
	if (!BUILT) check("R13: the admin page warns when the watch cap is reached (spec change 35, condition 2)", capWarned === true, capWarned === null ? "could not read the admin page" : `warning present: ${capWarned}`);

	// --- Drain and the past-cap probe: observed, not asserted. The cap is on rows SCANNED, not watch candidates, so
	// maturing a settled tip (reporting it 12 deep) may or may not free a slot. Whatever happens is the evidence R11/R13
	// want: does reporting the backlog settled let an invoice past the cap become watched, and over how many syncs?
	// Timing on each drain sync stays a hard check (R11: every sync under 30 s). The probe outcome is logged. ---
	let probeWatched = w1 ? w1.includes(probeIndex) : null;
	let lastWatch = w1 ? w1.length : null;
	let maxDrainMs = 0;
	const maxBatch = 100; // the plugin caps snapshots per sync at exactly 100 (101+ -> INVALID_BODY); see matrix C07
	let timingOk = true;
	for (let round = 0; round < 40 && !probeWatched; round++) {
		const start = round * maxBatch;
		if (start >= SEEDED) break;
		const snapshots = [];
		for (let i = start; i < Math.min(start + maxBatch, SEEDED); i++) {
			const index = BASE_INDEX + i;
			snapshots.push({ index, transfers: [{ txid: i.toString(16).padStart(64, "0"), amount: "100000000", confirmations: 12, height: H - 3, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" }] });
		}
		const rr = await sync({ snapshots });
		const w = watchOf(rr);
		if (w !== null) {
			lastWatch = w.length;
			probeWatched = w.includes(probeIndex);
		}
		maxDrainMs = Math.max(maxDrainMs, rr.ms);
		// A refused sync is quick, so it must fail this check, not pass it.
		if (rr.status !== 200 || rr.data?.ok !== true || rr.ms >= 30_000) timingOk = false;
		if (round % 10 === 0 || probeWatched) log(`drain sync ${round + 1} (indexes ${start}..): ${rr.ms.toFixed(0)}ms ${rr.code ?? "ok"} watch ${w?.length ?? "?"}`);
		if (memAvailableMiB() < 1536) {
			log("stopping the drain: under 1.5 GB available");
			break;
		}
	}
	check("R11: every drain sync finishes under 30 s", timingOk, `slowest drain sync ${maxDrainMs.toFixed(0)}ms; last watch ${lastWatch}`);
	log(`past-cap probe watched after draining: ${probeWatched} (last watch length ${lastWatch})`);

	// --- Once (and if) the probe is watched, a payment to it settles exactly once ---
	if (probeWatched) {
		r = await sync({ snapshots: [{ index: probeIndex, transfers: [{ txid: "fe".repeat(32), amount: "200000000", confirmations: 2, height: H - 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" }] }] });
		const probe1 = probeRow();
		await sync({ snapshots: [{ index: probeIndex, transfers: [{ txid: "fe".repeat(32), amount: "200000000", confirmations: 3, height: H - 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" }] }] });
		const probe2 = probeRow();
		check("R11: a past-cap invoice settles once its backlog is reported and it becomes watched", probe1?.status === "settled", `status ${probe1?.status}`);
		check("R11: a repeat sync doesn't double-count the probe (settled exactly once)", (probe2?.transfers?.length ?? 0) === 1, `transfers ${probe2?.transfers?.length}`);
	} else {
		log("probe never became watched by reporting the backlog settled; recorded as an observation for R11/R13 (the cap bounds rows scanned, so a past-cap invoice waits for the backlog to be purged, not merely matured)");
	}

	// Spec change 46: the free rows are handed out only once they're 45 s old.
	await handoutWait();
	// --- L7: checkout latency during a sync (the scan busy), ≤50 in flight ---
	const during = sync({});
	const checkoutTask = () => send(route("checkout"), { body: JSON.stringify({ kind: "tip" }), headers: { "content-type": "application/json" } });
	const fl = await flood(Array.from({ length: 40 }, () => checkoutTask), { concurrency: 20 });
	const sr = await during;
	const got = fl.results.filter((x) => x.ok && x.value?.data?.token).length;
	const slow = Math.max(0, ...fl.results.map((x) => x.ms));
	check("L7: checkouts keep answering during a backlog sync", got >= 1 && fl.stopped === null && sr.data?.ok === true, `${got}/${fl.results.length} got an address; slowest ${slow.toFixed(0)}ms; sync ${sr.ms.toFixed(0)}ms ${sr.code ?? "ok"}`);
	log(`evidence: ${OUT}`);
} finally {
	db.close();
}
console.log(failures === 0 ? "\nall backlog checks passed" : `\n${failures} backlog check(s) need attention`);
process.exitCode = failures === 0 ? 0 : 1;
