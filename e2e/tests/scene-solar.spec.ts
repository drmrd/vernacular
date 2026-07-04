import { test, expect, type Page } from '@playwright/test'

// The solar cases boot the deterministic render harness via the `?fixture=scene-harness`
// seam (see app/app.tsx) and select a named canonical environment state with the `scene`
// query parameter. The named states resolve in app/harness-environment.ts to a fixed
// site (latitude 40 north, longitude 75 west, America/New_York) and a fixed observation
// instant, driving the SolarLightingProvider deterministically so each baseline pins one
// sun position. Baselines are darwin renders from the development Mac's Metal tier,
// regenerated locally with --update-snapshots=all; continuous integration neither renders
// nor checks them, because the CI end-to-end job ignores scene specs (ADR-0149 records
// the convention and why the plans' CI-runner assumption was wrong).
//
// Self-skip policy: unlike the absent-WebGPU case, the harness renders via whatever
// backend the runner provides and only self-skips when no WebGL 2 context can be created
// at all (a runner with no usable GPU stack), so it does not vacuously skip everywhere.

// Pixel-approximate, not pixel-exact: a generous per-pixel threshold and a tolerant
// different-pixel ratio absorb graphics-driver and antialiasing variation on the lit
// shell, since the solar-position math is already proven by the core environment
// reference tests and the named-state resolution by app/harness-environment.test.ts.
const SHELL_THRESHOLD = 0.35
const SHELL_MAX_DIFF_PIXEL_RATIO = 0.05

async function captureShell(page: Page, query: string, snapshot: string): Promise<void> {
  await page.goto(`/?fixture=scene-harness${query}`)

  const canvas = page.locator('[data-testid="scene-harness"] canvas')
  await expect(canvas).toBeVisible()

  const hasWebGl2 = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return probe.getContext('webgl2') !== null
  })
  test.skip(!hasWebGl2, 'No WebGL 2 context on this runner; scene harness self-skips here.')

  // The harness renders a single static frame on mount (no animation). Wait for the
  // canvas backing store to reach its pinned size so the rendered frame is in the
  // compositor before screenshotting. The frame contents are verified out of band
  // against the committed baseline; with preserveDrawingBuffer off a 2D-readback of the
  // canvas reads an already-cleared buffer, so the compositor screenshot is the source
  // of truth, not an in-page pixel poll.
  await expect
    .poll(() => canvas.evaluate((element) => (element as HTMLCanvasElement).width), {
      message: 'waiting for the harness canvas to size its backing store',
    })
    .toBeGreaterThan(0)

  // The visible sky arrives through a lazily loaded chunk, so the mount frame renders
  // without it. The harness draws a second frame once the lighting reports ready and
  // marks data-harness-ready in the same commit pass, so awaiting the attribute
  // guarantees the screenshot captures the sky-lit frame, not the placeholder background.
  await expect(page.getByTestId('scene-harness')).toHaveAttribute('data-harness-ready', 'true')

  await expect(canvas).toHaveScreenshot(snapshot, {
    threshold: SHELL_THRESHOLD,
    maxDiffPixelRatio: SHELL_MAX_DIFF_PIXEL_RATIO,
  })
}

test.describe('Solar environment visual baseline', () => {
  test('renders the equinox-noon solar environment to its baseline', async ({ page }) => {
    await captureShell(page, '&scene=equinox-noon', 'scene-equinox-noon-webgl.png')
  })

  test('renders the winter-afternoon solar environment to its baseline', async ({ page }) => {
    await captureShell(page, '&scene=winter-afternoon', 'scene-winter-afternoon-webgl.png')
  })

  test('renders the neutral color-check environment to its baseline', async ({ page }) => {
    await captureShell(page, '&scene=color-check', 'scene-color-check-webgl.png')
  })

  test('renders the overcast-noon environment to its baseline', async ({ page }) => {
    await captureShell(page, '&scene=overcast-noon', 'scene-overcast-noon-webgl.png')
  })
})
