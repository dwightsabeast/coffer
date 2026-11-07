import { describe, expect, it } from "vitest";

import { MAX_ADDRESSES, MAX_POOL_BAD, MAX_SNAPSHOTS, MAX_TRANSFERS, MAX_WALLET_INDEX, acceptsVersion, checkHeaders, decodeStrict, parseSyncBody, seqInRange } from "../../src/sync/protocol";
import { TAGS, fakeAddress, fakeSubaddress } from "../addresses";

const NOW = 1_790_000_000_000;
const SIG = "A".repeat(86) + "==";
const transfer = (over: Record<string, unknown> = {}) => ({
	txid: "ab".repeat(32), amount: "1000", confirmations: 0, height: 0, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...over,
});
const body = (over: Record<string, unknown> = {}) => JSON.stringify({ v: 1, seq: NOW, height: 3_000_000, addresses: [], snapshots: [], ...over });
const code = (r: ReturnType<typeof parseSyncBody>) => (r.ok ? "ok" : r.code);

describe("headers and freshness", () => {
	it("[T04] accepts both headers within 300 seconds either way", () => {
		expect(checkHeaders({ "x-xmr-ts": String(NOW / 1000 - 300), "x-xmr-sig": SIG }, NOW).ok).toBe(true);
		expect(checkHeaders({ "x-xmr-ts": String(NOW / 1000 + 300), "x-xmr-sig": SIG }, NOW).ok).toBe(true);
	});
	it("[T04] rejects stale and future timestamps", () => {
		expect(checkHeaders({ "x-xmr-ts": String(NOW / 1000 - 301), "x-xmr-sig": SIG }, NOW)).toEqual({ ok: false, code: "STALE_TIMESTAMP" });
		expect(checkHeaders({ "x-xmr-ts": String(NOW / 1000 + 301), "x-xmr-sig": SIG }, NOW)).toEqual({ ok: false, code: "STALE_TIMESTAMP" });
	});
	it("[T03][F01] rejects missing or malformed headers", () => {
		for (const h of [{}, { "x-xmr-ts": String(NOW / 1000) }, { "x-xmr-sig": SIG }, { "x-xmr-ts": "17e8", "x-xmr-sig": SIG },
			{ "x-xmr-ts": String(NOW / 1000), "x-xmr-sig": "A".repeat(43) + "=" }, { "x-xmr-ts": String(NOW / 1000), "x-xmr-sig": SIG.replace("==", "") }]) {
			expect(checkHeaders(h as Record<string, string>, NOW)).toEqual({ ok: false, code: "MISSING_SIGNATURE" });
		}
	});
});

describe("strict decoding", () => {
	it("[F01] refuses a leading BOM and invalid UTF-8, keeps everything else byte for byte", () => {
		expect(decodeStrict(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBeNull();
		expect(decodeStrict(new Uint8Array([0x7b, 0xff, 0x7d]))).toBeNull();
		expect(decodeStrict(new TextEncoder().encode("{\"a\":\"café\"}\r\n"))).toBe("{\"a\":\"café\"}\r\n");
	});
});

describe("body validation", () => {
	it("accepts a well-formed body and ignores unknown fields", () => {
		expect(code(parseSyncBody(body({ note: "hi", snapshots: [{ index: 3, transfers: [transfer()] }] })))).toBe("ok");
	});
	it("protocol version: the current and the previous one, the previous flagged as outdated", () => {
		expect(acceptsVersion(1, 1)).toBe(true);
		expect(acceptsVersion(0, 1)).toBe(false);
		expect(acceptsVersion(2, 1)).toBe(false);
		// With a version 2 out, version 1 bridges still work and are flagged.
		const v1 = parseSyncBody(body({ v: 1 }), 2);
		expect(v1.ok && v1.value.outdated).toBe(true);
		expect(code(parseSyncBody(body({ v: 2 }), 2))).toBe("ok");
		expect(code(parseSyncBody(body({ v: 0 }), 2))).toBe("UNSUPPORTED_VERSION");
		expect(code(parseSyncBody(body({ v: 2 })))).toBe("UNSUPPORTED_VERSION");
	});
	it("[F01] rejects malformed bodies", () => {
		for (const bad of ["not json", "[]", body({ v: "1" }), body({ seq: 0 }), body({ seq: 1.5 }), body({ height: -1 }), body({ addresses: {} }), body({ snapshots: null })]) {
			expect(code(parseSyncBody(bad))).toBe("INVALID_BODY");
		}
	});
	it("[F01] enforces the caps", () => {
		const addr = (i: number) => ({ index: i + 1, address: fakeSubaddress(i + 1) });
		expect(code(parseSyncBody(body({ addresses: Array.from({ length: MAX_ADDRESSES }, (_, i) => addr(i)) })))).toBe("ok");
		expect(code(parseSyncBody(body({ addresses: Array.from({ length: MAX_ADDRESSES + 1 }, (_, i) => addr(i)) })))).toBe("INVALID_BODY");
		expect(code(parseSyncBody(body({ snapshots: Array.from({ length: MAX_SNAPSHOTS + 1 }, (_, i) => ({ index: i + 1, transfers: [] })) })))).toBe("INVALID_BODY");
		const many = (n: number) => Array.from({ length: n }, (_, i) => transfer({ txid: i.toString(16).padStart(64, "0") }));
		expect(code(parseSyncBody(body({ snapshots: [{ index: 1, transfers: many(MAX_TRANSFERS) }] })))).toBe("ok");
		expect(code(parseSyncBody(body({ snapshots: [{ index: 1, transfers: many(MAX_TRANSFERS + 1) }] })))).toBe("INVALID_BODY");
	});
	it("[F01] a malformed transfer rejects the whole body", () => {
		for (const t of [transfer({ amount: 1000 }), transfer({ amount: "1e3" }), transfer({ unlockTime: 0 }), transfer({ txid: "AB".repeat(32) }),
			transfer({ height: -1 }), transfer({ confirmations: 1.5 }), transfer({ doubleSpendSeen: "no" }), transfer({ amount: "1".repeat(21) })]) {
			expect(code(parseSyncBody(body({ snapshots: [{ index: 1, transfers: [t] }] })))).toBe("INVALID_BODY");
		}
		expect(code(parseSyncBody(body({ snapshots: [{ index: 1, transfers: [transfer(), transfer()] }] })))).toBe("INVALID_BODY"); // duplicate txid
		expect(code(parseSyncBody(body({ snapshots: [{ index: 1, transfers: [] }, { index: 1, transfers: [] }] })))).toBe("INVALID_BODY"); // duplicate index
	});
	it("[T11][F01] amounts and unlock times up to 20 digits stay strings (no 2^53 limit)", () => {
		const r = parseSyncBody(body({ snapshots: [{ index: 1, transfers: [transfer({ amount: "18446744073709551615", unlockTime: "18446744073709551615" })] }] }));
		expect(r.ok && r.value.snapshots[0].transfers[0]).toMatchObject({ amount: "18446744073709551615", unlockTime: "18446744073709551615" });
	});
	it("[F01] skips malformed pool addresses instead of rejecting the body", () => {
		const r = parseSyncBody(body({ addresses: [{ index: 1.5, address: fakeSubaddress(1) }, { index: 2, address: "short" }, { index: 3, address: "0".repeat(95) }, { index: 4, address: fakeSubaddress(4) }] }));
		expect(r.ok && r.value.addresses).toEqual([{ index: 4, address: fakeSubaddress(4) }]);
	});
	it("[T20] skips a pool address whose network can't be read (spec change 36): an unknown byte, or a standard address", () => {
		const kept = [{ index: 5, address: fakeSubaddress(5) }, { index: 6, address: fakeAddress(TAGS.mainnet[1], 6) }];
		const r = parseSyncBody(body({ addresses: [{ index: 2, address: fakeAddress(38, 2) }, { index: 3, address: fakeAddress(TAGS.stagenet[0], 3) }, ...kept] }));
		expect(r.ok && r.value.addresses).toEqual(kept);
	});
	it("[F01] reads the bridge's checks: known states kept, long details cut, anything malformed dropped without rejecting the body", () => {
		const checks = (c: unknown) => {
			const r = parseSyncBody(body({ checks: c }));
			expect(r.ok).toBe(true);
			return r.ok ? r.value.checks : "rejected";
		};
		expect(parseSyncBody(body()).ok && (parseSyncBody(body()) as { value: { checks?: unknown } }).value.checks).toBeUndefined();
		expect(checks({ node: { state: "mismatch", detail: "block 5 differs" }, wallet: { state: "behind", detail: "wallet at 1, node at 9" } }))
			.toEqual({ node: { state: "mismatch", detail: "block 5 differs" }, wallet: { state: "behind", detail: "wallet at 1, node at 9" } });
		for (const state of ["off", "ok", "unavailable", "mismatch"]) expect(checks({ node: { state } })).toEqual({ node: { state } });
		for (const state of ["ok", "behind", "unavailable", "syncing", "starting"]) expect(checks({ wallet: { state } })).toEqual({ wallet: { state } });
		expect(checks({ node: { state: "weird" }, wallet: { state: "mismatch" } })).toBeUndefined();
		expect(checks({ node: { state: "ok", detail: 7 } })).toEqual({ node: { state: "ok" } });
		expect(checks({ wallet: { state: "ok", detail: "x".repeat(400) } })).toEqual({ wallet: { state: "ok", detail: "x".repeat(300) } });
		for (const bad of ["nope", null, [], { node: "ok" }, { wallet: null }]) expect(checks(bad)).toBeUndefined();
	});
	it("[F01] validates the pair field", () => {
		expect(code(parseSyncBody(body({ pair: { code: "A".repeat(22), publicKey: "A".repeat(43) + "=" } })))).toBe("ok");
		expect(code(parseSyncBody(body({ pair: { code: "short", publicKey: "A".repeat(43) + "=" } })))).toBe("INVALID_BODY");
		expect(code(parseSyncBody(body({ pair: { code: "A".repeat(22), publicKey: "not base64" } })))).toBe("INVALID_BODY");
	});
});

describe("spec change 46: the wallet's index range, the seq bound, and the new request fields", () => {
	it("[T03][P02] an address or snapshot index outside 1..2^32-1 rejects the body, so a stolen key can't write into another wallet's range", () => {
		expect(MAX_WALLET_INDEX).toBe(2 ** 32 - 1);
		const addr = (index: number) => body({ addresses: [{ index, address: fakeSubaddress(7) }] });
		const snap = (index: number) => body({ snapshots: [{ index, transfers: [] }] });
		expect(code(parseSyncBody(addr(MAX_WALLET_INDEX)))).toBe("ok");
		expect(code(parseSyncBody(snap(MAX_WALLET_INDEX)))).toBe("ok");
		for (const index of [0, -1, 2 ** 32, 2 ** 32 + 5, 2 ** 40]) {
			expect(code(parseSyncBody(addr(index)))).toBe("INVALID_BODY");
			expect(code(parseSyncBody(snap(index)))).toBe("INVALID_BODY");
		}
	});
	it("[T04] seq must be within 300 s of the signed timestamp, either way (RT-24)", () => {
		const ts = String(NOW / 1000);
		expect(seqInRange(NOW, ts)).toBe(true);
		expect(seqInRange(NOW + 300_000, ts)).toBe(true);
		expect(seqInRange(NOW - 300_000, ts)).toBe(true);
		expect(seqInRange(NOW + 300_001, ts)).toBe(false);
		expect(seqInRange(NOW - 300_001, ts)).toBe(false);
		expect(seqInRange(9e15, ts)).toBe(false);
	});
	it("[T03][R08] reads checks.pool: ok, or a mismatch with at most 20 valid indexes; anything malformed dropped", () => {
		const pool = (p: unknown) => {
			const r = parseSyncBody(body({ checks: { pool: p } }));
			expect(r.ok).toBe(true);
			return r.ok ? r.value.checks?.pool : "rejected";
		};
		expect(pool({ state: "ok" })).toEqual({ state: "ok", bad: [] });
		expect(pool({ state: "mismatch", bad: [3, 9] })).toEqual({ state: "mismatch", bad: [3, 9] });
		expect(pool({ state: "mismatch", bad: [0, 2 ** 32, 1.5, "4", 4] })).toEqual({ state: "mismatch", bad: [4] });
		expect(MAX_POOL_BAD).toBe(20);
		expect(pool({ state: "mismatch", bad: Array.from({ length: 30 }, (_, i) => i + 1) })).toEqual({ state: "mismatch", bad: Array.from({ length: 20 }, (_, i) => i + 1) });
		expect(pool({ state: "mismatch" })).toEqual({ state: "mismatch", bad: [] });
		for (const bad of [{ state: "weird" }, "ok", null, { state: "mismatch", bad: "1" }]) expect(pool(bad)).toBeUndefined();
	});
	it("[T03][P02] reads the wallet answer: a match or null, and the highest received index; malformed dropped", () => {
		const wallet = (w: unknown) => {
			const r = parseSyncBody(body({ wallet: w }));
			expect(r.ok).toBe(true);
			return r.ok ? r.value.wallet : "rejected";
		};
		expect(wallet({ match: 0, receivedTop: 405 })).toEqual({ match: 0, receivedTop: 405 });
		expect(wallet({ match: null, receivedTop: 0 })).toEqual({ match: null, receivedTop: 0 });
		expect(wallet({ match: 3, receivedTop: MAX_WALLET_INDEX })).toEqual({ match: 3, receivedTop: MAX_WALLET_INDEX });
		for (const bad of [{ match: -1, receivedTop: 0 }, { match: 1.5, receivedTop: 0 }, { match: 0 }, { match: 0, receivedTop: 2 ** 32 }, { receivedTop: 1 }, "x", null]) {
			expect(wallet(bad)).toBeUndefined();
		}
	});
	it("[T03][P02] reads probeDigest: a 24-character base64 digest; anything else dropped", () => {
		const d = (v: unknown) => {
			const r = parseSyncBody(body({ probeDigest: v }));
			expect(r.ok).toBe(true);
			return r.ok ? r.value.probeDigest : "rejected";
		};
		expect(d("qYtoTZjlFXXSf7Ul9MFxxg==")).toBe("qYtoTZjlFXXSf7Ul9MFxxg==");
		for (const bad of ["qYtoTZjlFXXSf7Ul9MFxxg=", "A".repeat(24), "qYtoTZjlFXXSf7Ul9MFxx-==", 7, null]) expect(d(bad)).toBeUndefined();
	});
});
