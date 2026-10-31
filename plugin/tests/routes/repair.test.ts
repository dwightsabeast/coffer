// Re-pairing (spec change 45, RT-29): every new pairing drops the unused pool addresses and clears the stored network,
// then stores the new key. Claimed rows and their invoices stay. Through the runtime test host and its real storage.
import { afterEach, describe, expect, it } from "vitest";

import { subaddressNetwork } from "../../src/core/address";
import { GAP_ALERT } from "../../src/core/constants";
import { newPairingCode } from "../../src/sync/pairing";
import { TAGS, fakeAddress } from "../addresses";
import { type RedteamHost, type Reply, redteamHost } from "../redteam/harness";
import { KEY_IDS, PUBLIC_KEYS } from "../sync/helpers";

let h: RedteamHost | undefined;
afterEach(async () => {
	await h?.host.dispose();
	h = undefined;
});

type B = Record<string, any>;
const data = (r: Reply) => (r.json as B | null)?.data as B | undefined;

/** Pairs test2 with a fresh code, signed by test2: a new wallet host taking over from test1. */
async function pairTest2(host: RedteamHost): Promise<Reply> {
	const { code, state } = await newPairingCode(Date.now());
	await host.host.fixtures.plugin.kv("state:pairing", state);
	return host.sync({ addresses: [], snapshots: [], pair: { code, publicKey: PUBLIC_KEYS.test2 } }, { key: "test2" });
}
/** The new wallet's subaddresses: a different salt from the harness's pool, so no address is shared. */
const NEW = (i: number, net: keyof typeof TAGS = "stagenet") => fakeAddress(TAGS[net][1], i, "NEWWALLET");
const newAddresses = (from: number, n: number, net: keyof typeof TAGS = "stagenet") => Array.from({ length: n }, (_, k) => ({ index: from + k, address: NEW(from + k, net) }));
const byIndex = async (host: RedteamHost) => new Map((await host.pool()).map((p) => [p.addrIndex as number, p]));

describe("a new pairing starts the pool afresh (spec change 45)", () => {
	it("[T20][T03][R08] [RT-29] a re-pair to another wallet on the same network hands out only the new wallet's addresses", async () => {
		h = await redteamHost({ pool: 4 });
		const first = data(await h.checkout({ kind: "tip" }));
		expect(first?.address).toBeTruthy(); // index 1, claimed by the old wallet's tip

		const paired = data(await pairTest2(h));
		expect(paired).toMatchObject({ ok: true, poolFree: 0, poolTop: 1 }); // poolTop falls to the highest claimed row
		expect([...(await byIndex(h)).keys()]).toEqual([1]);

		const fresh = newAddresses(2, 5);
		expect(data(await h.sync({ addresses: fresh }, { key: "test2" }))).toMatchObject({ ok: true, poolFree: 5 });
		const handedOut: string[] = [];
		for (let i = 0; i < 5; i++) handedOut.push(data(await h.checkout({ kind: "tip" }))?.address as string);
		expect(handedOut.sort()).toEqual(fresh.map((a) => a.address).sort());
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		expect(data(await h.sync({}, { key: "test1" }))?.ok).not.toBe(true); // the old key no longer syncs
	});

	it("[T20][T03][R08] [RT-29] a stagenet-to-mainnet re-pair: the old unused addresses go, checkout hands out mainnet, claimed rows and invoices are untouched", async () => {
		h = await redteamHost({ pool: 3, poolNetwork: "stagenet" });
		expect(data(await h.checkout({ kind: "tip" }))?.address).toBeTruthy();
		const claimedBefore = (await h.pool()).filter((p) => p.status === "claimed");
		const invoicesBefore = await h.invoices();
		expect(claimedBefore).toHaveLength(1);

		expect(data(await pairTest2(h))?.ok).toBe(true);
		expect(await h.host.inspect.kv.get("state:network")).toBeNull();
		expect((await h.pool()).filter((p) => p.status !== "claimed")).toEqual([]);

		await h.sync({ addresses: newAddresses(2, 3, "mainnet") }, { key: "test2" });
		expect(await h.host.inspect.kv.get("state:network")).toEqual({ network: "mainnet", keyId: KEY_IDS.test2 });
		const tip = data(await h.checkout({ kind: "tip" }));
		expect(subaddressNetwork(tip?.address)).toBe("mainnet");
		expect((await h.pool()).filter((p) => p.addrIndex === 1)).toEqual(claimedBefore);
		expect((await h.invoices()).filter((inv) => inv.addrIndex === 1)).toEqual(invoicesBefore);
	});

	it("[T03][R08] the leftover window on purpose: an old-key sync's rows that land after the pairing are never handed out", async () => {
		h = await redteamHost({ pool: 2 });
		expect(data(await pairTest2(h))?.ok).toBe(true);
		// A sync signed by test1 that passed its checks before the new key was stored, writing after the drop.
		for (const i of [3, 4]) await h.host.fixtures.plugin.storage("pool", String(i), { addrIndex: i, address: fakeAddress(TAGS.stagenet[1], i, "THIEF"), status: "free", keyId: KEY_IDS.test1 });
		await h.host.fixtures.plugin.kv("state:network", { network: "stagenet", keyId: KEY_IDS.test1 });
		await h.sync({ addresses: newAddresses(5, 1) }, { key: "test2" });
		expect(data(await h.checkout({ kind: "tip" }))?.address).toBe(NEW(5));
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		expect(await h.invoices()).toHaveLength(1);
	});

	it("[T20][P02] [RT-11] checkout skips a free row on another network than the stored one, even with the current key's ID", async () => {
		h = await redteamHost({ pool: 0 });
		await h.host.fixtures.plugin.kv("state:network", { network: "stagenet", keyId: KEY_IDS.test1 });
		await h.host.fixtures.plugin.storage("pool", "1", { addrIndex: 1, address: fakeAddress(TAGS.mainnet[1], 1, "WRONG"), status: "free", keyId: KEY_IDS.test1 });
		await h.host.fixtures.plugin.storage("pool", "2", { addrIndex: 2, address: fakeAddress(TAGS.stagenet[1], 2, "RIGHT"), status: "free", keyId: KEY_IDS.test1 });
		expect(subaddressNetwork(data(await h.checkout({ kind: "tip" }))?.address)).toBe("stagenet");
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
	});

	it("[T03][R08] a row left \"dropped\" by a failed pairing: not free, not in poolTop or the gap warning, never handed out, and the next pairing deletes it", async () => {
		h = await redteamHost({ pool: 0 });
		await h.price("USD", "150.00");
		await h.host.fixtures.plugin.storage("pool", "900", { addrIndex: 900, address: fakeAddress(TAGS.stagenet[1], 900, "LEFT"), status: "dropped", keyId: KEY_IDS.test1 });
		await h.host.fixtures.plugin.storage("pool", "5", { addrIndex: 5, address: fakeAddress(TAGS.stagenet[1], 5, "CLAIMED"), status: "claimed", invoiceId: "inv_gone" });

		expect(data(await h.sync({}))).toMatchObject({ ok: true, poolFree: 0, poolTop: 5 });
		expect(data(await h.checkout({ kind: "tip" }))).toMatchObject({ error: { code: "NO_ADDRESS_AVAILABLE" } });
		const page = (await h.host.admin.loadPage("/payments")).blocks as B[];
		const health = page.find((b) => b.type === "fields" && b.block_id === "health")?.fields as B[];
		expect(health.find((f) => f.label === "Unpaid addresses since the last payment")?.value).toBe(`5 (warning at ${GAP_ALERT})`);
		expect(page.find((b) => b.type === "meter")).toMatchObject({ value: 0 });
		expect(page.filter((b) => b.type === "banner" && String(b.description ?? "").includes(String(GAP_ALERT)))).toEqual([]);

		expect(data(await pairTest2(h))).toMatchObject({ ok: true, poolTop: 5 });
		expect([...(await byIndex(h)).keys()]).toEqual([5]);
	});
});
