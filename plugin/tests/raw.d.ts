// Vite's `?raw` imports (a file's text), used by tests/manifest.test.ts to read emdash-plugin.jsonc in the sandbox.
declare module "*?raw" {
	const text: string;
	export default text;
}

// Vite's `import.meta.glob` with `{ query: "?raw", import: "default", eager: true }`, used by
// tests/routes/admin-route.test.ts to read every source file's text.
interface ImportMeta {
	glob(pattern: string, options: { query: "?raw"; import: "default"; eager: true }): Record<string, string>;
}
