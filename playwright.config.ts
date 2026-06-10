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
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /scene-visual-regression\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /scene-visual-regression\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /scene-visual-regression\.spec\.ts/,
    },
    {
      // WebGPU-capable runner for the three-dimensional scene visual harness.
      // Uses the full Chrome for Testing build (channel 'chromium') with the new
      // headless mode, which carries the GPU stack the stripped-down default
      // headless shell omits. The harness self-skips where no WebGPU adapter is
      // present: verified absent under Playwright on the development Mac on
      // 2026-06-09 (software-only SwiftShader fallback, navigator.gpu undefined),
      // so the baseline is produced on a WebGPU-capable runner. See the slice-0
      // ADR for the durable record of this verification.
      name: 'webgpu',
      testMatch: /scene-visual-regression\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chromium',
        launchOptions: {
          args: [
            '--enable-unsafe-webgpu',
            '--use-angle=metal',
            '--use-gpu-in-tests',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
