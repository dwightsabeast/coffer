/**
 * What a buyer reads when checkout refuses, for the buttons in phases 07 (tips) and 08 (products). The wallet host
 * being silent and its node still syncing read the same (spec change 20, item 5): the buyer can't act on the
 * difference, and the admin page says which it is.
 */
const MESSAGES: Record<string, string> = {
	WALLET_HOST_SILENT: "Monero payments are paused for a moment. Please try again in a few minutes.",
	WALLET_HOST_SYNCING: "Monero payments are paused for a moment. Please try again in a few minutes.",
	RATE_UNAVAILABLE: "The XMR price isn't available right now. Please try again in a minute.",
	// Wyatt's wording for an empty pool (phase 07; spec change 33).
	NO_ADDRESS_AVAILABLE: "Tips can't be taken right now. Please try again in a few minutes.",
	TOO_MANY_OPEN: "Too many payments are waiting right now. Please finish or wait for an open one, or try again later.",
	PRODUCT_NOT_FOUND: "This item can't be bought right now.",
	INVALID_REQUEST: "Please check the amount and the note, then try again.",
	ENTRY_NOT_FOUND: "This page can't take tips right now.",
	// Spec change 35: the site runs on Cloudflare Workers, which Coffer doesn't support yet. The admin page says why.
	UNSUPPORTED_PLATFORM: "Monero payments aren't available on this site yet.",
};

export const checkoutErrorMessage = (code: unknown): string =>
	(typeof code === "string" && Object.hasOwn(MESSAGES, code) ? MESSAGES[code] : undefined) ?? "Monero payment isn't available right now. Please try again later.";
