import { type PluginContext, type SandboxedPlugin, pluginRoute } from "emdash/plugin";

/**
 * Phase 07b sandbox canary (catalog rows G1 and G2, matrix T01 and R11). A second plugin with Coffer's exact manifest
 * that tries what the sandbox must stop. Each probe reports what happened and never grades it: scripts/redteam/canary.mjs
 * prints the results and the attacker judges them. Probes report counts and error messages only, never what another
 * plugin stores.
 *
 * The network probes aim at a listener the driver runs on this box (127.0.0.1:<port>, passed in the request), so a
 * request that gets out is recorded there and nothing reaches another machine. The one exception is plain http to an
 * allowed price host, which Coffer contacts anyway.
 *
 * Never shipped. Loaded on the dev site only while its probes run (scripts/redteam/canary-site.mjs on|off).
 */

/** "answered": a reply came back, but from what isn't known here; the driver's listener says whether anything got out. */
type Outcome = { outcome: "refused" | "allowed" | "answered" | "ok"; message: string };
const refused = (err: unknown): Outcome => ({ outcome: "refused", message: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err).slice(0, 200) });
const allowed = (message: string): Outcome => ({ outcome: "allowed", message });
const snippet = async (res: Response) => JSON.stringify((await res.text().catch(() => "")).slice(0, 80));

/** Fetch through ctx.http: "allowed" if any response comes back, whatever its status. */
async function viaHttp(ctx: PluginContext, url: string): Promise<Outcome> {
	if (!ctx.http) return { outcome: "refused", message: "no ctx.http" };
	try {
		const res = await ctx.http.fetch(url);
		return allowed(`HTTP ${res.status} from ${url}: ${await snippet(res)}`);
	} catch (err) {
		return refused(err);
	}
}

const PROBES: Record<string, (ctx: PluginContext, port: number) => Promise<Outcome>> = {
	ping: async (ctx) => ({ outcome: "ok", message: `${ctx.plugin.id} ${ctx.plugin.version}` }),

	// Network: only the two price hosts, only through ctx.http.
	"raw-fetch": async (_ctx, port) => {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/raw-fetch`);
			return { outcome: "answered", message: `global fetch returned HTTP ${res.status}: ${await snippet(res)}` };
		} catch (err) {
			return refused(err);
		}
	},
	"http-other-host": (ctx, port) => viaHttp(ctx, `http://127.0.0.1:${port}/http-other-host`),
	"http-userinfo": (ctx, port) => viaHttp(ctx, `http://api.kraken.com@127.0.0.1:${port}/http-userinfo`),
	"http-suffix": (ctx, port) => viaHttp(ctx, `http://api.kraken.com.localhost:${port}/http-suffix`),
	"http-plain-allowed-host": (ctx) => viaHttp(ctx, "http://api.kraken.com/0/public/Time"),

	// Content: read only.
	"content-create": async (ctx) => {
		const content = ctx.content as { create?: (collection: string, data: unknown) => Promise<unknown> } | undefined;
		if (typeof content?.create !== "function") return { outcome: "refused", message: "ctx.content has no create" };
		try {
			await content.create("posts", { slug: "canary-probe", status: "draft", data: { title: "canary probe" } });
			return allowed("ctx.content.create succeeded (a draft post 'canary-probe' now exists)");
		} catch (err) {
			return refused(err);
		}
	},

	// Storage: undeclared collections throw; the declared ones are the canary's own, never Coffer's.
	"storage-undeclared": async (ctx) => {
		try {
			const coll = (ctx.storage as Record<string, { get(id: string): Promise<unknown> } | undefined>).secrets;
			if (coll === undefined) return { outcome: "refused", message: "ctx.storage.secrets is undefined" };
			await coll.get("x");
			return allowed("ctx.storage.secrets.get answered");
		} catch (err) {
			return refused(err);
		}
	},
	"storage-coffer-rows": async (ctx) => {
		try {
			const storage = ctx.storage as Record<string, { count(where?: unknown): Promise<number> }>;
			const [invoices, pool] = [await storage.invoices.count(), await storage.pool.count()];
			const seen = invoices + pool;
			return seen > 0 ? allowed(`the canary sees ${invoices} invoice and ${pool} pool rows it never wrote`) : { outcome: "refused", message: "own collections empty (0 invoice, 0 pool rows)" };
		} catch (err) {
			return refused(err);
		}
	},
	"kv-coffer-keys": async (ctx) => {
		try {
			const keys = (await ctx.kv.list()).map((e) => e.key);
			const coffer = keys.filter((k) => k.startsWith("state:") || k.startsWith("settings:"));
			return coffer.length > 0 ? allowed(`the canary's KV lists ${coffer.length} key(s) shaped like Coffer's`) : { outcome: "refused", message: `KV lists ${keys.length} key(s), none of Coffer's` };
		} catch (err) {
			return refused(err);
		}
	},
	"settings-coffer-key": async (ctx) => {
		try {
			const v = await ctx.settings.get("bridgePublicKey");
			return v === null || v === undefined ? { outcome: "refused", message: "no bridgePublicKey setting visible" } : allowed("Coffer's bridgePublicKey setting is visible to another plugin");
		} catch (err) {
			return refused(err);
		}
	},

	// The runtime: no environment, no Node built-ins, no APIs the manifest didn't ask for.
	"process-env": async () => {
		const proc = (globalThis as { process?: { env?: Record<string, unknown> } }).process;
		const n = proc?.env ? Object.keys(proc.env).length : 0;
		return n > 0 ? allowed(`process.env has ${n} variable(s)`) : { outcome: "refused", message: proc ? "process exists, env empty" : "no process" };
	},
	"node-builtin": async () => {
		const name = ["node", "fs"].join(":"); // computed, so the bundler can't resolve it at build time
		try {
			const fs = (await import(/* @vite-ignore */ name)) as { readdirSync?: (p: string) => string[] };
			const entries = typeof fs.readdirSync === "function" ? fs.readdirSync("/").length : -1;
			return allowed(`imported ${name}${entries >= 0 ? `; readdirSync("/") listed ${entries} entries` : ""}`);
		} catch (err) {
			return refused(err);
		}
	},
	// G1 follow-up (07b round 1): does a write method under content:read actually DO something, or only exist? One
	// confirming write at most (Wyatt, 2026-10-26). createTerm is the most reversible write; a term named so it's easy
	// to find and delete. "allowed" here means the sandbox let a write through under a read-only capability.
	"taxonomy-write": async (ctx) => {
		const tax = ctx.taxonomies as { createTerm?: (...a: unknown[]) => Promise<unknown> } | undefined;
		if (typeof tax?.createTerm !== "function") return { outcome: "refused", message: "ctx.taxonomies has no createTerm" };
		try {
			const r = await tax.createTerm({ taxonomy: "tags", name: "coffer-canary-write-probe", slug: "coffer-canary-write-probe" });
			return allowed(`ctx.taxonomies.createTerm succeeded under content:read: ${JSON.stringify(r).slice(0, 120)}`);
		} catch (err) {
			return refused(err);
		}
	},

	// Which context APIs exist, and which of their methods write. content:read may bring read access to more than
	// content (media, taxonomies); a method that writes, or users, email or comments at all, would be beyond the manifest.
	"undeclared-apis": async (ctx) => {
		const WRITES = new Set(["create", "update", "delete", "upload", "getUploadUrl", "updateMetadata", "createTerm", "addEntryTerms", "removeEntryTerms", "send", "moderate", "set", "publish"]);
		const parts: string[] = [];
		let beyond = false;
		for (const k of ["content", "media", "taxonomies", "bylines", "schema", "redirects", "users", "email", "comments"] as const) {
			const api = ctx[k] as Record<string, unknown> | undefined;
			if (api === undefined) continue;
			const methods = Object.keys(api).filter((m) => typeof api[m] === "function");
			const writes = methods.filter((m) => WRITES.has(m));
			if (writes.length > 0 || k === "users" || k === "email" || k === "comments") beyond = true;
			parts.push(`${k} (${methods.join(", ")}${writes.length ? `; writes: ${writes.join(", ")}` : ""})`);
		}
		const message = parts.length ? `ctx carries ${parts.join("; ")}` : "no optional context APIs";
		return beyond ? allowed(message) : { outcome: "refused", message: `${message}; none writes` };
	},
};

const plugin: SandboxedPlugin = {
	routes: {
		probes: pluginRoute({
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			handler: async () => ({ probes: Object.keys(PROBES) }),
		}),
		probe: pluginRoute({
			public: true,
			methods: ["POST"],
			request: { body: "json", maxBytes: 1024 },
			handler: async (routeCtx, ctx) => {
				const { name, port } = (routeCtx.input ?? {}) as { name?: unknown; port?: unknown };
				const run = typeof name === "string" && Object.hasOwn(PROBES, name) ? PROBES[name] : undefined;
				if (!run) return { error: { code: "UNKNOWN_PROBE" } };
				if (!Number.isInteger(port) || (port as number) < 1 || (port as number) > 65535) return { error: { code: "BAD_PORT" } };
				return { probe: name, ...(await run(ctx, port as number)) };
			},
		}),
		// G2: burn the CPU for `seconds` (1 to 120) and say how long it ran before anything stopped it.
		spin: pluginRoute({
			public: true,
			methods: ["GET"],
			request: { body: "none" },
			handler: async (routeCtx) => {
				const seconds = Number((routeCtx.input as { seconds?: unknown } | null)?.seconds ?? 0);
				if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) return { error: { code: "BAD_SECONDS" } };
				const start = Date.now();
				let x = 0;
				while (Date.now() - start < seconds * 1000) x = (x * 31 + 7) % 1_000_003;
				return { spunMs: Date.now() - start, x };
			},
		}),
	},
};

export default plugin;
