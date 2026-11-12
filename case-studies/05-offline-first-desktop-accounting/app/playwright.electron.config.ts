import { defineConfig } from '@playwright/test'

// The desktop app: each test launches the built Electron app (run `npm run electron:build` first)
export default defineConfig({
  testDir: 'e2e-electron',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
})
