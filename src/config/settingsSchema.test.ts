import { describe, expect, it } from 'vitest';
import {
	isSafeValue,
	SETTINGS_SCHEMA,
	validateFileSize,
	validateSettings,
} from './settingsSchema';

describe('Settings Schema', () => {
	describe('SETTINGS_SCHEMA', () => {
		it('contains expected core settings', () => {
			expect(SETTINGS_SCHEMA).toHaveProperty('copyToClipboardEnabled');
			expect(SETTINGS_SCHEMA).toHaveProperty('dedupeEnabled');
			expect(SETTINGS_SCHEMA).toHaveProperty('notificationsLevel');
			expect(SETTINGS_SCHEMA).toHaveProperty('openResultsSideBySide');
		});

		it('contains URL-specific settings', () => {
			expect(SETTINGS_SCHEMA).toHaveProperty(['csv.streamingEnabled']);
			expect(SETTINGS_SCHEMA).toHaveProperty(['analysis.includeSecurity']);
			expect(SETTINGS_SCHEMA).toHaveProperty(['validation.followRedirects']);
		});

		it('has proper enum constraints', () => {
			const notificationsLevel = SETTINGS_SCHEMA.notificationsLevel;
			expect(notificationsLevel.enum).toEqual(['all', 'important', 'silent']);

			const presetSetting = SETTINGS_SCHEMA['presets.defaultPreset'];
			expect(presetSetting.enum).toContain('urls');
		});
	});

	describe('validateSettings', () => {
		it('validates valid settings', () => {
			const validSettings = {
				copyToClipboardEnabled: true,
				dedupeEnabled: false,
				notificationsLevel: 'important',
				'safety.fileSizeWarnBytes': 1000000,
				'analysis.enabled': true,
			};

			const result = validateSettings(validSettings);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.validSettings).toEqual(validSettings);
		});

		it('rejects invalid types', () => {
			const invalidSettings = {
				copyToClipboardEnabled: 'not-boolean',
				'safety.fileSizeWarnBytes': 'not-number',
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('Expected boolean, got string');
			expect(result.errors[1]).toContain('Expected number, got string');
		});

		it('rejects invalid enum values', () => {
			const invalidSettings = {
				notificationsLevel: 'invalid-level',
				'presets.defaultPreset': 'invalid-preset',
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('not in allowed values');
			expect(result.errors[1]).toContain('not in allowed values');
		});

		it('validates number ranges', () => {
			const invalidSettings = {
				'safety.fileSizeWarnBytes': 500, // below minimum
				'validation.timeout': 100_000, // above maximum
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('below minimum');
			expect(result.errors[1]).toContain('above maximum');
		});

		it('rejects non-finite numbers', () => {
			const invalidSettings = {
				'safety.fileSizeWarnBytes': Number.POSITIVE_INFINITY,
				'validation.timeout': NaN,
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('finite number');
			expect(result.errors[1]).toContain('finite number');
		});

		it('rejects unknown settings', () => {
			const invalidSettings = {
				unknownSetting: true,
				'unknown.nested': 'value',
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.errors[0]).toContain('Unknown setting');
			expect(result.errors[1]).toContain('Unknown setting');
		});

		it('rejects dangerous keys', () => {
			const dangerousSettings = {
				constructor: 'dangerous',
				prototype: 'bad',
			};

			const result = validateSettings(dangerousSettings);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThanOrEqual(2);
			expect(
				result.errors.some((error) => error.includes('Dangerous setting key')),
			).toBe(true);
		});

		it('rejects non-object input', () => {
			const inputs = [null, undefined, 'string', 123, true, []];

			for (const input of inputs) {
				const result = validateSettings(input);
				expect(result.valid).toBe(false);
				expect(result.errors[0]).toContain('must be a');
			}
		});

		it('rejects non-plain objects', () => {
			class CustomClass {}
			const customObject = new CustomClass();

			const result = validateSettings(customObject);

			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('plain JSON object');
		});

		it('rejects objects with too many keys', () => {
			const tooManyKeys: Record<string, unknown> = {};
			for (let i = 0; i < 101; i++) {
				tooManyKeys[`key${i}`] = true;
			}

			const result = validateSettings(tooManyKeys);

			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('too many keys');
		});

		it('validates string length constraints', () => {
			const longString = 'a'.repeat(501);
			const invalidSettings = {
				'keyboard.extractShortcut': longString,
			};

			const result = validateSettings(invalidSettings);

			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain('String value too long');
		});

		it('returns valid settings even with some invalid ones', () => {
			const mixedSettings = {
				copyToClipboardEnabled: true, // valid
				invalidSetting: 'bad', // invalid
				'safety.fileSizeWarnBytes': 2000000, // valid
				notificationsLevel: 'invalid', // invalid
			};

			const result = validateSettings(mixedSettings);

			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(2);
			expect(result.validSettings).toEqual({
				copyToClipboardEnabled: true,
				'safety.fileSizeWarnBytes': 2000000,
			});
		});
	});

	describe('isSafeValue', () => {
		it('allows safe primitive values', () => {
			expect(isSafeValue(true)).toBe(true);
			expect(isSafeValue(false)).toBe(true);
			expect(isSafeValue(123)).toBe(true);
			expect(isSafeValue('string')).toBe(true);
			expect(isSafeValue(null)).toBe(true);
			expect(isSafeValue(undefined)).toBe(true);
		});

		it('rejects unsafe values', () => {
			expect(isSafeValue({})).toBe(false);
			expect(isSafeValue([])).toBe(false);
			expect(isSafeValue(() => {})).toBe(false);
			expect(isSafeValue(Symbol('test'))).toBe(false);
		});
	});

	describe('validateFileSize', () => {
		it('allows valid file sizes', () => {
			expect(validateFileSize(1000)).toBeNull();
			expect(validateFileSize(50 * 1024)).toBeNull(); // 50KB
			expect(validateFileSize(100 * 1024)).toBeNull(); // 100KB exactly
		});

		it('rejects files that are too large', () => {
			const result = validateFileSize(200 * 1024); // 200KB
			expect(result).toContain('too large');
			expect(result).toContain('Maximum allowed');
		});

		it('rejects empty files', () => {
			const result = validateFileSize(0);
			expect(result).toContain('empty');
		});

		it('handles edge cases', () => {
			expect(validateFileSize(100 * 1024 + 1)).toContain('too large');
			expect(validateFileSize(1)).toBeNull();
		});
	});
});
