import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * CSS: whole-content scan. url(...) needs no special casing — quoted or
 * bare, the URL terminates at the quote/paren delimiter. v1.x labeled
 * every http URL 'https'; protocols are now real.
 */
export function extractFromCss(content: string): readonly Url[] {
	return toUrls(content, scanUrls(content));
}
