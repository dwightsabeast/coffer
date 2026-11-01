/**
 * Where Coffer keeps things (docs/spec.md, Plugin manifest and Security model):
 * - ctx.settings: the bridge's public key, the currency and the confirmation speed (no secret fields).
 * - ctx.kv: pairing state (a hash, never the code), the bridge's last sync, alerts, housekeeping cursors, the site's network (spec change 45).
 * - ctx.storage: the address pool and the invoices.
 */
import type { StorageCollection } from "emdash";
import type { PluginContext } from "emdash/plugin";

import { LATE_WINDOW_MS, TIP_WATCH_MS } from "./core/constants";
import type { Invoice } from "./core/invoice";
import { CURRENCIES, rateCacheKey } from "./rates";
import { ownIndex, walletRange } from "./core/walletindex";
import type { BridgeState, CheckRow, NetworkRecord, PoolCheckState, RefusedRecord, RotationState, SyncStore, WalletsState } from "./sync/handle";
import type { PairingState } from "./sync/pairing";

export const SETTING = { publicKey: "bridgePublicKey", currency: "currency", speed: "speed" } as const;
export const KV = { pairing: "state:pairing", bridge: "state:bridge", alerts: "state:alerts", purgeCursor: "state:purgeCursor", cronScheduled: "state:cronScheduled", salt: "state:salt", buckets: "state:buckets", paidTop: "state:paidTop", clientIp: "state:clientIp", lastPairing: "state:lastPairing", setupDone: "state:setupDone", watchTruncatedAt: "state:watchTruncatedAt", network: "state:network", wallets: "state:wallets", recent: "state:recent", checkRotation: "state:checkRotation", poolCheck: "state:poolCheck", previousKey: "state:previousKey", previousSeen: "state:previousSeen", refused: "state:refused" } as const;

/** A wallet's gap baseline (spec change 46): wallet 0 keeps today's key, the others get their own. */
export const paidTopKey = (wallet: number) => (wallet === 0 ? KV.paidTop : `${KV.paidTop}:${wallet}`);

/**
 * A pool row goes free -> claimed (checkout), or free -> dropped -> deleted (a new pairing, spec change 45). "dropped"
 * is left behind only if a pairing fails between marking and deleting: it's never counted as free or claimed, never
 * handed out, not in poolTop, and the next pairing deletes it.
 */
export interface PoolRow {
	addrIndex: number;
	address: string;
	/** "bad" (spec change 46): the wallet host found the row isn't from its wallet; never handed out, never deleted. */
	status: "free" | "claimed" | "dropped" | "bad";
	/** The ID of the bridge key whose sync added the row (spec change 45); rows from before it have none. */
	keyId?: string;
	/** When a sync added the row (ms, spec change 46); rows from before it have none and count as old. */
	addedAt?: number;
	invoiceId?: string;
}

/** Storage pages are at most 100 items. */
const PAGE = 100;
/**
 * The pairing drop's bound: 1,000 pages. Each page's rows are all deleted or claimed, so it ends long before this
 * unless syncs keep adding rows as fast as it deletes them. Any it leaves carry the old key's ID, which checkout skips.
 */
const MAX_DROP_PAGES = 1000;
/**
 * A scan's safety cap: 200 pages, 20,000 rows. The spam cap allows about 40 invoices every 30 minutes, and tips stay
 * candidates for 8 days, so about 15,400 rows at the most. Reaching it is reported, never silent (spec change 35,
 * condition 2: the scan used to stop at 10 pages without a word, on Node too). Release 1 runs on Node only, where a
 * 15,000-row scan took about 0.2 s; the planned KV watch index (spec change 35, A) replaces the scan.
 */
export const MAX_SCAN_PAGES = 200;

export const pool = (ctx: PluginContext) => ctx.storage.pool as StorageCollection<PoolRow>;
export const invoices = (ctx: PluginContext) => ctx.storage.invoices as StorageCollection<Invoice>;

/** Every page of a query, up to `maxPages`; `truncated` when rows were left unread. */
export async function collect(col: StorageCollection<Invoice>, where: Record<string, unknown>, maxPages: number = MAX_SCAN_PAGES): Promise<{ items: Invoice[]; truncated: boolean }> {
	const items: Invoice[] = [];
	let cursor: string | undefined;
	for (let page = 0; page < maxPages; page++) {
		const r = await col.query({ where: where as never, limit: PAGE, ...(cursor ? { cursor } : {}) });
		for (const item of r.items) items.push(item.data);
		if (!r.hasMore || !r.cursor) return { items, truncated: false };
		cursor = r.cursor;
	}
	return { items, truncated: true };
}

export class CtxSyncStore implements SyncStore {
	constructor(private readonly ctx: PluginContext) {}

	getPublicKey() {
		return this.ctx.settings.get<string>(SETTING.publicKey);
	}
	setPublicKey(publicKey: string) {
		return this.ctx.settings.set(SETTING.publicKey, publicKey);
	}
	getPairing() {
		return this.ctx.kv.get<PairingState>(KV.pairing);
	}
	setPairing(state: PairingState) {
		return this.ctx.kv.set(KV.pairing, state);
	}
	getBridgeState() {
		return this.ctx.kv.get<BridgeState>(KV.bridge);
	}
	setBridgeState(state: BridgeState) {
		return this.ctx.kv.set(KV.bridge, state);
	}
	async notePaid(wallet: number, index: number) {
		const key = paidTopKey(wallet);
		const top = await this.ctx.kv.get<number>(key);
		if (top === null || index > top) await this.ctx.kv.set(key, index);
	}
	getWallets() {
		return this.ctx.kv.get<WalletsState>(KV.wallets);
	}
	setWallets(state: WalletsState) {
		return this.ctx.kv.set(KV.wallets, state);
	}
	async poolLowest(wallet: number) {
		const low = await pool(this.ctx).query({ where: { status: { in: ["free", "claimed"] }, addrIndex: walletRange(wallet) }, orderBy: { addrIndex: "asc" }, limit: 1 });
		const row = low.items[0]?.data;
		return row ? { index: ownIndex(row.addrIndex), address: row.address } : null;
	}
	poolHas(index: number) {
		return pool(this.ctx).exists(String(index));
	}
	async poolGet(index: number) {
		return (await pool(this.ctx).get(String(index))) ?? null;
	}
	async poolRows(q: { wallet: number; status: "free" | "claimed"; after?: number; through?: number; limit: number }) {
		const range = walletRange(q.wallet);
		const addrIndex = { gte: q.after === undefined ? range.gte : Math.max(range.gte, q.after + 1), lt: q.through === undefined ? range.lt : Math.min(range.lt, q.through + 1) };
		const rows: PoolRow[] = [];
		let cursor: string | undefined;
		while (rows.length < q.limit) {
			const r = await pool(this.ctx).query({ where: { status: q.status, addrIndex }, orderBy: { addrIndex: "asc" }, limit: Math.min(PAGE, q.limit - rows.length), ...(cursor ? { cursor } : {}) });
			for (const item of r.items) rows.push(item.data);
			if (!r.hasMore || !r.cursor) break;
			cursor = r.cursor;
		}
		return rows;
	}
	async poolMarkBad(index: number) {
		await pool(this.ctx).updateIf(String(index), { where: { status: { in: ["free", "claimed"] } }, set: { status: "bad" } }).catch(() => undefined);
	}
	async getRecent() {
		return (await this.ctx.kv.get<Array<{ index: number; at: number }>>(KV.recent)) ?? [];
	}
	setRecent(rows: Array<{ index: number; at: number }>) {
		return this.ctx.kv.set(KV.recent, rows);
	}
	getRotation() {
		return this.ctx.kv.get<RotationState>(KV.checkRotation);
	}
	setRotation(state: RotationState) {
		return this.ctx.kv.set(KV.checkRotation, state);
	}
	getPoolCheck() {
		return this.ctx.kv.get<PoolCheckState>(KV.poolCheck);
	}
	setPoolCheck(state: PoolCheckState) {
		return this.ctx.kv.set(KV.poolCheck, state);
	}
	getPreviousKey() {
		return this.ctx.kv.get<string>(KV.previousKey);
	}
	async setPreviousKey(publicKey: string | null) {
		if (publicKey === null) await this.ctx.kv.delete(KV.previousKey);
		else await this.ctx.kv.set(KV.previousKey, publicKey);
	}
	getPreviousSeen() {
		return this.ctx.kv.get<{ at: number }>(KV.previousSeen);
	}
	async setPreviousSeen(seen: { at: number } | null) {
		if (seen === null) await this.ctx.kv.delete(KV.previousSeen);
		else await this.ctx.kv.set(KV.previousSeen, seen);
	}
	getRefused() {
		return this.ctx.kv.get<RefusedRecord>(KV.refused);
	}
	async setRefused(record: RefusedRecord | null) {
		if (record === null) await this.ctx.kv.delete(KV.refused);
		else await this.ctx.kv.set(KV.refused, record);
	}
	async poolAdd(row: { addrIndex: number; address: string; keyId: string; addedAt: number }) {
		// Create only when absent: a concurrent sync must never reset a claimed row to free.
		await pool(this.ctx).compareAndSet(String(row.addrIndex), null, { ...row, status: "free" });
	}
	getNetwork() {
		return this.ctx.kv.get<NetworkRecord>(KV.network);
	}
	setNetwork(record: NetworkRecord) {
		return this.ctx.kv.set(KV.network, record);
	}
	async clearNetwork() {
		await this.ctx.kv.delete(KV.network);
	}
	/**
	 * Mark, then delete. The mark is an updateIf guarded on status "free", the same guard checkout claims with, so of a
	 * claim and the drop exactly one wins a row. (updateIf leaves a row's revision unchanged, so a compareAndDelete on a
	 * revision read earlier could delete a row claimed in between.)
	 */
	async poolDropUnused() {
		const col = pool(this.ctx);
		for (let page = 0; page < MAX_DROP_PAGES; page++) {
			const r = await col.query({ where: { status: { in: ["free", "dropped"] } }, limit: PAGE });
			if (r.items.length === 0) return;
			const gone: string[] = [];
			for (const { id, data } of r.items) {
				if (data.status === "dropped") gone.push(id);
				else if ((await col.updateIf(id, { where: { status: "free" }, set: { status: "dropped" } })).applied) gone.push(id);
			}
			if (gone.length > 0) await col.deleteMany(gone);
		}
	}
	poolFreeCount() {
		return pool(this.ctx).count({ status: "free" });
	}
	async poolTop(wallet: number) {
		const top = await pool(this.ctx).query({ where: { status: { in: ["free", "claimed"] }, addrIndex: walletRange(wallet) }, orderBy: { addrIndex: "desc" }, limit: 1 });
		const row = top.items[0]?.data;
		return row ? ownIndex(row.addrIndex) : 0;
	}
	async invoiceForIndex(index: number) {
		const row = await pool(this.ctx).get(String(index));
		return row?.invoiceId ? invoices(this.ctx).get(row.invoiceId) : null;
	}
	saveInvoice(inv: Invoice) {
		return invoices(this.ctx).put(inv.id, inv);
	}
	async watchCandidates(now: number) {
		const col = invoices(this.ctx);
		const open = await collect(col, { status: { in: ["new", "seen", "confirming"] } });
		// Final invoices can be watched for at most a day after expiry (late window) or after settling (settled
		// within a day of expiry at the latest), so two days back covers them.
		const recent = await collect(col, { expiresAt: { gte: now - 2 * LATE_WINDOW_MS } });
		// Tips stay watched for 7 days after their window (spec change 33): their own lookback, on the kind+createdAt index.
		const tips = await collect(col, { kind: "tip", createdAt: { gte: now - TIP_WATCH_MS - LATE_WINDOW_MS } });
		if (open.truncated || recent.truncated || tips.truncated) await this.ctx.kv.set(KV.watchTruncatedAt, now);
		const byId = new Map<string, Invoice>();
		for (const inv of [...open.items, ...recent.items, ...tips.items]) byId.set(inv.id, inv);
		return [...byId.values()];
	}
}

/** plugin:uninstall with deleteData: the pool, the invoices, Coffer's KV state and its settings (the bridge key too). */
export async function deletePluginData(ctx: PluginContext): Promise<void> {
	for (const col of [pool(ctx), invoices(ctx)] as Array<StorageCollection<unknown>>) {
		for (let page = 0; page < 1000; page++) {
			const r = await col.query({ limit: PAGE });
			if (r.items.length === 0) break;
			await col.deleteMany(r.items.map((i) => i.id));
		}
	}
	// Each wallet's gap baseline (spec change 46). Wallet numbers only go up, so 1..the highest covers every one, trimmed
	// from the list or not. (The sandbox's ctx.kv has no list().)
	const wallets = await ctx.kv.get<WalletsState>(KV.wallets);
	const highest = Math.max(0, ...(wallets?.list.map((w) => w.wallet) ?? []));
	for (let w = 1; w <= highest; w++) await ctx.kv.delete(paidTopKey(w));
	for (const key of Object.values(KV)) await ctx.kv.delete(key);
	for (const c of CURRENCIES) await ctx.kv.delete(rateCacheKey(c));
	for (const key of Object.values(SETTING)) await ctx.settings.delete(key);
}

