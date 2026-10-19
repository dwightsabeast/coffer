/**
 * The pay page's server side, for the page file's frontmatter (not a component's: by the time a component renders,
 * Astro has started the response, so headers and the status code set there are lost; found on the dev site in
 * session 6c):
 *
 *   src/pages/pay/coffer/[token].astro
 *   ---
 *   import PayPage from "@cofferhq/astro/PayPage.astro";
 *   import { preparePayPage } from "@cofferhq/astro/page";
 *   const pay = await preparePayPage(Astro, Astro.params.token);
 *   ---
 *   <PayPage pay={pay} />
 */
import { safeReturn } from "./back";
import { setPayPageHeaders } from "./headers";
import { type StatusResult, fetchStatus } from "./status";

export interface PreparedPayPage {
	/** The token, only when it found an invoice (it goes into the polling URL). */
	token: string | null;
	result: StatusResult;
	/** The way back (spec change 39): the URL's `?return=` if it passes safeReturn(), else the site's home. */
	back?: { href: string; fallback: boolean };
}

/** Sets the privacy headers, reads the invoice's status, and sets the HTTP status: 200, 404 (unknown) or 503. */
export async function preparePayPage(astro: { locals: unknown; url: URL; response: { headers: Headers; status: number } }, token: unknown): Promise<PreparedPayPage> {
	await setPayPageHeaders(astro);
	const result = await fetchStatus(astro, token);
	astro.response.status = result.ok ? 200 : result.code === "INVOICE_NOT_FOUND" ? 404 : 503;
	// Checked again here: the query is the buyer's to edit.
	const href = safeReturn(astro.url.searchParams.get("return"), astro.url.origin);
	return { token: result.ok && typeof token === "string" ? token : null, result, back: { href: href ?? "/", fallback: href === null } };
}
