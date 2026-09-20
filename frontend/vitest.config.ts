import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  esbuild: { jsx: 'automatic' },
  // Integration cases import the real server compiler and its local skill assets.
  server: { fs: { allow: [fileURLToPath(new URL('../', import.meta.url))] } },
  test: { environment: 'jsdom', include: ['tests/**/*.test.{ts,tsx}'], restoreMocks: true, pool: 'threads', maxWorkers: 1 },
})
