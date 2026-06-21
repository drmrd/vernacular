import { defineConfig, devices } from '@playwright/test'

// Visual-regression baselines for the built Storybook stories. This lives in its
// own Playwright config, separate from the app end-to-end suite, because its
// webServer serves the static Storybook build (storybook-static/) rather than the
// app preview, and Playwright starts every configured webServer for any run.
//
// Baselines are committed and linux-only: they are generated in docker
// (linux/amd64) via `pnpm stories:update-snapshots` so they match the CI runner
// (ubuntu). A darwin host running this project mismatches by design, so it is not
// part of the default local `pnpm e2e`. See
// docs/knowledge/decisions/ADR-0117-storybook-story-visual-regression.md and
// docs/plans/2026-06-20-storybook-visual-regression.md.

const PORT = 6107
const baseURL = `http://localhost:${PORT}`
const STORYBOOK_STATIC_DIR = 'storybook-static'
const WEB_SERVER_TIMEOUT_MS = 60_000

// Story screenshots are component renders (text, borders, fills); a small ratio
// absorbs sub-pixel antialiasing between the docker baseline and the CI runner
// while still catching real visual changes. Widen per-story only if one proves
// flaky.
const STORY_DIFF_TOLERANCE = 0.01

export default defineConfig({
  testDir: './e2e/stories',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Every committed baseline is generated in linux docker, so pin the snapshot
  // suffix to `linux` regardless of the host that runs the diff.
  snapshotPathTemplate: 'e2e/stories/__screenshots__/{arg}-linux{ext}',
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: STORY_DIFF_TOLERANCE,
      animations: 'disabled',
    },
  },
  projects: [{ name: 'stories', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `node scripts/serve-static.mjs ${STORYBOOK_STATIC_DIR} ${PORT}`,
    // The static server 404s on `/` (no index fallback), and Playwright treats a
    // 404 as "not ready", so probe a file that really exists.
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: WEB_SERVER_TIMEOUT_MS,
  },
})
