/**
 * bridge/sync, step by step in the spec's order, against a storage interface (session 2d wires it to ctx.storage and
 * ctx.kv and declares the route). Returns the response body and the lifecycle events for the caller to record.
 */
import { type MoneroNetwork, subaddressNetwork } from "../core/address";
import { RESTORE_MARGIN_BLOCKS } from "../core/constants";
import { addressDigest } from "../core/digest";
import { type Invoice, type InvoiceEvent, counted } from "../core/invoice";
import { ownIndex, siteIndex, walletOf } from "../core/walletindex";
import { isWatched } from "../core/watch";
import { mergeSnapshot } from "./merge";
import { type PairingState, isPairingActive, keyId, pairingCodeMatches } from "./pairing";
import {
	type BridgeChecks,
	PAIR_MAX_BYTES,
	POOL_TARGET,
	type SyncBody,
	type SyncErrorCode,
	checkHeaders,
	decodeBase64,
	decodeStrict,
	parseSyncBody,
	seqInRange,
	verifySignature,
} from "./protocol";

export interface BridgeState {
	height: number;
	/** The last full sync: not a pairing request, not a "starting" message (spec change 29). Absent until the first. */
	lastSyncAt?: number;
	/** The last signed message of any kind: pairing, "starting" or a sync (spec change 29). Absent in older states. */
	lastHeardAt?: number;
	version: number;
	outdated: boolean;
	/** The wallet host's checks from its last sync; absent when it sent none (an older bridge). */
	checks?: BridgeChecks;
}

/**
 * The site's network (spec change 45): set by the first readable address a pairing's bridge sends, and kept with that
 * key's ID. A record from another key counts as not known, so a sync already running when a re-pairing lands can't fix
 * the new pairing's network.
 */
export interface NetworkRecord {
	network: MoneroNetwork;
	keyId: string;
}

/** One wallet the site has used (spec change 46). `probe` is its lowest-index row, in the wallet's own index. */
export interface WalletEntry {
	wallet: number;
	probe?: { index: number; address: string };
}

/**
 * The wallets the site has used, most recent first, and which one the paired key's bridge holds (spec change 46,
 * item 3). `current.wallet` is null while the site waits for the bridge's answer to the probes; a `current` from
 * another key counts as waiting too. No record at all is a site from before spec change 46: everything is wallet 0.
 */
export interface WalletsState {
	current: { keyId: string; wallet: number | null };
	list: WalletEntry[];
}

/** The probes go out for at most this many wallets; the list keeps at most MAX_WALLETS (an older one then looks new). */
export const MAX_PROBES = 10;
export const MAX_WALLETS = 100;

/** The paired key's wallet, or null while the site waits for its answer. */
export function currentWallet(state: WalletsState | null, signerKeyId: string): number | null {
	if (!state) return 0;
	return state.current.keyId === signerKeyId ? state.current.wallet : null;
}

export interface SyncStore {
	getPublicKey(): Promise<string | null>;
	setPublicKey(publicKey: string): Promise<void>;
	getPairing(): Promise<PairingState | null>;
	setPairing(state: PairingState): Promise<void>;
	getBridgeState(): Promise<BridgeState | null>;
	setBridgeState(state: BridgeState): Promise<void>;
	/**
	 * Raises a wallet's highest own index known to have received a counted payment (spec change 9's gap; per wallet
	 * since spec change 46).
	 */
	notePaid(wallet: number, index: number): Promise<void>;
	getWallets(): Promise<WalletsState | null>;
	setWallets(state: WalletsState): Promise<void>;
	/** A wallet's lowest-index row (free or claimed), in its own index; null when it has none. */
	poolLowest(wallet: number): Promise<{ index: number; address: string } | null>;
	/** True if the pool already has this subaddress index (free or claimed). */
	poolHas(index: number): Promise<boolean>;
	/** Adds a free row tagged with the ID of the key that signed the sync (spec change 45). */
	poolAdd(row: { addrIndex: number; address: string; keyId: string }): Promise<void>;
	getNetwork(): Promise<NetworkRecord | null>;
	setNetwork(record: NetworkRecord): Promise<void>;
	clearNetwork(): Promise<void>;
	/**
	 * Spec change 45: removes every unused pool row (free, or "dropped" by an earlier attempt), never a claimed one,
	 * even one a checkout claims while this runs.
	 */
	poolDropUnused(): Promise<void>;
	poolFreeCount(): Promise<number>;
	/** A wallet's highest own index in the pool (free or claimed; "dropped" and "bad" rows don't count), 0 when it has
	 * none. Every invoice's index is a pool row. */
	poolTop(wallet: number): Promise<number>;
	/** The invoice that claimed this subaddress index, if any. */
	invoiceForIndex(index: number): Promise<Invoice | null>;
	saveInvoice(inv: Invoice): Promise<void>;
	/** Invoices that might still be watched (open, or final within the last day); the handler applies isWatched. */
	watchCandidates(now: number): Promise<Invoice[]>;
}

export interface SyncSuccess {
	ok: true;
	poolFree: number;
	poolTarget: number;
	/**
	 * Spec change 15: a bridge whose wallet lacks this index catches up (creates addresses, rescans) before it reports.
	 * The current wallet's own index (spec change 46); 0 while the site waits for the probe answer.
	 */
	poolTop: number;
	/** The current wallet's own indexes; empty while the site waits for the probe answer. */
	watch: number[];
	/** Spec change 46, item 3: while the site waits for the answer, one digest per wallet it has used. */
	probes?: Array<{ wallet: number; index: number; digest: string }>;
	/** Spec change 17, on the response that completes a pairing only: scan from here when creating a wallet, so a
	 * reinstall finds payments to invoices made before it. Absent when nothing is watched. */
	restoreHeight?: number;
}
export type SyncResponse = SyncSuccess | { error: { code: SyncErrorCode } };

export interface SyncOutcome {
	response: SyncResponse;
	/** Lifecycle events per invoice (status changes, alerts) for the caller to record. */
	events: Array<{ invoiceId: string; event: InvoiceEvent }>;
	/** Set when this request completed a pairing. */
	paired?: boolean;
	/** With paired: the pairing replaced a key that was already stored. */
	replaced?: boolean;
}

const error = (code: SyncErrorCode): SyncOutcome => ({ response: { error: { code } }, events: [] });

export async function handleSync(input: { body: Uint8Array; headers: Record<string, string>; now: number }, store: SyncStore): Promise<SyncOutcome> {
	const { body: bytes, headers, now } = input;

	// 1. Headers and freshness, before anything else.
	const head = checkHeaders(headers, now);
	if (!head.ok) return error(head.code);
	const { ts, signature } = head.value;

	// 2. Pairing: the only case where the body is parsed before the signature is checked, and only while a code is
	// active and the body is small. The signature must verify with the key carried in the body.
	const pairing = await store.getPairing();
	let parsed: SyncBody | null = null;
	/** The key this request's signature verified with. */
	let signer = "";
	let paired = false;
	let replaced = false;
	if (isPairingActive(pairing, now) && bytes.length <= PAIR_MAX_BYTES) {
		const text = decodeStrict(bytes);
		if (text === null) return error("INVALID_ENCODING");
		const body = parseSyncBody(text);
		if (!body.ok) return error(body.code);
		if (!seqInRange(body.value.seq, ts)) return error("SEQ_OUT_OF_RANGE");
		if (body.value.pair) {
			if (!(await pairingCodeMatches(pairing, body.value.pair.code, now))) return error("PAIRING_REJECTED");
			const key = decodeBase64(body.value.pair.publicKey, 32);
			if (!key || !(await verifySignature(key, ts, bytes, signature))) return error("BAD_SIGNATURE");
			replaced = (await store.getPublicKey()) !== null;
			// Spec change 45, in this order: drop the unused pool and clear the network, then store the key, then burn the
			// code. A failure partway leaves the old pairing working and the code usable for a retry, never a new
			// pairing holding the old pool.
			await store.poolDropUnused();
			await store.clearNetwork();
			await store.setPublicKey(body.value.pair.publicKey);
			// Spec change 46: a site with history waits for the bridge to say which wallet it holds; a fresh one is wallet 0.
			// After the key, so a failure before this leaves the old key's wallet state as it was.
			const prior = await store.getWallets();
			let list = prior?.list;
			if (!list) {
				const low = await store.poolLowest(0);
				list = [{ wallet: 0, ...(low ? { probe: low } : {}) }];
			}
			const history = list.some((w) => w.probe !== undefined);
			await store.setWallets({ current: { keyId: keyId(body.value.pair.publicKey), wallet: history ? null : (list[0]?.wallet ?? 0) }, list });
			await store.setPairing({ ...pairing, used: true });
			parsed = body.value;
			signer = body.value.pair.publicKey;
			paired = true;
		}
	}

	// 3. Otherwise: the stored key verifies the exact bytes, then strict decoding, then parsing.
	if (!parsed) {
		const stored = await store.getPublicKey();
		const key = stored === null ? null : decodeBase64(stored, 32);
		if (!key) return error("NOT_PAIRED");
		if (!(await verifySignature(key, ts, bytes, signature))) return error("BAD_SIGNATURE");
		const text = decodeStrict(bytes);
		if (text === null) return error("INVALID_ENCODING");
		const body = parseSyncBody(text);
		if (!body.ok) return error(body.code);
		if (!seqInRange(body.value.seq, ts)) return error("SEQ_OUT_OF_RANGE");
		if (body.value.pair) return error(pairing === null ? "PAIRING_NOT_ACTIVE" : "PAIRING_REJECTED");
		// Spec change 45: if a pairing replaced the key while this request ran, it's refused as if signed by the old key.
		// The tags below cover a pairing that lands after this check.
		if ((await store.getPublicKey()) !== stored) return error("BAD_SIGNATURE");
		parsed = body.value;
		signer = stored as string;
	}

	// 4. Apply: bridge state, pool top-up, snapshots. The chain height never goes down (spec change 16): a fresh
	// wallet's first sync reports the height it has scanned to, which can be far below the chain's.
	// Spec change 29: only a full sync counts as one. A pairing request (the installer, before the wallet exists) and a
	// "starting" message (wallet-rpc not ready) say the wallet host is alive, not that its wallet has synced. Pairing
	// forgets the previous host's sync and checks; "starting" keeps the last full sync.
	const prev = await store.getBridgeState();
	const height = Math.max(prev?.height ?? 0, parsed.height);
	const starting = parsed.checks?.wallet?.state === "starting";
	const lastSyncAt = paired ? undefined : starting ? prev?.lastSyncAt : now;
	const checks = paired ? undefined : parsed.checks;
	await store.setBridgeState({
		height,
		...(lastSyncAt !== undefined ? { lastSyncAt } : {}),
		lastHeardAt: now,
		version: parsed.v,
		outdated: parsed.outdated,
		...(checks ? { checks } : {}),
	});
	// Spec change 45: one network per pairing. With none stored for this key, the first readable address in the body's
	// order sets it; an address on another network is dropped, like one whose network can't be read.
	const signerId = keyId(signer);
	// Spec change 46, items 3 and 4: which wallet this key's bridge holds, from its answer to the probes if it sends one.
	let wallets = await store.getWallets();
	let current = currentWallet(wallets, signerId);
	let walletsChanged = false;
	if (current === null && wallets && parsed.wallet) {
		const answer = parsed.wallet;
		let next: number | null = null;
		if (answer.match === null) next = Math.max(-1, ...wallets.list.map((w) => w.wallet)) + 1;
		else if (probeEntries(wallets).some((w) => w.wallet === answer.match)) next = answer.match;
		if (next !== null) {
			const entry = wallets.list.find((w) => w.wallet === next) ?? { wallet: next };
			wallets = { current: { keyId: signerId, wallet: next }, list: [entry, ...wallets.list.filter((w) => w.wallet !== next)].slice(0, MAX_WALLETS) };
			current = next;
			walletsChanged = true;
			// The gap baseline: the wallet's highest received index, so a returning wallet shows no false gap.
			await store.notePaid(next, answer.receivedTop);
		}
	}
	const events: SyncOutcome["events"] = [];
	if (current !== null) {
		const wallet = current;
		const record = parsed.addresses.length > 0 ? await store.getNetwork() : null;
		let network = record?.keyId === signerId ? record.network : null;
		for (const a of parsed.addresses) {
			const addressNetwork = subaddressNetwork(a.address);
			if (addressNetwork === null) continue;
			if (network === null) {
				network = addressNetwork;
				await store.setNetwork({ network, keyId: signerId });
			}
			if (addressNetwork !== network) continue;
			const n = siteIndex(wallet, a.index);
			if (await store.poolHas(n)) continue;
			await store.poolAdd({ addrIndex: n, address: a.address, keyId: signerId });
			if (wallets) {
				const entry = wallets.list.find((w) => w.wallet === wallet);
				if (entry && (!entry.probe || a.index < entry.probe.index)) {
					entry.probe = { index: a.index, address: a.address };
					walletsChanged = true;
				}
			}
		}
		// The highest index with a counted payment in this sync, noted once.
		const paid = Math.max(0, ...parsed.snapshots.filter((snap) => snap.transfers.some((t) => counted(t) && t.amount !== "0")).map((snap) => snap.index));
		if (paid > 0) await store.notePaid(wallet, paid);
		for (const snap of parsed.snapshots) await applySnapshot(store, siteIndex(wallet, snap.index), snap.transfers, { seq: parsed.seq, now, chainHeight: height }, events);
	}
	if (walletsChanged && wallets) await store.setWallets(wallets);

	// 5. Response: pool status, the current wallet's highest index and watch list (spec change 46: its own indexes, and
	// empty while the site waits for the probe answer, with the probes); on pairing, a suggested restore height across
	// every wallet's watched invoices.
	const watched = (await store.watchCandidates(now)).filter((inv) => isWatched(inv, now));
	const watch = current === null ? [] : [...new Set(watched.filter((inv) => walletOf(inv.addrIndex) === current).map((inv) => ownIndex(inv.addrIndex)))].sort((a, b) => a - b);
	const response: SyncSuccess = { ok: true, poolFree: await store.poolFreeCount(), poolTarget: POOL_TARGET, poolTop: current === null ? 0 : await store.poolTop(current), watch };
	if (current === null && wallets) {
		response.probes = await Promise.all(probeEntries(wallets).map(async (w) => ({ wallet: w.wallet, index: w.probe.index, digest: await addressDigest(w.probe.address) })));
	}
	if (paired && watched.length > 0) {
		response.restoreHeight = Math.max(0, Math.min(...watched.map((inv) => inv.createdHeight)) - RESTORE_MARGIN_BLOCKS);
	}
	return { response, events, ...(paired ? { paired, replaced } : {}) };
}

/** The wallets the probes go out for: those with a probe row, most recent first, at most MAX_PROBES. */
function probeEntries(state: WalletsState): Array<WalletEntry & { probe: NonNullable<WalletEntry["probe"]> }> {
	return state.list.filter((w): w is WalletEntry & { probe: NonNullable<WalletEntry["probe"]> } => w.probe !== undefined).slice(0, MAX_PROBES);
}

async function applySnapshot(store: SyncStore, index: number, transfers: SyncBody["snapshots"][number]["transfers"], at: { seq: number; now: number; chainHeight: number }, events: SyncOutcome["events"]) {
	const inv = await store.invoiceForIndex(index);
	if (!inv) return;
	const merged = mergeSnapshot(inv, transfers, at);
	if (!merged.applied) return;
	await store.saveInvoice(merged.invoice);
	for (const event of merged.events) events.push({ invoiceId: inv.id, event });
}
