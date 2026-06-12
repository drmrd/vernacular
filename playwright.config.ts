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
      testIgnore: /scene-.*\.spec\.ts/,
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /scene-.*\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testIgnore: /scene-.*\.spec\.ts/,
    },
    {
      // Hardware-GPU runner for the three-dimensional scene specs (the visual harness and
      // the live-preview camera-framing regression, matched by the scene-*.spec.ts name).
      // Uses the full Chrome for Testing build (channel 'chromium') with the new headless
      // mode, which carries the GPU stack the stripped-down default headless shell omits, and
      // selects the Apple Metal ANGLE backend so WebGL 2 renders on the real GPU rather
      // than a software rasterizer. The harness forces three's WebGL 2 backend so the
      // committed baseline (scene-empty-webgl.png) is a hardware-WebGL render that never
      // collides with a future WebGPU baseline. Empirically verified on the development
      // Mac on 2026-06-09: under these flags navigator.gpu is present and WebGPU also
      // renders, but the baseline is pinned to the WebGL backend by product decision.
      // See the slice-0 ADR for the durable record of this verification.
      name: 'scene-webgl',
      testMatch: /scene-.*\.spec\.ts/,
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
