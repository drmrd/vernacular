import { test, expect } from '@playwright/test'
import { drawnRoomCanvas, stableFrame } from './scene-helpers'

// The first committed pixel baseline on the render path users actually see: the editor's
// live three-dimensional pane (`WebGPUSceneView`) on the WebGPU backend, not the
// `?fixture=scene-harness` render harness, which forces WebGL 2 and is pinned separately by
// scene-visual-regression.spec.ts. Slice A3 of
// docs/specs/2026-08-31-rendering-realism-gates-occlusion-coverings.md (issue #469) exists so
// a change that splits the two backends fails a test instead of shipping.
//
// The file name carries the `scene-` prefix so the Playwright config routes it into the
// `scene-webgl` project, the only project that launches Chrome for Testing with
// `--enable-unsafe-webgpu` and the Metal ANGLE backend. Everywhere else the live view has no
// adapter and three quietly runs its own WebGL 2 fallback, which is the very difference this
// baseline watches, so the guard below skips rather than pinning the wrong render. On linux
// CI there is no adapter either, so the spec self-skips and the SwiftShader lane keeps the
// WebGL 2 contract of ADR-0152.
//
// Capture region: the `canvas` locator screenshots the composited page region, so the frame
// deliberately keeps the overlaid empty-selection status text and the controls hint on top of
// the canvas, matching what a viewer sees and what the other live-view captures already read.

// Pixel-approximate, not pixel-exact, the same pair the harness baselines use. Five separate
// probe runs on the development Mac were byte-identical (all ten pairwise diff ratios 0.000),
// so the whole budget is margin against future driver drift rather than measured noise.
const LIVE_VIEW_THRESHOLD = 0.35
const LIVE_VIEW_MAX_DIFF_PIXEL_RATIO = 0.05

// The session provider (ADR-0170) raises this once the stored session has been applied and a
// frame has drawn since the latest render-pipeline build settled. Waiting on it, and then on a
// steady frame, is what keeps the capture off a timeout.
const LIVE_VIEW_READY = '[data-live-view-ready="true"]'

// Runs in the page. `navigator.gpu` can be present while `requestAdapter()` resolves to null,
// which is exactly the state the stripped-down headless shell reports; three logs "No available
// adapters" and falls back to WebGL 2 without throwing. Only a non-null adapter means the live
// view is really drawing through WebGPU.
async function webGpuAdapterAvailable(): Promise<boolean> {
  if (!('gpu' in navigator)) return false
  return (await navigator.gpu.requestAdapter()) !== null
}

test.describe('Live three-dimensional view visual baseline', () => {
  test('pins the top-down live frame to a committed baseline', async ({ page }) => {
    await page.goto('/')

    const hasAdapter = await page.evaluate(webGpuAdapterAvailable)
    test.skip(
      !hasAdapter,
      'No WebGPU adapter on this runner; the live 3D view falls back to WebGL 2 here.',
    )

    // The closed rectangular room is the deterministic fixture the live-view specs share: it
    // derives a floor slab that fills the framed view, so the whole canvas carries geometry.
    const canvas = await drawnRoomCanvas(page)

    // A named preset pins the camera, so the baseline does not depend on the fitted default.
    await page.getByRole('button', { name: 'Top down' }).click()

    await expect(page.locator(LIVE_VIEW_READY)).toBeAttached()
    await stableFrame(canvas)

    await expect(canvas).toHaveScreenshot('live-view-top-down-webgpu.png', {
      threshold: LIVE_VIEW_THRESHOLD,
      maxDiffPixelRatio: LIVE_VIEW_MAX_DIFF_PIXEL_RATIO,
    })
  })
})
