// Phase 07b pass 1, round 1 (black box): plan item B2, the admin page's own actions pushed past what the page offers.
// Rows F04 (out-of-range and unknown values refused), T07 (`required` never lowered) and T13 (pairing codes). The admin
// is trusted, so the question is only whether the page's handlers do what the page says: refuse what it doesn't offer,
// change nothing on a refusal, and never crash. Invoices come from the public routes (tip checkout, signed syncs);
// action values are the ones the rendered page hands the browser, then altered.
import { afterEach, describe, expect, it } from "vitest";

import { H0, type RedteamHost, type Reply, redteamHost } from "./harness";
import { PUBLIC_KEYS } from "../sync/helpers";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;
const ok = (r: Reply) => data(r)?.ok === true;
let txn = 0;
const tr = (amount: string, confirmations: number, o: B = {}) => ({ txid: (++txn).toString(16).padStart(64, "0"), amount, confirmations, height: H0 + 1, timestamp: 1_790_000_000, doubleSpendSeen: false, unlockTime: "0", ...o });
const PAGE = "/payments";

/** Every block, depth first. */
const walk = (blocks: B[]): B[] => blocks.flatMap((b) => [b, ...walk(Array.isArray(b.blocks) ? b.blocks : [])]);
const buttons = (blocks: B[]) => walk(blocks).filter((b) => b.type === "actions").flatMap((b) => b.elements as B[]);
const codeFrom = (blocks: B[]) => (walk(blocks).find((b) => b.type === "code" && String(b.code).includes("/install.sh"))?.code as string | undefined)?.match(/--pair ([A-Za-z0-9_-]{22})$/)?.[1];

async function site(pool = 8) {
	h = await redteamHost({ pool });
	for (const c of ["USD", "EUR"] as const) await h.price(c, "150.00");
	return h;
}
const r = () => h as RedteamHost;
const byId = async (id: string) => (await r().invoices()).find((i) => i.id === id) as B;
async function tip(body: B = {}) {
	const t = data(await r().checkout({ kind: "tip", ...body }))!.token as string;
	return (await r().invoices()).find((i) => i.token === t) as B;
}
const load = async () => (await r().host.admin.loadPage(PAGE)).blocks as B[];
const act = (actionId: string, value?: unknown) => r().host.admin.act(PAGE, actionId, value === undefined ? {} : { value });

/** A settled tip whose payment the bridge then stops reporting: review, reason reversed. */
async function reversedTip() {
	const inv = await tip();
	await r().sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] });
	await r().sync({ height: H0 + 13, snapshots: [{ index: inv.addrIndex, transfers: [] }] });
	const after = await byId(inv.id);
	expect(after).toMatchObject({ status: "review", reviewReason: "reversed" });
	return after;
}
/** A settled tip, 10 deep. */
async function settledTip() {
	const inv = await tip();
	await r().sync({ height: H0 + 12, snapshots: [{ index: inv.addrIndex, transfers: [tr("500000000", 10)] }] });
	expect((await byId(inv.id)).status).toBe("settled");
	return byId(inv.id);
}
/** What the page offers for an invoice, as the browser would see it. */
const offered = async (id: string) => buttons(await load()).filter((e) => e.action_id === "invoice_action" && String(e.value).endsWith(`:${id}`)).map((e) => e.value as string);
/** The fields that matter for "nothing changed". */
const snap = (i: B) => JSON.stringify({ status: i.status, reviewReason: i.reviewReason, required: i.required, adminFinal: i.adminFinal, settledAt: i.settledAt, finalAt: i.finalAt, transfers: i.transfers });

describe("B2: the review-item actions with forged values", () => {
	it("[F04] B2: unknown, look-alike, oversized and wrong-typed invoice values are refused with an error toast, and nothing changes", async () => {
		await site();
		const inv = await reversedTip();
		expect(await offered(inv.id)).toEqual([`expire:${inv.id}`, `settle:${inv.id}`]);
		const before = snap(inv);
		const id = inv.id as string;
		const values: unknown[] = [
			"settle:inv_0000000000000000", `settle:${id}x`, `settle:${id.toUpperCase()}`, `settle:${id} `, ` settle:${id}`, `settle:${id}\u0000`, `settle:${id}\n`,
			`SETTLE:${id}`, `Settle:${id}`, `settle::${id}`, `settle:${id}:${id}`, `settle:${id}|`,
			`settle:${"a".repeat(1_000_000)}`, "settle:__proto__", "settle:constructor", "settle:toString", "settle:1", `settle:${inv.addrIndex}`, `settle:${inv.token}`, `settle:${inv.subaddress}`,
			`raise:${id}`, `details:${id}`, `delete:${id}`, `refund:${id}`, `pay:${id}`, `settle:inv_${"0".repeat(16)}`,
			`settle:${id.replace("inv_", "inv‐")}`, `settle:${id.replace("i", "і")}`, // hyphen and Cyrillic look-alikes
			"", ":", "settle", "settle:", 42, -1, 1e308, true, null, [], [`settle:${id}`], { id }, { value: `settle:${id}` }, { action: "settle", id },
		];
		const notRefused: string[] = [];
		for (const value of values) {
			const res = await act("invoice_action", value);
			if (res.toast?.type !== "error") notRefused.push(`${JSON.stringify(value).slice(0, 60)} -> ${JSON.stringify(res.toast)}`);
		}
		expect(notRefused).toEqual([]);
		expect(snap(await byId(id))).toBe(before);
	});

	it("[F04] B2: action IDs that aren't the page's own, including Object.prototype names, are refused without a crash", async () => {
		await site();
		const inv = await reversedTip();
		const before = snap(inv);
		const notRefused: string[] = [];
		for (const actionId of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty", "prototype", "then", "INVOICE_ACTION", "invoice_action ", "invoice_action\u0000", "admin", "settle", "", "x".repeat(10_000)]) {
			const res = await act(actionId, `settle:${inv.id}`).catch((e: unknown) => ({ toast: { type: "thrown", message: String(e) } }) as B);
			if (res.toast?.type !== "error") notRefused.push(`${JSON.stringify(actionId).slice(0, 40)} -> ${JSON.stringify(res.toast)}`);
		}
		expect(notRefused).toEqual([]);
		expect(snap(await byId(inv.id))).toBe(before);
	});

	it("[F04] B2: a forged action the page doesn't offer for that state is refused: expire or re-settle a settled tip, act on a decided one", async () => {
		await site();
		const settled = await settledTip();
		expect(await offered(settled.id)).toEqual([]);
		for (const v of [`expire:${settled.id}`, `settle:${settled.id}`, `raise:${settled.id}`]) expect((await act("invoice_action", v)).toast?.type, v).toBe("error");
		expect((await byId(settled.id)).status).toBe("settled");
		expect((await byId(settled.id)).adminFinal).toBeUndefined();
		// Decided once (expire the reversed one): both actions are then refused, and the decision holds.
		const rev = await reversedTip();
		expect((await act("invoice_action", `expire:${rev.id}`)).toast?.type).toBe("success");
		const decided = snap(await byId(rev.id));
		for (const v of [`settle:${rev.id}`, `expire:${rev.id}`]) expect((await act("invoice_action", v)).toast?.type, v).toBe("error");
		expect(snap(await byId(rev.id))).toBe(decided);
	});

	// Break: the release-1 page offers no action at all on a tip that isn't in review, yet the handler takes a forged
	// Mark settled or Expire for one. Only an admin can send it (B1 covers everyone else), so the reach is the admin's own
	// records: a tip nobody paid shown as settled, or an open tip closed. Filed as RT-14 (Low).
	it("[F04] [RT-14] B2: a forged Mark settled or Expire on an open tip, which the page doesn't offer, is refused", async () => {
		await site();
		const toasts: Record<string, unknown> = {};
		const statuses: Record<string, unknown> = {};
		for (const verb of ["settle", "expire"]) {
			const open = await tip(); // a fresh open tip for each, so the first can't close it for the second
			expect(await offered(open.id)).toEqual([]);
			toasts[verb] = (await act("invoice_action", `${verb}:${open.id}`)).toast?.type;
			statuses[verb] = (await byId(open.id)).status;
		}
		expect({ toasts, statuses }).toEqual({ toasts: { settle: "error", expire: "error" }, statuses: { settle: "new", expire: "new" } });
	});

	it("[F04] B2: text after a '|' in an action value acts only on the named invoice (the goods build's page position; no other row changes)", async () => {
		await site();
		const a = await reversedTip();
		const b = await reversedTip();
		const bBefore = snap(b);
		expect((await act("invoice_action", `expire:${a.id}|${b.id}`)).toast?.type).toBe("success");
		expect(await byId(a.id)).toMatchObject({ status: "expired", adminFinal: true });
		expect(snap(await byId(b.id))).toBe(bBefore);
		const res = await act("invoice_action", `settle:${b.id}|${"x".repeat(1000)}`);
		expect(Array.isArray(res.blocks)).toBe(true);
	});

	it("[F04] B2: settle and expire racing on one review item: exactly one wins, and the stored state is the winner's", async () => {
		await site();
		const inv = await reversedTip();
		const results = await Promise.all([act("invoice_action", `settle:${inv.id}`), act("invoice_action", `expire:${inv.id}`), act("invoice_action", `settle:${inv.id}`), act("invoice_action", `expire:${inv.id}`)]);
		const wins = results.map((x, i) => [i, x.toast?.type] as const).filter(([, t]) => t === "success");
		expect(wins, JSON.stringify(results.map((x) => x.toast))).toHaveLength(1);
		const after = await byId(inv.id);
		expect(after.adminFinal).toBe(true);
		expect(after.status).toBe(wins[0][0] % 2 === 0 ? "settled" : "expired");
	});

	it("[T30] B2 observation: an admin's Mark settled on a reversed tip adds nothing to the totals, because nothing is still received", async () => {
		await site();
		const inv = await reversedTip();
		const received = async () => walk(await load()).filter((b) => b.type === "fields").flatMap((b) => b.fields as B[]).find((f) => f.label === "Received" && /XMR$/.test(String(f.value)))?.value;
		const before = await received();
		expect((await act("invoice_action", `settle:${inv.id}`)).toast?.type).toBe("success");
		expect(await byId(inv.id)).toMatchObject({ status: "settled", adminFinal: true });
		// Recorded for the report: the totals add what was received, and the reversed tip's payment is no longer reported,
		// so the admin's decision changes its status but not the total.
		expect({ before, after: await received() }).toEqual({ before: "0 XMR", after: "0 XMR" });
	});
});

describe("B2: confirmations can't be lowered from the admin page", () => {
	it("[T07] B2: forged raise values with numbers never lower required, and never change a tip's status", async () => {
		await site();
		const open = await tip();
		const required = open.required as number;
		for (const v of [`raise:${open.id}`, `raise:${open.id}:0`, `raise:${open.id}:-1`, `raise:${open.id}:1`, `raise:${open.id}|0`, `raise:${open.id}:1e3`, `raise:${open.id}:NaN`, `raise:${open.id}:99999999999999999999`, `lower:${open.id}`, `raise:${open.id}:${required - 1}`]) {
			await act("invoice_action", v);
			const now = await byId(open.id);
			expect(now.required, v).toBeGreaterThanOrEqual(required);
			expect(now.status, v).toBe("new");
		}
	});

	it("[T07] B2: saving a faster speed (and hostile settings values) never lowers required on open tips", async () => {
		await site();
		expect((await r().host.admin.submit(PAGE, "save_settings", { currency: "USD", speed: "strict" })).toast?.type).toBe("success");
		const open = await tip();
		const required = open.required as number;
		expect((await r().host.admin.submit(PAGE, "save_settings", { currency: "USD", speed: "fast" })).toast?.type).toBe("success");
		expect((await byId(open.id)).required).toBe(required);
		expect((await tip()).required, "a new tip takes the new speed").toBeLessThanOrEqual(required);
		// The form's values pushed past its options; extra fields that name stored state.
		const bad: B[] = [
			{ currency: "USD", speed: "FAST" }, { currency: "USD", speed: "fast " }, { currency: "USD", speed: ["fast"] }, { currency: "USD", speed: { toString: "fast" } },
			{ currency: "USD", speed: "__proto__" }, { currency: "XMR", speed: "fast" }, { currency: "usd", speed: "fast" }, { currency: "x".repeat(100_000), speed: "fast" }, {},
		];
		const accepted = [];
		for (const values of bad) if ((await r().host.admin.submit(PAGE, "save_settings", values)).toast?.type !== "error") accepted.push(JSON.stringify(values).slice(0, 60));
		expect(accepted).toEqual([]);
		expect((await byId(open.id)).required).toBe(required);
	});

	it("[T07][T13] B2: extra settings fields can't set the bridge key, required or the floor", async () => {
		await site();
		const open = await tip();
		const res = await r().host.admin.submit(PAGE, "save_settings", { currency: "USD", speed: "standard", bridgePublicKey: PUBLIC_KEYS.test2, required: 0, minAtomic: "1", poolTarget: 1_000_000, __proto__: { speed: "fast" } });
		// Saving the two real fields may succeed; the extras must do nothing.
		expect(["success", "error"]).toContain(res.toast?.type);
		expect(await r().host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test1);
		expect((await byId(open.id)).required).toBe(open.required);
		expect((await tip()).minAtomic).toBe(open.minAtomic);
	});
});

describe("B2: pairing codes in a tight loop", () => {
	const pairBody = (code: string) => ({ addresses: [], snapshots: [], pair: { code, publicKey: PUBLIC_KEYS.test2 } });

	it("[T13] B2: 200 Connect presses in a row keep one pairing record; only the newest code pairs", { timeout: 60_000 }, async () => {
		await site(1);
		const codes: string[] = [];
		for (let i = 0; i < 200; i++) codes.push(codeFrom((await act("connect_wallet_host")).blocks as B[]) as string);
		expect(new Set(codes).size).toBe(200);
		const kv = (await r().host.inspect.kv.list()) as B[];
		expect(kv.filter((k) => String(k.id).startsWith("state:pairing"))).toHaveLength(1);
		for (const old of [codes[0], codes[100], codes[198]]) expect(ok(await r().sync(pairBody(old), { key: "test2" })), "an older code paired").toBe(false);
		expect(await r().host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test1);
		expect(ok(await r().sync(pairBody(codes[199]), { key: "test2" }))).toBe(true);
		expect(await r().host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test2);
	});

	it("[T13] B2: 20 presses at the same moment leave at most one code that pairs", async () => {
		await site(1);
		const pages = await Promise.all(Array.from({ length: 20 }, () => act("connect_wallet_host")));
		const codes = pages.map((p) => codeFrom(p.blocks as B[])).filter((c): c is string => typeof c === "string");
		const pairedWith: string[] = [];
		for (const code of codes) if (ok(await r().sync(pairBody(code), { key: "test2" }))) pairedWith.push(code);
		expect(pairedWith.length).toBeLessThanOrEqual(1);
	});
});

describe("B2: the other buttons pushed around", () => {
	it("[F04] B2: review paging with hostile cursors renders a page, never a crash", async () => {
		await site();
		await reversedTip();
		const failed: string[] = [];
		for (const value of [{ start: -1 }, { start: -1e308 }, { start: 1e308 }, { start: 1.5 }, { start: "0" }, { start: null }, { start: {} }, { start: [12] }, { start: 2 ** 53 }, "x", [], null, 7, { start: 12, extra: "y".repeat(100_000) }]) {
			const res = await act("review_page", value).catch((e: unknown) => ({ thrown: String(e) }) as B);
			if (!Array.isArray(res.blocks)) failed.push(`${JSON.stringify(value).slice(0, 50)} -> ${JSON.stringify(res).slice(0, 120)}`);
		}
		expect(failed).toEqual([]);
	});

	it("[F04] B2: Get a test address pressed 30 times leaves one open test invoice, not 30 claimed addresses", async () => {
		await site(8);
		const toasts: B[] = [];
		for (let i = 0; i < 30; i++) toasts.push((await act("get_test_address")).toast ?? {});
		const pool = await r().pool();
		const claimed = pool.filter((p) => p.status !== "free").length;
		expect(claimed, JSON.stringify(toasts.slice(0, 3))).toBeLessThanOrEqual(1);
	});

	it("[F04] B2: Check again and Connect with junk values do their normal thing and nothing else", async () => {
		await site(1);
		const before = JSON.stringify(await r().invoices());
		for (const value of ["x".repeat(100_000), { start: -1 }, null, ["a"], 1e308]) {
			expect(Array.isArray((await act("check_again", value)).blocks)).toBe(true);
		}
		expect(JSON.stringify(await r().invoices())).toBe(before);
		expect(await r().host.inspect.setting("bridgePublicKey")).toBe(PUBLIC_KEYS.test1);
	});
});
