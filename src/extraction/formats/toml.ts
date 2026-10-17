import { loadToml, type TomlValue } from '../../parsers/toml/load';
import type { Url } from '../../types';
import {
	locateParsedValues,
	scanUrls,
	toUnpositionedUrls,
	toUrls,
} from '../heuristics';

/**
 * The crate's `toml`: toml 1.1 at preserve_order, its strings collected the
 * way `serde_json::to_value` hands them over — a table's keys in byte order,
 * since that `Map` sorts — then located in the source. A document that does
 * not parse falls back to a scan of the whole text.
 */
export function extractFromToml(content: string): readonly Url[] {
	const parsed = loadToml(content);
	if (typeof parsed === 'string') return toUrls(content, scanUrls(content));
	const { located, unlocated } = locateParsedValues(content, strings(parsed));
	return [...toUrls(content, located), ...toUnpositionedUrls(unlocated)];
}

/** Every string in the tree; a datetime's text is digits and never a URL. */
function strings(value: TomlValue): string[] {
	if (value.type === 'string') return [value.text];
	if (value.type === 'array') return value.items.flatMap(strings);
	if (value.type !== 'table') return [];
	return [...value.entries]
		.sort(([left], [right]) =>
			Buffer.compare(Buffer.from(left), Buffer.from(right)),
		)
		.flatMap(([, item]) => strings(item));
}
