import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_EXCLUDED_FILES,
	DEFAULT_EXCLUDED_FOLDERS,
	DEFAULT_EXCLUDED_PATHS,
} from '../workspace/defaults';
import { CONFIG_DEFAULTS } from './config';

/**
 * CONFIG_DEFAULTS must stay identical to the defaults declared in
 * package.json contributes.configuration — v1.x shipped with the two
 * silently disagreeing (postProcess.openInNewFile et al).
 */
describe('config defaults parity with package.json', () => {
	const manifest = JSON.parse(
		readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
	) as {
		contributes: {
			configuration: { properties: Record<string, { default: unknown }> };
		};
	};
	const props = manifest.contributes.configuration.properties;

	const KEY_MAP: Record<string, keyof typeof CONFIG_DEFAULTS> = {
		'urls-le.clipboardIncludesPositions': 'clipboardIncludesPositions',
		'urls-le.copyToClipboardEnabled': 'copyToClipboardEnabled',
		'urls-le.dedupeEnabled': 'dedupeEnabled',
		'urls-le.notificationsLevel': 'notificationsLevel',
		'urls-le.postProcess.openInNewFile': 'postProcessOpenInNewFile',
		'urls-le.openResultsSideBySide': 'openResultsSideBySide',
		'urls-le.safety.enabled': 'safetyEnabled',
		'urls-le.safety.fileSizeWarnBytes': 'safetyFileSizeWarnBytes',
		'urls-le.safety.largeOutputLinesThreshold':
			'safetyLargeOutputLinesThreshold',
		'urls-le.showPositions': 'showPositions',
		'urls-le.statusBar.enabled': 'statusBarEnabled',
		'urls-le.telemetryEnabled': 'telemetryEnabled',
		'urls-le.workspace.scanAlwaysInclude': 'workspaceScanAlwaysInclude',
		'urls-le.workspace.scanExcludes': 'workspaceScanExcludes',
		'urls-le.workspace.scanMaxFiles': 'workspaceScanMaxFiles',
		'urls-le.workspace.scanMaxResults': 'workspaceScanMaxResults',
		'urls-le.workspace.scanPatterns': 'workspaceScanPatterns',
		'urls-le.workspace.scanRespectGitignore': 'workspaceScanRespectGitignore',
		'urls-le.workspace.scanSkipBinaryFiles': 'workspaceScanSkipBinaryFiles',
		'urls-le.workspace.scanUseDefaultExcludes':
			'workspaceScanUseDefaultExcludes',
	};

	it('covers every declared setting', () => {
		expect(Object.keys(props).sort()).toEqual(Object.keys(KEY_MAP).sort());
	});

	for (const [manifestKey, defaultsKey] of Object.entries(KEY_MAP)) {
		it(`${manifestKey} default matches`, () => {
			expect(CONFIG_DEFAULTS[defaultsKey]).toEqual(props[manifestKey]?.default);
		});
	}
});

describe('the README states the scan limits the code uses', () => {
	const readme = readFileSync(join(__dirname, '..', '..', 'README.md'), 'utf8');
	const grouped = (n: number) => n.toLocaleString('en-US');

	it('in the settings table', () => {
		expect(readme).toContain(
			`| \`urls-le.workspace.scanMaxFiles\` | \`${CONFIG_DEFAULTS.workspaceScanMaxFiles}\` |`,
		);
		expect(readme).toContain(
			`| \`urls-le.workspace.scanMaxResults\` | \`${CONFIG_DEFAULTS.workspaceScanMaxResults}\` |`,
		);
	});

	it('in the prose', () => {
		expect(readme).toContain(
			`It stops at ${grouped(CONFIG_DEFAULTS.workspaceScanMaxFiles)} files or ${grouped(CONFIG_DEFAULTS.workspaceScanMaxResults)} listed occurrences.`,
		);
	});
});

describe('the README lists the folders a scan skips', () => {
	it('exactly as the code has them', () => {
		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const listed =
			/<!-- built-in-folders -->\n(.*)\n<!-- \/built-in-folders -->/
				.exec(readme)?.[1]
				?.split(', ')
				.map((entry) => entry.replace(/`/g, ''));
		expect(listed).toEqual([...DEFAULT_EXCLUDED_FOLDERS, '*.egg-info']);
	});

	it('and the files, exactly as the code has them', () => {
		const readme = readFileSync(
			join(__dirname, '..', '..', 'README.md'),
			'utf8',
		);
		const listed = /<!-- built-in-files -->\n(.*)\n<!-- \/built-in-files -->/
			.exec(readme)?.[1]
			?.split(', ')
			.map((entry) => entry.replace(/`/g, ''));
		expect(listed).toEqual([
			...DEFAULT_EXCLUDED_FILES,
			...DEFAULT_EXCLUDED_PATHS,
		]);
	});
});
