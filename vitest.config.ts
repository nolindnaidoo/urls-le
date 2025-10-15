import path from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vitest/config'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'threads',
    setupFiles: [],
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.bench.ts',
        'test/**',
        'dist/**',
        'src/__mocks__/**',
        '**/node_modules/**',
        '**/coverage/**',
        '**/release/**',
        '**/docs/**',
        '**/*.config.*',
      ],
    },
  },
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, 'test/vscode.mock.ts'),
    },
  },
})
