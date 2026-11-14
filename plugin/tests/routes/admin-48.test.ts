// Spec change 48 on the site: the bridge's circuit breaker and failed save, on the wire and on Health (RT-32).
import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { parseSyncBody } from "../../src/sync/protocol";
import { KEY_IDS, PUBLIC_KEYS } from "../sync/helpers";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

type B = Record<string, any>;
const H0 = 3_000_000;
const KRAKEN = "https://api.kraken.com/0/public/Ticker?pair=XMRUSD";
const TITLE = "The wallet host stopped adding addresses";
const BAD = "It found a problem with an address it had just created, so it stopped rather than keep repeating.";
const MANY = "It created far more addresses than tips have used, so it stopped rather than keep going.";
const AFTER = "To restart it, run sudo systemctl restart xmr-bridge on the wallet host. If it stops again, its log has the details: sudo journalctl -u xmr-bridge";

async function setup(checks: B, free: number) {
	const h = await createPluginRuntimeTestHost();
	host = h;
	await h.fixtures.plugin.setting("bridgePublicKey", PUBLIC_KEYS.test1);
	await h.fixtures.plugin.kv("state:network", { network: "stagenet", keyId: KEY_IDS.test1 });
	await h.fixtures.plugin.kv("state:bridge", { height: H0, lastSyncAt: Date.now() - 30_000, lastHeardAt: Date.now() - 30_000, version: 1, outdated: false, checks });
	await h.fixtures.plugin.kv("state:setupDone", true);
	for (let i = 1; i <= free; i++) await h.fixtures.plugin.storage("pool", String(i), { addrIndex: i, address: `7free${i}`, status: "free", addedAt: 1 });
	await h.http.respond(KRAKEN, new Response(JSON.stringify({ error: [], result: { XXMRZUSD: { c: ["150.00", "1.0"] } } })));
	return h;
}
const banners = async () => ((await (host as PluginRuntimeTestHost).admin.loadPage("/payments")).blocks as B[]).filter((b) => b.type === "banner").map((b) => ({ variant: b.variant, title: b.title, description: b.description }));

describe("the circuit breaker on Health", () => {
	it("[R08] [RT-32] bad_created: Wyatt's text, with the free count", async () => {
		await setup({ topUp: { state: "stopped", reason: "bad_created" } }, 3);
		expect(await banners()).toContainEqual({ variant: "error", title: TITLE, description: `${BAD} Payments are still tracked. Tips keep working for now: 3 free addresses are left. ${AFTER}` });
	});
	it("[F08] [RT-32] too_many: Wyatt's text", async () => {
		await setup({ topUp: { state: "stopped", reason: "too_many" } }, 2);
		expect(await banners()).toContainEqual({ variant: "error", title: TITLE, description: `${MANY} Payments are still tracked. Tips keep working for now: 2 free addresses are left. ${AFTER}` });
	});
	it("[R08] [RT-32] one free address: singular", async () => {
		await setup({ topUp: { state: "stopped", reason: "too_many" } }, 1);
		expect(await banners()).toContainEqual({ variant: "error", title: TITLE, description: `${MANY} Payments are still tracked. Tips keep working for now: 1 free address is left. ${AFTER}` });
	});
	it("[R08] [RT-32] no free addresses: Wyatt's text, which stays true on a site with a fallback address", async () => {
		await setup({ topUp: { state: "stopped", reason: "too_many" } }, 0);
		expect(await banners()).toContainEqual({ variant: "error", title: TITLE, description: `${MANY} Payments are still tracked. No free addresses are left, so Coffer can't take new tips. ${AFTER}` });
	});
	it("[R08] [RT-32] no banner while top-ups run", async () => {
		await setup({}, 3);
		expect((await banners()).map((b) => b.title)).not.toContain(TITLE);
	});
});

describe("a failed save on Health", () => {
	it("[R08] [RT-32] an amber line saying what it risks and where to look", async () => {
		await setup({ save: { state: "failed" } }, 3);
		expect(await banners()).toContainEqual({ variant: "alert", title: "The wallet host can't save its wallet", description: "Payments are still tracked, and it keeps trying. Until a save works, a crash could make it forget new addresses and then wrongly report them as not from your wallet. Check that the wallet host's disk isn't full (df -h). Details are in its log; on the wallet host, run: sudo journalctl -u xmr-bridge" });
	});
});

describe("on the wire", () => {
	const body = (checks: unknown) => JSON.stringify({ v: 1, seq: 1, height: H0, addresses: [], snapshots: [], checks });
	const parsed = (checks: unknown) => {
		const r = parseSyncBody(body(checks));
		if (!r.ok) throw new Error("the body was refused");
		return r.value.checks;
	};
	it("[R08] [RT-32] both reasons and the failed save are kept", () => {
		expect(parsed({ topUp: { state: "stopped", reason: "too_many" } })).toEqual({ topUp: { state: "stopped", reason: "too_many" } });
		expect(parsed({ topUp: { state: "stopped", reason: "bad_created" } })).toEqual({ topUp: { state: "stopped", reason: "bad_created" } });
		expect(parsed({ save: { state: "failed" } })).toEqual({ save: { state: "failed" } });
	});
	it("[R08] [RT-32] anything malformed is dropped, never a reason to refuse the body", () => {
		expect(parsed({ topUp: { state: "stopped", reason: "because" } })).toBeUndefined();
		expect(parsed({ topUp: { state: "running", reason: "too_many" } })).toBeUndefined();
		expect(parsed({ topUp: "stopped" })).toBeUndefined();
		expect(parsed({ save: { state: "maybe" } })).toBeUndefined();
	});
});
