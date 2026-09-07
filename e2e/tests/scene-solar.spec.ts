import { test, expect, type Page } from '@playwright/test'

// The solar cases boot the deterministic render harness via the `?fixture=scene-harness`
// seam (see app/app.tsx) and select a named canonical environment state with the `scene`
// query parameter. The named states resolve in app/harness-environment.ts to a fixed
// site (latitude 40 north, longitude 75 west, America/New_York) and a fixed observation
// instant, driving the SolarLightingProvider deterministically so each baseline pins one
// sun position. The -darwin baselines are renders from the development Mac's Metal tier,
// regenerated locally with --update-snapshots=all (ADR-0149); the -linux baselines are
// rendered on the CI runner by the refresh-scene-baselines workflow and checked there by
// the scene-visual job (ADR-0152).
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

// The finish-contrast baseline gates the glossy floor's specular response as pixels
// (rendering-realism lane 1, issue #541). The roughness defect this gate exists to catch
// spreads the specular lobe across the whole floor: nearly every pixel moves, each by a
// hair, so the standing shell tolerances never see it and the pair below is derived
// instead, per the two-probe midpoint variant recorded in ADR-0157's amendment.
//
// Derived on 2026-09-06 on the development Mac (darwin Metal, 320x240 canvas, 76800
// pixels), against the seeded baseline:
//
//   noise: five consecutive captures at threshold 0 and maxDiffPixelRatio 0 all passed,
//   so the render is deterministic and the noise band is 0.000000.
//   roughness-only probe (semi-gloss roughness 0.3 set to 0.9, sheen and specular kept):
//   53138 pixels differ at threshold 0 (ratio 0.6919); at threshold 0.02 only 54 pixels
//   remain (ratio 0.0007), and at 0.1 and above the comparison passes.
//   full-collapse probe (the semi-gloss entry set to the matte values, the #520 defect
//   class): 53344 pixels differ at threshold 0 (ratio 0.6946).
//
// So the per-pixel threshold is 0 (any deviation counts; the capture is deterministic)
// and the ratio gate goes at the midpoint between the zero noise band and the weaker
// probe signal: 0.6919 / 2 rounded to 0.346. An environmental drift that moves more
// than a third of the pixels turns this test red; that forces a deliberate baseline
// refresh, which is the standing discipline for the scene tier.
const FINISH_CONTRAST_THRESHOLD = 0
const FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO = 0.346

// The ambient-occlusion baseline gates the GTAO pass as pixels (rendering-realism lane 2,
// issue #522; re-derived for lane 4's indirect-only blend and again for lane 5's rendered
// normals target, issue #471). Each engine change moves what the defect probes can move,
// so the pair below is re-derived against the refreshed baselines, per the two-probe
// midpoint variant recorded in ADR-0157's amendment.
//
// Re-derived on 2026-09-07 on the development Mac (darwin Metal, 320x240 canvas, 76800
// pixels), against the normals-target baseline:
//
//   noise: five consecutive captures at threshold 0 and maxDiffPixelRatio 0 all passed,
//   so the render is deterministic and the noise band is 0.000000.
//   probe A, the no-op radius class (ADR-0158; AO_RADIUS_METERS 0.25 set to 0.00025):
//   pixels differing at threshold 0.35 / 0.2 / 0.1 / 0.05 / 0.02 / 0 were
//   0 / 0 / 53 / 358 / 2264 / 34049.
//   probe B, the 10x recalibration class (issue #522; AO_RADIUS_METERS 0.25 set to 2.5):
//   0 / 0 / 57 / 806 / 3134 / 9191.
//
// The weaker probe per rung first clears one percent of the frame at threshold 0.02
// (probe A, 2264 pixels, ratio 0.0295). The ratio gate goes at the midpoint between the
// zero noise band and that signal, rounded down so it stays at most half the signal:
// 0.014 (2.1x margin). The linux reading is measured from this lane's seeded red run
// before merge:
//
//   linux red-run reading (probe B seeded): pending; recorded by the lane before merge.
const AMBIENT_OCCLUSION_THRESHOLD = 0.02
const AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO = 0.014

// One harness capture: the query string that selects the state, the snapshot it must
// match, and optional per-capture overrides of the standing shell tolerances.
interface ShellCapture {
  readonly query: string
  readonly snapshot: string
  readonly threshold?: number
  readonly maxDiffPixelRatio?: number
}

async function captureShell(page: Page, capture: ShellCapture): Promise<void> {
  await page.goto(`/?fixture=scene-harness${capture.query}`)

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

  await expect(canvas).toHaveScreenshot(capture.snapshot, {
    threshold: capture.threshold ?? SHELL_THRESHOLD,
    maxDiffPixelRatio: capture.maxDiffPixelRatio ?? SHELL_MAX_DIFF_PIXEL_RATIO,
  })
}

test.describe('Solar environment visual baseline', () => {
  test('renders the equinox-noon solar environment to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=equinox-noon',
      snapshot: 'scene-equinox-noon-webgl.png',
    })
  })

  test('renders the winter-afternoon solar environment to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=winter-afternoon',
      snapshot: 'scene-winter-afternoon-webgl.png',
    })
  })

  test('renders the neutral color-check environment to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=color-check',
      snapshot: 'scene-color-check-webgl.png',
    })
  })

  test('renders the overcast-noon environment to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=overcast-noon',
      snapshot: 'scene-overcast-noon-webgl.png',
    })
  })

  test('renders the ambient-occlusion interior to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=ambient-occlusion',
      snapshot: 'scene-ambient-occlusion-webgl.png',
      threshold: AMBIENT_OCCLUSION_THRESHOLD,
      maxDiffPixelRatio: AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO,
    })
  })

  test('renders the window-light interior to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=window-light',
      snapshot: 'scene-window-light-webgl.png',
    })
  })

  test('renders the finish-contrast glossy floor to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=finish-contrast&paint=finish-contrast',
      snapshot: 'scene-finish-contrast-webgl.png',
      threshold: FINISH_CONTRAST_THRESHOLD,
      maxDiffPixelRatio: FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO,
    })
  })
})
