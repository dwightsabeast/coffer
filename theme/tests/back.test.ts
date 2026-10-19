// The pay page's way back (spec change 39): one validator for the tip form's returnTo and the pay URL's return. Only a
// same-origin path comes out, never one into the pay pages or the admin; anything else is null, and the page links "/".
import { describe, expect, it } from "vitest";

import { safeReturn } from "../src/back";

const ORIGIN = "https://shop.example";
const ok = (v: string) => safeReturn(v, ORIGIN);

describe("safeReturn", () => {
	it("accepts a same-origin path and its query; drops the fragment", () => {
		expect(ok("/")).toBe("/");
		expect(ok("/posts/welcome")).toBe("/posts/welcome");
		expect(ok("/posts/welcome?ref=x")).toBe("/posts/welcome?ref=x");
		expect(ok("/posts/welcome#frag")).toBe("/posts/welcome");
		expect(ok("/posts/welcome?ref=x#frag")).toBe("/posts/welcome?ref=x");
	});

	it("refuses other sites, schemes and backslashes", () => {
		for (const v of ["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "https://shop.example/posts", "javascript:alert(1)", "data:text/html,x", "posts/welcome", "///evil.com"]) {
			expect(ok(v), v).toBeNull();
		}
	});

	it("refuses the pay pages and the admin, also through dot segments and percent-encoding", () => {
		for (const v of ["/pay/coffer", "/pay/coffer/", "/pay/coffer/abc", "/pay/coffer/tip", "/_emdash", "/_emdash/admin", "/./pay/coffer/x", "/pay/x/../coffer/x", "/%5Femdash/admin", "/pay%2Fcoffer/x", "/%70ay/coffer/x"]) {
			expect(ok(v), v).toBeNull();
		}
		// Neighbours that only look alike stay allowed.
		expect(ok("/pay/cofferx")).toBe("/pay/cofferx");
		expect(ok("/pay")).toBe("/pay");
	});

	it("refuses empty, over 512 characters, control characters, and anything not a string", () => {
		expect(ok("")).toBeNull();
		expect(ok(`/${"a".repeat(511)}`)).toBe(`/${"a".repeat(511)}`);
		expect(ok(`/${"a".repeat(512)}`)).toBeNull();
		for (const v of ["/posts\nx", "/posts\tx", "/posts\rx", "/posts\u0000x", "/posts\u007fx"]) expect(ok(v), JSON.stringify(v)).toBeNull();
		for (const v of [null, undefined, 42, ["/"], { href: "/" }]) expect(safeReturn(v, ORIGIN)).toBeNull();
	});

	it("/%2F%2Fevil.com stays a path on this site: URL resolution keeps it percent-encoded", () => {
		expect(ok("/%2F%2Fevil.com")).toBe("/%2F%2Fevil.com");
		expect(new URL(ok("/%2F%2Fevil.com") as string, ORIGIN).origin).toBe(ORIGIN);
	});
});
