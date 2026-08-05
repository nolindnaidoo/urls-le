import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * XML (Maven POM, build configs, feeds): whole-content scan. v1.x ran a
 * URL-attribute pattern and a plain-text pattern over the same line and
 * emitted attribute URLs twice; a single scan reports each occurrence
 * once, at its real offset.
 */
export function extractFromXml(content: string): readonly Url[] {
	return toUrls(content, scanUrls(content));
}
