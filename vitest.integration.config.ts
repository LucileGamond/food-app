import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Tests de src/api contre la Supabase locale (`npx supabase start`).
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: ['src/api/**'],
      exclude: ['src/api/index.ts', 'src/**/*.test.*'],
      reportsDirectory: 'coverage/integration',
      thresholds: { lines: 85, branches: 85, functions: 85, statements: 85 },
    },
  },
})
