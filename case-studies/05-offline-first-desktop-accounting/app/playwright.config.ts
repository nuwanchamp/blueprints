import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5173', channel: 'chrome', viewport: { width: 1440, height: 960 } },
  webServer: { command: 'npx vite --port 5173 --host 127.0.0.1', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
})
