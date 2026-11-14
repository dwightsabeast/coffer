// Phase 07b: the data-at-rest scanner (catalog row I; matrix P01, P03, T02, T13, T15). Dev only. Looks for the shop's
// view key, plaintext pairing codes and raw IP addresses in what the site keeps: a VACUUM INTO copy of its database
// (every cell, then the raw bytes), the live -wal file (raw, read only), and logs.
//
//   scripts/with-shop-env.sh node scripts/redteam/scan-at-rest.mjs [--db <path>] [--log <file>]... [--code-file <file>]...
//                                                                 [--ip <address>]... [--secret-file <file>]...
//
// The view key comes from SHOP_VIEW_KEY (set by with-shop-env.sh) and nowhere else. --code-file is a mode-600 file
// holding a pairing code (dev-e2e.mjs --issue-code writes one); --secret-file is any other mode-600 file whose
// contents must not appear (for the wallet-host scan). --ip names an address the run sent (each is also looked for in
// its other spellings); besides those, any IP-shaped text in Coffer's own rows fails.
//
// One line per check, PASS or FAIL. A FAIL names where (file, table, row, column, offset) and which encoding matched,
// never the value or the text around it. Exit code 1 on any FAIL. A copy of the output goes to
// ~/xmr-pay-dev-data/redteam/.
import { appendFileSync, existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isIPv4, isIPv6 } from "node:net";
import { pathToFileURL } from "node:url";

import { DEFAULT_DB, EVIDENCE_DIR, PLUGIN, evidencePath } from "./lib.mjs";

const { DatabaseSync } = await import("node:sqlite");

/** The ways a 32-byte key could be written down: hex either case, base64, base64url, and the bytes themselves. */
export function keyNeedles(hex) {
	if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("the view key must be 64 hex characters");
	const bytes = Buffer.from(hex, "hex");
	const b64 = bytes.toString("base64");
	return [
		{ encoding: "hex", text: hex.toLowerCase() },
		{ encoding: "HEX", text: hex.toUpperCase() },
		{ encoding: "base64", text: b64 },
		{ encoding: "base64 (unpadded)", text: b64.replace(/=+$/, "") },
		{ encoding: "base64url", text: bytes.toString("base64url") },
		{ encoding: "raw bytes", bytes },
	].map((n) => ({ ...n, bytes: n.bytes ?? Buffer.from(n.text) }));
}

/** An IP address as text, plus its other common spellings (IPv6 compressed, expanded, and IPv4-mapped). */
export function ipNeedles(ip) {
	if (isIPv4(ip)) return [{ encoding: "ipv4", text: ip }, { encoding: "ipv4-mapped ipv6", text: `::ffff:${ip}` }].map((n) => ({ ...n, bytes: Buffer.from(n.text) }));
	if (!isIPv6(ip)) throw new Error(`not an IP address: ${ip}`);
	const full = expandIPv6(ip);
	const spellings = new Set([ip.toLowerCase(), full, full.split(":").map((g) => g.replace(/^0+(?=.)/, "")).join(":"), compressIPv6(full)]);
	return [...spellings].map((text) => ({ encoding: "ipv6", text, bytes: Buffer.from(text) }));
}

function expandIPv6(ip) {
	const [head, tail = ""] = ip.toLowerCase().split("::");
	const h = head ? head.split(":") : [];
	const t = tail ? tail.split(":") : [];
	const groups = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
	return groups.map((g) => g.padStart(4, "0")).join(":");
}

function compressIPv6(full) {
	const groups = full.split(":").map((g) => g.replace(/^0+(?=.)/, ""));
	let best = [-1, 0];
	for (let i = 0; i < 8; ) {
		let j = i;
		while (j < 8 && groups[j] === "0") j++;
		if (j - i > best[1]) best = [i, j - i];
		i = j === i ? i + 1 : j;
	}
	if (best[1] < 2) return groups.join(":");
	return `${groups.slice(0, best[0]).join(":")}::${groups.slice(best[0] + best[1]).join(":")}`;
}

const IPV4_SHAPE = /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g;
const IPV6_CANDIDATE = /[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*:[0-9A-Fa-f:.]*/g;
/** IP-shaped text in a string: real IPv4 dotted quads and anything net.isIPv6 accepts. Versions, times and amounts don't match. */
export function ipShapes(text) {
	const found = [];
	for (const _ of text.matchAll(IPV4_SHAPE)) found.push("ipv4");
	for (const m of text.matchAll(IPV6_CANDIDATE)) if (isIPv6(m[0].replace(/^[.]+|[.]+$/g, ""))) found.push("ipv6");
	return found;
}

/**
 * Every place the needles turn up. Sources: { kind: "db", path } (each text or blob cell, then the raw file),
 * { kind: "file", path } (raw bytes). Each hit is { where, encoding }; nothing of the value itself.
 */
export function findNeedles(needles, sources) {
	const hits = [];
	for (const src of sources) {
		if (src.kind === "db") {
			const db = new DatabaseSync(src.path, { readOnly: true });
			try {
				for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
					const info = db.prepare("SELECT name, pk FROM pragma_table_info(?)").all(name);
					const cols = info.map((c) => c.name);
					const pk = info.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => `"${c.name.replaceAll('"', '""')}"`);
					const key = pk.length > 0 ? pk.join(" || '/' || ") : "rowid";
					for (const row of db.prepare(`SELECT ${key} AS __key, * FROM "${name.replaceAll('"', '""')}"`).iterate()) {
						for (const col of cols) {
							const v = row[col];
							const cell = typeof v === "string" ? Buffer.from(v) : v instanceof Uint8Array ? Buffer.from(v) : null;
							if (cell === null) continue;
							for (const n of needles) if (cell.includes(n.bytes)) hits.push({ where: `${src.label}: table ${name}, row ${shortKey(row.__key)}, column ${col}`, encoding: n.encoding });
						}
					}
				}
			} finally {
				db.close();
			}
		}
		const raw = readFileSync(src.path);
		for (const n of needles) {
			const at = raw.indexOf(n.bytes);
			if (at !== -1) hits.push({ where: `${src.label}: raw bytes at offset ${at}`, encoding: n.encoding });
		}
	}
	return hits;
}

/** A row's primary key, short enough for a location: Coffer's keys are invoice ids, pool indexes and KV names, never a secret. */
const shortKey = (k) => String(k).slice(0, 64);

/** IP-shaped text in Coffer's own rows: _plugin_storage for the plugin and its options (settings). */
export function cofferIpShapes(dbPath, plugin = PLUGIN) {
	const db = new DatabaseSync(dbPath, { readOnly: true });
	try {
		const hits = [];
		const rows = [
			...db.prepare("SELECT collection || '/' || id AS key, data AS text FROM _plugin_storage WHERE plugin_id = ?").all(plugin).map((r) => ({ where: `_plugin_storage ${shortKey(r.key)}`, text: r.text })),
			...db.prepare("SELECT name AS key, value AS text FROM options WHERE name LIKE ?").all(`plugin:${plugin}:%`).map((r) => ({ where: `options ${shortKey(r.key)}`, text: r.text })),
		];
		for (const r of rows) for (const kind of ipShapes(String(r.text ?? ""))) hits.push({ where: r.where, encoding: `${kind}-shaped text` });
		return { hits, rows: rows.length };
	} finally {
		db.close();
	}
}

function readSecretFile(path) {
	const mode = statSync(path).mode & 0o777;
	if (mode & 0o077) throw new Error(`${path} must be readable by its owner only (mode 600), not ${mode.toString(8)}`);
	return readFileSync(path, "utf8").trim();
}

function parseArgs(argv) {
	const o = { db: DEFAULT_DB, logs: [], codeFiles: [], ips: [], secretFiles: [] };
	const many = { "--log": "logs", "--code-file": "codeFiles", "--ip": "ips", "--secret-file": "secretFiles" };
	for (let i = 0; i < argv.length; i += 2) {
		const [flag, v] = [argv[i], argv[i + 1]];
		if (v === undefined) throw new Error(`${flag} needs a value`);
		if (flag === "--db") o.db = v;
		else if (many[flag]) o[many[flag]].push(v);
		else throw new Error(`unknown option ${flag}`);
	}
	if (o.logs.length === 0) o.logs.push(`${homedir()}/sites/xmr-dev-site/.astro/dev.log`);
	return o;
}

/** Runs the scan. Returns the lines printed and whether anything failed. `env` and `evidenceDir` are for the tests. */
export function scan(argv, { env = process.env, evidenceDir = EVIDENCE_DIR, print = console.log } = {}) {
	const viewKey = env.SHOP_VIEW_KEY;
	if (!viewKey) throw new Error("SHOP_VIEW_KEY isn't set; run through scripts/with-shop-env.sh");
	const o = parseArgs(argv);
	const stamp = new Date().toISOString().replace(/[:.]/g, "");
	const out = evidencePath(`scan-at-rest-${stamp}.txt`, evidenceDir);
	const lines = [];
	const say = (line) => {
		lines.push(line);
		print(line);
		appendFileSync(out, line + "\n", { mode: 0o600 });
	};

	// A fresh VACUUM INTO copy: the cells as SQLite sees them, writes still in the -wal included.
	const copy = evidencePath(`scan-at-rest-${stamp}.db`, evidenceDir);
	const live = new DatabaseSync(o.db, { readOnly: true });
	try {
		live.prepare("VACUUM INTO ?").run(copy);
	} finally {
		live.close();
	}
	const sources = [{ kind: "db", path: copy, label: "database copy" }];
	if (existsSync(`${o.db}-wal`)) sources.push({ kind: "file", path: `${o.db}-wal`, label: "live -wal file" });
	for (const log of o.logs) {
		if (existsSync(log)) sources.push({ kind: "file", path: log, label: `log ${log}` });
		else say(`NOTE  log ${log} doesn't exist; not scanned`);
	}
	say(`# data at rest, ${new Date().toISOString()}: ${sources.map((s) => s.label).join("; ")}`);

	let failed = false;
	const report = (tags, what, hits) => {
		if (hits.length === 0) return say(`${tags} PASS  ${what}: not found`);
		failed = true;
		for (const h of hits) say(`${tags} FAIL  ${what}: found (${h.encoding}) in ${h.where}`);
	};
	try {
		report("[P01][T02][T15]", "the view key", findNeedles(keyNeedles(viewKey), sources));
		o.codeFiles.forEach((f, i) => report("[T02][T13]", `pairing code ${i + 1} (from --code-file)`, findNeedles([{ encoding: "plaintext", bytes: Buffer.from(readSecretFile(f)) }], sources)));
		o.secretFiles.forEach((f, i) => report("[T02][T29]", `secret ${i + 1} (from --secret-file)`, findNeedles([{ encoding: "plaintext", bytes: Buffer.from(readSecretFile(f)) }], sources)));
		for (const ip of o.ips) report("[P03]", `IP address ${ip}`, findNeedles(ipNeedles(ip), sources));
		const shapes = cofferIpShapes(copy);
		report("[P03]", `IP-shaped text in Coffer's ${shapes.rows} rows and settings`, shapes.hits);
	} finally {
		rmSync(copy, { force: true });
	}
	say(failed ? "RESULT FAIL" : "RESULT PASS");
	say(`saved to ${out}`);
	return { lines, failed, out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	try {
		process.exitCode = scan(process.argv.slice(2)).failed ? 1 : 0;
	} catch (err) {
		console.error(`scan-at-rest: ${err.message}`);
		process.exitCode = 2;
	}
}
