import type { Url } from '../../types';
import { scanUrls, toUrls } from '../heuristics';

/**
 * YAML: whole-content scan, comments included (as in v1.x — a URL in a
 * commented-out line is still discoverable). Protocols are real; v1.x
 * labeled every http URL 'https'.
 */
export function extractFromYaml(content: string): readonly Url[] {
	return toUrls(content, scanUrls(content));
}
