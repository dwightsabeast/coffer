// Spec change 46, item 2: refused syncs from the wallet host are shown, not silent. A request whose signature verifies
// with the current key but is refused afterwards is recorded with its code; after a re-pair, a request signed by the
// previous key is recorded as "the previous wallet host is still running". Both writes are at most once a minute.
import { describe, expect, it } from "vitest";

import { PREVIOUS_GRACE_MS, REFUSAL_WRITE_MS, handleSync } from "../../src/sync/handle";
import { newPairingCode } from "../../src/sync/pairing";
import { type KeyName, MemoryStore, PUBLIC_KEYS, bytesOf, signedHeaders } from "./helpers";

const T0 = 1_790_000_000_000;
const H0 = 3_000_000;
const body = (over: Record<string, unknown> = {}) => ({ v: 1, seq: T0, height: H0, addresses: [], snapshots: [], ...over });
/** signedAt: when the bridge signed it, if earlier than its arrival (now). */
async function send(store: MemoryStore, b: unknown, opts: { now?: number; signedAt?: number; key?: KeyName; raw?: Uint8Array } = {}) {
	const now = opts.now ?? T0;
	const bytes = opts.raw ?? bytesOf(b);
	return handleSync({ body: bytes, headers: await signedHeaders(bytes, opts.signedAt ?? now, opts.key ?? "test1"), now }, store);
}
const code = (out: Awaited<ReturnType<typeof send>>) => ("error" in out.response ? out.response.error.code : "ok");
const at = (s: number) => T0 + s * 1000;
function paired(key: KeyName = "test1") {
	const store = new MemoryStore();
	store.publicKey = PUBLIC_KEYS[key];
	return store;
}

describe("refused syncs from the current key (spec change 46, item 2)", () => {
	it("[T03][R08] each refusal after a good signature is recorded with its code", async () => {
		for (const [want, make] of [
			["INVALID_ENCODING", (s: MemoryStore) => send(s, null, { raw: new Uint8Array([0xef, 0xbb, 0xbf, ...bytesOf(body())]) })],
			["INVALID_BODY", (s: MemoryStore) => send(s, body({ addresses: {} }))],
			["UNSUPPORTED_VERSION", (s: MemoryStore) => send(s, body({ v: 2 }))],
			["SEQ_OUT_OF_RANGE", (s: MemoryStore) => send(s, body({ seq: T0 + 3_600_000 }))],
		] as const) {
			const store = paired();
			expect(code(await make(store))).toBe(want);
			expect(store.refused).toEqual({ code: want, since: T0, at: T0 });
		}
	});

	it("[T03][R08] written at most once a minute; a new code starts again; a good sync clears it", async () => {
		expect(REFUSAL_WRITE_MS).toBe(60_000);
		const store = paired();
		await send(store, body({ v: 2 }), { now: at(0) });
		await send(store, body({ v: 2, seq: at(10) }), { now: at(10) });
		expect(store.refused).toEqual({ code: "UNSUPPORTED_VERSION", since: at(0), at: at(0) });
		await send(store, body({ v: 2, seq: at(61) }), { now: at(61) });
		expect(store.refused).toEqual({ code: "UNSUPPORTED_VERSION", since: at(0), at: at(61) });
		await send(store, body({ addresses: {}, seq: at(62) }), { now: at(62) });
		expect(store.refused).toEqual({ code: "INVALID_BODY", since: at(62), at: at(62) });
		expect(code(await send(store, body({ seq: at(63) }), { now: at(63) }))).toBe("ok");
		expect(store.refused).toBeNull();
	});

	it("[T03] a request whose signature doesn't verify isn't recorded: anyone can send one", async () => {
		const store = paired();
		expect(code(await send(store, body({ v: 2 }), { key: "test2" }))).toBe("BAD_SIGNATURE");
		expect(store.refused).toBeNull();
		expect(store.previousSeen).toBeNull();
	});
});

describe("the previous wallet host (spec change 46, item 2; D4)", () => {
	async function repaired() {
		const store = paired("test1");
		const { code: c, state } = await newPairingCode(T0);
		store.pairing = state;
		expect(code(await send(store, body({ pair: { code: c, publicKey: PUBLIC_KEYS.test2 } }), { key: "test2" }))).toBe("ok");
		return store;
	}

	it("[T03][R08] a re-pair keeps the key it replaced; that key's requests stay refused and are recorded after the grace, at most once a minute", async () => {
		const store = await repaired();
		expect(store.previousKey).toEqual({ publicKey: PUBLIC_KEYS.test1, pairedAt: T0 });
		expect(PREVIOUS_GRACE_MS).toBe(60_000);
		// In the grace: refused, not recorded.
		expect(code(await send(store, body({ seq: at(59) }), { now: at(59) }))).toBe("BAD_SIGNATURE");
		expect(store.previousSeen).toBeNull();
		// An old host still running: recorded at its first sync past the grace.
		expect(code(await send(store, body({ seq: at(60) }), { now: at(60) }))).toBe("BAD_SIGNATURE");
		expect(store.previousSeen).toEqual({ at: at(60) });
		await send(store, body({ seq: at(90) }), { now: at(90) });
		expect(store.previousSeen).toEqual({ at: at(60) });
		await send(store, body({ seq: at(121) }), { now: at(121) });
		expect(store.previousSeen).toEqual({ at: at(121) });
		// Nothing the previous key sends is applied.
		expect(store.bridge?.lastSyncAt).toBeUndefined();
	});

	it("[T03][R08] 46's step 5b: a sync the previous key signed just before a same-machine re-pair, arriving just after it, doesn't raise the line", async () => {
		// The site stores the new key before the bridge saves it, and a sync already on its way (signed with the old key)
		// lands after the swap. The same machine, honest: no "previous wallet host is still running".
		const store = await repaired(); // the pairing at T0
		expect(code(await send(store, body({ seq: T0 - 200 }), { signedAt: T0 - 200, now: T0 + 100 }))).toBe("BAD_SIGNATURE");
		// A slow one: signed before the swap, 28 s on its way (RT-15's sync time on a large backlog).
		expect(code(await send(store, body({ seq: T0 - 100 }), { signedAt: T0 - 100, now: at(28) }))).toBe("BAD_SIGNATURE");
		expect(store.previousSeen).toBeNull();
	});

	it("[T03] a first pairing has no previous key; a key that was never paired isn't recorded", async () => {
		const store = new MemoryStore();
		const { code: c, state } = await newPairingCode(T0);
		store.pairing = state;
		await send(store, body({ pair: { code: c, publicKey: PUBLIC_KEYS.test1 } }));
		expect(store.previousKey).toBeNull();
		expect(code(await send(store, body({ seq: at(5) }), { key: "test2", now: at(5) }))).toBe("BAD_SIGNATURE");
		expect(store.previousSeen).toBeNull();
	});

	it("[T03][R08] the next pairing forgets the record, and the key it replaced becomes the previous key", async () => {
		const store = await repaired();
		await send(store, body({ seq: at(65) }), { now: at(65) });
		expect(store.previousSeen).toEqual({ at: at(65) });
		const { code: c, state } = await newPairingCode(at(70));
		store.pairing = state;
		await send(store, body({ seq: at(70), pair: { code: c, publicKey: PUBLIC_KEYS.test1 } }), { now: at(70) });
		expect(store.previousKey).toEqual({ publicKey: PUBLIC_KEYS.test2, pairedAt: at(70) });
		expect(store.previousSeen).toBeNull();
	});

	it("[T03][R08] a previous key stored before the grace (a plain string) gets none: its requests are recorded", async () => {
		const store = paired("test2");
		const kv = new Map<string, unknown>([["state:previousKey", PUBLIC_KEYS.test1]]);
		// The KV store's reading of the old form, through the real store class.
		const { CtxSyncStore } = await import("../../src/store");
		const real = new CtxSyncStore({ kv: { get: async (k: string) => kv.get(k) ?? null, set: async (k: string, v: unknown) => void kv.set(k, v), delete: async (k: string) => kv.delete(k) } } as never);
		expect(await real.getPreviousKey()).toEqual({ publicKey: PUBLIC_KEYS.test1, pairedAt: 0 });
		store.previousKey = { publicKey: PUBLIC_KEYS.test1, pairedAt: 0 };
		expect(code(await send(store, body({ seq: at(1) }), { now: at(1) }))).toBe("BAD_SIGNATURE");
		expect(store.previousSeen).toEqual({ at: at(1) });
	});
});
