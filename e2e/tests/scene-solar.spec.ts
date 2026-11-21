import { test, expect, type Page } from '@playwright/test'
import { openHarnessScene } from './scene-helpers'

// The solar cases boot the deterministic render harness via the `?fixture=scene-harness`
// seam (see app/app.tsx) and select a named canonical environment state with the `scene`
// query parameter. The named states resolve in app/harness-environment.ts to a fixed
// observation instant. Most states also pin a located site (latitude 40 north, longitude
// 75 west, America/New_York), driving the SolarLightingProvider deterministically so each
// baseline pins one sun position. The daylight-reference state pins a different site,
// DAYLIGHT_REFERENCE_SITE in app/harness-environment.ts (time zone UTC). The
// sample-daylight state is the one with no site location: it pins the opening instant,
// and the sun comes from the sample place with north implied by the front of the
// building, so its baseline pins one sun position too.
// The -darwin baselines are renders from the development Mac's Metal tier,
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
// Re-derived on 2026-11-20 on the development Mac (darwin Metal, 320x240 canvas, 76800
// pixels), with Playwright's own image comparator, each probe frame against the shipped
// frame, after the sheen lobe took the paint color (issue #629; the shipped frame moved
// 46909 pixels at threshold 0 against the frame before it):
//
//   noise: five consecutive captures of each build were byte-identical, so the render is
//   deterministic and the noise band is 0.000000.
//   roughness-only probe (semi-gloss roughness 0.3 set to 0.9, sheen and specular kept):
//   46797 pixels differ at threshold 0 (ratio 0.6093); at threshold 0.02 only 49 pixels
//   remain, at 0.05 only 3, and at 0.1 and above the comparison passes.
//   full-collapse probe (the semi-gloss entry set to the matte values, the #520 defect
//   class): 46899 pixels differ at threshold 0 (ratio 0.6107); 46420 at 0.02, 8 at 0.05.
//
// So the per-pixel threshold is 0 (any deviation counts; the capture is deterministic)
// and the ratio gate goes at the midpoint between the zero noise band and the weaker
// probe signal: 0.6093 / 2 rounded down to 0.304. An environmental drift that moves
// nearly a third of the pixels turns this test red; that forces a deliberate baseline
// refresh, which is the standing discipline for the scene tier.
const FINISH_CONTRAST_THRESHOLD = 0
const FINISH_CONTRAST_MAX_DIFF_PIXEL_RATIO = 0.304

// The ambient-occlusion baseline gates the GTAO pass as pixels (rendering-realism lane 2,
// issue #522; re-derived for lane 4's indirect-only blend, for lane 5's rendered normals
// target, issue #471, for the outward wall faces, issue #491, for the calibrated daylight, and
// for the grey ground of the dome, the air-path fade of the sun, and the sky gain that follows
// the sun's height). Each engine change moves what the defect probes can move, so the pair below
// is re-derived against the shipped frame the refreshed baseline will hold, per the two-probe
// midpoint variant recorded in ADR-0157's amendment.
//
// Re-derived on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
// 320x240 frame, 76800 pixels), with Playwright's own image comparator, each probe frame
// against the shipped frame:
//
//   noise: five consecutive captures of each build were byte-identical, so the render is
//   deterministic and the noise band is 0.000000.
//   probe A, the no-op radius class (ADR-0158; AO_RADIUS_METERS 0.25 set to 0.00025):
//   pixels differing at threshold 0.35 / 0.2 / 0.1 / 0.05 / 0.02 / 0 were
//   0 / 0 / 7 / 51 / 2018 / 31683.
//   probe B, the 10x recalibration class (issue #522; AO_RADIUS_METERS 0.25 set to 2.5):
//   0 / 0 / 2 / 118 / 616 / 7273.
//   Linux: not yet recorded for this derivation.
//
// The weaker probe per rung first clears one percent of the frame at threshold 0 (probe B,
// 7273 pixels, ratio 0.0947); at threshold 0.02 the weaker probe moves only 616 pixels (ratio
// 0.0080). The ratio gate goes at the midpoint between the zero noise band and that signal,
// rounded down so it stays at most half the signal: 0.047 (2.0x margin). Before these three
// changes probe B moved 6699 pixels at threshold 0 and the ratio was 0.043.
const AMBIENT_OCCLUSION_THRESHOLD = 0
const AMBIENT_OCCLUSION_MAX_DIFF_PIXEL_RATIO = 0.047

// One harness capture: the query string that selects the state, the snapshot it must
// match, and optional per-capture overrides of the standing shell tolerances.
interface ShellCapture {
  readonly query: string
  readonly snapshot: string
  readonly threshold?: number
  readonly maxDiffPixelRatio?: number
}

async function captureShell(page: Page, capture: ShellCapture): Promise<void> {
  const canvas = await openHarnessScene(page, capture.query, 'scene harness')

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
  // without it. The harness draws its ready frame in the renderer's own animation loop, on a
  // frame of its own, and data-harness-ready turns true in the commit after that frame was
  // drawn, so awaiting the attribute guarantees the screenshot captures the sky-lit frame.
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

  test('renders the shadow on the lawn to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=shadow-on-lawn',
      snapshot: 'scene-shadow-on-lawn-webgl.png',
    })
  })

  test('renders sample daylight to its baseline', async ({ page }) => {
    await captureShell(page, {
      query: '&scene=sample-daylight',
      snapshot: 'scene-sample-daylight-webgl.png',
    })
  })
})
