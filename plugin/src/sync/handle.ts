/**
 * bridge/sync, step by step in the spec's order, against a storage interface (session 2d wires it to ctx.storage and
 * ctx.kv and declares the route). Returns the response body and the lifecycle events for the caller to record.
 */
import { type MoneroNetwork, subaddressNetwork } from "../core/address";
import { RESTORE_MARGIN_BLOCKS } from "../core/constants";
import { addressDigest } from "../core/digest";
import { type Invoice, type InvoiceEvent, counted, isOpen } from "../core/invoice";
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

/**
 * One wallet the site has used (spec change 46). `probe` is the digest of its own index-1 address (Wyatt's review:
 * probes are always index 1, so answering one never makes a fresh wallet create more than its first subaddress).
 */
export interface WalletEntry {
	wallet: number;
	probe?: { digest: string };
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

/** Spec change 46, item 1: the check list's size, the rotation's chunk and pace, and what counts as a recent row. */
export const MAX_CHECK = 150;
export const CHECK_ROTATION_CHUNK = 50;
export const CHECK_ROTATE_MS = 30_000;
export const RECENT_MS = 24 * 3_600_000;

/** A pool row as the check list reads it (site number). */
export interface CheckRow {
	addrIndex: number;
	address: string;
	status: string;
}

/**
 * The pool check's state (spec change 46, D3): when the bridge last reported "ok" (a thief's forged "ok" can refresh it
 * too, so it shows only that a check is running), and a mismatch, sticky until the next pairing.
 */
export interface PoolCheckState {
	lastOkAt?: number;
	mismatch?: { at: number; keyId: string };
}

/** The rotation through the rest of the current wallet's rows: the chunk [from, to], taken at `at` (site numbers). */
export interface RotationState {
	wallet: number;
	from: number;
	to: number;
	at: number;
}

/** Spec change 46, item 2: a refusal from the current key, kept until its next good sync. */
export interface RefusedRecord {
	code: SyncErrorCode;
	/** When this code was first refused, since the last good sync. */
	since: number;
	/** When it was last written (at most once a minute). */
	at: number;
}
/** The refusal and previous-key records are written at most this often, so a key can't drive KV writes. */
export const REFUSAL_WRITE_MS = 60_000;
/**
 * 46's step 5b: the previous key's requests in the first minute after a pairing aren't recorded. On a same-machine
 * re-pair the site stores the new key before the bridge saves it, so a sync signed with the old key can land just after
 * the swap (and one can be up to the 30 s request wall on its way). An old host still running is recorded at its first
 * sync after this, at most one sync interval later.
 */
export const PREVIOUS_GRACE_MS = 60_000;

/** Spec change 46, item 2 (D4): the key a pairing replaced, and when that pairing was (for the grace). */
export interface PreviousKey {
	publicKey: string;
	pairedAt: number;
}

/** The paired key's wallet, or null while the site waits for its answer. */
export function currentWallet(state: WalletsState | null, signerKeyId: string): number | null {
	if (!state) return 0;
	return state.current.keyId === signerKeyId ? state.current.wallet : null;
}

/** A won claim on a pairing code (spec change 50): what was claimed, and the revision the claim left behind. */
export interface PairingClaim {
	state: PairingState;
	revision: string;
}

export interface SyncStore {
	getPublicKey(): Promise<string | null>;
	setPublicKey(publicKey: string): Promise<void>;
	getPairing(): Promise<PairingState | null>;
	/**
	 * Spec change 50 (RT-07): marks this code used in one conditional write, so of several requests with it only one
	 * gets a claim. Null when the stored code is another one, is already used or claimed, or is gone.
	 */
	claimPairing(expected: PairingState): Promise<PairingClaim | null>;
	/**
	 * Puts a claimed code back after its pairing failed, unless the admin has issued a new code since. Never throws:
	 * the pairing's own error is the one to report.
	 */
	releasePairing(claim: PairingClaim): Promise<void>;
	getBridgeState(): Promise<BridgeState | null>;
	setBridgeState(state: BridgeState): Promise<void>;
	/**
	 * Raises a wallet's highest own index known to have received a counted payment (spec change 9's gap; per wallet
	 * since spec change 46).
	 */
	notePaid(wallet: number, index: number): Promise<void>;
	getWallets(): Promise<WalletsState | null>;
	setWallets(state: WalletsState): Promise<void>;
	/** A wallet's highest claimed own index, 0 when none (spec change 46: numbering cues only from handed-out rows). */
	claimedTop(wallet: number): Promise<number>;
	/** True if any pool row of any wallet is claimed: the site has history. */
	poolAnyClaimed(): Promise<boolean>;
	/** True if the pool already has this subaddress index (free or claimed). */
	poolHas(index: number): Promise<boolean>;
	/** Adds a free row tagged with the ID of the key that signed the sync (spec change 45) and when (spec change 46). */
	poolAdd(row: { addrIndex: number; address: string; keyId: string; addedAt: number }): Promise<void>;
	/** One pool row by site number, any status. */
	poolGet(index: number): Promise<CheckRow | null>;
	/**
	 * A wallet's rows of one status, lowest site number first: above `after` and up to `through` when given (site
	 * numbers), at most `limit`.
	 */
	poolRows(q: { wallet: number; status: "free" | "claimed"; after?: number; through?: number; limit: number }): Promise<CheckRow[]>;
	/** Spec change 46: marks a row "bad" (never handed out, never deleted, out of poolTop and the free count). */
	poolMarkBad(index: number): Promise<void>;
	getRecent(): Promise<Array<{ index: number; at: number }>>;
	setRecent(rows: Array<{ index: number; at: number }>): Promise<void>;
	getRotation(): Promise<RotationState | null>;
	setRotation(state: RotationState): Promise<void>;
	getPoolCheck(): Promise<PoolCheckState | null>;
	setPoolCheck(state: PoolCheckState): Promise<void>;
	/** Spec change 46, item 2 (D4): the key the last pairing replaced, and when it was last heard from. */
	getPreviousKey(): Promise<PreviousKey | null>;
	setPreviousKey(previous: PreviousKey | null): Promise<void>;
	getPreviousSeen(): Promise<{ at: number } | null>;
	setPreviousSeen(seen: { at: number } | null): Promise<void>;
	getRefused(): Promise<RefusedRecord | null>;
	setRefused(record: RefusedRecord | null): Promise<void>;
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
	/**
	 * Spec change 46 (Wyatt's review): the current wallet's highest claimed own index; free, "bad" and "dropped" rows
	 * don't count, so a key thief's free rows can't move it. The bridge's catch-up follows this, never poolTop. 0 while
	 * the site waits for the probe answer.
	 */
	claimedTop: number;
	/** Spec change 46, item 3: while the site waits for the answer, one per wallet with a probe (index 1); may be empty. */
	probes?: Array<{ wallet: number; index: 1; digest: string }>;
	/** Spec change 46, item 1: the current wallet's rows for the bridge to check, by own index and digest. */
	check?: Array<{ index: number; digest: string }>;
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
			// Spec change 50 (RT-07): claim the code before anything else is written. Only one request can win it; a
			// second one with the same code, at the same moment or later, is refused like any used code.
			const claim = await store.claimPairing(pairing);
			if (!claim) return error("PAIRING_REJECTED");
			try {
				const previous = await store.getPublicKey();
				replaced = previous !== null;
				// Spec change 46: on a site from before it, wallet 0's probe is its row at index 1, read before the drop below
				// can remove it (a free row 1).
				const prior = await store.getWallets();
				let probe0: WalletEntry["probe"];
				if (!prior) {
					const row1 = await store.poolGet(siteIndex(0, 1));
					if (row1 && (row1.status === "free" || row1.status === "claimed")) probe0 = { digest: await addressDigest(row1.address) };
				}
				// Spec change 45, in this order: drop the unused pool and clear the network, then store the key. A failure
				// partway leaves the old pairing working and the code usable for a retry (the release below), never a new
				// pairing holding the old pool.
				await store.poolDropUnused();
				await store.clearNetwork();
				await store.setPublicKey(body.value.pair.publicKey);
				// Spec change 46, item 2: keep the key this pairing replaced, to tell its requests apart later.
				// One write holds the key and the pairing's time, so a request can't see the key without the time (5b's grace).
				if (previous !== null && previous !== body.value.pair.publicKey) await store.setPreviousKey({ publicKey: previous, pairedAt: now });
				await store.setPreviousSeen(null);
				await store.setRefused(null);
				// Spec change 46: a site with history waits for the bridge to say which wallet it holds; a fresh one is wallet 0.
				// After the key, so a failure before this leaves the old key's wallet state as it was.
				const list = prior?.list ?? [{ wallet: 0, ...(probe0 ? { probe: probe0 } : {}) }];
				// History: a probe to match, or any row ever handed out. A site with claimed rows but no probe still waits, and
				// the bridge's "no match" then starts a new wallet (the safe start).
				const history = list.some((w) => w.probe !== undefined) || (await store.poolAnyClaimed());
				await store.setWallets({ current: { keyId: keyId(body.value.pair.publicKey), wallet: history ? null : (list[0]?.wallet ?? 0) }, list });
				// Spec change 46: a mismatch is sticky until the next pairing (after the key, so a failed pairing keeps it).
				await store.setPoolCheck({});
			} catch (e) {
				// A failed write: put the code back so a retry can pair (spec change 45), then report the failure.
				await store.releasePairing(claim);
				throw e;
			}
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
		if (!(await verifySignature(key, ts, bytes, signature))) {
			await notePrevious(store, ts, bytes, signature, now);
			return error("BAD_SIGNATURE");
		}
		const text = decodeStrict(bytes);
		if (text === null) return refuse(store, "INVALID_ENCODING", now);
		const body = parseSyncBody(text);
		if (!body.ok) return refuse(store, body.code, now);
		if (!seqInRange(body.value.seq, ts)) return refuse(store, "SEQ_OUT_OF_RANGE", now);
		if (body.value.pair) return error(pairing === null ? "PAIRING_NOT_ACTIVE" : "PAIRING_REJECTED");
		// Spec change 45: if a pairing replaced the key while this request ran, it's refused as if signed by the old key.
		// The tags below cover a pairing that lands after this check.
		if ((await store.getPublicKey()) !== stored) return error("BAD_SIGNATURE");
		parsed = body.value;
		signer = stored as string;
		if ((await store.getRefused()) !== null) await store.setRefused(null);
	}

	// 4. Apply: bridge state, pool top-up, snapshots. The chain height never goes down (spec change 16): a fresh
	// wallet's first sync reports the height it has scanned to, which can be far below the chain's.
	// Spec change 29: only a full sync counts as one. A pairing request (the installer, before the wallet exists) and a
	// "starting" message (wallet-rpc not ready) say the wallet host is alive, not that its wallet has synced. Pairing
	// forgets the previous host's sync and checks; "starting" keeps the last full sync.
	const prev = await store.getBridgeState();
	// Spec change 47, D4 (RT-26): a pairing whose request carries a height resets the site's height to it, lower
	// included, so a height a dishonest node pushed up heals. The bridge sends only a bounded one (the node synchronized,
	// within 10 blocks of a second node with a remote node), else 0, which keeps the stored height. A wallet still
	// scanning reports through ordinary syncs, which never lower it.
	const height = paired && parsed.height > 0 ? parsed.height : Math.max(prev?.height ?? 0, parsed.height);
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
			const entry = wallets.list.find((w) => w.wallet === next) ?? { wallet: next, ...(parsed.probeDigest ? { probe: { digest: parsed.probeDigest } } : {}) };
			wallets = { current: { keyId: signerId, wallet: next }, list: [entry, ...wallets.list.filter((w) => w.wallet !== next)].slice(0, MAX_WALLETS) };
			current = next;
			walletsChanged = true;
			// The gap baseline: the wallet's highest received index, so a returning wallet shows no false gap.
			await store.notePaid(next, answer.receivedTop);
		}
	}
	// The bridge's index-1 digest, sent once after a pairing on a site with no history: the current wallet's probe.
	if (current !== null && wallets && parsed.probeDigest) {
		const entry = wallets.list.find((w) => w.wallet === current);
		if (entry && !entry.probe) {
			entry.probe = { digest: parsed.probeDigest };
			walletsChanged = true;
		}
	}
	const events: SyncOutcome["events"] = [];
	let wrongNetwork = false;
	if (current !== null) {
		const wallet = current;
		const record = parsed.addresses.length > 0 ? await store.getNetwork() : null;
		let network = record?.keyId === signerId ? record.network : null;
		// Spec change 46: at most POOL_TARGET rows free, so every free row fits in every check list.
		let room = parsed.addresses.length > 0 ? POOL_TARGET - (await store.poolFreeCount()) : 0;
		const added: number[] = [];
		for (const a of parsed.addresses) {
			if (room <= 0) break;
			const addressNetwork = subaddressNetwork(a.address);
			if (addressNetwork === null) continue;
			if (network === null) {
				network = addressNetwork;
				await store.setNetwork({ network, keyId: signerId });
			}
			if (addressNetwork !== network) {
				// An honest bridge never sends one: its own first address set the network (spec change 46, item 2).
				wrongNetwork = true;
				continue;
			}
			const n = siteIndex(wallet, a.index);
			if (await store.poolHas(n)) continue;
			await store.poolAdd({ addrIndex: n, address: a.address, keyId: signerId, addedAt: now });
			added.push(n);
			room--;
		}
		if (added.length > 0) await store.setRecent([...added.reverse().map((index) => ({ index, at: now })), ...(await store.getRecent())].slice(0, MAX_CHECK));
		// The bridge's check of the last list it was sent (spec change 46, item 1).
		await applyPoolReport(store, parsed.checks?.pool, wrongNetwork, wallet, signerId, now, events);
		// The highest index with a counted payment in this sync, noted once.
		const paid = Math.max(0, ...parsed.snapshots.filter((snap) => snap.transfers.some((t) => counted(t) && t.amount !== "0")).map((snap) => snap.index));
		if (paid > 0) await store.notePaid(wallet, paid);
		for (const snap of parsed.snapshots) await applySnapshot(store, siteIndex(wallet, snap.index), snap.transfers, { seq: parsed.seq, now, chainHeight: height }, events);
	}
	if (walletsChanged && wallets) await store.setWallets(wallets);

	// 5. Response: pool status, the current wallet's highest index and watch list (spec change 46: its own indexes, and
	// empty while the site waits for the probe answer, with the probes); on pairing, a suggested restore height across
	// every wallet's watched invoices.
	const candidates = await store.watchCandidates(now);
	if (current !== null) await leaveOtherWallets(store, candidates, current, now, events);
	const watched = candidates.filter((inv) => isWatched(inv, now));
	const watch = current === null ? [] : [...new Set(watched.filter((inv) => walletOf(inv.addrIndex) === current && !leftBehind(inv)).map((inv) => ownIndex(inv.addrIndex)))].sort((a, b) => a - b);
	const response: SyncSuccess = { ok: true, poolFree: await store.poolFreeCount(), poolTarget: POOL_TARGET, poolTop: current === null ? 0 : await store.poolTop(current), watch, claimedTop: current === null ? 0 : await store.claimedTop(current) };
	if (current !== null) response.check = await checkList(store, current, candidates, now);
	if (current === null && wallets) {
		response.probes = probeEntries(wallets).map((w) => ({ wallet: w.wallet, index: 1 as const, digest: w.probe.digest }));
	}
	if (paired && watched.length > 0) {
		// From the healed height too (spec change 47): an invoice created under an inflated height doesn't put the new
		// wallet's restore height in the future.
		response.restoreHeight = Math.max(0, Math.min(height, ...watched.map((inv) => inv.createdHeight)) - RESTORE_MARGIN_BLOCKS);
	}
	return { response, events, ...(paired ? { paired, replaced } : {}) };
}

/**
 * Spec change 46, item 2: a request the current key signed, refused afterwards, is recorded with its code, so Health
 * can say the site is refusing the wallet host's updates (today such a sync fails silently on the site's side).
 */
async function refuse(store: SyncStore, code: SyncErrorCode, now: number): Promise<SyncOutcome> {
	const rec = await store.getRefused();
	if (!rec || rec.code !== code) await store.setRefused({ code, since: now, at: now });
	else if (now - rec.at >= REFUSAL_WRITE_MS) await store.setRefused({ ...rec, at: now });
	return error(code);
}

/**
 * After a re-pair: a request the previous key signed is still refused, but recorded (D4), at most once a minute, and not
 * in the grace after the pairing (5b).
 */
async function notePrevious(store: SyncStore, ts: string, bytes: Uint8Array, signature: Uint8Array<ArrayBuffer>, now: number) {
	const previous = await store.getPreviousKey();
	if (previous === null || now - previous.pairedAt < PREVIOUS_GRACE_MS) return;
	const key = decodeBase64(previous.publicKey, 32);
	if (!key || !(await verifySignature(key, ts, bytes, signature))) return;
	const seen = await store.getPreviousSeen();
	if (!seen || now - seen.at >= REFUSAL_WRITE_MS) await store.setPreviousSeen({ at: now });
}

/**
 * Closed because its wallet was no longer connected (D2), or because its address wasn't from the wallet (D3): never
 * watched again, and no snapshot reopens it.
 */
const leftBehind = (inv: Invoice) => inv.reviewReason === "wallet_changed" || inv.expiredReason === "wallet_changed" || inv.reviewReason === "not_your_wallet";

/**
 * Spec change 46, item 1 (D3): "ok" records when the check last passed; a mismatch (or an address on another network
 * from the current key) is recorded, sticky, and every bad row turns "bad" with any invoice on it sent to review
 * (not_your_wallet), closed and admin-decided ones included, since those decisions were made without knowing.
 */
async function applyPoolReport(store: SyncStore, report: BridgeChecks["pool"], wrongNetwork: boolean, wallet: number, signerId: string, now: number, events: SyncOutcome["events"]) {
	if (!report && !wrongNetwork) return;
	const state = (await store.getPoolCheck()) ?? {};
	if (report?.state === "ok") state.lastOkAt = now;
	if (report?.state === "mismatch" || wrongNetwork) {
		state.mismatch ??= { at: now, keyId: signerId };
		for (const own of report?.state === "mismatch" ? report.bad : []) {
			const n = siteIndex(wallet, own);
			await store.poolMarkBad(n);
			const inv = await store.invoiceForIndex(n);
			if (!inv || inv.reviewReason === "not_your_wallet") continue;
			const from = inv.status;
			inv.status = "review";
			inv.reviewReason = "not_your_wallet";
			delete inv.adminFinal;
			delete inv.pendingExpiry;
			inv.finalAt ??= now;
			await store.saveInvoice(inv);
			events.push({ invoiceId: inv.id, event: { type: "status", from, to: "review", reason: "not_your_wallet" } });
		}
	}
	await store.setPoolCheck(state);
}

/**
 * The rows the bridge checks (spec change 46, item 1): every free row, lowest first (checkout hands those out next);
 * then rows added in the last 24 hours, newest first, whatever their status; then open invoices' rows, newest first;
 * then a rotation through the rest that moves on by the clock, every CHECK_ROTATE_MS, so a thief syncing often can't
 * hurry it past the honest bridge. The current wallet's rows only, at most MAX_CHECK, as own indexes and digests.
 */
async function checkList(store: SyncStore, wallet: number, candidates: Invoice[], now: number): Promise<Array<{ index: number; digest: string }>> {
	const out: Array<{ index: number; address: string }> = [];
	const seen = new Set<number>();
	const push = (index: number, address: string) => {
		if (out.length >= MAX_CHECK || seen.has(index) || walletOf(index) !== wallet) return;
		seen.add(index);
		out.push({ index, address });
	};
	const live = (r: CheckRow | null): r is CheckRow => r !== null && (r.status === "free" || r.status === "claimed");
	for (const r of await store.poolRows({ wallet, status: "free", limit: MAX_CHECK })) push(r.addrIndex, r.address);
	for (const e of await store.getRecent()) {
		if (out.length >= MAX_CHECK) break;
		if (now - e.at > RECENT_MS || seen.has(e.index) || walletOf(e.index) !== wallet) continue;
		const r = await store.poolGet(e.index);
		if (live(r)) push(r.addrIndex, r.address);
	}
	const open = candidates.filter((inv) => isOpen(inv) && walletOf(inv.addrIndex) === wallet && !leftBehind(inv)).sort((a, b) => b.createdAt - a.createdAt);
	for (const inv of open) push(inv.addrIndex, inv.subaddress);
	const start = siteIndex(wallet, 0);
	let rotation = await store.getRotation();
	let chunk: CheckRow[];
	if (!rotation || rotation.wallet !== wallet || now - rotation.at >= CHECK_ROTATE_MS) {
		const after = rotation?.wallet === wallet ? rotation.to : start;
		chunk = await store.poolRows({ wallet, status: "claimed", after, limit: CHECK_ROTATION_CHUNK });
		if (chunk.length === 0 && after > start) chunk = await store.poolRows({ wallet, status: "claimed", after: start, limit: CHECK_ROTATION_CHUNK });
		rotation = { wallet, from: chunk[0]?.addrIndex ?? start, to: chunk.at(-1)?.addrIndex ?? start, at: now };
		await store.setRotation(rotation);
	} else {
		chunk = await store.poolRows({ wallet, status: "claimed", after: rotation.from - 1, through: rotation.to, limit: CHECK_ROTATION_CHUNK });
	}
	for (const r of chunk) push(r.addrIndex, r.address);
	return Promise.all(out.map(async (e) => ({ index: ownIndex(e.index), digest: await addressDigest(e.address) })));
}

/**
 * Spec change 46, D2: another wallet's open invoices can't get evidence from this wallet host. Something received goes
 * to review (wallet_changed) at once; nothing received expires at its deadline by the site's clock (wallet_changed).
 */
async function leaveOtherWallets(store: SyncStore, candidates: Invoice[], wallet: number, now: number, events: SyncOutcome["events"]) {
	for (const inv of candidates) {
		if (walletOf(inv.addrIndex) === wallet || !isOpen(inv) || inv.adminFinal) continue;
		const from = inv.status;
		if (inv.transfers.length > 0) {
			inv.status = "review";
			inv.reviewReason = "wallet_changed";
		} else if (now >= inv.expiresAt) {
			inv.status = "expired";
			inv.expiredReason = "wallet_changed";
		} else continue;
		delete inv.pendingExpiry;
		inv.finalAt ??= now;
		await store.saveInvoice(inv);
		events.push({ invoiceId: inv.id, event: { type: "status", from, to: inv.status, ...(inv.status === "review" ? { reason: "wallet_changed" as const } : {}) } });
	}
}

/** The wallets the probes go out for: those with a probe row, most recent first, at most MAX_PROBES. */
function probeEntries(state: WalletsState): Array<WalletEntry & { probe: NonNullable<WalletEntry["probe"]> }> {
	return state.list.filter((w): w is WalletEntry & { probe: NonNullable<WalletEntry["probe"]> } => w.probe !== undefined).slice(0, MAX_PROBES);
}

async function applySnapshot(store: SyncStore, index: number, transfers: SyncBody["snapshots"][number]["transfers"], at: { seq: number; now: number; chainHeight: number }, events: SyncOutcome["events"]) {
	const inv = await store.invoiceForIndex(index);
	if (!inv || leftBehind(inv)) return;
	const merged = mergeSnapshot(inv, transfers, at);
	if (!merged.applied) return;
	await store.saveInvoice(merged.invoice);
	for (const event of merged.events) events.push({ invoiceId: inv.id, event });
}
