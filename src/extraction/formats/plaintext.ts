import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * Anything with no format-aware extractor: Python, Go, shell, SQL, CSV, a
 * log. Whole-content scan, because there is nothing to exclude — every
 * extractor in this directory is this scan minus one exclusion, so this is
 * the superset, and a URL is unambiguous in any of them.
 */
export function extractFromPlainText(content: string): readonly Url[] {
	return toUrls(content, scanUrls(content));
}
