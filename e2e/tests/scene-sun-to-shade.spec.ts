import { test, expect } from '@playwright/test'
import { linearLevel } from './canvas-patch'
import { logReading, sampleCanvasColor, settledHarnessCanvas, squareRegion } from './scene-helpers'

// The sun-to-shade gate. Daylight on open ground is several times brighter than the shade of a
// building, and the ratio rests on the balance of the direct sun and the sky that fills the
// shade. This spec reads the lawn in the sun and the lawn in the building's shadow, undoes the
// tone curve on each to recover the linear light level behind the pixel, and asserts the ratio
// of the two is at least a derived minimum. A ratio near one means the sky floods the shade.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness state this gate renders.
const SHADOW_ON_LAWN_QUERY = '&scene=shadow-on-lawn'

// The lawn inside the building's shadow, north of the north wall: x 150..173, y 109..132. Every
// edge of the shadow lies at least 5 px outside the square.
const SHADOWED_LAWN = squareRegion(150, 109, 24)
// The lawn in the sun east of the shadow, at the same depth in the view: x 236..259,
// y 109..132. No edge of the shadow or the lawn comes within 13 px of it.
const SUNLIT_LAWN = squareRegion(236, 109, 24)

/**
 * The smallest ratio of the sunlit lawn's linear level to the shadowed lawn's.
 *
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame), after the ground half of the sky dome turned a neutral grey, the sun's level
 * took the air-path fade, and the visible sky's gain came to follow the sun's height. Readings
 * of these regions, sunlit over shadowed:
 *
 *   before the daylight calibration: 0.1334 / 0.0764 = 1.7455
 *   calibrated daylight (this build): 0.5978 / 0.1008 = 5.9321
 *   Linux, calibrated daylight (this build): 0.5979 / 0.1008 = 5.9329
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0. The
 * minimum is the midpoint of the two ratios, 3.8388, rounded to 3.839, which clears this build
 * by 2.093 and the earlier build by 2.094. Before these three changes this build read 5.9702 and
 * the minimum was 3.858.
 *
 * The gate has no upper bound. Its probe zeroes the sky's ambient light, and the shadowed lawn
 * then renders black (code 0, linear level 0), so the ratio has no finite value and no midpoint
 * to set a bound at.
 */
const SUN_TO_SHADE_MIN_RATIO = 3.839

test.describe('Sun to shade gate', () => {
  test('the sunlit lawn reads brighter than the shadowed lawn by a daylight ratio', async ({
    page,
  }) => {
    const canvas = await settledHarnessCanvas(page, SHADOW_ON_LAWN_QUERY)

    const sunlit = linearLevel(await sampleCanvasColor(page, canvas, SUNLIT_LAWN))
    const shadowed = linearLevel(await sampleCanvasColor(page, canvas, SHADOWED_LAWN))
    const ratio = sunlit / shadowed
    logReading('sunlit lawn linear level', sunlit.toFixed(4))
    logReading('shadowed lawn linear level', shadowed.toFixed(4))
    logReading('sun to shade ratio', ratio.toFixed(4))

    expect(
      ratio,
      `sunlit lawn ${sunlit.toFixed(4)} over shadowed lawn ${shadowed.toFixed(4)}: the ratio ` +
        `${ratio.toFixed(4)} is under the derived minimum ${SUN_TO_SHADE_MIN_RATIO}, so the sky ` +
        `floods the shade and the sun reads weak against it`,
    ).toBeGreaterThanOrEqual(SUN_TO_SHADE_MIN_RATIO)
  })
})
