/**
 * Resolving a format hint from whatever an agent happens to send.
 *
 * The engine's own `determineFileType` accepts VS Code language ids and nothing
 * else — it maps `yaml`/`yml` and falls through to `unknown` for the rest. An
 * agent will send `md`, `.md`, `Markdown`, or `README.md` instead. Widening
 * happens here rather than in the engine, whose behaviour is pinned by
 * characterization goldens.
 */

/**
 * Every language id the engine understands, keyed by what a caller might send.
 *
 * Exported because `crate/fixtures/aliases.json` holds it equal to the Rust
 * crate's table: both MCP servers offer the same `extract_urls`, so a name one
 * side reads and the other refuses makes them two different tools rather than
 * one. `scripts/check-extraction-parity.ts` checks this side of that.
 */
export const ALIASES: Readonly<Record<string, string>> = Object.freeze({
	markdown: 'markdown',
	md: 'markdown',
	mdx: 'markdown',
	mdown: 'markdown',
	mkd: 'markdown',
	html: 'html',
	htm: 'html',
	xhtml: 'html',
	css: 'css',
	scss: 'css',
	less: 'css',
	javascript: 'javascript',
	js: 'javascript',
	jsx: 'javascript',
	mjs: 'javascript',
	cjs: 'javascript',
	typescript: 'typescript',
	ts: 'typescript',
	tsx: 'typescript',
	mts: 'typescript',
	cts: 'typescript',
	json: 'json',
	jsonc: 'json',
	yaml: 'yaml',
	yml: 'yaml',
	properties: 'properties',
	env: 'properties',
	toml: 'toml',
	ini: 'ini',
	cfg: 'ini',
	conf: 'ini',
	xml: 'xml',
	svg: 'xml',
	xsl: 'xml',
	pom: 'xml',
	// Named rather than left to the fallback: an agent that sends `csv` should
	// see it in the advertised enum, and see the same answer a filename gives.
	csv: 'csv',
	tsv: 'csv',
	plaintext: 'plaintext',
	txt: 'plaintext',
	log: 'plaintext',
});

/**
 * What a caller gets when nothing recognises the name. A URL is unambiguous in
 * any text, so refusing a document with no format-aware extractor was never
 * protecting anyone from a wrong answer — it withheld the right one.
 */
export const FALLBACK_FORMAT = 'plaintext';

/** The language ids a caller may pass, for the tool's JSON schema. */
export const SUPPORTED_FORMATS: readonly string[] = Object.freeze([
	...new Set(Object.values(ALIASES)),
]);

function normalise(raw: string): string {
	// Tolerate ".MD", " md ", and a bare extension.
	return raw.trim().toLowerCase().replace(/^\./, '');
}

/**
 * Own keys only. A plain object literal still inherits from Object.prototype,
 * so an unguarded `ALIASES['toString']` hands back a function that every
 * truthiness check downstream accepts as a language id.
 */
function lookup(key: string): string | undefined {
	return Object.hasOwn(ALIASES, key) ? ALIASES[key] : undefined;
}

/**
 * Resolve a format hint or a filename to a language id the engine accepts.
 *
 * Anything named resolves: a name nothing recognises yields FALLBACK_FORMAT
 * rather than null. A format-aware extractor only ever *excludes* part of a
 * document — a fenced block, a comment, everything that is not a JSON string —
 * so the fallback is a superset of all eleven, and an unrecognised name can
 * never hide a URL. It can only stop excluding one.
 *
 * Null only when nothing was named at all, so the caller can say which input
 * was missing rather than letting the engine report `Unsupported language:
 * undefined`.
 */
export function resolveFormat(
	format: string | undefined,
	filename: string | undefined,
): string | null {
	if (format) {
		const direct = lookup(normalise(format));
		if (direct) return direct;
	}

	if (filename) {
		// The whole name first, so `.env` lands even though it has no extension.
		const whole = lookup(normalise(filename));
		if (whole) return whole;

		const dot = filename.lastIndexOf('.');
		if (dot !== -1) {
			const byExtension = lookup(normalise(filename.slice(dot + 1)));
			if (byExtension) return byExtension;
		}
	}

	return format || filename ? FALLBACK_FORMAT : null;
}
