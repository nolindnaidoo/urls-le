/**
 * Resolving a format hint from whatever an agent happens to send.
 *
 * The engine's own `determineFileType` accepts VS Code language ids and nothing
 * else — it maps `yaml`/`yml` and falls through to `unknown` for the rest. An
 * agent will send `md`, `.md`, `Markdown`, or `README.md` instead. Widening
 * happens here rather than in the engine, whose behaviour is pinned by
 * characterization goldens.
 */

/** Every language id the engine understands, keyed by what a caller might send. */
const ALIASES: Readonly<Record<string, string>> = Object.freeze({
	markdown: 'markdown',
	md: 'markdown',
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
});

/** The language ids a caller may pass, for the tool's JSON schema. */
export const SUPPORTED_FORMATS: readonly string[] = Object.freeze([
	...new Set(Object.values(ALIASES)),
]);

function normalise(raw: string): string {
	// Tolerate ".MD", " md ", and a bare extension.
	return raw.trim().toLowerCase().replace(/^\./, '');
}

/**
 * Resolve a format hint or a filename to a language id the engine accepts.
 *
 * Returns null when nothing matches, so the caller can say which input was
 * unusable rather than letting the engine report `Unsupported language:
 * undefined`.
 */
export function resolveFormat(
	format: string | undefined,
	filename: string | undefined,
): string | null {
	if (format) {
		const direct = ALIASES[normalise(format)];
		if (direct) return direct;
	}

	if (filename) {
		const dot = filename.lastIndexOf('.');
		if (dot !== -1) {
			const byExtension = ALIASES[normalise(filename.slice(dot + 1))];
			if (byExtension) return byExtension;
		}
	}

	return null;
}
