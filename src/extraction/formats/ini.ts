import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';
import { createPositionIndex } from '../position';

/**
 * INI: whole-content scan, minus comment lines (; or #).
 *
 * **No parser.** This used to parse with the `ini` package and then
 * forward-locate each value, which made the answer depend on which INI
 * library each language happened to install. `ini` never throws — a line
 * with no `=` becomes a key whose value is `true`, which `collectStrings`
 * skips, so the URL vanished and the declared fallback below could never
 * fire. The Rust server's parser refuses that same line and fell back to
 * a whole-document scan, so it found the URL. One document, one
 * `extract_urls` tool, two servers, two answers — found by generated
 * documents in `scripts/differential.ts`.
 *
 * A rule both sides can state in three lines cannot drift that way, and
 * it is what the .properties extractor has always done. The shared
 * corpus is unchanged: a URL in a comment stays excluded.
 */
export function extractFromIni(content: string): readonly Url[] {
	const lines = content.split('\n');
	const toPosition = createPositionIndex(content);

	const matches = scanUrls(content).filter((match) => {
		const line = lines[toPosition(match.start).line - 1]?.trim() ?? '';
		return !line.startsWith(';') && !line.startsWith('#');
	});

	return toUrls(content, matches);
}
