// Phase 07b pass 1, round 2: live dev-site runs that need the Node runner itself, not the plugin test host.
//
//   node scripts/redteam/round2-live.mjs a8 [--site http://localhost:4321]   A8: concurrent tips racing for free addresses
//   node scripts/redteam/round2-live.mjs c6 [--site …]                       C6: two pair requests with one code at once
//   node scripts/redteam/round2-live.mjs j1 [--site …]                       J1: the site killed (SIGKILL) mid-sync
//
// Loopback only. Each run starts with cleanupCofferRows (it deletes ALL pool and invoice rows and the paired key), pairs
// a fresh in-memory key through the KV shortcut and pushes fake stagenet addresses, so back up data.db first and
// restore it after (`setup-test-reset.mjs --restore`, the site stopped). PASS/FAIL per check, exit 1 on any FAIL.
// J1 kills and restarts the dev site (`astro dev`, started by an agent: background, outside tmux).
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";

import { DEFAULT_DB, DEFAULT_SITE, KEY_OPTION, assertMemory, cleanupCofferRows, evidencePath, fakeAddress, loopbackUrl, newKey, openSiteDb, route as routeOn, send, signedHeaders, syncBody, writePairingCode, handoutWait } from "./lib.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const mode = args[0];
if (!["a8", "c6", "j1"].includes(mode)) throw new Error("usage: round2-live.mjs a8|c6|j1 [--site <loopback URL>]");
const site = loopbackUrl(value("--site", DEFAULT_SITE));
const route = (name) => routeOn(site, name);
const SITE_DIR = `${homedir()}/sites/xmr-dev-site`;
const HEIGHT = 3_000_000;
const evidence = evidencePath(`round2-${mode}-${new Date().toISOString().replace(/[:.]/g, "")}.txt`);

let failures = 0;
const log = (line) => {
	console.log(line);
	appendFileSync(evidence, line + "\n", { mode: 0o600 });
};
const check = (label, pass, got = "") => {
	if (!pass) failures++;
	log(`${pass ? "PASS" : "FAIL"}  ${label.padEnd(72)} ${got}`);
	return pass;
};
const note = (label, got = "") => log(`NOTE  ${label.padEnd(72)} ${got}`);
const show = (r) => `${r.status} ${r.code ?? JSON.stringify(r.data ?? r.json ?? {}).slice(0, 100)}`;

let seq = Date.now();
const signedSync = (key, fields, { height = HEIGHT, s = ++seq } = {}) => {
	const bytes = syncBody(fields, { seq: s, height });
	return send(route("bridge/sync"), { body: bytes, headers: signedHeaders(bytes, { key }) });
};
const tip = () => send(route("checkout"), { body: JSON.stringify({ kind: "tip" }), headers: { "content-type": "application/json", origin: site.origin } });
const rows = (db, collection) => db.prepare("SELECT data FROM _plugin_storage WHERE plugin_id = 'coffer' AND collection = ?").all(collection).map((r) => JSON.parse(r.data));

/** Clean slate, a fresh key paired through the KV shortcut, and `count` fake stagenet addresses from index 1. */
async function freshSite(db, count) {
	cleanupCofferRows(db);
	const key = newKey();
	const code = writePairingCode(db);
	const r = await signedSync(key, { pair: { code, publicKey: key.publicB64 } });
	if (r.data?.ok !== true) throw new Error(`pairing failed: ${show(r)}`);
	for (let start = 1; start <= count; start += 100) {
		const addresses = [];
		for (let i = start; i < Math.min(start + 100, count + 1); i++) addresses.push({ index: i, address: fakeAddress(i) });
		const p = await signedSync(key, { addresses });
		if (p.data?.ok !== true) throw new Error(`address push failed: ${show(p)}`);
	}
	// Spec change 46: a new pool row is handed out only once it's 45 s old. (After the cleanup above the site has no
	// history, so the pairing doesn't wait for a wallet answer.)
	await handoutWait();
	return key;
}

/** Pool and invoices agree: no address or index on two invoices; every claimed row names an invoice that has it. */
function poolConsistent(db, label) {
	const pool = rows(db, "pool");
	const invs = rows(db, "invoices");
	const addrs = new Set(invs.map((i) => i.subaddress));
	const idx = new Set(invs.map((i) => i.addrIndex));
	const byId = new Map(invs.map((i) => [i.id, i]));
	const orphans = pool.filter((p) => p.status === "claimed" && (!p.invoiceId || byId.get(p.invoiceId)?.addrIndex !== p.addrIndex));
	check(`${label}: no address or index on two invoices`, addrs.size === invs.length && idx.size === invs.length, `${invs.length} invoices, ${addrs.size} addresses, ${idx.size} indexes`);
	check(`${label}: every claimed pool row belongs to its invoice`, orphans.length === 0, `${orphans.length} orphaned claims`);
	return { pool, invs };
}

async function a8(db) {
	// Two bursts: as many tips as free addresses, then more tips than free addresses (kept under the 40-open cap).
	for (const [free, burst] of [[30, 30], [30, 40]]) {
		await freshSite(db, free);
		const results = await Promise.all(Array.from({ length: burst }, () => tip()));
		const ok = results.filter((r) => r.data?.token).length;
		const codes = {};
		for (const r of results) if (!r.data?.token) codes[r.code ?? r.status] = (codes[r.code ?? r.status] ?? 0) + 1;
		const { pool } = poolConsistent(db, `A8 ${burst} at once, ${free} free`);
		const left = pool.filter((p) => p.status === "free").length;
		check(`A8 ${burst} at once, ${free} free: at most ${free} succeed`, ok <= free, `${ok} ok`);
		note(`A8 ${burst} at once, ${free} free: refused while addresses were free (RT-04)`, `${ok} ok, refusals ${JSON.stringify(codes)}, ${left} still free`);
		const after = await tip();
		note(`A8 ${burst} at once, ${free} free: the next single tip`, show(after));
	}
}

async function c6(db) {
	for (let round = 1; round <= 3; round++) {
		await freshSite(db, 5);
		const [k1, k2] = [newKey(), newKey()];
		const code = writePairingCode(db);
		const pair = (key) => signedSync(key, { pair: { code, publicKey: key.publicB64 } });
		const [r1, r2] = await Promise.all([pair(k1), pair(k2)]);
		const wins = [r1, r2].filter((r) => r.data?.ok === true).length;
		const stored = db.prepare("SELECT value FROM options WHERE name = ?").get(KEY_OPTION)?.value ?? "";
		const storedIs = stored.includes(k1.publicB64) ? "key 1" : stored.includes(k2.publicB64) ? "key 2" : "neither";
		const s1 = await signedSync(k1, {});
		const s2 = await signedSync(k2, {});
		const works = [s1.data?.ok === true ? "key 1" : null, s2.data?.ok === true ? "key 2" : null].filter(Boolean);
		check(`C6 round ${round}: exactly one of two simultaneous pair requests wins (RT-07)`, wins === 1, `${wins} got ok; stored ${storedIs}; syncs work for ${works.join(", ") || "none"}`);
		// Every request told it paired can sync, and no other key can (spec change 50).
		const told = [r1.data?.ok === true ? "key 1" : null, r2.data?.ok === true ? "key 2" : null].filter(Boolean);
		check(`C6 round ${round}: the keys that sync are exactly the ones told they paired, and the stored key is one of them`, told.join() === works.join() && told.includes(storedIs), `told ${told.join(", ") || "none"}; syncs work for ${works.join(", ") || "none"}; stored ${storedIs}; key 1 pair ${show(r1)}, sync ${show(s1)}; key 2 pair ${show(r2)}, sync ${show(s2)}`);
	}
}

// ---- J1: kill the site mid-sync ----
function sitePid() {
	const out = spawnSync("npx", ["astro", "dev", "status"], { cwd: SITE_DIR, encoding: "utf8" });
	const m = /pid (\d+)/.exec(out.stdout + out.stderr);
	return m ? Number(m[1]) : null;
}
async function waitFor(pred, ms) {
	const end = Date.now() + ms;
	while (Date.now() < end) {
		if (await pred()) return true;
		await new Promise((r) => setTimeout(r, 1000));
	}
	return false;
}
const siteUp = async () => {
	try {
		return (await send(`${route("status")}?token=${"A".repeat(22)}`, { method: "GET" })).code === "INVOICE_NOT_FOUND";
	} catch {
		return false;
	}
};
async function restartSite() {
	spawnSync("tmux", ["kill-session", "-t", "site"]); // a session left from an earlier start holds the name
	execFileSync("tmux", ["new", "-d", "-s", "site", "-c", SITE_DIR, "npm run dev; exec bash"]);
	if (!(await waitFor(siteUp, 120_000))) throw new Error("the dev site didn't come back within 2 minutes");
	spawnSync("tmux", ["kill-session", "-t", "site"]); // astro moved itself to the background; the tmux shell is empty
}

async function j1(db) {
	const N = 35;
	const key = await freshSite(db, N);
	const tokens = [];
	for (let i = 0; i < N; i++) {
		const r = await tip();
		if (!r.data?.token) throw new Error(`tip ${i} failed: ${show(r)}`);
		tokens.push(r.data.token);
	}
	const invs = rows(db, "invoices");
	// One sync settling all 35: each gets 32 counted transfers of 0.001 XMR at 20 confirmations.
	const tx = (inv, k) => ({ txid: ((inv.addrIndex * 64 + k) >>> 0).toString(16).padStart(64, "a"), amount: "1000000000", confirmations: 20, height: HEIGHT - 19, timestamp: Math.floor(Date.now() / 1000), doubleSpendSeen: false, unlockTime: "0" });
	const snapshots = invs.map((inv) => ({ index: inv.addrIndex, transfers: Array.from({ length: 32 }, (_, k) => tx(inv, k)) }));
	const bigSeq = ++seq;
	const bytes = syncBody({ snapshots }, { seq: bigSeq, height: HEIGHT });
	note("J1: sync body", `${N} snapshots x 32 transfers, ${bytes.length} bytes`);

	// Time a dry run first? A real run would apply it. Instead, kill after a short fixed delay and see what landed.
	const pid = sitePid();
	if (!pid) throw new Error("no running astro dev pid");
	const t0 = Date.now();
	const req = send(route("bridge/sync"), { body: bytes, headers: signedHeaders(bytes, { key }) }).then(
		(r) => ({ r, ms: Date.now() - t0 }),
		(e) => ({ e: String(e).slice(0, 80), ms: Date.now() - t0 }),
	);
	const delay = Number(value("--kill-after", "150"));
	await new Promise((r) => setTimeout(r, delay));
	process.kill(pid, "SIGKILL");
	const killedAt = Date.now() - t0;
	const outcome = await req;
	note("J1: killed the site", `SIGKILL at ${killedAt} ms; the request ended after ${outcome.ms} ms: ${outcome.r ? show(outcome.r) : outcome.e}`);
	await waitFor(async () => !(await siteUp()), 15_000);
	spawnSync("pkill", ["-KILL", "-f", `${SITE_DIR}/node_modules/.bin/astro`]);

	const mid = rows(db, "invoices");
	const settledMid = mid.filter((i) => i.status === "settled").length;
	note("J1: after the crash, before any retry", `${settledMid} of ${N} settled`);
	check("J1: no invoice holds a partial transfer list", mid.every((i) => i.transfers.length === 0 || i.transfers.length === 32), mid.map((i) => i.transfers.length).filter((n) => n !== 0 && n !== 32).join(",") || "all 0 or 32");

	await restartSite();
	note("J1: site restarted", "");
	// The bridge's retry: the same body (same seq), freshly signed.
	const retry = await send(route("bridge/sync"), { body: bytes, headers: signedHeaders(bytes, { key }) });
	check("J1: the retried sync is accepted", retry.data?.ok === true, show(retry));
	const after = rows(db, "invoices");
	check("J1: after the retry, every invoice is settled", after.every((i) => i.status === "settled"), `${after.filter((i) => i.status === "settled").length} of ${N}`);
	check("J1: each payment counted once (32 transfers, 0.032 XMR each)", after.every((i) => i.transfers.length === 32 && new Set(i.transfers.map((t) => t.txid)).size === 32 && i.transfers.reduce((a, t) => a + BigInt(t.amountAtomic), 0n) === 32_000_000_000n), "");
	check("J1: every invoice's seq is the sync's", after.every((i) => i.seq === bigSeq), "");
	// A second retry changes nothing.
	const again = await send(route("bridge/sync"), { body: bytes, headers: signedHeaders(bytes, { key }) });
	const after2 = rows(db, "invoices");
	check("J1: a second retry changes nothing", again.data?.ok === true && JSON.stringify(after2) === JSON.stringify(after), show(again));
	poolConsistent(db, "J1 after the retries");
}

assertMemory();
const db = openSiteDb(DEFAULT_DB);
log(`# round2-live ${mode} ${new Date().toISOString()} on ${site.origin}`);
try {
	if (!(await siteUp())) throw new Error("the dev site isn't answering");
	if (mode === "a8") await a8(db);
	if (mode === "c6") await c6(db);
	if (mode === "j1") await j1(db);
} finally {
	db.close();
}
log(failures === 0 ? "all checks passed" : `${failures} check(s) failed`);
log(`evidence: ${evidence}`);
process.exitCode = failures === 0 ? 0 : 1;
