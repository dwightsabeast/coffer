// Phase 07b: run the sandbox canary's probes on the dev site (catalog G1 and G2). Dev only. Load the canary first
// (scripts/redteam/canary-site.mjs on, then start the site).
//
//   node scripts/redteam/canary.mjs [--site <loopback URL>]           every probe, one line each
//   node scripts/redteam/canary.mjs --spin <seconds> [--site ...]    the CPU spin, timing Coffer's status route meanwhile
//
// Prints what each probe reported; the canary never grades and neither does this script, except that the exit code is
// 1 when any probe came back "allowed" or reached the listener, so a run in a loop stands out. Output is also saved
// under ~/xmr-pay-dev-data/redteam/.
//
// The network probes aim at a listener this script runs on 127.0.0.1 and [::1] (one port, both addresses), so a
// request that escapes the sandbox is recorded here, by path, and reaches no other machine.
import { appendFileSync } from "node:fs";
import { createServer } from "node:http";

import { DEFAULT_SITE, evidencePath, loopbackUrl, route, send } from "./lib.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
};
const site = loopbackUrl(value("--site", DEFAULT_SITE));
const spin = value("--spin", null);
const canary = (name) => new URL(`/_emdash/api/plugins/coffer-canary/${name}`, site).href;
const out = evidencePath(`canary-${new Date().toISOString().replace(/[:.]/g, "")}.txt`);
const say = (line) => {
	console.log(line);
	appendFileSync(out, line + "\n", { mode: 0o600 });
};

say(`# sandbox canary on ${site.origin}, ${new Date().toISOString()}`);
if (spin === null) {
	const reached = [];
	const listen = (host, port) =>
		new Promise((ok, fail) => {
			const s = createServer((req, res) => {
				reached.push(req.url);
				res.end("canary listener\n");
			});
			s.once("error", fail);
			s.listen(port, host, () => ok(s));
		});
	const v4 = await listen("127.0.0.1", 0);
	const port = v4.address().port;
	const v6 = await listen("::1", port).catch(() => null);
	try {
		const list = await send(canary("probes"), { method: "GET" });
		if (!Array.isArray(list.data?.probes)) throw new Error(`the canary isn't answering (${list.status} ${list.text.slice(0, 120)}); is it on and the site started?`);
		let allowed = 0;
		for (const name of list.data.probes) {
			const before = reached.length;
			const r = await send(canary("probe"), { body: JSON.stringify({ name, port }), headers: { "content-type": "application/json" } });
			const outcome = r.data?.outcome ?? `no answer (HTTP ${r.status}${r.code ? `, ${r.code}` : ""})`;
			const got = reached.length > before ? `  [the listener got ${reached.slice(before).join(", ")}]` : "";
			if (outcome === "allowed" || got) allowed++;
			say(`[T01] ${name.padEnd(24)} ${outcome === "allowed" ? "ALLOWED " : outcome.padEnd(8)}  ${r.data?.message ?? r.text.slice(0, 160)}${got || (outcome === "answered" ? "  [the listener got nothing]" : "")}`);
		}
		say(`${list.data.probes.length} probes, ${allowed} allowed or reached the listener (port ${port}${v6 ? ", 127.0.0.1 and [::1]" : ", 127.0.0.1 only"})`);
		process.exitCode = allowed === 0 ? 0 : 1;
	} finally {
		v4.close();
		v6?.close();
	}
} else {
	// G2: does the runner stop a spinning route, and does the site keep answering meanwhile?
	const seconds = Number(spin);
	if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120) throw new Error("--spin takes 1 to 120 seconds");
	const started = performance.now();
	const spinning = send(`${canary("spin")}?seconds=${seconds}`, { method: "GET" }).then(
		(r) => ({ r, ms: performance.now() - started }),
		(err) => ({ err, ms: performance.now() - started }),
	);
	let done = false;
	spinning.then(() => (done = true));
	const lat = [];
	while (!done) {
		const t = performance.now();
		const r = await send(`${route(site, "status")}?token=${"A".repeat(22)}`, { method: "GET" }).catch((err) => ({ status: 0, code: err.message }));
		lat.push({ ms: performance.now() - t, ok: r.code === "INVOICE_NOT_FOUND" });
		await new Promise((res) => setTimeout(res, 1000));
	}
	const s = await spinning;
	const sorted = lat.map((l) => l.ms).sort((a, b) => a - b);
	say(`[T01][R11] spin ${seconds} s: ${s.err ? `request failed after ${Math.round(s.ms)} ms (${s.err.message})` : `HTTP ${s.r.status} after ${Math.round(s.ms)} ms: ${s.r.text.slice(0, 160)}`}`);
	say(`[T01][R11] status meanwhile: ${lat.length} requests, ${lat.filter((l) => l.ok).length} answered INVOICE_NOT_FOUND, median ${Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0)} ms, max ${Math.round(sorted.at(-1) ?? 0)} ms`);
}
say(`saved to ${out}`);
