import { test, expect, type Locator, type Page } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { sampleCanvasColor } from './scene-helpers'

// The ambient-occlusion gate (slice A1 of the rendering-realism gates spec, issue #522).
// The committed pixel baseline for this state passes whether or not the occlusion pass is
// tuned to the world's millimetre scale, so it never saw the defect class it was meant to
// catch. This spec measures the occlusion instead of photographing it: it renders the
// canonical `ambient-occlusion` harness state, samples one patch inside the window head
// reveal and one on the open wall above it, and asserts the reveal reads darker in OKLab
// lightness by at least a derived minimum. Occlusion darkens, so lightness is the axis that
// carries the signal and the whole assertion is one number.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, the same way
// scene-color-accuracy.spec.ts does, so it runs on darwin Metal and on the linux SwiftShader
// lane and self-skips only where no WebGL 2 context can be created. It commits no screenshot,
// so no baseline moves with it.

// The canonical harness state this gate renders.
const AMBIENT_OCCLUSION_SCENE = 'ambient-occlusion'

// The harness canvas is 320 x 240 CSS pixels at device scale 1, the frame the committed
// scene-ambient-occlusion baseline already pins. `sampleCanvasColor` centers its 24 px patch
// on a fraction of the frame, so the patch positions, derived in frame pixels, convert here.
const HARNESS_CANVAS_WIDTH_PX = 320
const HARNESS_CANVAS_HEIGHT_PX = 240

function patchCenteredOn(xPx: number, yPx: number): { x: number; y: number } {
  return { x: xPx / HARNESS_CANVAS_WIDTH_PX, y: yPx / HARNESS_CANVAS_HEIGHT_PX }
}

// The window head reveal on the east wall: the underside of the opening head, which faces
// back into the wall thickness and is the strongest occlusion signal in this frame.
const AO_WINDOW_HEAD_PATCH = patchCenteredOn(224, 116)
// The open wall directly above the same opening, the unoccluded reference. At this framing a
// 24 px patch spans roughly 780 mm of wall, so the two patches overlap by about a third of
// their height. The overlap only shrinks the measured contrast, and the probe check below
// shows the remaining separation is still wide enough to place a threshold in.
const AO_OPEN_WALL_PATCH = patchCenteredOn(224, 100)

// The derived threshold (spec locked decision 6: derive the tolerance, then freeze it). Both
// readings below are darwin Metal renders of this frame, as `openWallL - revealL`:
//
//   shipped radius, AO_RADIUS_METERS 0.25: +0.0223
//   wrong-radius probe, AO_RADIUS_METERS 2.5: +0.0029
//
// Six captures at the shipped radius, spanning a rebuild and three preview-server restarts,
// came back byte-identical, so the observed noise band over the repeats is 0.0000 and the
// margin rule (at least twice the noise band) puts no floor on the threshold. With no noise to
// widen for, the threshold sits at the midpoint of the two readings, (0.0223 + 0.0029) / 2.
// The SwiftShader lane rasterizes the same frame differently, so a reading that lands near
// this number there is a reason to re-derive the pair, not to nudge the constant.
const AO_CONTRAST_MINIMUM = 0.0126

// Puts the harness in the ambient-occlusion state and returns its settled canvas.
async function gotoAmbientOcclusionScene(page: Page): Promise<Locator> {
  await page.goto(`/?fixture=scene-harness&scene=${AMBIENT_OCCLUSION_SCENE}`)
  const harness = page.getByTestId('scene-harness')
  const canvas = harness.locator('canvas')
  await expect(canvas).toBeVisible()
  const hasWebGl2 = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    return probe.getContext('webgl2') !== null
  })
  test.skip(
    !hasWebGl2,
    'No WebGL 2 context on this runner; the ambient-occlusion gate self-skips here.',
  )
  await expect(harness).toHaveAttribute('data-harness-ready', 'true')
  return canvas
}

test.describe('Ambient-occlusion contrast gate', () => {
  test('the window head reveal renders darker than the open wall above it', async ({ page }) => {
    const canvas = await gotoAmbientOcclusionScene(page)

    const revealL = srgbToOkLab(await sampleCanvasColor(page, canvas, AO_WINDOW_HEAD_PATCH)).L
    const openWallL = srgbToOkLab(await sampleCanvasColor(page, canvas, AO_OPEN_WALL_PATCH)).L
    const contrast = openWallL - revealL

    expect(
      contrast,
      `window head reveal L ${revealL.toFixed(4)} against open wall L ${openWallL.toFixed(4)}: ` +
        `contrast ${contrast.toFixed(4)} is under the derived minimum ${AO_CONTRAST_MINIMUM}, so ` +
        `the occlusion pass is not darkening the reveal the way a quarter-metre gather does`,
    ).toBeGreaterThanOrEqual(AO_CONTRAST_MINIMUM)
  })
})
