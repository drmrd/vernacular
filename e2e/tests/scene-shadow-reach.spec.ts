import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import {
  logReading,
  sampleCanvasColor,
  settledHarnessCanvas,
  type SamplePatch,
} from './scene-helpers'

// The shadow-reach gate. The solar shadow camera used to fit only the building, the casters,
// so a shadow that ran off the building was cut off a few metres from it and the lawn past
// that line read as sunlit. In the winter-afternoon state the sun stands low in the south-west,
// so the building's shadow runs east across the lawn, and the old fit stopped it about 3 m
// from the building's center. This spec measures the shadow instead of photographing it: it
// reads the lawn far east of the east wall, where the shadow now lands, and the lawn that is
// in the sun in every build, and asserts the shadowed lawn reads darker in OKLab lightness by
// at least a derived minimum. A shadow cut off short leaves the far lawn sunlit and the gap
// closes to nothing.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness state this gate renders.
const WINTER_AFTERNOON_QUERY = '&scene=winter-afternoon'

// The harness canvas is 320 x 240 CSS pixels at device scale 1, the frame the committed
// scene-winter-afternoon baseline already pins. The regions below are pixel rectangles on
// that frame; `sampleCanvasColor` takes a patch center as frame fractions, so they convert.
const HARNESS_CANVAS_WIDTH_PX = 320
const HARNESS_CANVAS_HEIGHT_PX = 240

// A square region of the frame given by its top-left corner and side, in frame pixels.
function squareRegion(originXPx: number, originYPx: number, sizePx: number): SamplePatch {
  const half = sizePx / 2
  return {
    x: (originXPx + half) / HARNESS_CANVAS_WIDTH_PX,
    y: (originYPx + half) / HARNESS_CANVAS_HEIGHT_PX,
    sizePx,
  }
}

// The lawn east of the east wall, past where the old fit cut the shadow off, clear of the
// building, the far edge of the lawn, and the frame: x 284..307, y 140..163. The shipped shadow
// covers it, the old cut-off line lies about 40 px to its west, and no edge of the shadow, the
// lawn, or the frame comes within 4 px of it in either build.
const SHADOWED_LAWN = squareRegion(284, 140, 24)
// The lawn west of the building, in the sun in every build and far from the building's shadow
// and its ambient darkening: x 28..51, y 140..163. No edge of the lawn, the shadow, or the
// frame comes within 4 px of it in either build.
const SUNLIT_LAWN = squareRegion(28, 140, 24)

/**
 * The smallest OKLab lightness gap the sunlit lawn may read above the shadowed lawn.
 *
 * Measured on 2026-11-15 on the development Mac (darwin Metal, 320x240 canvas) on both builds,
 * not derived by eye. The lawn is a dark green, so a shadow on it moves the lightness by only
 * a little, and the gate rests on that small but exact gap. Readings of these regions:
 *
 *   shadow fitted to the casters only (before the fix): sunlit 0.3614, shadowed 0.3606, gap 0.0008
 *   shadow fitted to the casters and their shadow on the ground (this fix): sunlit 0.3614,
 *   shadowed 0.3490, gap 0.0124
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0 on
 * both. The threshold is the midpoint of the two gaps, (0.0124 + 0.0008) / 2 = 0.0066, rounded
 * to 0.007. The margins are 0.0054 below the shipped reading and 0.0062 above the defect
 * reading.
 */
const SHADOW_REACH_MIN_GAP = 0.007

test.describe('Shadow reach gate', () => {
  test('the lawn far east of the building reads darker than the lawn in the sun', async ({
    page,
  }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_QUERY)

    const sunlitL = srgbToOkLab(await sampleCanvasColor(page, canvas, SUNLIT_LAWN)).L
    const shadowedL = srgbToOkLab(await sampleCanvasColor(page, canvas, SHADOWED_LAWN)).L
    const gap = sunlitL - shadowedL
    logReading('sunlit lawn L', sunlitL.toFixed(4))
    logReading('shadowed lawn L', shadowedL.toFixed(4))
    logReading('shadow reach gap', gap.toFixed(4))

    expect(
      gap,
      `sunlit lawn L ${sunlitL.toFixed(4)} against shadowed lawn L ${shadowedL.toFixed(4)}: ` +
        `gap ${gap.toFixed(4)} is under the derived minimum ${SHADOW_REACH_MIN_GAP}, so the ` +
        `building's shadow is cut off before it reaches the far lawn`,
    ).toBeGreaterThanOrEqual(SHADOW_REACH_MIN_GAP)
  })
})
