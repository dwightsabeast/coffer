// Spec change 52 (RT-05): what the per-client bucket hashes. IPv6 gives its /64, an IPv4-mapped address its IPv4
// address, IPv4 itself, and anything else the text as given.
import { describe, expect, it } from "vitest";

import { clientKeyText } from "../../src/clientip";

describe("clientKeyText", () => {
	const SAME_64 = "v6:2001:db8:1:2";
	it.each([
		["2001:db8:1:2::1", SAME_64],
		["2001:db8:1:2:ffff:ffff:ffff:ffff", SAME_64],
		["2001:0DB8:0001:0002:0000:0000:0000:0001", SAME_64],
		["[2001:db8:1:2::1]", SAME_64],
		["2001:db8:1:2::1%eth0", SAME_64],
		["2001:db8:1:2::", SAME_64],
		["2001:db8:1:2:3:4:5:6", SAME_64],
		["2001:db8:1:2:3:4:198.51.100.7", SAME_64],
		["2001:db8:1:3::1", "v6:2001:db8:1:3"],
		["2001:db8::1", "v6:2001:db8:0:0"],
		["::", "v6:0:0:0:0"],
		["::1", "v6:0:0:0:0"],
		["1::", "v6:1:0:0:0"],
		["fe80::1%2", "v6:fe80:0:0:0"],
	])("[T18][T05] [RT-05] IPv6 %s is its /64", (ip, want) => {
		expect(clientKeyText(ip)).toBe(want);
	});

	it.each([
		["198.51.100.7", "198.51.100.7"],
		["::ffff:198.51.100.7", "198.51.100.7"],
		["::FFFF:c633:6407", "198.51.100.7"],
		["0:0:0:0:0:ffff:c633:6407", "198.51.100.7"],
		["[::ffff:198.51.100.7]", "198.51.100.7"],
	])("[T18][T05] [RT-05] IPv4 and IPv4-mapped %s is the IPv4 address", (ip, want) => {
		expect(clientKeyText(ip)).toBe(want);
	});

	it.each([
		"",
		"unknown",
		"1:2:3:4:5:6:7",
		"1:2:3:4:5:6:7:8:9",
		"1::2::3",
		"2001:db8:1:2::g",
		"2001:db8:1:2:12345::",
		"1:2:3:4:5:6:7::8",
		":1:2:3:4:5:6:7",
		"1:2:3:4:5:6:7:",
		"2001:db8::1.2.3",
		"2001:db8::256.1.1.1",
		"1.2.3.4:5::",
		"::ffff:1.2.3.4:5",
		"[2001:db8::1",
		"2001:db8::1%",
	])("[T18][T05] [RT-05] %j isn't an address and is kept as given", (text) => {
		expect(clientKeyText(text)).toBe(text);
	});

	it("[T18][T05] [RT-05] IPv4 text is never reshaped (EmDash gives it; leading zeros and all)", () => {
		for (const ip of ["10.0.0.1", "010.0.0.1", "1.2.3.4.5"]) expect(clientKeyText(ip)).toBe(ip);
	});
});
