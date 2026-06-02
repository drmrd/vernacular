import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:4173'

const SCREENSHOT_DIFF_TOLERANCE = 0.02

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: SCREENSHOT_DIFF_TOLERANCE,
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
