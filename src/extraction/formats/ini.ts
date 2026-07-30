import * as ini from 'ini';
import type { Url } from '../../types';
import {
	locateParsedValues,
	scanUrls,
	toUnpositionedUrls,
	toUrls,
} from '../heuristics';

/**
 * INI: parse, walk string values, then forward-locate each URL in the
 * source for a real position — v1.x returned no positions at all from
 * this path. Comment lines (; or #) never contribute (the parser drops
 * them). On a parse error the whole content is scanned instead.
 */
export function extractFromIni(content: string): Url[] {
	try {
		const parsed = ini.parse(content);
		const strings = collectStrings(parsed);
		const { located, unlocated } = locateParsedValues(content, strings);
		return [...toUrls(content, located), ...toUnpositionedUrls(unlocated)];
	} catch (error) {
		console.warn('[URLs-LE] INI parsing failed, using fallback:', error);
		return toUrls(content, scanUrls(content));
	}
}

function collectStrings(node: unknown): string[] {
	if (typeof node === 'string') {
		return [node];
	}
	if (Array.isArray(node)) {
		return node.flatMap(collectStrings);
	}
	if (node && typeof node === 'object') {
		return Object.values(node).flatMap(collectStrings);
	}
	return [];
}
