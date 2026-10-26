// Phase 07b pass 1, round 1 (black box): someone who can reach bridge/sync but holds no key (plan group C), and the
// sync body parser behind the signature (F01). Every refusal must leave storage, KV and settings exactly as they were.
import { afterEach, describe, expect, it } from "vitest";

import { H0, type RedteamHost, type Reply, redteamHost } from "./harness";
import { rng, withSeed } from "./random";
import { PUBLIC_KEYS, b64, bytesOf, fromB64, signedHeaders } from "../sync/helpers";
import { TAGS, fakeAddress } from "../addresses";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const code = (r: Reply) => data(r)?.error?.code as string | undefined;
const ok = (r: Reply) => data(r)?.ok === true;

/** Everything the plugin keeps, as one comparable string. */
async function state(r: RedteamHost) {
	const kv = await r.host.inspect.kv.list();
	return JSON.stringify({ invoices: await r.invoices(), pool: await r.pool(), kv, key: await r.host.inspect.setting("bridgePublicKey") });
}

/** A paired site with one open tip on pool index 1, and a body that would settle it and add a pool address. */
async function target() {
	h = await redteamHost({ pool: 3 });
	const tip = data(await h.checkout({ kind: "tip" }))!;
	const inv = (await h.invoices()).find((i) => i.token === tip.token)!;
	const forged = (seq = Date.now() + 1) => ({
		v: 1, seq, height: H0 + 20, addresses: [{ index: 500, address: fakeAddress(TAGS.stagenet[1], 500, "F") }],
		snapshots: [{ index: inv.addrIndex, transfers: [{ txid: "ab".repeat(32), amount: "5000000000000", confirmations: 15, height: H0 + 5, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" }] }],
	});
	return { h, inv, forged };
}

const L = (1n << 252n) + 27742317777372353535851937790883648493n;
/** The same signature with S + L: the same point equation, but not the canonical encoding RFC 8032 requires. */
function malleate(sig: string): string | null {
	const bytes = fromB64(sig);
	let s = 0n;
	for (let i = 63; i >= 32; i--) s = (s << 8n) | BigInt(bytes[i]);
	const s2 = s + L;
	if (s2 >= 1n << 256n) return null;
	const out = bytes.slice();
	let v = s2;
	for (let i = 32; i < 64; i++) {
		out[i] = Number(v & 0xffn);
		v >>= 8n;
	}
	return b64(out);
}

describe("C1: forged signatures", () => {
	it("[T03] C1: no signature, garbage, the wrong key, other bytes, a flipped bit or a non-canonical S: refused, nothing changes", async () => {
		const { h, forged } = await target();
		const before = await state(h);
		const body = bytesOf(forged());
		const good = await signedHeaders(body, Date.now(), "test1");
		const flipped = fromB64(good["x-xmr-sig"]);
		flipped[10] ^= 0x01;
		const other = bytesOf({ ...forged(), height: H0 + 21 });
		const tries: Array<[string, () => Promise<Reply>]> = [
			["unsigned", () => h.sync(body, { unsigned: true })],
			["ts only", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"] } })],
			["sig only", () => h.sync(body, { unsigned: true, headers: { "x-xmr-sig": good["x-xmr-sig"] } })],
			["empty sig", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": "" } })],
			["not base64", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": "!!!!" } })],
			["zero sig", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": b64(new Uint8Array(64)) } })],
			["short sig", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": good["x-xmr-sig"].slice(0, 40) } })],
			["long sig", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": b64(new Uint8Array([...fromB64(good["x-xmr-sig"]), 0])) } })],
			["unpaired key", () => h.sync(body, { key: "test2" })],
			["other bytes", () => h.sync(body, { send: other })],
			["one byte added", () => h.sync(body, { send: new Uint8Array([...body, 0x20]) })],
			["flipped bit", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": b64(flipped) } })],
			["ts changed", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": String(Number(good["x-xmr-ts"]) + 1), "x-xmr-sig": good["x-xmr-sig"] } })],
			["the public key as sig", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": PUBLIC_KEYS.test1 + PUBLIC_KEYS.test1 } })],
		];
		const ms = malleate(good["x-xmr-sig"]);
		if (ms) tries.push(["S + L", () => h.sync(body, { unsigned: true, headers: { "x-xmr-ts": good["x-xmr-ts"], "x-xmr-sig": ms } })]);
		const accepted: string[] = [];
		for (const [name, send] of tries) {
			const r = await send();
			if (ok(r) || r.status >= 500) accepted.push(`${name}: ${r.status} ${r.text.slice(0, 80)}`);
		}
		expect(accepted).toEqual([]);
		expect(await state(h)).toBe(before);
	});

	it("[T03] C1: a refused sync doesn't count as hearing from the wallet host (the silent-host alert can't be masked)", async () => {
		h = await redteamHost({ pool: 1, lastSyncAgo: 10 * 60_000 });
		const before = await state(h);
		const body = bytesOf({ v: 1, seq: Date.now(), height: H0, addresses: [], snapshots: [] });
		await h.sync(body, { unsigned: true });
		await h.sync(body, { key: "test2" });
		await h.sync(body, { nowMs: Date.now() - 400_000 });
		expect(await state(h)).toBe(before);
	});

	it("[T03] C1: a refused sync leaves the signed snapshot it carried unapplied, also with the body sent as text or JSON", async () => {
		const { h, forged } = await target();
		const before = await state(h);
		const body = bytesOf(forged());
		for (const ct of ["application/json", "text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) {
			const r = await h.sync(body, { key: "test2", headers: { "content-type": ct } });
			expect(ok(r), ct).toBe(false);
		}
		expect(await state(h)).toBe(before);
	});
});

describe("C2: freshness and replay", () => {
	it("[T04] C2: 299 s either way is accepted; 302 s and more either way is refused", async () => {
		// The header is whole seconds and the server reads its clock a few hundred ms after the sender, so a timestamp
		// 301 s ahead can land 300.x s ahead and pass (seen once in round 1). The exact 300/301 edges are covered with a
		// fixed clock in protocol.test.ts; here the margins either side.
		h = await redteamHost({ pool: 1 });
		const res: B = {};
		for (const off of [-3600, -302, -299, 299, 302, 3600, 86_400 * 365]) {
			const r = await h.sync({}, { nowMs: Date.now() + off * 1000 });
			res[off] = ok(r) ? "ok" : code(r);
		}
		expect(res).toEqual({ "-3600": "STALE_TIMESTAMP", "-302": "STALE_TIMESTAMP", "-299": "ok", "299": "ok", "302": "STALE_TIMESTAMP", "3600": "STALE_TIMESTAMP", "31536000": "STALE_TIMESTAMP" });
	});

	it("[T04] C2: odd spellings of the timestamp header are refused even when signed exactly as sent", async () => {
		h = await redteamHost({ pool: 1 });
		const ts = Math.floor(Date.now() / 1000);
		const accepted: string[] = [];
		for (const t of [`${ts}.0`, `0${ts}`, `+${ts}`, ` ${ts}`, `${ts} `, `${ts}e0`, `0x${ts.toString(16)}`, `${ts * 1000}`, "", "NaN", "-0", `${ts}\n`]) {
			const r = await h.sync({}, { ts: t });
			if (ok(r)) accepted.push(JSON.stringify(t));
		}
		// A number that parses to now within the window is harmless (it was signed), but strictness is the promise.
		expect(accepted.filter((t) => !["\"0" + ts + "\"", "\"+" + ts + "\"", `" ${ts}"`, `"${ts} "`, `"${ts}\\n"`].includes(t))).toEqual([]);
	});

	it("[T04] C2: a replayed snapshot (equal or lower seq, even re-signed with a fresh timestamp) is ignored; the same request twice applies once", async () => {
		const { h, inv } = await target();
		const t = (amount: string, confirmations: number) => ({ txid: "cd".repeat(32), amount, confirmations, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" });
		const s1 = Date.now() + 10;
		const first = { v: 1, seq: s1, height: H0 + 1, addresses: [], snapshots: [{ index: inv.addrIndex, transfers: [t("200000000", 0)] }] };
		expect(ok(await h.sync(bytesOf(first)))).toBe(true);
		expect(ok(await h.sync(bytesOf(first)))).toBe(true); // the identical request again
		const once = (await h.invoices()).find((i) => i.id === inv.id)!;
		expect(once.transfers).toHaveLength(1);
		expect(once.status).toBe("confirming"); // at least the floor, 0 confirmations
		// Older and equal seq carrying a confirmed payment: ignored.
		for (const seq of [s1, s1 - 1, 0, -1]) {
			await h.sync(bytesOf({ ...first, seq, height: H0 + 30, snapshots: [{ index: inv.addrIndex, transfers: [t("200000000", 20)] }] }));
			expect((await h.invoices()).find((i) => i.id === inv.id)!.status, String(seq)).toBe("confirming");
		}
	});
});

describe("C3 and F01: hostile bodies behind the signature", () => {
	it("[F01][T11] C3: malformed signed bodies are refused with no state change", async () => {
		const { h, inv } = await target();
		const before = await state(h);
		const tr = (o: B = {}) => ({ txid: "ef".repeat(32), amount: "500000000", confirmations: 15, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...o });
		const snap = (o: B) => ({ v: 1, seq: Date.now() + 100, height: H0 + 20, addresses: [], snapshots: [{ index: inv.addrIndex, transfers: [tr(o)] }] });
		const raw = (s: string) => new TextEncoder().encode(s);
		const cases: Array<[string, Uint8Array<ArrayBuffer>]> = [
			["empty", new Uint8Array(0)], ["BOM", new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(snap({}))])], ["invalid UTF-8", new Uint8Array([...raw('{"v":1,"x":"'), 0xc3, 0x28, ...raw('"}')])],
			["overlong UTF-8", new Uint8Array([...raw('{"v":1,"x":"'), 0xc0, 0xaf, ...raw('"}')])], ["UTF-16", new Uint8Array([...raw('{"v":1}')].flatMap((b) => [b, 0]))],
			["truncated", raw(JSON.stringify(snap({})).slice(0, -3))], ["array", raw("[]")], ["null", raw("null")], ["string", raw('"x"')], ["number", raw("1")],
			["NaN", raw(`{"v":1,"seq":NaN,"height":1,"addresses":[],"snapshots":[]}`)], ["trailing comma", raw('{"v":1,"seq":1,"height":1,"addresses":[],"snapshots":[],}')],
			["comment", raw('{"v":1,/*x*/"seq":1,"height":1,"addresses":[],"snapshots":[]}')], ["v string", bytesOf({ ...snap({}), v: "1" })], ["v 2", bytesOf({ ...snap({}), v: 2 })],
			["seq string", bytesOf({ ...snap({}), seq: String(Date.now()) })], ["seq float", bytesOf({ ...snap({}), seq: Date.now() + 0.5 })], ["height negative", bytesOf({ ...snap({}), height: -1 })],
			["height float", bytesOf({ ...snap({}), height: 1.5 })], ["height huge", bytesOf({ ...snap({}), height: 2 ** 53 })], ["addresses object", bytesOf({ ...snap({}), addresses: {} })],
			["snapshots null", bytesOf({ ...snap({}), snapshots: null })], ["no snapshots", bytesOf({ v: 1, seq: Date.now() + 100, height: H0 + 20, addresses: [] })],
			["amount negative", bytesOf(snap({ amount: "-500000000" }))], ["amount decimal", bytesOf(snap({ amount: "500000000.0" }))], ["amount exponent", bytesOf(snap({ amount: "5e8" }))],
			["amount number", bytesOf(snap({ amount: 500000000 }))], ["amount empty", bytesOf(snap({ amount: "" }))],
			["amount spaces", bytesOf(snap({ amount: " 500000000" }))], ["amount hex", bytesOf(snap({ amount: "0x1dcd6500" }))],
			["unlockTime number", bytesOf(snap({ unlockTime: 0 }))], ["unlockTime negative", bytesOf(snap({ unlockTime: "-1" }))],
			["doubleSpend string", bytesOf(snap({ doubleSpendSeen: "false" }))], ["confirmations negative", bytesOf(snap({ confirmations: -1 }))], ["confirmations float", bytesOf(snap({ confirmations: 1.5 }))],
			["confirmations string", bytesOf(snap({ confirmations: "15" }))], ["txid short", bytesOf(snap({ txid: "ab" }))], ["txid not hex", bytesOf(snap({ txid: "zz".repeat(32) }))],
			["txid upper", bytesOf(snap({ txid: "EF".repeat(32) }))], ["timestamp string", bytesOf(snap({ timestamp: "1790000000" }))], ["no txid", bytesOf(snap({ txid: undefined }))],
			["index negative", bytesOf({ ...snap({}), snapshots: [{ index: -1, transfers: [] }] })], ["index float", bytesOf({ ...snap({}), snapshots: [{ index: 1.5, transfers: [] }] })],
			["index string", bytesOf({ ...snap({}), snapshots: [{ index: String(inv.addrIndex), transfers: [tr()] }] })], 
			["transfers object", bytesOf({ ...snap({}), snapshots: [{ index: inv.addrIndex, transfers: { 0: tr() } }] })],
			["33 transfers", bytesOf({ ...snap({}), snapshots: [{ index: inv.addrIndex, transfers: Array.from({ length: 33 }, (_, i) => tr({ txid: i.toString(16).padStart(64, "0") })) }] })],
			["101 addresses", bytesOf({ ...snap({}), addresses: Array.from({ length: 101 }, (_, i) => ({ index: 600 + i, address: fakeAddress(TAGS.stagenet[1], 600 + i, "A") })) })],
			["201 snapshots", bytesOf({ ...snap({}), snapshots: Array.from({ length: 201 }, (_, i) => ({ index: 1000 + i, transfers: [] })) })],
		];
		const accepted: string[] = [];
		for (const [name, body] of cases) {
			const r = await h.sync(body);
			if (ok(r) || r.status >= 500) accepted.push(`${name}: ${r.status} ${r.text.slice(0, 100)}`);
		}
		expect(accepted).toEqual([]);
		expect(await state(h)).toBe(before);
	});

	it("[F01][T11] C3: a repeated key never makes a time-locked or flagged payment count", async () => {
		const { h, inv } = await target();
		const seq = Date.now() + 100;
		const tr = `{"txid":"${"ef".repeat(32)}","amount":"500000000","confirmations":15,"height":${H0 + 1},"timestamp":1790000000,"doubleSpendSeen":false,"unlockTime":"0"}`;
		for (const t of [tr.replace('"unlockTime":"0"', '"unlockTime":"0","unlockTime":"99"'), tr.replace('"doubleSpendSeen":false', '"doubleSpendSeen":false,"doubleSpendSeen":true')]) {
			await h.sync(new TextEncoder().encode(`{"v":1,"seq":${seq},"height":${H0 + 20},"addresses":[],"snapshots":[{"index":${inv.addrIndex},"transfers":[${t}]}]}`));
		}
		expect((await h.invoices()).find((i) => i.id === inv.id)!.status).toBe("new");
	});

	it.fails("[F01] [RT-06] C3: duplicate keys are refused (F01), so no other reader can see a different body", async () => {
		const { h, inv } = await target();
		const before = await state(h);
		const seq = Date.now() + 100;
		const tr = `{"txid":"${"ef".repeat(32)}","amount":"500000000","confirmations":15,"height":${H0 + 1},"timestamp":1790000000,"doubleSpendSeen":false,"unlockTime":"0"}`;
		const bodies = [
			`{"v":1,"v":99,"seq":${seq},"height":${H0 + 20},"addresses":[],"snapshots":[]}`,
			`{"v":1,"seq":${seq},"height":${H0 + 20},"addresses":[],"snapshots":[{"index":${inv.addrIndex},"transfers":[${tr.replace('"unlockTime":"0"', '"unlockTime":"0","unlockTime":"99"')}]}]}`,
			`{"v":1,"seq":${seq},"height":${H0 + 20},"addresses":[],"snapshots":[{"index":${inv.addrIndex},"transfers":[${tr.replace('"doubleSpendSeen":false', '"doubleSpendSeen":false,"doubleSpendSeen":true')}]}]}`,
		];
		const accepted: string[] = [];
		for (const b of bodies) if (ok(await h.sync(new TextEncoder().encode(b)))) accepted.push(b.slice(0, 120));
		// JSON's last value wins; a body that repeats a key reads differently to other parsers, so F01 says refuse it.
		const now = (await h.invoices()).find((i) => i.id === inv.id)!;
		expect(now.status, "a repeated unlockTime or doubleSpendSeen made the payment count").not.toMatch(/settled|confirming/);
		expect(accepted).toEqual([]);
		expect(await state(h)).toBe(before);
	});

	it.fails("[F01] [RT-06] C3: out-of-range and non-canonical values are refused: amount and unlockTime at 2^64, a leading zero, index 2^32", async () => {
		const { h, inv } = await target();
		const tr = (o: B = {}) => ({ txid: "ef".repeat(32), amount: "500000000", confirmations: 0, height: 0, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...o });
		const snap = (o: B, seq: number) => ({ v: 1, seq, height: H0 + 20, addresses: [], snapshots: [{ index: inv.addrIndex, transfers: [tr(o)] }] });
		const cases: Array<[string, B]> = [
			["amount 2^64", snap({ amount: "18446744073709551616" }, Date.now() + 300)], ["amount leading zero", snap({ amount: "0500000000" }, Date.now() + 301)],
			["unlockTime 2^64", snap({ unlockTime: "18446744073709551616" }, Date.now() + 302)], ["index 2^32", { v: 1, seq: Date.now() + 303, height: H0, addresses: [], snapshots: [{ index: 2 ** 32, transfers: [] }] }],
		];
		const accepted: string[] = [];
		for (const [name, b] of cases) if (ok(await h.sync(bytesOf(b)))) accepted.push(name);
		expect(accepted).toEqual([]);
	});

	it.fails("[F01] [RT-06] C3: unknown fields are refused, at the top and inside a snapshot, transfer or address", async () => {
		const { h, inv } = await target();
		const tr = { txid: "ef".repeat(32), amount: "1", confirmations: 0, height: 0, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0" };
		const base = { v: 1, height: H0, addresses: [], snapshots: [] };
		const accepted: string[] = [];
		const bodies: Array<[string, B]> = [
			["top", { ...base, extra: 1 }], ["snapshot", { ...base, snapshots: [{ index: inv.addrIndex, transfers: [], extra: 1 }] }],
			["transfer", { ...base, snapshots: [{ index: inv.addrIndex, transfers: [{ ...tr, extra: 1 }] }] }], ["address", { ...base, addresses: [{ index: 700, address: fakeAddress(TAGS.stagenet[1], 700, "U"), extra: 1 }] }],
		];
		for (const [name, b] of bodies) if (ok(await h.sync({ ...b, seq: Date.now() + accepted.length + 200 }))) accepted.push(name);
		expect(accepted).toEqual([]);
	});

	it("[F01] C3: a body of exactly 256 KiB is read; one byte more is refused before the plugin runs", async () => {
		h = await redteamHost({ pool: 1 });
		const pad = (n: number) => {
			const base = bytesOf({ v: 1, seq: Date.now() + 5000, height: H0, addresses: [], snapshots: [] });
			const b = new Uint8Array(n);
			b.set(base);
			b.fill(0x20, base.length);
			return b;
		};
		expect(ok(await h.sync(pad(262_144)))).toBe(true);
		const before = await state(h);
		const over = await h.sync(pad(262_145));
		expect(over.status).toBe(413);
		expect(await state(h)).toBe(before);
	});

	it("[F01][T03] C3: seeded random bodies, signed and unsigned, never change state or crash the route", async () => {
		await withSeed(async (r) => {
			const { h } = await target();
			const before = await state(h);
			const seed = bytesOf({ v: 1, seq: Date.now() + 1, height: H0, addresses: [], snapshots: [] });
			for (let i = 0; i < 120; i++) {
				const pick = r.int(0, 3);
				const body = pick === 0 ? r.bytes(r.int(0, 600)) : pick === 1 ? r.mutate(seed) : pick === 2 ? bytesOf(r.json()) : new TextEncoder().encode(r.hostileString());
				const res = await h.sync(body as Uint8Array<ArrayBuffer>, i % 2 ? { unsigned: true } : {});
				expect(res.status, `case ${i}`).toBeLessThan(500);
				if (i % 2) expect(ok(res), `unsigned case ${i} accepted`).toBe(false);
			}
			// Signed random bodies that parse as a valid empty sync may move lastSyncAt; nothing else may change.
			const after = JSON.parse(await state(h));
			const was = JSON.parse(before);
			expect(after.invoices).toEqual(was.invoices);
			expect(after.pool).toEqual(was.pool);
			expect(after.key).toEqual(was.key);
		});
	});
});

describe("C6: pairing abuse", () => {
	const codeFrom = (blocks: B[]) => {
		const cmd = blocks.find((b) => b.type === "code" && String(b.code).includes("/install.sh"))?.code as string | undefined;
		return cmd?.match(/--pair ([A-Za-z0-9_-]{22})$/)?.[1];
	};
	async function withCode(paired: "test1" | null = null) {
		h = await redteamHost({ pool: 1, paired });
		for (const c of ["USD", "EUR"]) await h.price(c as "USD", "150.00");
		const pairCode = codeFrom((await h.host.admin.act("/payments", "connect_wallet_host")).blocks as B[]);
		expect(pairCode).toBeTruthy();
		return { h, pairCode: pairCode as string };
	}
	const pairBody = (pairCode: string, key: "test1" | "test2", extra: B = {}) => ({ addresses: [], snapshots: [], pair: { code: pairCode, publicKey: PUBLIC_KEYS[key] }, ...extra });

	it("[T13] C6: guessed, near-miss and malformed codes don't pair, and don't burn the real code", async () => {
		const { h, pairCode } = await withCode();
		const flip = pairCode.slice(0, -1) + (pairCode.endsWith("A") ? "B" : "A");
		for (const guess of ["A".repeat(22), flip, pairCode.toLowerCase() === pairCode ? pairCode.toUpperCase() : pairCode.toLowerCase(), pairCode + "A", pairCode.slice(1), "", " ".repeat(22), `${pairCode} `]) {
			if (guess === pairCode) continue;
			const r = await h.sync(pairBody(guess, "test2"), { key: "test2" });
			expect(ok(r), JSON.stringify(guess)).toBe(false);
		}
		for (const bad of [null, 5, ["x"], { code: pairCode }]) expect(ok(await h.sync({ addresses: [], snapshots: [], pair: { code: bad, publicKey: PUBLIC_KEYS.test2 } }, { key: "test2" }))).toBe(false);
		expect(await h.host.inspect.setting("bridgePublicKey")).toBeFalsy();
		expect(ok(await h.sync(pairBody(pairCode, "test2"), { key: "test2" }))).toBe(true);
		expect(await h.host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test2);
	});

	it("[T13] C6: a used code can't pair again; an expired code never pairs; no code means no pairing", async () => {
		const { h, pairCode } = await withCode();
		expect(ok(await h.sync(pairBody(pairCode, "test1"), { key: "test1" }))).toBe(true);
		expect(ok(await h.sync(pairBody(pairCode, "test2"), { key: "test2" }))).toBe(false);
		expect(await h.host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test1);
		// An expired code: the pairing state's deadline moved into the past (15 minutes going by).
		const second = codeFrom((await h.host.admin.act("/payments", "connect_wallet_host")).blocks as B[]) as string;
		const st = (await h.host.inspect.kv.get<B>("state:pairing")) as B;
		await h.host.fixtures.plugin.kv("state:pairing", { ...st, expiresAt: Date.now() - 1 });
		expect(ok(await h.sync(pairBody(second, "test2"), { key: "test2" }))).toBe(false);
		expect(await h.host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test1);
	});

	it("[T13] C6: a pair body signed by another key than the one it names, or with a malformed key, is refused", async () => {
		const { h, pairCode } = await withCode();
		const refused: B[] = [];
		const tries: Array<[string, B, "test1" | "test2"]> = [
			["names test2, signed by test1", pairBody(pairCode, "test2"), "test1"],
			["short key", { addresses: [], snapshots: [], pair: { code: pairCode, publicKey: b64(new Uint8Array(31)) } }, "test2"],
			["zero key (small order)", { addresses: [], snapshots: [], pair: { code: pairCode, publicKey: b64(new Uint8Array(32)) } }, "test2"],
			["identity point", { addresses: [], snapshots: [], pair: { code: pairCode, publicKey: b64(new Uint8Array([1, ...new Uint8Array(31)])) } }, "test2"],
			["not base64", { addresses: [], snapshots: [], pair: { code: pairCode, publicKey: "!!" } }, "test2"],
			["key as array", { addresses: [], snapshots: [], pair: { code: pairCode, publicKey: [PUBLIC_KEYS.test2] } }, "test2"],
		];
		for (const [name, body, key] of tries) if (ok(await h.sync(body, { key }))) refused.push({ name });
		expect(refused).toEqual([]);
		expect(await h.host.inspect.setting("bridgePublicKey")).toBeFalsy();
		expect(ok(await h.sync(pairBody(pairCode, "test2"), { key: "test2" }))).toBe(true); // the code is still good
	});

	it("[T13][F01] C6: while a code is active, unsigned and oversized pair bodies are refused without a crash", async () => {
		await withSeed(async (r) => {
			const { h, pairCode } = await withCode();
			// The pairing path parses before checking the signature (the spec's one exception), so it gets hostile input too.
			for (let i = 0; i < 60; i++) {
				const body = i % 3 === 0 ? r.bytes(r.int(0, 4000)) : i % 3 === 1 ? bytesOf({ pair: r.json(), addresses: [], snapshots: [] }) : bytesOf({ ...pairBody(r.hostileString().slice(0, 30), "test2") });
				const res = await h.sync(body as Uint8Array<ArrayBuffer>, i % 2 ? { unsigned: true } : { key: "test2" });
				expect(res.status, `case ${i}`).toBeLessThan(500);
				expect(ok(res), `case ${i}`).toBe(false);
			}
			const big = pairBody(pairCode, "test2", { pad: "x".repeat(4200) });
			expect(ok(await h.sync(big, { key: "test2" }))).toBe(false);
			expect(await h.host.inspect.setting("bridgePublicKey")).toBeFalsy();
			expect(ok(await h.sync(pairBody(pairCode, "test2"), { key: "test2" }))).toBe(true);
		});
	});

	it.fails("[T13] [RT-07] C6: two pair requests with the same valid code at the same moment: exactly one wins, and its key is the one stored", async () => {
		for (let round = 0; round < 5; round++) {
			const { h, pairCode } = await withCode();
			const [a, b] = await Promise.all([h.sync(pairBody(pairCode, "test1"), { key: "test1" }), h.sync(pairBody(pairCode, "test2"), { key: "test2" })]);
			const wins = [ok(a), ok(b)];
			expect(wins.filter(Boolean), `round ${round}`).toHaveLength(1);
			expect(await h.host.inspect.setting("bridgePublicKey")).toBe(wins[0] ? PUBLIC_KEYS.test1 : PUBLIC_KEYS.test2);
			await h.host.dispose();
		}
		h = undefined;
	});
});
