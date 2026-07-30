import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractUrls } from './extract';

/**
 * Characterization tests: pin the CURRENT extraction output per format,
 * including known bugs (CSS/JSON/YAML labeling http URLs as https,
 * TOML/INI results missing positions, XML double-extracting attribute
 * URLs, per-format dedupe divergence, per-line loops). Behavior changes
 * must update these snapshots in the same commit, so every output diff
 * is explicit.
 */

const FIXTURES: ReadonlyArray<{ fixture: string; languageId: string }> = [
	{ fixture: 'urls.md', languageId: 'markdown' },
	{ fixture: 'urls.html', languageId: 'html' },
	{ fixture: 'urls.css', languageId: 'css' },
	{ fixture: 'urls.js', languageId: 'javascript' },
	{ fixture: 'urls.js', languageId: 'typescript' },
	{ fixture: 'urls.json', languageId: 'json' },
	{ fixture: 'urls.yaml', languageId: 'yaml' },
	{ fixture: 'urls.properties', languageId: 'properties' },
	{ fixture: 'urls.toml', languageId: 'toml' },
	{ fixture: 'broken.toml', languageId: 'toml' },
	{ fixture: 'urls.ini', languageId: 'ini' },
	{ fixture: 'urls.xml', languageId: 'xml' },
];

describe('extraction characterization', () => {
	for (const { fixture, languageId } of FIXTURES) {
		it(`${fixture} as ${languageId}`, async () => {
			const content = readFileSync(
				join(__dirname, '__fixtures__', fixture),
				'utf8',
			);
			const result = await extractUrls(content, languageId);
			expect(result).toMatchSnapshot();
		});
	}

	it('unknown language returns a format error', async () => {
		const result = await extractUrls(
			'see https://fallback.example.com/plain',
			'python',
		);
		expect(result).toMatchSnapshot();
	});
});
