import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // sqlite-wasm loads its .wasm via import.meta.url, so it must not be pre-bundled
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  // Playwright owns e2e/, so Vitest only looks at unit tests next to the code
  test: { include: ['src/**/*.test.ts', 'electron/**/*.test.ts'] },
})
