// Phase 07b: shared helpers for the adversarial passes, moved out of scripts/dev-e2e.mjs. Dev only; never shipped. Node
// built-ins only.
//
// Every request goes to a loopback site (localhost, 127.0.0.1 or [::1]) and follows no redirect, so an attack can't
// reach another machine by mistake or be bounced to one. Signing keys are the published RFC 8032 test keys (the same
// seeds as plugin/tests/sync/helpers.ts) or a key generated in memory for one run; no other key is ever written.
//
// Floods go through flood(): at most 50 requests in flight, and it stops starting new ones when the box has less than
// 1.5 GB available (CLAUDE.md, "Memory"; the 07b catalog's row H).
import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { homedir } from "node:os";
import { basename, join } from "node:path";

process.removeAllListeners("warning"); // node:sqlite's experimental notice
const { DatabaseSync } = await import("node:sqlite");

export const PLUGIN = "coffer";
export const DEFAULT_SITE = "http://localhost:4321";
export const DEFAULT_DB = `${homedir()}/sites/xmr-dev-site/data.db`;
export const EVIDENCE_DIR = `${homedir()}/xmr-pay-dev-data/redteam`;
export const MAX_CONCURRENCY = 50;
export const MIN_AVAILABLE_MIB = 1536;

// ---- loopback only ----
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The URL, parsed, if it points at this box; otherwise an error. */
export function loopbackUrl(input) {
	const url = new URL(input);
	if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`refusing ${url.protocol} URLs: http(s) to a loopback site only`);
	if (url.username !== "" || url.password !== "") throw new Error("refusing a URL with a user name or password in it");
	if (!LOOPBACK.has(url.hostname)) throw new Error(`refusing ${url.host}: loopback sites only (localhost, 127.0.0.1, [::1])`);
	return url;
}

/** A plugin route's URL on a loopback site. */
export const route = (site, name) => new URL(`/_emdash/api/plugins/${PLUGIN}/${name}`, loopbackUrl(site)).href;

/**
 * One request to a loopback URL, redirects not followed. Plugin results arrive as { data }; host errors as
 * { error: { code } }; `code` is whichever is there.
 */
export async function send(url, { method = "POST", body, headers = {}, signal } = {}) {
	const res = await fetch(loopbackUrl(url), { method, headers, body, redirect: "manual", signal });
	const text = await res.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = { raw: text.slice(0, 120) };
	}
	const data = json.data;
	const code = data?.error?.code ?? json.error?.code ?? null;
	return { status: res.status, headers: res.headers, text, json, data, code };
}

// ---- keys and signing ----
const RFC8032_SEEDS = {
	test1: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
	test2: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
};
const PKCS8_ED25519 = Buffer.from("302e020100300506032b657004220420", "hex");
const keyOf = (privateKey) => {
	const publicKey = createPublicKey(privateKey);
	return { privateKey, publicKey, publicB64: publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("base64") };
};

/** RFC 8032's published test key "test1" or "test2" (section 7.1). */
export function rfc8032Key(name) {
	const seed = RFC8032_SEEDS[name];
	if (seed === undefined) throw new Error(`no RFC 8032 key named ${name}`);
	return keyOf(createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, Buffer.from(seed, "hex")]), format: "der", type: "pkcs8" }));
}

/** A bridge key for one run, kept in memory. */
export const newKey = () => keyOf(generateKeyPairSync("ed25519").privateKey);

export const nowTs = () => String(Math.floor(Date.now() / 1000));
export const b64url = (buf) => Buffer.from(buf).toString("base64url");

/** x-xmr-ts and x-xmr-sig for a body: the signature is over ts + "\n" + the exact bytes. */
export function signedHeaders(bytes, { key, ts = nowTs() }) {
	const sig = sign(null, Buffer.concat([Buffer.from(`${ts}\n`), bytes]), key.privateKey).toString("base64");
	return { "content-type": "application/json", "x-xmr-ts": ts, "x-xmr-sig": sig };
}

/** A sync body's bytes: protocol version 1, the given seq and height, empty lists unless `fields` sets them. */
export const syncBody = (fields, { seq, height }) => Buffer.from(JSON.stringify({ v: 1, seq, height, addresses: [], snapshots: [], ...fields }));

/** A signed POST to bridge/sync; `extra` headers are added after the signature's. */
export const sync = (site, bytes, signOpts, extra = {}) => send(route(site, "bridge/sync"), { body: bytes, headers: { ...signedHeaders(bytes, signOpts), ...extra } });

// ---- fake addresses ----
const DIGITS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BLOCK_CHARS = [0, 2, 3, 5, 6, 7, 9, 10, 11];
/** Monero's block base58: 8-byte blocks to 11 characters, the last partial block to its own length. */
export function base58(bytes) {
	let out = "";
	for (let i = 0; i < bytes.length; i += 8) {
		const block = bytes.subarray(i, i + 8);
		let n = 0n;
		for (const b of block) n = (n << 8n) | BigInt(b);
		let s = "";
		for (let k = 0; k < BLOCK_CHARS[block.length]; k++, n /= 58n) s = DIGITS[Number(n % 58n)] + s;
		out += s;
	}
	return out;
}
/** Network bytes: standard address, subaddress. */
export const TAGS = { mainnet: [18, 42], stagenet: [24, 36], testnet: [53, 63] };
/**
 * A fake subaddress for a pool index: a network byte (36, stagenet's, by default), the index, made-up key bytes and a
 * zero checksum, so no wallet would send to it. Since spec change 36 the plugin reads the network byte and drops an
 * address it can't read.
 */
export function fakeAddress(index, tag = TAGS.stagenet[1]) {
	const bytes = Buffer.alloc(69);
	bytes[0] = tag;
	bytes.writeUInt32BE(index, 1);
	for (let k = 5; k < 65; k++) bytes[k] = (k * 37 + 11) & 0xff;
	return base58(bytes);
}

// ---- the dev site's database ----
/** What a run creates and cleanup removes. Wyatt's settings (currency, speed), the salt and the cron flag stay. */
export const RUN_KV = ["state:pairing", "state:bridge", "state:alerts", "state:buckets", "state:purgeCursor"];
export const KEY_OPTION = `plugin:${PLUGIN}:settings:bridgePublicKey`;

export function openSiteDb(path = DEFAULT_DB, { readOnly = false } = {}) {
	if (!existsSync(path)) throw new Error(`no database at ${path}`);
	const db = new DatabaseSync(path, { readOnly });
	db.exec("PRAGMA busy_timeout = 5000");
	return db;
}

/**
 * The KV shortcut: the admin page stores only a SHA-256 hash of its pairing code, so a script can't read one back.
 * This writes a new code's hash into the plugin's KV row (the sandbox runner keeps a sandboxed plugin's KV in
 * _plugin_storage, collection "__kv"), exactly what the admin page's Connect wallet host would store, and returns the
 * code. Valid 15 minutes, single use.
 */
export function writePairingCode(db, { code = b64url(randomBytes(16)), now = Date.now() } = {}) {
	const state = JSON.stringify({ codeHash: b64url(createHash("sha256").update(code).digest()), expiresAt: now + 15 * 60_000, used: false });
	const stamp = new Date(now).toISOString();
	db.prepare(
		"INSERT INTO _plugin_storage (plugin_id, collection, id, data, revision, created_at, updated_at) VALUES (?, '__kv', 'state:pairing', ?, ?, ?, ?) ON CONFLICT (plugin_id, collection, id) DO UPDATE SET data = excluded.data, revision = excluded.revision, updated_at = excluded.updated_at",
	).run(PLUGIN, state, crypto.randomUUID(), stamp, stamp);
	return code;
}

/** Removes Coffer's pool and invoice rows, the run's KV rows and the paired key. Returns what it removed. */
export function cleanupCofferRows(db) {
	const rows = db.prepare("DELETE FROM _plugin_storage WHERE plugin_id = ? AND collection IN ('pool', 'invoices')").run(PLUGIN).changes;
	const kv = db.prepare(`DELETE FROM _plugin_storage WHERE plugin_id = ? AND collection = '__kv' AND id IN (${RUN_KV.map(() => "?").join(",")})`).run(PLUGIN, ...RUN_KV).changes;
	const key = db.prepare("DELETE FROM options WHERE name = ?").run(KEY_OPTION).changes;
	return { rows, kv, key };
}

// ---- evidence and backups ----
/** A file under ~/xmr-pay-dev-data/redteam/ (made mode 700 if missing). `name` is a plain file name. */
export function evidencePath(name, dir = EVIDENCE_DIR) {
	if (name !== basename(name) || name === "" || name === "." || name === "..") throw new Error(`evidence file names have no folders in them: ${name}`);
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	return join(dir, name);
}

/**
 * A copy of a SQLite database through VACUUM INTO on a read-only connection, so writes still in the -wal file come
 * along (never `cp data.db` alone). Written to <dir>/<name>.db, mode 600; refuses to overwrite.
 */
export function backupDatabase(name, { from = DEFAULT_DB, dir = EVIDENCE_DIR } = {}) {
	const to = evidencePath(name.endsWith(".db") ? name : `${name}.db`, dir);
	if (existsSync(to)) throw new Error(`${to} already exists; pick another name`);
	const db = openSiteDb(from, { readOnly: true });
	try {
		db.prepare("VACUUM INTO ?").run(to);
	} finally {
		db.close();
	}
	chmodSync(to, 0o600);
	return to;
}

// ---- memory and floods ----
/** MemAvailable from /proc/meminfo, in MiB (the `available` column of `free -m`). */
export function memAvailableMiB(meminfo = readFileSync("/proc/meminfo", "utf8")) {
	const m = /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo);
	if (!m) throw new Error("MemAvailable not found in /proc/meminfo");
	return Math.floor(Number(m[1]) / 1024);
}

/** Throws when less than `min` MiB is available. */
export function assertMemory(min = MIN_AVAILABLE_MIB, readMemory = memAvailableMiB) {
	const mib = readMemory();
	if (mib < min) throw new Error(`only ${mib} MiB available (under ${min}); stop something first`);
	return mib;
}

/**
 * Runs `tasks` (functions returning promises) with at most `concurrency` in flight (50 at most). Before starting each
 * task it reads the available memory and stops starting new ones below `stopBelowMiB`; tasks already in flight finish.
 * Returns each started task's result in order, why it stopped (null when all ran), and the most in flight at once.
 */
export async function flood(tasks, { concurrency = 10, stopBelowMiB = MIN_AVAILABLE_MIB, readMemory = memAvailableMiB } = {}) {
	if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > MAX_CONCURRENCY) throw new Error(`concurrency must be 1 to ${MAX_CONCURRENCY}`);
	const queue = [...tasks];
	const results = [];
	let next = 0;
	let inFlight = 0;
	let maxInFlight = 0;
	let stopped = null;
	async function worker() {
		while (stopped === null && next < queue.length) {
			const mib = readMemory();
			if (mib < stopBelowMiB) {
				stopped = `memory: ${mib} MiB available, under ${stopBelowMiB}`;
				return;
			}
			const i = next++;
			inFlight++;
			maxInFlight = Math.max(maxInFlight, inFlight);
			const start = performance.now();
			try {
				results[i] = { ok: true, value: await queue[i](), ms: performance.now() - start };
			} catch (error) {
				results[i] = { ok: false, error, ms: performance.now() - start };
			} finally {
				inFlight--;
			}
		}
	}
	await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
	return { results: results.filter(Boolean), stopped, maxInFlight };
}
