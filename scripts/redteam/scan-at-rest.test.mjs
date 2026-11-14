// Tests for scripts/redteam/scan-at-rest.mjs on temporary databases: node --test scripts/redteam/*.test.mjs
// The "view key" here is 32 random bytes made for each run, never a real key.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { ipNeedles, ipShapes, keyNeedles, scan } from "./scan-at-rest.mjs";

const { DatabaseSync } = await import("node:sqlite");
const scratch = mkdtempSync(join(tmpdir(), "redteam-scan-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
/** A site database shaped like the dev site's (the two tables the scanner reads by name), with optional plants. */
function siteDb({ kv = null, option = null, other = null, walOnly = null } = {}) {
	const dir = join(scratch, `site${++n}`);
	const path = `${dir}.db`;
	const db = new DatabaseSync(path);
	db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
	db.exec("CREATE TABLE _plugin_storage (plugin_id TEXT, collection TEXT, id TEXT, data TEXT, PRIMARY KEY (plugin_id, collection, id))");
	db.exec("CREATE TABLE options (name TEXT PRIMARY KEY, value TEXT)");
	db.exec("CREATE TABLE posts (id TEXT PRIMARY KEY, body BLOB)");
	const put = db.prepare("INSERT INTO _plugin_storage VALUES ('coffer', ?, ?, ?)");
	put.run("invoices", "inv_1", JSON.stringify({ status: "settled", version: "1.3.1", at: "2026-10-26T09:00:00Z", amountAtomic: "2000000000" }));
	if (kv !== null) put.run("__kv", "state:bridge", JSON.stringify({ note: kv }));
	db.prepare("INSERT INTO options VALUES (?, ?)").run("plugin:coffer:settings:bridgePublicKey", JSON.stringify(option ?? "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="));
	if (other !== null) db.prepare("INSERT INTO posts VALUES ('p1', ?)").run(other);
	db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
	if (walOnly !== null) db.prepare("INSERT INTO options VALUES ('site:title', ?)").run(walOnly); // stays in -wal: the writer is left open
	return { path, db };
}

function run(path, extra = [], key) {
	const printed = [];
	const evidenceDir = join(scratch, `ev${++n}`);
	const r = scan(["--db", path, "--log", join(scratch, "no-such.log"), ...extra], { env: { SHOP_VIEW_KEY: key }, evidenceDir, print: (l) => printed.push(l) });
	return { ...r, printed: printed.join("\n"), saved: readFileSync(r.out, "utf8") };
}

const leaks = (text, needles) => needles.filter((x) => x.text !== undefined && text.includes(x.text)).map((x) => x.encoding);

describe("scan-at-rest", () => {
	it("refuses to run without SHOP_VIEW_KEY, and refuses a malformed key without echoing it", () => {
		assert.throws(() => scan([], { env: {} }), /SHOP_VIEW_KEY isn't set/);
		const bad = "zz" + randomBytes(31).toString("hex");
		assert.throws(() => keyNeedles(bad), (err) => !err.message.includes(bad));
	});

	it("a clean database passes every check", () => {
		const key = randomBytes(32).toString("hex");
		const { path, db } = siteDb();
		const r = run(path, [], key);
		db.close();
		assert.equal(r.failed, false, r.printed);
		assert.match(r.printed, /\[P01\]\[T02\]\[T15\] PASS {2}the view key: not found/);
		assert.match(r.printed, /\[P03\] PASS {2}IP-shaped text in Coffer's 2 rows and settings: not found/);
		assert.match(r.printed, /RESULT PASS/);
	});

	it("finds the key in every encoding and place, names where, and never prints it", () => {
		const key = randomBytes(32).toString("hex");
		const needles = keyNeedles(key);
		const b = Buffer.from(key, "hex");
		const { path, db } = siteDb({ kv: `x${key.toUpperCase()}y`, option: b.toString("base64url"), other: Buffer.concat([Buffer.from("pre"), b]), walOnly: b.toString("base64") });
		const log = join(scratch, "dev.log");
		writeFileSync(log, `line one\nkey=${key}\n`);
		const r = run(path, ["--log", log], key);
		db.close();
		assert.equal(r.failed, true);
		assert.match(r.printed, /FAIL {2}the view key: found \(HEX\) in database copy: table _plugin_storage, row coffer\/__kv\/state:bridge, column data/);
		assert.match(r.printed, /found \(base64url\) in database copy: table options, row plugin:coffer:settings:bridgePublicKey, column value/);
		assert.match(r.printed, /found \(raw bytes\) in database copy: table posts, row p1, column body/);
		assert.match(r.printed, /found \(base64\) in database copy: table options, row site:title/); // from the -wal, through VACUUM INTO
		assert.match(r.printed, /found \(base64\) in live -wal file: raw bytes at offset \d+/);
		assert.match(r.printed, /found \(hex\) in log .*dev\.log: raw bytes at offset \d+/);
		assert.deepEqual(leaks(r.printed, needles), []);
		assert.deepEqual(leaks(r.saved, needles), []);
	});

	it("finds a pairing code from a mode-600 file and refuses a readable one", () => {
		const key = randomBytes(32).toString("hex");
		const code = randomBytes(16).toString("base64url");
		const { path, db } = siteDb({ kv: `code ${code}` });
		const file = join(scratch, "code.txt");
		writeFileSync(file, code + "\n", { mode: 0o600 });
		const r = run(path, ["--code-file", file], key);
		assert.match(r.printed, /\[T02\]\[T13\] FAIL {2}pairing code 1 \(from --code-file\): found \(plaintext\) in database copy: table _plugin_storage/);
		assert.equal(r.printed.includes(code), false);
		assert.equal(r.saved.includes(code), false);
		chmodSync(file, 0o644);
		assert.throws(() => run(path, ["--code-file", file], key), /mode 600/);
		db.close();
	});

	it("finds a named IP in its other spellings, and any IP-shaped text in Coffer's rows", () => {
		const key = randomBytes(32).toString("hex");
		const { path, db } = siteDb({ kv: "seen from 2001:db8:0:0:0:0:0:7 and ::ffff:203.0.113.9" });
		const r = run(path, ["--ip", "2001:db8::7", "--ip", "203.0.113.9", "--ip", "198.51.100.1"], key);
		db.close();
		assert.match(r.printed, /\[P03\] FAIL {2}IP address 2001:db8::7: found \(ipv6\)/);
		assert.match(r.printed, /\[P03\] FAIL {2}IP address 203.0.113.9: found \(ipv4\)/);
		assert.match(r.printed, /\[P03\] PASS {2}IP address 198.51.100.1: not found/);
		assert.match(r.printed, /\[P03\] FAIL {2}IP-shaped text in Coffer's 3 rows and settings: found \(ipv6-shaped text\) in _plugin_storage __kv\/state:bridge/);
	});

	it("IP shapes: real addresses only, not versions, times or amounts", () => {
		assert.deepEqual(ipShapes("version 1.3.1, at 09:00:00, 2000000000 atomic, 10.0.0.256"), []);
		assert.deepEqual(ipShapes("from 10.0.0.1 and fe80::1 and 2001:db8:0:0:0:0:0:7"), ["ipv4", "ipv6", "ipv6"]);
		assert.deepEqual(ipNeedles("2001:0db8:0000:0000:0000:0000:0000:0007").map((x) => x.text).sort(), ["2001:0db8:0000:0000:0000:0000:0000:0007", "2001:db8:0:0:0:0:0:7", "2001:db8::7"]);
	});
});
