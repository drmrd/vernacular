import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { sampleCanvasColor } from './canvas-patch'
import {
  HARNESS_CANVAS_HEIGHT_PX,
  HARNESS_CANVAS_WIDTH_PX,
  logReading,
  settledHarnessCanvas,
} from './scene-helpers'

// The ambient-occlusion gate (slice A1 of the rendering-realism gates spec, issue #522).
// The committed pixel baseline for the ambient-occlusion state passes whether or not the
// occlusion pass is tuned to the world's millimetre scale, so it never saw the defect class it
// was meant to catch. This spec measures the occlusion instead of photographing it: it renders
// the canonical `window-light` harness state, an interior camera looking east at the window,
// samples one patch on the crease where the east wall meets the floor and one on the open
// floor nearby, and asserts the crease reads darker in OKLab lightness by at least a derived
// minimum. Occlusion darkens, so lightness is the axis that carries the signal and the whole
// assertion is one number. Neither patch takes direct sun, so a lighting change moves both
// alike and the difference stays an occlusion reading.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, the same way
// scene-color-accuracy.spec.ts does, so it runs on darwin Metal and on the linux SwiftShader
// lane and self-skips only where no WebGL 2 context can be created. It commits no screenshot,
// so no baseline moves with it.

// The canonical harness state this gate renders.
const WINDOW_LIGHT_QUERY = '&scene=window-light'

// The harness canvas is the frame the committed scene-window-light baseline already pins.
// `sampleCanvasColor` centers its 24 px patch on a fraction of the frame, so the patch
// positions, derived in frame pixels, convert here.
function patchCenteredOn(xPx: number, yPx: number): { x: number; y: number } {
  return { x: xPx / HARNESS_CANVAS_WIDTH_PX, y: yPx / HARNESS_CANVAS_HEIGHT_PX }
}

// The foot of the east wall's room face, where it meets the floor: the interior crease that
// carries the strongest occlusion signal in this frame (24 px patch at x 182..205, y 100..123).
const AO_WALL_FLOOR_CREASE_PATCH = patchCenteredOn(194, 112)
// The open floor toward the south-east corner of the room, the less occluded reference
// (24 px patch at x 214..237, y 122..145). Both patches mix surfaces, as any patch at a crease
// must; the probe readings below show the separation is still wide enough for a threshold.
const AO_OPEN_FLOOR_PATCH = patchCenteredOn(226, 134)

// The derived threshold (spec locked decision 6: derive the tolerance, then freeze it).
// Re-sited on 2026-11-15 (issue #491): once the wall faces were wound outward, the window head
// reveal this gate sampled in the exterior ambient-occlusion state turned out to be the
// inside-out head polygon seen through the wall, and the new exterior faces take direct sun.
// Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
// 320x240 frame), after the ground half of the sky dome turned a neutral grey, the sun's level
// took the air-path fade, and the visible sky's gain came to follow the sun's height, with both
// probes repeated. Checked again on 2026-11-16 after the sun's level came to fade by the Kasten
// and Young (1989) relative air mass: the shipped reading moved from +0.0240 to +0.0241 (the sun
// stands 37 degrees up here, so the probes were not repeated). Darwin Metal readings of the
// window-light frame, as openFloorL - creaseL:
//
//   shipped radius, AO_RADIUS_METERS 0.25: +0.0241 (+0.024093 unrounded)
//   wrong-radius probe, AO_RADIUS_METERS 2.5: -0.0050
//   no-op radius probe, AO_RADIUS_METERS 0.00025: -0.0069
//   Linux, shipped radius, AO_RADIUS_METERS 0.25: +0.0238 (the two probes were not taken)
//
// Captures of this frame are byte-deterministic (five identical captures of each build, zero
// noise band), so the threshold sits at the midpoint of the shipped reading and the nearer
// defect reading, (0.024093 - 0.0050) / 2 = 0.009546, rounded to 0.0095: the margin is 0.0146
// below the shipped reading and 0.0145 above the defect reading, and a 2 px shift of both
// patches in any of eight directions keeps at least 0.0148 of contrast on the shipped radius.
// Before the grey ground, the air-path fade, and the sky gain, the readings were +0.0284,
// -0.0005, and -0.0029 and the threshold was 0.014.
// The SwiftShader lane rasterizes the same frame differently, so a reading that lands near
// this number there is a reason to re-derive the pair, not to nudge the constant.
const AO_CONTRAST_MINIMUM = 0.0095

test.describe('Ambient-occlusion contrast gate', () => {
  test('the wall-floor crease renders darker than the open floor beside it', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINDOW_LIGHT_QUERY)

    const creaseL = srgbToOkLab(await sampleCanvasColor(page, canvas, AO_WALL_FLOOR_CREASE_PATCH)).L
    const openFloorL = srgbToOkLab(await sampleCanvasColor(page, canvas, AO_OPEN_FLOOR_PATCH)).L
    const contrast = openFloorL - creaseL
    logReading('ambient-occlusion contrast', contrast.toFixed(4))

    expect(
      contrast,
      `wall-floor crease L ${creaseL.toFixed(4)} against open floor L ${openFloorL.toFixed(4)}: ` +
        `contrast ${contrast.toFixed(4)} is under the derived minimum ${AO_CONTRAST_MINIMUM}, so ` +
        `the occlusion pass is not darkening the crease the way a quarter-metre gather does`,
    ).toBeGreaterThanOrEqual(AO_CONTRAST_MINIMUM)
  })
})
