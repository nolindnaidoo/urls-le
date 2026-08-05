import { extractUrls } from '../extraction/extract';
import {
	capped,
	DEFAULT_MAX_RESULTS,
	envelope,
	MAX_MAX_RESULTS,
	readMaxResults,
	readString,
	toDiagnostics,
} from './envelope';
import { resolveFormat, SUPPORTED_FORMATS } from './fileType';
import type { ToolDefinition } from './transport';

/**
 * The tools this server exposes.
 *
 * Names are a public API with no deprecation channel — once an agent's prompt
 * or memory references `extract_urls`, renaming it breaks silently. They are
 * pinned by a golden test for that reason.
 *
 * No tool touches the filesystem. The agent already has file-read tools;
 * duplicating them here would add a path-traversal surface for no capability.
 *
 * **The description is the API.** A model reads it to decide whether to call
 * this tool at all, so it names the formats explicitly rather than saying
 * "many formats" — a model cannot reason about a vague claim, and the cost of
 * that vagueness is either a call that returns nothing or a tool that is never
 * tried. The same reasoning governs argument descriptions: each says what the
 * value does, not what type it is, because the type is already in the schema.
 */

// Advertised in the schema with its default visible, rather than silently
// enforced. A model that can see the cap can raise it when it genuinely needs
// more, and can read `meta.truncated` to know it should. A hidden cap just
// produces quietly incomplete answers.
const MAX_RESULTS_SCHEMA = {
	type: 'integer',
	minimum: 1,
	maximum: MAX_MAX_RESULTS,
	default: DEFAULT_MAX_RESULTS,
	description: `Cap on returned URLs (default ${DEFAULT_MAX_RESULTS}). meta.truncated reports whether any were dropped.`,
};

async function extract(args: Record<string, unknown>): Promise<unknown> {
	const content = readString(args, 'content');
	const maxResults = readMaxResults(args);

	const format = typeof args.format === 'string' ? args.format : undefined;
	const filename =
		typeof args.filename === 'string' ? args.filename : undefined;

	// Requiring one of the two up front gives a message naming the problem,
	// instead of the engine reporting "Unsupported language: undefined".
	const languageId = resolveFormat(format, filename);
	if (!languageId) {
		throw new Error(
			`Provide \`format\` (one of: ${SUPPORTED_FORMATS.join(', ')}) or a \`filename\` with a recognised extension.`,
		);
	}

	const result = await extractUrls(content, languageId);
	const values = result.urls.map((u) => ({
		value: u.value,
		protocol: u.protocol,
		line: u.position?.line,
		column: u.position?.column,
	}));

	// Dedupe is opt-in, and deliberately so. Two occurrences of the same URL is
	// a fact about the document — it is exactly what a link audit counts — and
	// collapsing them by default would silently discard that with no way for the
	// caller to know it happened. Keeping first occurrence rather than last
	// preserves document order, so positions stay ascending and a model can
	// still reason about where in the file something appeared.
	const deduped =
		args.dedupe === true
			? values.filter(
					(u, i, all) => all.findIndex((o) => o.value === u.value) === i,
				)
			: values;

	// Capped after dedupe, not before: capping first would return 500 rows that
	// collapse to 30, which is neither the first 500 unique URLs nor an honest
	// truncation.
	const { items, truncated } = capped(deduped, maxResults);

	return envelope(
		'extract_urls',
		{ urls: items, fileType: result.fileType ?? languageId },
		items.length,
		toDiagnostics(result),
		truncated,
	);
}

export const TOOLS: readonly ToolDefinition[] = Object.freeze([
	Object.freeze({
		name: 'extract_urls',
		description:
			'Extract every URL from a document, with its protocol and 1-based line and column. Supports Markdown, HTML, CSS, JavaScript, TypeScript, JSON, YAML, Properties, TOML, INI and XML. Code blocks and comments are excluded where the format defines them.',
		inputSchema: {
			type: 'object',
			properties: {
				content: {
					type: 'string',
					description: 'The document text to scan.',
				},
				format: {
					type: 'string',
					enum: SUPPORTED_FORMATS,
					description:
						'Document format. Provide this or `filename`. Common extensions and aliases are accepted.',
				},
				filename: {
					type: 'string',
					description:
						'Filename used to infer the format when `format` is absent, e.g. "README.md".',
				},
				dedupe: {
					type: 'boolean',
					default: false,
					description: 'Collapse repeated URLs to their first occurrence.',
				},
				maxResults: MAX_RESULTS_SCHEMA,
			},
			required: ['content'],
			additionalProperties: false,
		},
		handler: extract,
	}),
]);
