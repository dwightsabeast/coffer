/**
 * The pay page's way back (spec change 39): one check for the tip form's `returnTo` and the pay URL's `?return=`, so a
 * crafted value can't send the buyer to another site or into the admin. The page links "/" whenever this says no. The
 * Referer header isn't used: the pay page's privacy headers suppress it.
 */
const MAX_LENGTH = 512;
/** Never a way back: Coffer's own pay pages (a loop) and EmDash's admin and API. */
const REFUSED = ["/pay/coffer", "/_emdash"];
const CONTROL = /[\u0000-\u001f\u007f]/;

const refusedPath = (path: string) => REFUSED.some((p) => path === p || path.startsWith(`${p}/`));

/** A same-origin `pathname + search` (no fragment), or null. */
export function safeReturn(value: unknown, origin: string): string | null {
	if (typeof value !== "string" || value === "" || value.length > MAX_LENGTH) return null;
	if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || CONTROL.test(value)) return null;
	let url: URL;
	try {
		url = new URL(value, origin);
	} catch {
		return null;
	}
	if (url.origin !== new URL(origin).origin) return null;
	// The path as resolved (dot segments gone), and again percent-decoded, since a server may decode before routing.
	let decoded: string;
	try {
		decoded = new URL(decodeURIComponent(url.pathname).replace(/^\/+/, "/"), origin).pathname;
	} catch {
		return null;
	}
	if (refusedPath(url.pathname) || refusedPath(decoded)) return null;
	return url.pathname + url.search;
}
