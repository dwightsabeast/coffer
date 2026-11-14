// What the per-client spam bucket hashes (spec change 52, RT-05). An ISP gives an IPv6 customer at least a /64, so
// for IPv6 one visitor is the first 64 bits, in whatever spelling the address arrives. Hand-written: no dependency.

/** A dotted IPv4 address as four bytes, or null. */
function ipv4Bytes(text: string): number[] | null {
	const parts = text.split(".");
	if (parts.length !== 4 || !parts.every((p) => /^\d{1,3}$/.test(p))) return null;
	const bytes = parts.map(Number);
	return bytes.every((b) => b <= 255) ? bytes : null;
}

/** An IPv6 address as its eight 16-bit groups, or null when the text isn't one. Brackets and a zone are allowed. */
function ipv6Groups(text: string): number[] | null {
	let s = text;
	if (s.startsWith("[")) {
		if (!s.endsWith("]")) return null;
		s = s.slice(1, -1);
	}
	const zone = s.indexOf("%");
	if (zone !== -1) {
		if (zone === s.length - 1) return null;
		s = s.slice(0, zone);
	}
	const halves = s.split("::");
	if (halves.length > 2) return null;
	const parse = (half: string, last: boolean): number[] | null => {
		if (half === "") return [];
		const out: number[] = [];
		const parts = half.split(":");
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			if (last && i === parts.length - 1 && part.includes(".")) {
				// The last 32 bits written as IPv4 ("::ffff:198.51.100.7").
				const bytes = ipv4Bytes(part);
				if (!bytes) return null;
				out.push((bytes[0] << 8) | bytes[1], (bytes[2] << 8) | bytes[3]);
			} else {
				if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
				out.push(parseInt(part, 16));
			}
		}
		return out;
	};
	const head = parse(halves[0], halves.length === 1);
	const tail = halves.length === 2 ? parse(halves[1], true) : [];
	if (!head || !tail) return null;
	const given = head.length + tail.length;
	// "::" stands for at least one group of zeros; without it all eight are written.
	if (halves.length === 2 ? given > 7 : given !== 8) return null;
	return [...head, ...Array<number>(8 - given).fill(0), ...tail];
}

/**
 * The text a client's bucket key is hashed from: an IPv6 address gives its /64 ("v6:2001:db8:1:2"), an IPv4-mapped
 * one ("::ffff:198.51.100.7") the IPv4 address, and anything else, IPv4 included, itself. Never throws: text that
 * isn't an address is bucketed as given, as it always was.
 */
export function clientKeyText(ip: string): string {
	if (!ip.includes(":")) return ip;
	const g = ipv6Groups(ip);
	if (!g) return ip;
	if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) return `${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`;
	return `v6:${g.slice(0, 4).map((n) => n.toString(16)).join(":")}`;
}
