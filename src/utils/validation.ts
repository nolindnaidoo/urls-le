import type { Configuration, ValidationResult } from '../types';
import { validateUrl } from './urlValidation';

export async function validateUrls(
	urls: string[],
	_config: Configuration,
): Promise<ValidationResult[]> {
	const results: ValidationResult[] = [];

	for (const url of urls) {
		try {
			const result = await validateUrl(url, {
				timeout: 5000, // Default 5 second timeout
				followRedirects: true, // Default to following redirects
			});
			results.push(result);
		} catch (error) {
			results.push({
				url,
				status: 'error',
				error: error instanceof Error ? error.message : 'Unknown error',
			});
		}
	}

	return results;
}
