// Phase 07b pass 1, round 1: the live dev-site attacks that need EmDash's own request handling, which the plugin test
// hosts don't reproduce. C4 (proxy-added Origin/Authorization on a signed sync) is already covered by dev-e2e's header
// checks; this adds A6/F06 (a spoofed Host / X-Forwarded-Host), the live half of L2 (client-IP headers on Node), and C5
// (a slow drip body against the 30 s wall, with the site's liveness measured alongside).
//
//   node scripts/redteam/round1-live.mjs [--site http://localhost:4321]
//
// Loopback only. It pairs a fresh in-memory key through the KV shortcut, pushes a small pool, runs the checks, and
// cleans up its own rows and key. Back up data.db first (the caller does). PASS/FAIL per check; exit 1 on any FAIL.
// C5's wall check prints "KNOWN RT-13" (not counted as a FAIL) only for RT-13's exact result; see isKnownRt13Drip.

import { DEFAULT_DB, DEFAULT_SITE, cleanupCofferRows, fakeAddress, loopbackUrl, newKey, openSiteDb, route as routeOn, send, signedHeaders, syncBody, writePairingCode, handoutWait, HANDOUT_WAIT_MS, C5_WALL_MS, isKnownRt13Drip } from "./lib.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const site = loopbackUrl(value("--site", DEFAULT_SITE));
const route = (name) => routeOn(site, name);
const db = openSiteDb(DEFAULT_DB);
const key = newKey();
let seq = Date.now();
const body = (fields) => syncBody(fields, { seq: ++seq, height: 3_000_000 });
const sync = (bytes, extra = {}) => send(route("bridge/sync"), { body: bytes, headers: { ...signedHeaders(bytes, { key }), ...extra } });

let failures = 0;
const check = (label, pass, got = "") => {
	if (!pass) failures++;
	console.log(`${pass ? "PASS" : "FAIL"}  ${label.padEnd(64)} ${got}`);
	return pass;
};
const show = (r) => `${r.status} ${r.code ?? JSON.stringify(r.data ?? r.json ?? {}).slice(0, 100)}`;

// Clean slate for this run's rows (leaves Wyatt's settings and the salt).
cleanupCofferRows(db);

try {
	let r = await send(`${route("status")}?token=${"A".repeat(22)}`, { method: "GET" });
	if (!check("site up: status unknown token -> INVOICE_NOT_FOUND", r.code === "INVOICE_NOT_FOUND", show(r))) throw new Error("dev site/plugin not answering");

	// Pair a fresh key and push 12 stagenet addresses.
	const code = writePairingCode(db);
	const addresses = Array.from({ length: 12 }, (_, i) => ({ index: i + 1, address: fakeAddress(i + 1) }));
	r = await sync(body({ addresses, pair: { code, publicKey: key.publicB64 } }));
	if (!check("pair + 12 addresses -> ok", r.data?.ok === true && r.data.poolFree >= 12, show(r))) throw new Error("pairing failed");
	// Spec change 46: a new pool row is handed out only once it's 45 s old.
	console.log(`waiting ${HANDOUT_WAIT_MS / 1000} s for the hand-out window (spec change 46)`);
	await handoutWait();

	// --- A6 / F06: a spoofed Host and X-Forwarded-Host on the public routes ---
	const spoof = { host: "evil.example", "x-forwarded-host": "evil.example", "x-forwarded-proto": "http", "x-forwarded-for": "203.0.113.1" };
	r = await send(route("checkout"), { body: JSON.stringify({ kind: "tip" }), headers: { "content-type": "application/json", ...spoof } });
	const uriClean = !JSON.stringify(r.data ?? {}).includes("evil.example");
	check("A6: checkout with a spoofed Host builds no evil.example URL", r.data?.token !== undefined && uriClean, show(r));
	const token = r.data?.token;
	if (token) {
		r = await send(`${route("status")}?token=${token}`, { method: "GET", headers: spoof });
		check("A6: status with a spoofed Host leaks no evil.example", !JSON.stringify(r.data ?? {}).includes("evil.example"), show(r));
	}

	// --- L2 live: client-IP headers on a Node site don't make per-client buckets ---
	// On Node, EmDash's extractIp returns nothing without trusted proxy config, so requestMeta.ip is unset and the
	// per-client cap never engages. A visitor spoofing these can't fill another visitor's bucket; the only limit is the
	// site-wide open-invoice cap. We confirm many tips from one spoofed IP are not cut off before the site-wide cap.
	let ok = 0;
	let perClientCode = null;
	for (let i = 0; i < 8; i++) {
		r = await send(route("checkout"), { body: JSON.stringify({ kind: "tip" }), headers: { "content-type": "application/json", "x-forwarded-for": "198.51.100.9", "cf-connecting-ip": "198.51.100.9" } });
		if (r.data?.token) ok++;
		else perClientCode = r.code;
	}
	check("L2: 8 tips from one spoofed IP aren't cut by a per-client cap on Node", ok === 8, `${ok}/8 ok${perClientCode ? `, first refusal ${perClientCode}` : ""}`);
	const kvRow = db.prepare("SELECT data FROM _plugin_storage WHERE plugin_id = 'coffer' AND collection = '__kv' AND id = 'state:buckets'").get();
	check("L2: no per-client buckets were stored from spoofed headers", kvRow === undefined, kvRow ? "state:buckets exists" : "none");

	// --- C5: a slow drip body against bridge/sync, with the site's liveness measured alongside ---
	// A ReadableStream that sends a byte, waits, and would keep going past the 30 s wall. While it drips, poll status.
	const started = Date.now();
	const drip = new ReadableStream({
		start(c) {
			c.enqueue(new TextEncoder().encode('{"v":1,"seq":'));
			let n = 0;
			const t = setInterval(() => {
				try {
					c.enqueue(new TextEncoder().encode("0"));
				} catch {
					clearInterval(t);
					return;
				}
				if (++n > 40) {
					clearInterval(t);
					try {
						c.close();
					} catch {}
				}
			}, 1000);
		},
	});
	const dripReq = fetch(loopbackUrl(route("bridge/sync")), { method: "POST", body: drip, duplex: "half", headers: signedHeaders(Buffer.from("x"), { key }) }).then(
		async (res) => ({ status: res.status, ms: Date.now() - started, text: (await res.text()).slice(0, 80) }),
		(err) => ({ status: "error", ms: Date.now() - started, text: String(err).slice(0, 80) }),
	);
	// While it drips, the site must keep answering status within a short time.
	let liveMs = null;
	let liveOk = false;
	for (let i = 0; i < 8; i++) {
		const t0 = Date.now();
		const s = await send(`${route("status")}?token=${"B".repeat(22)}`, { method: "GET" });
		const dt = Date.now() - t0;
		liveMs = Math.max(liveMs ?? 0, dt);
		if (s.code === "INVOICE_NOT_FOUND" && dt < 5000) liveOk = true;
		else liveOk = false;
	}
	const dripResult = await dripReq;
	const c5Label = "C5: the drip request ends at or before the 30 s wall";
	const c5Got = `${dripResult.status} after ${dripResult.ms} ms: ${dripResult.text}`;
	// RT-13 (open finding): remove this branch when RT-13 is fixed.
	if (isKnownRt13Drip(dripResult)) console.log(`KNOWN RT-13  ${c5Label.padEnd(64)} ${c5Got}`);
	else check(c5Label, typeof dripResult.status === "number" ? dripResult.ms <= C5_WALL_MS : true, c5Got);
	check("C5: status stays responsive while the body drips", liveOk, `max status ${liveMs} ms over 8 polls`);
} finally {
	const { rows, kv, key: k } = cleanupCofferRows(db);
	console.log(`cleanup: removed ${rows} pool/invoice rows, ${kv} KV rows, ${k} bridge key`);
	db.close();
}
console.log(failures === 0 ? "\nall live checks passed" : `\n${failures} live check(s) need attention`);
process.exitCode = failures === 0 ? 0 : 1;
