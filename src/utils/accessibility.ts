export interface AccessibilityResult {
	url: string;
	accessible: boolean;
	issues: readonly string[];
	severity: 'warning' | 'error';
	// Index signature for compatibility
	readonly [key: string]: unknown;
}

export async function checkUrlAccessibility(
	urls: string[],
): Promise<AccessibilityResult[]> {
	const results: AccessibilityResult[] = [];

	for (const url of urls) {
		try {
			const result = await checkSingleUrlAccessibility(url);
			results.push(result);
		} catch (error) {
			results.push({
				url,
				accessible: false,
				issues: [error instanceof Error ? error.message : 'Unknown error'],
				severity: 'error',
			});
		}
	}

	return results;
}

async function checkSingleUrlAccessibility(
	url: string,
): Promise<AccessibilityResult> {
	// Simplified accessibility check - in a real implementation, you'd analyze the URL
	// For now, just check if the URL looks accessible
	if (isAccessibleUrl(url)) {
		return {
			url,
			accessible: true,
			issues: [],
			severity: 'warning',
		};
	}

	return {
		url,
		accessible: false,
		issues: ['Accessibility issue detected'],
		severity: 'error',
	};
}

function isAccessibleUrl(url: string): boolean {
	// Simplified accessibility check
	// In a real implementation, you'd check for accessibility patterns
	return !url.includes('javascript:') && !url.includes('data:');
}
