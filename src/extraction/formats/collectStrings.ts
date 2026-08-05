/**
 * Every string value in a parsed document tree, at any depth.
 *
 * Shared by the TOML and INI extractors, which parse into the same shape of
 * nested plain objects and arrays and each carried an identical copy.
 */
export function collectStrings(node: unknown): readonly string[] {
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
