// Phase 07b: a runtime test host set up the way the attacks need it, and the requests they send. Reuses the sync
// signing (RFC 8032 test keys) and the fake addresses of the other tests.
//
// Two ways in:
// - actions.routes.request goes through EmDash's own request handling, which derives requestMeta itself: raw bodies,
//   headers, signed syncs. This is what a visitor or the bridge reaches.
// - transport.invokeRoute takes a requestMeta directly (`meta`: ip, geo, ...): for attacks on the per-client cap and the
//   Cloudflare refusal, where the test plays the host's view of who is asking.
import { createPluginRuntimeTestHost, type PluginRuntimeTestHost, type PluginTestRequest } from "@emdash-cms/plugin-test";

import { PUBLIC_KEYS, bytesOf, signedHeaders, type KeyName } from "../sync/helpers";
import { TAGS, fakeAddress } from "../addresses";

export const H0 = 3_000_000;
export const ROUTE_URL = (route: string, query = "") => `https://site.test/_emdash/api/plugins/coffer/${route}${query}`;

type Json = Record<string, any>;
export interface Reply {
	status: number;
	text: string;
	json: Json | null;
}
async function reply(res: Response): Promise<Reply> {
	const text = await res.text();
	let json: Json | null = null;
	try {
		json = JSON.parse(text) as Json;
	} catch {}
	return { status: res.status, text, json };
}

export interface SyncOptions {
	key?: KeyName;
	/** Signing time in ms (default now); the x-xmr-ts header follows it unless `ts` overrides the header alone. */
	nowMs?: number;
	ts?: string;
	/** Extra headers, added after the signature's. */
	headers?: Record<string, string>;
	/** Sign these bytes but send `send` instead (tampering after signing). */
	send?: Uint8Array<ArrayBuffer>;
	/** No x-xmr-ts or x-xmr-sig at all. */
	unsigned?: boolean;
}

export interface HostOptions {
	/** Pair with this RFC 8032 key (default test1); null leaves the site unpaired. */
	paired?: KeyName | null;
	/** Free pool rows 1..pool (default 0), stagenet subaddresses unless `poolNetwork` says otherwise. */
	pool?: number;
	poolNetwork?: keyof typeof TAGS;
	/** The last sync this long ago in ms (default 30 s); null for none. */
	lastSyncAgo?: number | null;
}

let seq = Date.now();

export async function redteamHost(o: HostOptions = {}) {
	const host: PluginRuntimeTestHost = await createPluginRuntimeTestHost();
	const pairedWith = o.paired === undefined ? "test1" : o.paired;
	if (pairedWith !== null) await host.fixtures.plugin.setting("bridgePublicKey", PUBLIC_KEYS[pairedWith]);
	const ago = o.lastSyncAgo === undefined ? 30_000 : o.lastSyncAgo;
	if (ago !== null) await host.fixtures.plugin.kv("state:bridge", { height: H0, lastSyncAt: Date.now() - ago, version: 1, outdated: false });
	const tag = TAGS[o.poolNetwork ?? "stagenet"][1];
	for (let i = 1; i <= (o.pool ?? 0); i++) await host.fixtures.plugin.storage("pool", String(i), { addrIndex: i, address: fakeAddress(tag, i, "R"), status: "free" });

	/** A sync body (v 1, the next seq, H0, empty lists unless `body` sets them) or exact bytes, signed and posted. */
	async function sync(body: Json | Uint8Array<ArrayBuffer>, opts: SyncOptions = {}): Promise<Reply> {
		const bytes = body instanceof Uint8Array ? body : bytesOf({ v: 1, seq: ++seq, height: H0, addresses: [], snapshots: [], ...body });
		const signed = opts.unsigned ? {} : await signedHeaders(bytes, opts.nowMs ?? Date.now(), opts.key ?? "test1", opts.ts);
		const res = await host.actions.routes.request("bridge/sync", {
			method: "POST",
			rawBody: opts.send ?? bytes,
			headers: { "content-type": "application/octet-stream", ...signed, ...opts.headers },
		});
		return reply(res);
	}

	/** checkout with any body: an object is sent as JSON, a string exactly as given. */
	async function checkout(body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
		const raw = typeof body === "string" ? body : JSON.stringify(body);
		return reply(await host.actions.routes.request("checkout", { method: "POST", rawBody: raw, headers: { "content-type": "application/json", ...headers } }));
	}

	/** checkout through the transport, with the requestMeta the host would have derived (ip, geo, ...). */
	function checkoutAs(meta: NonNullable<PluginTestRequest["meta"]>, body: unknown, request: Omit<PluginTestRequest, "meta"> = {}) {
		return host.transport.invokeRoute("checkout", body, { ...request, meta });
	}

	/** status for a token, sent exactly as given in the query string (encode it yourself to test encodings). */
	async function status(rawToken: string, headers: Record<string, string> = {}): Promise<Reply> {
		return reply(await host.actions.routes.request("status", { method: "GET", url: ROUTE_URL("status", `?token=${rawToken}`), headers }));
	}

	/** A Kraken price for the next rate fetch (the plugin asks Kraken first). */
	async function price(pair: "USD" | "EUR", value: string) {
		await host.http.respond(`https://api.kraken.com/0/public/Ticker?pair=XMR${pair}`, new Response(JSON.stringify({ error: [], result: { [`XXMRZ${pair}`]: { c: [value, "1.0"] } } })));
	}

	const invoices = async () => (await host.inspect.storage.list<Json>("invoices")).map((r) => r.data);
	const pool = async () => (await host.inspect.storage.list<Json>("pool")).map((r) => r.data);

	return { host, sync, checkout, checkoutAs, status, price, invoices, pool };
}

export type RedteamHost = Awaited<ReturnType<typeof redteamHost>>;
