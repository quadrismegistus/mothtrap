import { defineConfig, devices } from '@playwright/test'

// E2E runs against a production `vite preview` of the built app in demo mode
// (?demo=1), so no login/network is needed. The webServer builds first so the
// served bundle always matches the working tree — previewing a stale build
// silently tests old code (it burned us: local runs passed on code CI failed).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
