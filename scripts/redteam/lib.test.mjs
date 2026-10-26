// Tests for scripts/redteam/lib.mjs: node --test scripts/redteam/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sign, verify } from "node:crypto";
import { after, describe, it } from "node:test";

import { backupDatabase, cookieOf, evidencePath, fakeAddress, flood, loopbackUrl, magicTokenFrom, memAvailableMiB, rfc8032Key, route, send, signedHeaders, syncBody } from "./lib.mjs";

const { DatabaseSync } = await import("node:sqlite");
const scratch = mkdtempSync(join(tmpdir(), "redteam-lib-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

describe("loopback guard", () => {
	it("refuses anything but a loopback http(s) site", () => {
		for (const url of ["http://example.com", "http://localhost.example.com", "http://127.0.0.1.nip.io", "http://user@localhost:4321", "http://localhost:4321@example.com", "http://10.0.0.1", "http://192.168.1.10:4321", "file:///etc/passwd", "ftp://localhost", "http://[::2]"]) {
			assert.throws(() => loopbackUrl(url), undefined, url);
		}
		assert.throws(() => route("http://example.com", "status"));
	});

	it("accepts localhost, 127.0.0.1 and [::1]", () => {
		for (const url of ["http://localhost:4321", "http://127.0.0.1:4322", "http://[::1]:4321", "https://localhost"]) assert.equal(loopbackUrl(url).href.startsWith(url), true, url);
		assert.equal(route("http://localhost:4321", "bridge/sync"), "http://localhost:4321/_emdash/api/plugins/coffer/bridge/sync");
	});

	it("follows no redirect", async () => {
		const server = createServer((_, res) => res.writeHead(302, { location: "http://example.invalid/elsewhere" }).end());
		await new Promise((r) => server.listen(0, "127.0.0.1", r));
		try {
			const r = await send(`http://127.0.0.1:${server.address().port}/`, { method: "GET" });
			assert.equal(r.status, 302);
			assert.equal(r.headers.get("location"), "http://example.invalid/elsewhere");
		} finally {
			server.close();
		}
	});
});

describe("signing", () => {
	// RFC 8032 section 7.1, TEST 1 and TEST 2.
	const vectors = [
		{ name: "test1", pub: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", msg: "", sig: "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b" },
		{ name: "test2", pub: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", msg: "72", sig: "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00" },
	];
	for (const v of vectors) {
		it(`RFC 8032 ${v.name}: public key and signature match the published vector`, () => {
			const key = rfc8032Key(v.name);
			assert.equal(Buffer.from(key.publicB64, "base64").toString("hex"), v.pub);
			assert.equal(sign(null, Buffer.from(v.msg, "hex"), key.privateKey).toString("hex"), v.sig);
		});
	}

	it("the public keys match the plugin tests' PUBLIC_KEYS", () => {
		assert.equal(rfc8032Key("test1").publicB64, "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=");
		assert.equal(rfc8032Key("test2").publicB64, "PUAXw+hDiVqStwqnTRt+vJyYLM8uxJaMwM1V8Sr0Zgw=");
	});

	it("signedHeaders signs ts + newline + the exact bytes", () => {
		const key = rfc8032Key("test1");
		const bytes = syncBody({}, { seq: 7, height: 100 });
		const h = signedHeaders(bytes, { key, ts: "1700000000" });
		assert.equal(h["x-xmr-ts"], "1700000000");
		assert.equal(verify(null, Buffer.concat([Buffer.from("1700000000\n"), bytes]), key.publicKey, Buffer.from(h["x-xmr-sig"], "base64")), true);
		assert.equal(verify(null, Buffer.concat([Buffer.from("1700000001\n"), bytes]), key.publicKey, Buffer.from(h["x-xmr-sig"], "base64")), false);
		assert.deepEqual(JSON.parse(bytes), { v: 1, seq: 7, height: 100, addresses: [], snapshots: [] });
	});

	it("fake addresses are 95 characters and differ by index and network byte", () => {
		assert.equal(fakeAddress(1).length, 95);
		assert.notEqual(fakeAddress(1), fakeAddress(2));
		assert.notEqual(fakeAddress(1), fakeAddress(1, 42));
	});
});

describe("flood", () => {
	const wait = (ms) => new Promise((r) => setTimeout(r, ms));

	it("refuses more than 50 in flight", async () => {
		await assert.rejects(flood([], { concurrency: 51 }));
		await assert.rejects(flood([], { concurrency: 0 }));
	});

	it("keeps to its concurrency and returns every result in order", async () => {
		let live = 0;
		let most = 0;
		const tasks = Array.from({ length: 120 }, (_, i) => async () => {
			most = Math.max(most, ++live);
			await wait(2);
			live--;
			if (i === 5) throw new Error("five");
			return i;
		});
		const r = await flood(tasks, { concurrency: 50, readMemory: () => 4000 });
		assert.equal(r.stopped, null);
		assert.equal(r.results.length, 120);
		assert.equal(r.maxInFlight, 50);
		assert.equal(most, 50);
		assert.equal(r.results[7].value, 7);
		assert.equal(r.results[5].ok, false);
	});

	it("stops starting tasks when memory runs low", async () => {
		let reads = 0;
		const tasks = Array.from({ length: 100 }, () => async () => wait(1));
		const r = await flood(tasks, { concurrency: 5, readMemory: () => (++reads > 20 ? 1000 : 4000) });
		assert.match(r.stopped, /^memory: 1000 MiB/);
		assert.ok(r.results.length < 100 && r.results.length >= 20, String(r.results.length));
	});

	it("reads MemAvailable in MiB", () => {
		assert.equal(memAvailableMiB("MemTotal: 8011776 kB\nMemAvailable:    5117952 kB\n"), 4998);
		assert.throws(() => memAvailableMiB("MemTotal: 1 kB\n"));
		assert.ok(memAvailableMiB() > 0);
	});
});

describe("evidence and backups", () => {
	it("evidence file names have no folders", () => {
		for (const bad of ["../x", "a/b", "", ".."]) assert.throws(() => evidencePath(bad, scratch), undefined, bad);
		assert.equal(evidencePath("run.txt", join(scratch, "ev")), join(scratch, "ev", "run.txt"));
		assert.equal(statSync(join(scratch, "ev")).mode & 0o777, 0o700);
	});

	it("backs up with the WAL's writes, mode 600, and never overwrites", () => {
		const src = join(scratch, "site.db");
		const db = new DatabaseSync(src);
		db.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0; CREATE TABLE t (v TEXT); INSERT INTO t VALUES ('in the wal');");
		const to = backupDatabase("copy", { from: src, dir: scratch }); // the writer is still open: the row is only in -wal
		db.close();
		assert.equal(statSync(to).mode & 0o777, 0o600);
		const copy = new DatabaseSync(to, { readOnly: true });
		assert.equal(copy.prepare("SELECT v FROM t").get().v, "in the wal");
		copy.close();
		assert.throws(() => backupDatabase("copy", { from: src, dir: scratch }), /already exists/);
	});
});

describe("EmDash sessions", () => {
	it("cookieOf joins only the name=value part of each Set-Cookie", () => {
		const h = new Headers();
		h.append("set-cookie", "a=1; Path=/; HttpOnly");
		h.append("set-cookie", "b=two; SameSite=Lax");
		assert.equal(cookieOf(h), "a=1; b=two");
		assert.equal(cookieOf(new Headers()), "");
	});

	it("magicTokenFrom takes the token from a verify link and nothing else", () => {
		assert.equal(magicTokenFrom("Sign in: http://localhost:4321/_emdash/api/auth/magic-link/verify?token=abc_DEF-1&redirect=%2F ok"), "abc_DEF-1");
		assert.equal(magicTokenFrom("http://localhost:4321/_emdash/api/auth/invite/accept?token=nope"), null);
		assert.equal(magicTokenFrom(undefined), null);
	});
});
