// The buyer-facing checkout messages.
import { describe, expect, it } from "vitest";

import { checkoutErrorMessage } from "../src/messages";

describe("checkoutErrorMessage", () => {
	it("a silent wallet host and a syncing node read the same (spec change 20, item 5); unknown codes get a general line", () => {
		expect(checkoutErrorMessage("WALLET_HOST_SYNCING")).toBe(checkoutErrorMessage("WALLET_HOST_SILENT"));
		expect(checkoutErrorMessage("RATE_UNAVAILABLE")).toContain("price");
		// Spec change 35: a site on Cloudflare Workers, which release 1 doesn't support.
		expect(checkoutErrorMessage("UNSUPPORTED_PLATFORM")).toBe("Monero payments aren't available on this site yet.");
		expect(checkoutErrorMessage("toString")).toBe("Monero payment isn't available right now. Please try again later.");
		expect(checkoutErrorMessage(undefined)).toBe("Monero payment isn't available right now. Please try again later.");
	});
});
