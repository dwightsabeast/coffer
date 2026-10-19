// The invoice's coin, stored as asset, chain and network (spec change 36, Wyatt 2026-10-18). Rows from before 7e have no
// coin fields: xmr on monero, the network read from the stored subaddress, and mainnet only if that can't be read.
import { describe, expect, it } from "vitest";

import { coinOf, newInvoice } from "../../src/core/invoice";
import { TAGS, fakeAddress, fakeSubaddress } from "../addresses";

const make = (network: "mainnet" | "stagenet" | "testnet", subaddress = fakeSubaddress(1)) =>
	newInvoice({ id: "inv_1", token: "t", kind: "tip", fiatMinor: null, currency: "USD", rate: null, speed: "standard", subaddress, addrIndex: 1, now: 0, chainHeight: 100, network });

describe("the invoice's coin", () => {
	it("newInvoice stores asset, chain and the network it was given", () => {
		expect(make("stagenet")).toMatchObject({ asset: "xmr", chain: "monero", network: "stagenet" });
		expect(make("mainnet", fakeAddress(TAGS.mainnet[1], 1))).toMatchObject({ asset: "xmr", chain: "monero", network: "mainnet" });
	});

	it("coinOf returns the stored fields, even where the address says otherwise", () => {
		expect(coinOf(make("stagenet"))).toEqual({ asset: "xmr", chain: "monero", network: "stagenet" });
		expect(coinOf({ ...make("testnet"), subaddress: fakeSubaddress(1) })).toEqual({ asset: "xmr", chain: "monero", network: "testnet" });
	});

	it("an invoice without the fields: xmr on monero, the network from its stored subaddress", () => {
		const { asset, chain, network, ...legacy } = make("stagenet");
		expect([asset, chain, network]).toEqual(["xmr", "monero", "stagenet"]);
		expect(coinOf(legacy)).toEqual({ asset: "xmr", chain: "monero", network: "stagenet" });
		expect(coinOf({ ...legacy, subaddress: fakeAddress(TAGS.testnet[1], 1) })).toEqual({ asset: "xmr", chain: "monero", network: "testnet" });
	});

	it("an invoice without the fields and an unreadable subaddress reads as mainnet", () => {
		const { asset: _a, chain: _c, network: _n, ...legacy } = make("stagenet");
		expect(coinOf({ ...legacy, subaddress: fakeAddress(38, 1) })).toEqual({ asset: "xmr", chain: "monero", network: "mainnet" });
		expect(coinOf({ ...legacy, subaddress: "" })).toEqual({ asset: "xmr", chain: "monero", network: "mainnet" });
	});
});
