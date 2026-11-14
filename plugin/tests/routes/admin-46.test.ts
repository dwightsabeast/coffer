// Spec change 46 on the admin page (item 1's banner, item 2's lines, D3's Health field and D4's wording), through the
// runtime host's admin helpers, which also validate every Block Kit response.
import { afterEach, describe, expect, it } from "vitest";

import { createPluginRuntimeTestHost, type PluginRuntimeTestHost } from "@emdash-cms/plugin-test";

import { KEY_IDS, PUBLIC_KEYS } from "../sync/helpers";

let host: PluginRuntimeTestHost | undefined;
afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

type B = Record<string, any>;
const H0 = 3_000_000;
const KRAKEN = "https://api.kraken.com/0/public/Ticker?pair=XMRUSD";
const utc = (ms: number) => `${new Date(ms).toISOString().slice(11, 16)} UTC`;

async function setup(kv: Record<string, unknown> = {}) {
	const h = await createPluginRuntimeTestHost();
	host = h;
	await h.fixtures.plugin.setting("bridgePublicKey", PUBLIC_KEYS.test1);
	await h.fixtures.plugin.kv("state:network", { network: "stagenet", keyId: KEY_IDS.test1 });
	await h.fixtures.plugin.kv("state:bridge", { height: H0, lastSyncAt: Date.now() - 30_000, lastHeardAt: Date.now() - 30_000, version: 1, outdated: false });
	await h.fixtures.plugin.kv("state:setupDone", true);
	for (const [k, v] of Object.entries(kv)) await h.fixtures.plugin.kv(k, v);
	await h.http.respond(KRAKEN, new Response(JSON.stringify({ error: [], result: { XXMRZUSD: { c: ["150.00", "1.0"] } } })));
	return h;
}
const load = async () => (await (host as PluginRuntimeTestHost).admin.loadPage("/payments")).blocks as B[];
const banners = (blocks: B[]) => blocks.filter((b) => b.type === "banner").map((b) => ({ variant: b.variant ?? "default", title: b.title as string, description: b.description as string }));
const field = (blocks: B[], label: string) => blocks.find((b) => b.type === "fields" && b.block_id === "health")?.fields.find((f: B) => f.label === label)?.value as string | undefined;

const MISMATCH = {
	variant: "error",
	title: "Coffer found addresses on this site that aren't from your wallet",
	description: "Someone may have your wallet host's key. Payments to those addresses don't reach you, so Coffer has stopped handing them out. Connect a new wallet host now (in Settings), on a machine you trust, then check Needs a decision.",
};

describe("spec change 46 on the admin page", () => {
	it("[T03][R08] a pool mismatch: the red banner, first", async () => {
		const at = Date.now() - 60_000;
		await setup({ "state:poolCheck": { mismatch: { at, keyId: KEY_IDS.test1 }, lastOkAt: Date.now() - 5000 } });
		const b = await load();
		expect(banners(b)[0]).toEqual(MISMATCH);
		expect(field(b, "Address check")).toBe(`Failed at ${utc(at)}`);
	});

	it("[T03] the address check field: OK with when, or never for a wallet host that doesn't check yet", async () => {
		await setup({ "state:poolCheck": { lastOkAt: Date.now() - 5000 } });
		let b = await load();
		expect(field(b, "Address check")).toBe("OK, less than a minute ago");
		expect(banners(b).some((x) => x.title === MISMATCH.title)).toBe(false);
		await host?.dispose();
		host = undefined;
		await setup();
		b = await load();
		expect(field(b, "Address check")).toBe("Never (your wallet host doesn't check yet; run xmr-bridge update)");
	});

	it("[T03][R08] the site refusing the wallet host's updates: red, with the code and since when", async () => {
		const since = Date.now() - 120_000;
		await setup({ "state:refused": { code: "SEQ_OUT_OF_RANGE", since, at: Date.now() - 10_000 } });
		expect(banners(await load())).toContainEqual({
			variant: "error",
			title: "The site is refusing your wallet host's updates",
			description: `Since ${utc(since)}, with SEQ_OUT_OF_RANGE. On the wallet host, run: sudo xmr-bridge status --config /etc/xmr-bridge/config`,
		});
	});

	it("[T03][R08] the previous wallet host still running (D4): a plain line with the pairing time, for a day", async () => {
		const pairedAt = Date.now() - 3_600_000;
		await setup({ "state:lastPairing": { at: pairedAt, replaced: true }, "state:previousSeen": { at: Date.now() - 30_000 } });
		const t = utc(pairedAt);
		expect(banners(await load())).toContainEqual({
			variant: "default",
			title: "Your previous wallet host is still running",
			description: `Your previous wallet host is still contacting this site; its updates are refused. If you moved to a new wallet host at ${t}, shut the old one down (on it: sudo systemctl disable --now xmr-bridge). If you re-paired the same one, leave it running: someone else has the old key, and the re-pair already locked them out. If you didn't connect a wallet host at ${t}, someone else did: connect yours again now.`,
		});
		await host?.dispose();
		host = undefined;
		await setup({ "state:lastPairing": { at: pairedAt, replaced: true }, "state:previousSeen": { at: Date.now() - 25 * 3_600_000 } });
		expect(banners(await load()).some((x) => x.title === "Your previous wallet host is still running")).toBe(false);
	});
});
