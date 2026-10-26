// Phase 07b: seeded random input for the adversarial tests (no fuzz library; the dependency tiers). Every generator draws
// from one seeded sfc32 stream, so a failing case reproduces with REDTEAM_SEED=<seed> pnpm exec vitest run <file>.
// withSeed() puts the seed at the front of any failure message.

/** The seed: REDTEAM_SEED if set, otherwise a fresh one. */
export function seedFrom(text = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.REDTEAM_SEED): number {
	if (text !== undefined && text !== "") {
		const n = Number(text);
		if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`REDTEAM_SEED must be an integer from 0 to 4294967295, not ${text}`);
		return n;
	}
	return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Runs fn with a generator for `seed`; a failure's message starts with "[seed <n>]". */
export async function withSeed<T>(fn: (r: Rng) => T | Promise<T>, seed = seedFrom()): Promise<T> {
	try {
		return await fn(rng(seed));
	} catch (err) {
		if (err instanceof Error) err.message = `[seed ${seed}] ${err.message}`;
		throw err;
	}
}

export interface Rng {
	readonly seed: number;
	/** A uint32. */
	u32(): number;
	/** An integer from lo to hi, both included. */
	int(lo: number, hi: number): number;
	bool(): boolean;
	pick<T>(xs: readonly T[]): T;
	bytes(n: number): Uint8Array;
	/** A number-like edge case: 0, -1, 2^53 and beyond, 2^64-1, 2^64, fractions, exponents, NaN as text. */
	edgeNumber(): string;
	/** A short string built from hostile pieces: bidi, zero-width, BOM, lone surrogates, NUL, controls, HTML, script. */
	hostileString(maxPieces?: number): string;
	/** A JSON value of bounded depth. */
	json(depth?: number): unknown;
	/** The bytes with one random change: a bit flip, a cut, an inserted byte or a repeated slice. */
	mutate(bytes: Uint8Array): Uint8Array;
}

/** sfc32, seeded through splitmix32 so nearby seeds give unrelated streams. */
export function rng(seed: number): Rng {
	let s = seed >>> 0;
	const split = () => {
		s = (s + 0x9e3779b9) >>> 0;
		let z = s;
		z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
		z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
		return (z ^ (z >>> 16)) >>> 0;
	};
	let a = split(), b = split(), c = split(), d = split();
	const u32 = () => {
		const t = (((a + b) >>> 0) + d) >>> 0;
		d = (d + 1) >>> 0;
		a = b ^ (b >>> 9);
		b = (c + (c << 3)) >>> 0;
		c = ((c << 21) | (c >>> 11)) >>> 0;
		c = (c + t) >>> 0;
		return t;
	};
	for (let i = 0; i < 12; i++) u32();

	const int = (lo: number, hi: number) => lo + Math.floor((u32() / 0x1_0000_0000) * (hi - lo + 1));
	const pick = <T>(xs: readonly T[]) => xs[int(0, xs.length - 1)];
	const bytes = (n: number) => Uint8Array.from({ length: n }, () => u32() & 0xff);
	const edgeNumber = () => pick(EDGE_NUMBERS);
	const hostileString = (maxPieces = 6) => Array.from({ length: int(1, maxPieces) }, () => (u32() % 3 === 0 ? String.fromCharCode(int(0x20, 0x7e)) : pick(HOSTILE_PIECES))).join("");
	const json = (depth = 3): unknown => {
		const kind = int(0, depth > 0 ? 7 : 4);
		switch (kind) {
			case 0: return null;
			case 1: return u32() % 2 === 0;
			case 2: return Number(pick(["0", "-1", "1e308", "9007199254740993", "0.5", "-0"]));
			case 3: return edgeNumber();
			case 4: return hostileString();
			case 5: return Array.from({ length: int(0, 4) }, () => json(depth - 1));
			default: return Object.fromEntries(Array.from({ length: int(0, 4) }, () => [pick(KEYS), json(depth - 1)]));
		}
	};
	const mutate = (input: Uint8Array) => {
		const out = Array.from(input);
		const at = out.length === 0 ? 0 : int(0, out.length - 1);
		switch (int(0, 3)) {
			case 0: if (out.length > 0) out[at] ^= 1 << int(0, 7); break;
			case 1: out.length = at; break;
			case 2: out.splice(at, 0, u32() & 0xff); break;
			default: { const end = Math.min(out.length, at + int(1, 16)); out.splice(end, 0, ...out.slice(at, end)); }
		}
		return Uint8Array.from(out);
	};
	return { seed, u32, int, bool: () => (u32() & 1) === 1, pick, bytes, edgeNumber, hostileString, json, mutate };
}

const EDGE_NUMBERS = [
	"0", "-0", "-1", "1", "00", "01", "0x10", "1e3", "1E-3", "1.0", "0.000000000001", ".5", "5.", "+1",
	"9007199254740991", "9007199254740992", "9007199254740993",
	"18446744073709551615", "18446744073709551616", "-18446744073709551615", "340282366920938463463374607431768211456",
	"NaN", "Infinity", "-Infinity", "", " 1", "1 ", "١٢٣", "１２３",
];

const HOSTILE_PIECES = [
	"‮", "‭", "⁦", "⁩", // bidi overrides and isolates
	"​", "‌", "‍", "⁠", "﻿", // zero-width and the BOM
	"\ud800", "\udfff", // lone surrogates
	"\u0000", "\u0007", "\u001b[31m", "\r\n", "\u0085", " ",
	"<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "\"'><", "javascript:alert(1)", "&lt;&#x3c;",
	"{{7*7}}", "${7*7}", "%00", "%2e%2e%2f", "\\u0000", "../", "😀", "é", "ﷺ",
];

const KEYS = ["kind", "amount", "fiatMinor", "currency", "xmr", "entry", "note", "token", "__proto__", "constructor", "v", "seq", "height", "addresses", "snapshots", "pair", "index", "transfers", ""];

/** A string of `length` characters, for size limits (1 MB and the like). */
export const longString = (length: number, unit = "a") => unit.repeat(Math.ceil(length / unit.length)).slice(0, length);
