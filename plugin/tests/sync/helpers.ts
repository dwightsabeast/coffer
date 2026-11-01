// Test helpers for bridge/sync: an in-memory SyncStore, and signing with the published RFC 8032 test keys through
// WebCrypto (the same keys as contract/test-vectors/sync-signature.json; never a key of our own).
import type { Invoice } from "../../src/core/invoice";
import { ownIndex, walletOf } from "../../src/core/walletindex";
import { siteIndex } from "../../src/core/walletindex";
import type { BridgeState, CheckRow, NetworkRecord, PoolCheckState, RefusedRecord, RotationState, SyncStore, WalletsState } from "../../src/sync/handle";
import { type PairingState, keyId } from "../../src/sync/pairing";

const SEEDS = {
	test1: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
	test2: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
} as const;
export const PUBLIC_KEYS = {
	test1: "11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo=",
	test2: "PUAXw+hDiVqStwqnTRt+vJyYLM8uxJaMwM1V8Sr0Zgw=",
} as const;
/** The key IDs pool rows carry (spec change 45): a fixture's free rows belong to the key it pairs with. */
export const KEY_IDS = { test1: keyId(PUBLIC_KEYS.test1), test2: keyId(PUBLIC_KEYS.test2) } as const;
export type KeyName = keyof typeof SEEDS;

const hexBytes = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => Number.parseInt(h, 16));
export const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
export const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

async function privateKey(name: KeyName): Promise<CryptoKey> {
	const pkcs8 = new Uint8Array([...hexBytes("302e020100300506032b657004220420"), ...hexBytes(SEEDS[name])]);
	return crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, false, ["sign"]);
}

/** Headers for a body: x-xmr-ts (seconds) and the base64 signature over ts + "\n" + bytes. */
export async function signedHeaders(body: Uint8Array, nowMs: number, key: KeyName = "test1", tsOverride?: string): Promise<Record<string, string>> {
	const ts = tsOverride ?? String(Math.floor(nowMs / 1000));
	const prefix = new TextEncoder().encode(`${ts}\n`);
	const message = new Uint8Array(prefix.length + body.length);
	message.set(prefix, 0);
	message.set(body, prefix.length);
	const sig = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, await privateKey(key), message));
	return { "x-xmr-ts": ts, "x-xmr-sig": b64(sig) };
}

export const bytesOf = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));

export class MemoryStore implements SyncStore {
	publicKey: string | null = null;
	pairing: PairingState | null = null;
	bridge: BridgeState | null = null;
	pool = new Map<number, { addrIndex: number; address: string; status: "free" | "claimed" | "dropped" | "bad"; keyId?: string; invoiceId?: string; addedAt?: number }>();
	recent: Array<{ index: number; at: number }> = [];
	rotation: RotationState | null = null;
	poolCheck: PoolCheckState | null = null;
	previousKey: string | null = null;
	previousSeen: { at: number } | null = null;
	refused: RefusedRecord | null = null;
	async getPreviousKey() { return this.previousKey; }
	async setPreviousKey(k: string | null) { this.previousKey = k; }
	async getPreviousSeen() { return this.previousSeen ? { ...this.previousSeen } : null; }
	async setPreviousSeen(s: { at: number } | null) { this.previousSeen = s ? { ...s } : null; }
	async getRefused() { return this.refused ? { ...this.refused } : null; }
	async setRefused(r: RefusedRecord | null) { this.refused = r ? { ...r } : null; }
	network: NetworkRecord | null = null;
	invoices = new Map<string, Invoice>();

	async getPublicKey() { return this.publicKey; }
	async setPublicKey(k: string) { this.publicKey = k; }
	async getPairing() { return this.pairing; }
	async setPairing(s: PairingState) { this.pairing = s; }
	/** Wallet 0's gap baseline (state:paidTop); other wallets' are in paidTops (spec change 46). */
	paidTop: number | null = null;
	paidTops = new Map<number, number>();
	wallets: WalletsState | null = null;
	async getBridgeState() { return this.bridge; }
	async notePaid(w: number, i: number) {
		if (w === 0) this.paidTop = Math.max(this.paidTop ?? i, i);
		else this.paidTops.set(w, Math.max(this.paidTops.get(w) ?? i, i));
	}
	async getWallets() { return this.wallets ? structuredClone(this.wallets) : null; }
	async setWallets(s: WalletsState) { this.wallets = structuredClone(s); }
	private live(w: number) { return [...this.pool.values()].filter((r) => (r.status === "free" || r.status === "claimed") && walletOf(r.addrIndex) === w); }
	async poolLowest(w: number) {
		const rows = this.live(w).sort((a, b) => a.addrIndex - b.addrIndex);
		return rows[0] ? { index: ownIndex(rows[0].addrIndex), address: rows[0].address } : null;
	}
	async setBridgeState(s: BridgeState) { this.bridge = s; }
	async poolHas(i: number) { return this.pool.has(i); }
	async poolAdd(row: { addrIndex: number; address: string; keyId: string; addedAt: number }) { this.pool.set(row.addrIndex, { ...row, status: "free" }); }
	async poolGet(i: number): Promise<CheckRow | null> { const r = this.pool.get(i); return r ? { ...r } : null; }
	async poolRows(q: { wallet: number; status: "free" | "claimed"; after?: number; through?: number; limit: number }) {
		const lo = q.after === undefined ? siteIndex(q.wallet, 0) : q.after + 1;
		const hi = q.through ?? siteIndex(q.wallet, 0) + 2 ** 32 - 1;
		return [...this.pool.values()].filter((r) => r.status === q.status && r.addrIndex >= Math.max(lo, siteIndex(q.wallet, 0)) && r.addrIndex <= hi && walletOf(r.addrIndex) === q.wallet)
			.sort((a, b) => a.addrIndex - b.addrIndex).slice(0, q.limit).map((r) => ({ ...r }));
	}
	async poolMarkBad(i: number) { const r = this.pool.get(i); if (r && (r.status === "free" || r.status === "claimed")) r.status = "bad"; }
	async getRecent() { return this.recent.map((e) => ({ ...e })); }
	async setRecent(rows: Array<{ index: number; at: number }>) { this.recent = rows.map((e) => ({ ...e })); }
	async getRotation() { return this.rotation ? { ...this.rotation } : null; }
	async setRotation(s: RotationState) { this.rotation = { ...s }; }
	async getPoolCheck() { return this.poolCheck ? structuredClone(this.poolCheck) : null; }
	async setPoolCheck(s: PoolCheckState) { this.poolCheck = structuredClone(s); }
	async getNetwork() { return this.network; }
	async setNetwork(r: NetworkRecord) { this.network = { ...r }; }
	async clearNetwork() { this.network = null; }
	async poolDropUnused() {
		for (const [i, r] of this.pool) if (r.status === "free" || r.status === "dropped") this.pool.delete(i);
	}
	async poolFreeCount() { return [...this.pool.values()].filter((r) => r.status === "free").length; }
	async poolTop(w: number) { return Math.max(0, ...this.live(w).map((r) => ownIndex(r.addrIndex))); }
	async invoiceForIndex(i: number) {
		const row = this.pool.get(i);
		return row?.invoiceId ? (this.invoices.get(row.invoiceId) ?? null) : null;
	}
	async saveInvoice(inv: Invoice) { this.invoices.set(inv.id, structuredClone(inv)); }
	async watchCandidates() { return [...this.invoices.values()]; }

	/** Test-only: claim a pool row for an invoice, as checkout will in session 2d. */
	claim(index: number, inv: Invoice) {
		const row = this.pool.get(index);
		if (!row || row.status !== "free") throw new Error(`pool row ${index} not free`);
		row.status = "claimed";
		row.invoiceId = inv.id;
		this.invoices.set(inv.id, structuredClone({ ...inv, addrIndex: index, subaddress: row.address }));
	}
}
