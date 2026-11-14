// Phase 07b pass 1, round 1 (black box): L2, the per-client cap against spoofed client-IP headers, at the Host layer.
// EmDash derives requestMeta.ip itself; the test host's request path plays a Node site with no trusted proxy headers.
// The dev-site half (EmDash's real header handling, and the tip endpoint that forwards the visitor's headers) is in
// scripts/redteam/round1-live.mjs.
import { afterEach, describe, expect, it } from "vitest";

import { type RedteamHost, type Reply, redteamHost } from "./harness";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const PER_CLIENT = 5; // seen in round 1: the sixth open tip from one client is refused
const outcome = (r: unknown) => {
	const v = ((r as Reply).json ? (r as Reply).json?.data : r) as B;
	return (v?.error?.code as string | undefined) ?? (v?.token ? "ok" : JSON.stringify(v));
};
const SPOOF = ["x-forwarded-for", "cf-connecting-ip", "x-real-ip", "true-client-ip", "x-client-ip", "fastly-client-ip", "x-cluster-client-ip", "forwarded"];
const spoofed = (ip: string) => Object.fromEntries(SPOOF.map((k) => [k, k === "forwarded" ? `for=${ip}` : ip]));

describe("L2: client-IP headers", () => {
	it("[T18][T05] L2: headers a visitor sets never become the client IP: no per-client bucket is made from them", async () => {
		h = await redteamHost({ pool: 20 });
		const codes: string[] = [];
		for (let i = 0; i < PER_CLIENT + 3; i++) codes.push(outcome(await h.checkout({ kind: "tip" }, spoofed("198.51.100.7"))));
		expect(codes).toEqual(Array(PER_CLIENT + 3).fill("ok"));
		expect(await h.host.inspect.kv.get("state:buckets")).toBeFalsy();
	});

	it("[T18][T05] L2: with the IP known, one client is held to its own cap and can't fill another's bucket", async () => {
		h = await redteamHost({ pool: 30 });
		const a = { ip: "198.51.100.7" } as never;
		const b = { ip: "198.51.100.8" } as never;
		const codes: string[] = [];
		for (let i = 0; i < PER_CLIENT + 2; i++) codes.push(outcome(await h.checkoutAs(a, { kind: "tip" })));
		expect(codes).toEqual([...Array(PER_CLIENT).fill("ok"), "TOO_MANY_OPEN", "TOO_MANY_OPEN"]);
		expect(outcome(await h.checkoutAs(b, { kind: "tip" }))).toBe("ok");
	});

	it("[T18][T05] [RT-05] L2: an IPv6 visitor can't dodge the cap by moving to another address in their own /64", async () => {
		// An ISP hands each IPv6 customer at least a /64, so one visitor controls 2^64 addresses.
		h = await redteamHost({ pool: 30 });
		for (let i = 0; i < PER_CLIENT; i++) expect(outcome(await h.checkoutAs({ ip: `2001:db8:1:2::${i + 1}` } as never, { kind: "tip" }))).toBe("ok");
		const next = outcome(await h.checkoutAs({ ip: "2001:db8:1:2:ffff::9" } as never, { kind: "tip" }));
		expect(next).toBe("TOO_MANY_OPEN");
	});

	it("[T18][T05] [RT-05] L2: another /64 has its own bucket, and one address in any spelling has one", async () => {
		h = await redteamHost({ pool: 30 });
		// One address, five spellings (spec change 52): compressed, full, upper case, bracketed, with a zone.
		const spellings = ["2001:db8:1:2::1", "2001:0db8:0001:0002:0000:0000:0000:0001", "2001:DB8:1:2::1", "[2001:db8:1:2::1]", "2001:db8:1:2::1%eth0"];
		for (const ip of spellings) expect(outcome(await h.checkoutAs({ ip } as never, { kind: "tip" })), ip).toBe("ok");
		expect(outcome(await h.checkoutAs({ ip: spellings[1] } as never, { kind: "tip" }))).toBe("TOO_MANY_OPEN");
		// The neighbouring /64 isn't held by it.
		expect(outcome(await h.checkoutAs({ ip: "2001:db8:1:3::1" } as never, { kind: "tip" }))).toBe("ok");
	});

	it("[T18][T05] [RT-05] L2: an IPv4-mapped IPv6 address shares the IPv4 address's bucket", async () => {
		h = await redteamHost({ pool: 30 });
		const forms = ["198.51.100.7", "::ffff:198.51.100.7", "::FFFF:c633:6407", "198.51.100.7", "::ffff:198.51.100.7"];
		for (const ip of forms) expect(outcome(await h.checkoutAs({ ip } as never, { kind: "tip" })), ip).toBe("ok");
		expect(outcome(await h.checkoutAs({ ip: "::ffff:198.51.100.7" } as never, { kind: "tip" }))).toBe("TOO_MANY_OPEN");
		expect(outcome(await h.checkoutAs({ ip: "198.51.100.8" } as never, { kind: "tip" }))).toBe("ok");
	});

	it("[T18][T05] [RT-05] L2: text that isn't an address still checks out, and is held to the cap as given", async () => {
		h = await redteamHost({ pool: 30 });
		for (let i = 0; i < PER_CLIENT; i++) expect(outcome(await h.checkoutAs({ ip: "not:an:address::at::all" } as never, { kind: "tip" }))).toBe("ok");
		expect(outcome(await h.checkoutAs({ ip: "not:an:address::at::all" } as never, { kind: "tip" }))).toBe("TOO_MANY_OPEN");
		expect(outcome(await h.checkoutAs({ ip: "unknown" } as never, { kind: "tip" }))).toBe("ok");
	});

	it("[P03][T18] L2: the buckets hold only salted hashes of the IP, never the address in any spelling", async () => {
		h = await redteamHost({ pool: 10 });
		for (const ip of ["198.51.100.7", "2001:db8::7"]) await h.checkoutAs({ ip } as never, { kind: "tip" });
		const all = JSON.stringify([await h.host.inspect.kv.list(), await h.invoices(), await h.pool()]);
		for (const s of ["198.51.100.7", "198.51.100", "2001:db8::7", "2001:db8", "2001:0db8", "20010db8", "c6336407"]) expect(all, s).not.toContain(s);
	});
});
