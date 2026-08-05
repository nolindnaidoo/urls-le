import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * JavaScript/TypeScript: whole-content scan. String literals, template
 * literals (multi-line included), and comments all contribute — a URL
 * in a comment is still a URL in the file.
 */
export function extractFromJavaScript(content: string): readonly Url[] {
	return toUrls(content, scanUrls(content));
}
