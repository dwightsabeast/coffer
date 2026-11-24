// The trust contract an operator consents to (docs/spec.md, "Plugin manifest"; CLAUDE.md, "Plugin trust contract (frozen)").
// Any change here is a stop point for Wyatt: update this test only together with the spec.
import { afterEach, expect, it } from "vitest";

import { createPluginTestHost, type PluginTestHost } from "@emdash-cms/plugin-test";

import descriptionSection from "../docs/description.md?raw";
import installationSection from "../docs/installation.md?raw";
import securitySection from "../docs/security.md?raw";
import manifestSource from "../emdash-plugin.jsonc?raw";
import packageSource from "../package.json?raw";

let host: PluginTestHost | undefined;
afterEach(async () => {
	await host?.dispose();
	host = undefined;
});

it("[T01][P02] the built manifest matches the spec's trust contract exactly", async () => {
	host = await createPluginTestHost();
	const m = host.manifest as unknown as Record<string, any>;
	expect(m.id).toBe("coffer");
	expect(m.capabilities).toEqual(["content:read", "network:request"]);
	expect(m.allowedHosts).toEqual(["api.coingecko.com", "api.kraken.com"]);
	expect(m.storage).toEqual({
		pool: { indexes: ["status"], uniqueIndexes: ["addrIndex"] },
		invoices: { indexes: ["status", "expiresAt", ["kind", "createdAt"]], uniqueIndexes: ["token", "subaddress"] },
	});
	expect(m.admin).toMatchObject({
		pages: [{ path: "/payments", label: "Monero payments" }],
		widgets: [{ id: "xmr-status", title: "Monero payments", size: "half" }],
	});
	// Exactly the frozen route list (CLAUDE.md, "Plugin trust contract").
	const routes = (m.routes ?? []).map((r: any) => ({ name: r.name ?? r, public: r.public ?? false, methods: r.methods })).sort((a: any, b: any) => a.name.localeCompare(b.name));
	expect(routes).toEqual([
		{ name: "admin", public: false, methods: ["POST"] },
		{ name: "bridge/sync", public: true, methods: ["POST"] },
		{ name: "checkout", public: true, methods: ["POST"] },
		{ name: "status", public: true, methods: ["GET"] },
	]);
	const sync = (m.routes ?? []).find((r: any) => r.name === "bridge/sync");
	expect(sync).toMatchObject({ methods: ["POST"], request: { body: "bytes", headers: ["x-xmr-ts", "x-xmr-sig"], maxBytes: 262144 } });
});

it("the admin page and the xmr-status widget load through the host's admin path", async () => {
	const { createPluginRuntimeTestHost } = await import("@emdash-cms/plugin-test");
	const runtime = await createPluginRuntimeTestHost();
	try {
		const page = await runtime.admin.loadPage("/payments");
		const widget = await runtime.admin.loadWidget("xmr-status");
		expect(page.blocks[0]).toMatchObject({ type: "header", text: "Monero payments" });
		expect(widget.blocks.length).toBeGreaterThan(0);
	} finally {
		await runtime.dispose();
	}
});

it("the source manifest names the plugin Coffer, slug coffer", () => {
	// The display name isn't in the built manifest, so read the source (JSONC: drop whole-line comments).
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(m.slug).toBe("coffer");
	expect(m.name).toBe("Coffer");
});

it("the source manifest points at the renamed repository, dwightsabeast/coffer (spec change 41 item 10)", () => {
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(m.repo).toBe("https://github.com/dwightsabeast/coffer");
	expect(m.security).toEqual({ url: "https://github.com/dwightsabeast/coffer/security/advisories/new" });
});

// Spec change 41 items 3 and 9, with Wyatt's decision D as amended on 2026-10-25 (EmDash's floor is the tested version: 1.3.1 then, 1.4.0 from 2026-11-14, 1.5.0 since 2026-11-20).
const graphemes = (text: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].length;

it("[T01] the source manifest declares the supported EmDash and Astro versions (spec change 41 item 3)", () => {
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(m.release?.requires).toEqual({ "env:emdash": ">=1.5.0 <2.0.0", "env:astro": ">=7.3.5 <8.0.0" });
	expect(JSON.parse(packageSource).peerDependencies).toEqual({ emdash: ">=1.5.0 <2.0.0" });
});

it("the listing says what setup needs before the Install click (spec change 41 item 9)", () => {
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(m.description).toBe("Accept Monero tips. Needs a separate Linux wallet host and a small edit to your site's code. Node-hosted sites only for now.");
	expect(graphemes(m.description)).toBeLessThanOrEqual(140);
	expect(m.sections?.description).toEqual({ file: "./docs/description.md" });
	expect(descriptionSection.startsWith("## What you'll need\n")).toBe(true);
	expect(descriptionSection).toContain("EmDash 1.5.0 or later");
	expect(graphemes(descriptionSection)).toBeLessThanOrEqual(2000);
	expect(new TextEncoder().encode(descriptionSection).length).toBeLessThanOrEqual(20_000);
});

// Wyatt, 2026-11-15: about 1,850 of the registry's 2,000 graphemes, so the real install address fits later; raised to
// 1,950 with that address in it (Wyatt, 2026-11-20, spec change 58).
it("the listing's installation text leaves room under the registry's 2,000 graphemes and links the install guide", () => {
	expect(graphemes(installationSection)).toBeLessThanOrEqual(1950);
	expect(installationSection).toContain("The command downloads from https://get.coffer.party.");
	expect(installationSection).toContain("https://github.com/dwightsabeast/coffer/blob/coffer%401.0.0/docs/install.md");
	expect(installationSection).toContain("/_emdash/api/plugins/coffer/*");
	expect(installationSection).toContain("never the spend key");
});

// Phase 09 step 4: the listing's Security section, a plain summary of the security report (Wyatt approved the text,
// ASD-STE100 wording, 2026-11-20). Registry limits: 2,000 graphemes and 20,000 bytes.
it("the listing's Security section is declared, fits the registry's limits and links the report and private reporting", () => {
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(m.sections?.security).toEqual({ file: "./docs/security.md" });
	expect(graphemes(securitySection)).toBeLessThanOrEqual(2000);
	expect(new TextEncoder().encode(securitySection).length).toBeLessThanOrEqual(20_000);
	expect(securitySection.startsWith("## What Coffer can and can't reach\n")).toBe(true);
	expect(securitySection).toContain("The spend key stays in your wallet app.");
	expect(securitySection).toContain("https://github.com/dwightsabeast/coffer/blob/coffer%401.0.0/docs/security-report.md");
	expect(securitySection).toContain("https://github.com/dwightsabeast/coffer/security/advisories/new");
});

// Phase 09, release 1.0.0: spec change 41 item 8 (listing and release metadata only; no trust-contract effect) and
// decisions row 91 (the admin page's sidebar icon is `coins`). The version comes from package.json; the manifest
// declares none, so the two can't disagree.
it("release 1.0.0: version, keywords, the admin page's icon and the listing icon (spec change 41 item 8)", () => {
	const m = JSON.parse(manifestSource.replace(/^\s*\/\/.*$/gm, ""));
	expect(JSON.parse(packageSource).version).toBe("1.0.0");
	expect(m.version).toBeUndefined();
	expect(m.keywords).toEqual(["monero", "xmr", "payments", "tips", "privacy"]);
	expect(m.admin.pages).toEqual([{ path: "/payments", label: "Monero payments", icon: "coins" }]);
	expect(m.admin.widgets).toEqual([{ id: "xmr-status", title: "Monero payments", size: "half" }]);
	expect(m.release?.artifacts).toEqual({ icon: { file: "./images/coffer-icon.png" } });
});
