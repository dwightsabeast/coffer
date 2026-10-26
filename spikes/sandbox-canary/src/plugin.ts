import { type PluginContext, type SandboxedPlugin, pluginRoute } from "emdash/plugin";

/**
 * Phase 07b sandbox canary (catalog rows G1 and G2, matrix T01 and R11). A second plugin with Coffer's exact manifest
 * that tries what the sandbox must stop. Each probe reports what happened and never grades it: scripts/redteam/canary.mjs
 * prints the results and the attacker judges them. Probes report counts and error messages only, never what another
 * plugin stores.
 *
 * Never shipped. Loaded on the dev site only while its probes run (scripts/redteam/canary-site.mjs on|off).
 */

type Outcome = { outcome: "refused" | "allowed" | "ok"; message: string };
const refused = (err: unknown): Outcome => ({ outcome: "refused", message: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err).slice(0, 200) });
const allowed = (message: string): Outcome => ({ outcome: "allowed", message });

/** Fetch through ctx.http: "allowed" if any response comes back, whatever its status. */
async function viaHttp(ctx: PluginContext, url: string): Promise<Outcome> {
	if (!ctx.http) return { outcome: "refused", message: "no ctx.http" };
	try {
		const res = await ctx.http.fetch(url);
		return allowed(`HTTP ${res.status} from ${url}`);
	} catch (err) {
		return refused(err);
	}
}

const PROBES: Record<string, (ctx: PluginContext) => Promise<Outcome>> = {
	ping: async (ctx) => ({ outcome: "ok", message: `${ctx.plugin.id} ${ctx.plugin.version}` }),

	// Network: only the two price hosts, only through ctx.http.
	"raw-fetch": async () => {
		try {
			const res = await fetch("https://example.com/");
			return allowed(`global fetch answered HTTP ${res.status}`);
		} catch (err) {
			return refused(err);
		}
	},
	"http-other-host": (ctx) => viaHttp(ctx, "https://example.com/"),
	"http-userinfo": (ctx) => viaHttp(ctx, "https://api.kraken.com@example.com/"),
	"http-suffix": (ctx) => viaHttp(ctx, "https://api.kraken.com.example.com/"),
	"http-loopback": (ctx) => viaHttp(ctx, "http://127.0.0.1:4321/"),
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
	"undeclared-apis": async (ctx) => {
		const present = (["users", "email", "media", "comments", "redirects", "taxonomies", "bylines", "schema"] as const).filter((k) => ctx[k] !== undefined);
		const risky = present.filter((k) => k === "users" || k === "email" || k === "media" || k === "comments");
		return risky.length > 0 ? allowed(`ctx carries ${present.join(", ")}`) : { outcome: "refused", message: present.length ? `ctx carries only ${present.join(", ")}` : "none of users, email, media, comments, redirects, taxonomies, bylines, schema" };
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
				const name = (routeCtx.input as { name?: unknown } | null)?.name;
				const run = typeof name === "string" && Object.hasOwn(PROBES, name) ? PROBES[name] : undefined;
				if (!run) return { error: { code: "UNKNOWN_PROBE" } };
				return { probe: name, ...(await run(ctx)) };
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
