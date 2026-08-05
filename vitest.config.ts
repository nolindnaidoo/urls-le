import { defineConfig } from 'vitest/config';

// Identical in every *-le repo. Paths are glob-based rather than repo-specific
// so this file can be copied across without edits; coverage is measured and
// reported but not gated.
export default defineConfig({
	test: {
		environment: 'node',
		globals: true,
		pool: 'threads',
		include: ['src/**/*.test.ts'],
		exclude: ['node_modules/**', 'dist/**', 'out-test/**'],
		coverage: {
			provider: 'v8',
			thresholds: {
				lines: 75,
				functions: 80,
				branches: 60,
				statements: 75,
			},
			reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
			include: ['src/**/*.ts'],
			exclude: [
				'src/**/*.test.ts',
				'src/**/*.bench.ts',
				'src/**/__mocks__/**',
				'src/**/__fixtures__/**',
				'src/**/__snapshots__/**',
				'src/**/__performance__/**',
				'src/**/__data__/**',
				'src/i18n/**',
				'src/types.ts',
				// Process wiring: it calls serve() and exits. The protocol it
				// wires up is covered by check-mcp-bundle.js against the built file.
				'src/mcp/server.ts',
				'src/mcp/info.ts',
			],
		},
	},
	resolve: {
		alias: {
			vscode: new URL('./src/__mocks__/vscode.ts', import.meta.url).pathname,
		},
	},
});
