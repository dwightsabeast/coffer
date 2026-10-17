/**
 * The tip endpoint (phase 07): the TipButton form posts here, with no JavaScript needed. It makes the tip through the
 * plugin's checkout route in-process and redirects to the pay page. The site's file is two lines:
 *
 *   src/pages/pay/tip.ts
 *   import { tipEndpoint } from "@cofferhq/astro/tip";
 *   export const POST = tipEndpoint({ address: "8…", network: "mainnet" });
 *
 * `address` (optional) is spec change 18 A's fallback: a shop address shown, with a QR, when Coffer can't make a tip
 * invoice (no free address, the open-invoice cap, or the plugin unavailable or unsupported). It's set here, never taken
 * from the form, so nobody can put their own address on the site. It's checked for format and network once, at start; a
 * bad one is logged and shows an error for the site's admin instead of a QR.
 *
 * The checkout request carries the visitor's own request headers (not cookies, credentials or Origin) and, on Workers,
 * its `cf` object, so EmDash gives checkout the same client IP for its per-client limit as a direct call.
 */
import type { APIRoute } from "astro";
import { getPublicPluginApiRouteHandler, type PublicPluginRuntimeLocals } from "emdash/plugin-utils";

import { checkTipAddress, type MoneroNetwork } from "./address";
import { CLIENT_SCRIPT } from "./client";
import { payPageHeaders } from "./headers";
import { checkoutErrorMessage } from "./messages";
import { qrSvg } from "./qr";
import { PLUGIN_ID } from "./status";
import { PAGE_CSS } from "./styles";

export interface TipEndpointOptions {
	/** Spec change 18 A: a shop address to show when no tip invoice can be made. */
	address?: string;
	network?: MoneroNetwork;
	/** Where the pay page lives (`/pay/<token>`). */
	payPath?: string;
}

/** Refusals that mean "no tip invoice can be made right now", where a fallback address helps. */
const FALLBACK_CODES = new Set(["NO_ADDRESS_AVAILABLE", "TOO_MANY_OPEN", "UNAVAILABLE", "UNSUPPORTED_PLATFORM"]);
const DROPPED_HEADERS = new Set(["cookie", "authorization", "origin", "content-type", "content-length", "host"]);
const CURRENCIES = new Set(["USD", "EUR"]);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * A post from another site. The checkout route itself refuses a cross-site Origin (EmDash's CSRF check), but this
 * endpoint calls it in-process, so it checks first: Sec-Fetch-Site "cross-site", or an Origin for another host (or
 * "null"). No Origin at all, as from curl, passes, as on the route itself. Found live in 7c: Astro didn't refuse it.
 */
function crossSite(request: Request, url: URL): boolean {
	if (request.headers.get("sec-fetch-site") === "cross-site") return true;
	const origin = request.headers.get("origin");
	if (origin === null) return false;
	try {
		return new URL(origin).host !== url.host || new URL(origin).protocol !== url.protocol;
	} catch {
		return true;
	}
}

/** A same-site path to go back to, or "/". */
function backPath(v: FormDataEntryValue | null): string {
	const s = typeof v === "string" ? v : "";
	return /^\/(?![/\\])[^\s\\]*$/.test(s) ? s : "/";
}

/** Decimal text to integer minor units with at most `places` decimals, or null. */
function toUnits(text: string, places: number, maxWhole: number): bigint | null {
	const m = new RegExp(`^(\\d{1,${maxWhole}})(?:\\.(\\d{1,${places}}))?$`).exec(text.trim());
	if (!m) return null;
	return BigInt(m[1]) * 10n ** BigInt(places) + BigInt((m[2] ?? "").padEnd(places, "0"));
}

type TipBody = { kind: "tip"; amount?: { fiatMinor: string; currency: string } | { xmrAtomic: string }; contentRef?: { collection: string; id: string }; note?: string };

/** The form to checkout's tip body, or null when it's malformed. The plugin checks it again. */
function tipBody(form: FormData): TipBody | null {
	const get = (k: string) => {
		const v = form.get(k);
		return typeof v === "string" ? v : "";
	};
	const body: TipBody = { kind: "tip" };
	const amount = get("amount") || "any";
	const currency = get("currency") || "USD";
	if (amount === "custom") {
		const unit = get("unit");
		if (unit === "fiat") {
			if (!CURRENCIES.has(currency)) return null;
			const minor = toUnits(get("custom"), 2, 7);
			if (minor === null || minor <= 0n) return null;
			body.amount = { fiatMinor: minor.toString(), currency };
		} else if (unit === "xmr") {
			const atomic = toUnits(get("custom"), 12, 9);
			if (atomic === null || atomic <= 0n) return null;
			body.amount = { xmrAtomic: atomic.toString() };
		} else return null;
	} else if (amount !== "any") {
		if (!/^[1-9]\d{0,5}$/.test(amount) || !CURRENCIES.has(currency)) return null;
		body.amount = { fiatMinor: (BigInt(amount) * 100n).toString(), currency };
	}
	const collection = get("collection");
	const id = get("id");
	if (collection && id) body.contentRef = { collection, id };
	const note = get("note").trim();
	if (note) body.note = note;
	return body;
}

/** Makes EmDash skip its editor toolbar here, as on the pay page (see PayPage.astro): our CSP would block it. */
const TOOLBAR_PLACEHOLDER = '<div id="emdash-toolbar" hidden></div>';

async function page(status: number, title: string, main: string): Promise<Response> {
	const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><meta name="referrer" content="no-referrer"><title>${esc(title)}</title><style>${PAGE_CSS}</style></head><body>${TOOLBAR_PLACEHOLDER}${main}<script>${CLIENT_SCRIPT}</script></body></html>`;
	return new Response(html, { status, headers: { ...(await payPageHeaders()), "Content-Type": "text/html; charset=utf-8" } });
}

const errorPage = (status: number, message: string, back: string, adminNote?: string) =>
	page(
		status,
		"Tip with Monero",
		`<main class="coffer-pay" data-coffer-pay data-final="true"><h1>Tip with Monero</h1><section class="coffer-card"><p class="coffer-status">${esc(message)}</p>${adminNote ? `<p class="coffer-note">For the site's admin: ${esc(adminNote)}</p>` : ""}<p class="coffer-note"><a href="${esc(back)}">Back</a></p></section></main>`,
	);

const fallbackPage = (address: string, back: string) =>
	page(
		200,
		"Tip with Monero",
		`<main class="coffer-pay" data-coffer-pay data-final="true"><h1>Tip with Monero</h1><section class="coffer-card"><p class="coffer-status">Send a tip to this address from any Monero wallet. This site doesn't confirm these tips.</p></section><section class="coffer-card">${qrSvg(`monero:${address}`)}<p class="coffer-label">Address</p><div class="coffer-copyrow"><p class="coffer-value" data-field="address">${esc(address)}</p><button type="button" class="coffer-button" data-copy="address" hidden>Copy</button></div><a class="coffer-wallet" href="monero:${esc(address)}" rel="noreferrer">Open in wallet</a><p class="coffer-note">Nothing opened? Copy the address above into your wallet.</p><p class="coffer-note"><a href="${esc(back)}">Back</a></p></section></main>`,
	);

export function tipEndpoint(options: TipEndpointOptions = {}): APIRoute {
	const payPath = (options.payPath ?? "/pay").replace(/\/$/, "");
	const fallback = options.address === undefined ? null : checkTipAddress(options.address, options.network ?? "mainnet");
	if (fallback && !fallback.ok) console.error(`[coffer] ${fallback.reason}`);

	return async ({ request, url, locals }) => {
		if (crossSite(request, url)) return errorPage(403, "This tip didn't come from this site's own page.", "/");
		const form = await request.formData().catch(() => new FormData());
		const back = backPath(form.get("returnTo"));
		const body = tipBody(form);
		if (!body) return errorPage(400, checkoutErrorMessage("INVALID_REQUEST"), back);

		let code = "UNAVAILABLE";
		const handler = getPublicPluginApiRouteHandler(locals as PublicPluginRuntimeLocals);
		if (handler) {
			const headers = new Headers();
			request.headers.forEach((value, name) => {
				if (!DROPPED_HEADERS.has(name.toLowerCase())) headers.set(name, value);
			});
			headers.set("content-type", "application/json");
			const cf = (request as Request & { cf?: unknown }).cf;
			const init = { method: "POST", headers, body: JSON.stringify(body), ...(cf ? { cf } : {}) } as RequestInit;
			try {
				const res = await handler(PLUGIN_ID, "POST", "checkout", new Request(new URL(`/_emdash/api/plugins/${PLUGIN_ID}/checkout`, url), init));
				const data = (res.success ? res.data : undefined) as { token?: unknown; error?: { code?: unknown } } | undefined;
				if (typeof data?.token === "string" && /^[A-Za-z0-9_-]{22}$/.test(data.token)) {
					return new Response(null, { status: 303, headers: { Location: `${payPath}/${data.token}`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
				}
				if (typeof data?.error?.code === "string") code = data.error.code;
			} catch {
				code = "UNAVAILABLE";
			}
		}
		if (FALLBACK_CODES.has(code)) {
			if (fallback?.ok) return fallbackPage(fallback.address, back);
			return errorPage(503, checkoutErrorMessage(code === "UNAVAILABLE" ? "NO_ADDRESS_AVAILABLE" : code), back, fallback && !fallback.ok ? fallback.reason.replace(/ Check the address given to tipEndpoint\.$/, "") : undefined);
		}
		return errorPage(code === "RATE_UNAVAILABLE" || code.startsWith("WALLET_HOST") ? 503 : 400, checkoutErrorMessage(code), back);
	};
}
