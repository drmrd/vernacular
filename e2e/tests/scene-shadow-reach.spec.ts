import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { logReading, sampleCanvasColor, settledHarnessCanvas, squareRegion } from './scene-helpers'

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
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame) under the calibrated daylight, not by eye. The defect probe is a local edit to
 * the solar lighting provider that fits the shadow camera to the casters alone, as before the
 * fix, which cuts the shadow off on the lawn. Readings of these regions:
 *
 *   probe, shadow fitted to the casters alone: sunlit 0.4465, shadowed 0.4337, gap 0.0127
 *   shadow fitted to the casters and their shadow on the ground (this build): sunlit 0.4465,
 *   shadowed 0.3290, gap 0.1174
 *   Linux SwiftShader (run 43820235938, 2026-11-16), this build: gap 0.1176. The probe was not
 *   run on Linux, so there is no Linux defect reading.
 *
 * Five captures of each build came back identical to four decimals, so the noise band is under
 * 0.0001 on both. The threshold is the midpoint of the two gaps, (0.1174 + 0.0127) / 2 = 0.06505,
 * rounded to 0.065. The margins are 0.0524 below the shipped reading and 0.0523 above the
 * defect reading. Before the calibration the lawn read darker, the two gaps were 0.0124 and
 * 0.0008, and the threshold was 0.007, which the calibrated defect reading of 0.0127 would pass.
 */
const SHADOW_REACH_MIN_GAP = 0.065

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
