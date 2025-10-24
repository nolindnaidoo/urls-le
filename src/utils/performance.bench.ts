import { bench } from 'vitest';
import { extractUrls } from '../extraction/extract';

// Test data generators
function generateHtmlContent(size: number): string {
	const urls = [
		'https://example.com',
		'https://github.com/user/repo',
		'mailto:user@example.com',
		'tel:+1234567890',
		'ftp://files.example.com',
	];
	const elements = [];

	for (let i = 0; i < size; i++) {
		const url = urls[i % urls.length];
		elements.push(`<a href="${url}">Link ${i}</a>`);
	}

	return elements.join('\n');
}

function generateMarkdownContent(size: number): string {
	const urls = [
		'https://example.com',
		'https://github.com/user/repo',
		'mailto:user@example.com',
		'tel:+1234567890',
		'ftp://files.example.com',
	];
	const links = [];

	for (let i = 0; i < size; i++) {
		const url = urls[i % urls.length];
		links.push(`[Link ${i}](${url})`);
	}

	return links.join('\n');
}

function generateJavaScriptContent(size: number): string {
	const urls = [
		'https://example.com',
		'https://github.com/user/repo',
		'mailto:user@example.com',
		'tel:+1234567890',
		'ftp://files.example.com',
	];
	const variables = [];

	for (let i = 0; i < size; i++) {
		const url = urls[i % urls.length];
		variables.push(`const url${i} = "${url}";`);
	}

	return variables.join('\n');
}

// Benchmark tests
bench('extractUrls: HTML - 1KB', async () => {
	const content = generateHtmlContent(50);
	await extractUrls(content, 'html');
});

bench('extractUrls: HTML - 10KB', async () => {
	const content = generateHtmlContent(500);
	await extractUrls(content, 'html');
});

bench('extractUrls: HTML - 100KB', async () => {
	const content = generateHtmlContent(5000);
	await extractUrls(content, 'html');
});

bench('extractUrls: HTML - 1MB', async () => {
	const content = generateHtmlContent(50000);
	await extractUrls(content, 'html');
});

bench('extractUrls: Markdown - 1KB', async () => {
	const content = generateMarkdownContent(50);
	await extractUrls(content, 'markdown');
});

bench('extractUrls: Markdown - 10KB', async () => {
	const content = generateMarkdownContent(500);
	await extractUrls(content, 'markdown');
});

bench('extractUrls: Markdown - 100KB', async () => {
	const content = generateMarkdownContent(5000);
	await extractUrls(content, 'markdown');
});

bench('extractUrls: Markdown - 1MB', async () => {
	const content = generateMarkdownContent(50000);
	await extractUrls(content, 'markdown');
});

bench('extractUrls: JavaScript - 1KB', async () => {
	const content = generateJavaScriptContent(50);
	await extractUrls(content, 'javascript');
});

bench('extractUrls: JavaScript - 10KB', async () => {
	const content = generateJavaScriptContent(500);
	await extractUrls(content, 'javascript');
});

bench('extractUrls: JavaScript - 100KB', async () => {
	const content = generateJavaScriptContent(5000);
	await extractUrls(content, 'javascript');
});

bench('extractUrls: JavaScript - 1MB', async () => {
	const content = generateJavaScriptContent(50000);
	await extractUrls(content, 'javascript');
});

// Memory usage tests
bench('extractUrls: Memory usage - Large HTML', async () => {
	const content = generateHtmlContent(10000);
	await extractUrls(content, 'html');

	// Log memory usage if available
	if (typeof process !== 'undefined' && process.memoryUsage) {
		console.log('Memory usage:', process.memoryUsage());
	}
});

bench('extractUrls: Memory usage - Large Markdown', async () => {
	const content = generateMarkdownContent(10000);
	await extractUrls(content, 'markdown');

	// Log memory usage if available
	if (typeof process !== 'undefined' && process.memoryUsage) {
		console.log('Memory usage:', process.memoryUsage());
	}
});

bench('extractUrls: Memory usage - Large JavaScript', async () => {
	const content = generateJavaScriptContent(10000);
	await extractUrls(content, 'javascript');

	// Log memory usage if available
	if (typeof process !== 'undefined' && process.memoryUsage) {
		console.log('Memory usage:', process.memoryUsage());
	}
});
