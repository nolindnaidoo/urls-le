import { describe, expect, it } from 'vitest';
import { sanitizeErrorMessage } from './errors';

describe('sanitizeErrorMessage', () => {
	it('redacts macOS and Linux home directories', () => {
		expect(sanitizeErrorMessage('ENOENT /Users/alice/project/x')).toBe(
			'ENOENT /Users/***/project/x',
		);
		expect(sanitizeErrorMessage('read /home/bob/secrets')).toBe(
			'read /home/***/secrets',
		);
	});

	it('redacts Windows user directories', () => {
		expect(sanitizeErrorMessage('open C:\\Users\\carol\\file.txt')).toBe(
			'open C:\\Users\\***\\file.txt',
		);
	});

	it('redacts credential-shaped fragments', () => {
		expect(sanitizeErrorMessage('failed: password=hunter2 rejected')).toBe(
			'failed: password=*** rejected',
		);
		expect(sanitizeErrorMessage('token: abc123')).toBe('token=***');
	});

	it('passes ordinary messages through', () => {
		expect(sanitizeErrorMessage('Unexpected end of input')).toBe(
			'Unexpected end of input',
		);
	});
});
