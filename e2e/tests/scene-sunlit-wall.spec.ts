import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { logReading, sampleCanvasColor, settledHarnessCanvas, squareRegion } from './scene-helpers'

// The sunlit-wall gate (issue #491). Every wall face used to be wound inside out, so the
// shadow pass stored each wall's sun-side plane and every sunlit face was shadowed by its own
// wall: a face turned to the sun and a face turned away rendered the same value, and the
// standing scene tolerances (threshold 0.35, ratio 0.05) let that through for months. This
// spec measures the sun instead of photographing it. In the winter-afternoon state the sun
// stands low in the south-west, so the south exterior face takes direct sun and the east
// exterior face turns away from it. The gate asserts the sunlit face reads lighter than the
// shaded face in OKLab lightness by at least a derived minimum.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness state this gate renders.
const WINTER_AFTERNOON_QUERY = '&scene=winter-afternoon'

// The south exterior face, the door wall (outward normal toward world south), clear of the
// door and the wall edges: x 143..166, y 148..171.
const SUNLIT_SOUTH_WALL = squareRegion(143, 148, 24)
// The east exterior face, the window wall (outward normal toward world east), between the
// south-east corner and the window: x 188..199, y 145..156. The face is about 21 px wide here,
// so this is the largest square that keeps 4 px from the corner and from the window reveal.
const SHADED_EAST_WALL = squareRegion(188, 145, 12)

/**
 * The smallest OKLab lightness gap the sunlit south face may read above the shaded east face.
 *
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame) under the calibrated daylight, from the light model in core, not by eye. The
 * two faces no longer receive the same sky: the sky brightens toward the sun and the lawn lights
 * the walls from below, so each face is predicted on its own. The model is
 * predictedMatteRadiance: the wall color (#d8d4cc, linear 0.687, 0.658, 0.604) times the sun
 * color times the sun level times max(0, n.l) over pi, plus the sky's light on that normal from
 * its spherical harmonics, with the sun from the pinned instant (south n.l 0.596, east n.l
 * -0.798). The luminance of each prediction goes through agxNeutralResponse and is read as a
 * grey. Model: south L 0.8007, east L 0.4032, gap 0.3975. Readings of these regions:
 *
 *   calibrated daylight (this build): south 0.8009, east 0.4095, gap 0.3914
 *   Linux SwiftShader (run 43820235938, 2026-11-16), calibrated daylight: south 0.8010, east
 *   0.4095, gap 0.3915, within 0.0001 of the Mac
 *
 * Five captures came back identical to four decimals, so the noise band is 0. The threshold is
 * half the model gap, 0.3975 / 2 = 0.1987, rounded to 0.199. The east face reads a little above
 * the model, so the measured gap is 0.0061 under it. The margin is 0.1924 below the reading.
 * The defect this gate was written for, a wall that shades its own sunlit face, would leave the
 * south face its sky light alone: the model puts that face at L 0.4813, a gap of 0.0781 over
 * the east face, 0.1209 under the threshold. The east region was the 16 px square at x 186..201,
 * y 143..158 until this derivation; it held one color, so the 12 px square inside it reads the
 * same.
 */
const SUNLIT_WALL_MIN_GAP = 0.199

test.describe('Sunlit wall gate', () => {
  test('the sunlit south wall renders lighter than the shaded east wall', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_QUERY)

    const sunlitL = srgbToOkLab(await sampleCanvasColor(page, canvas, SUNLIT_SOUTH_WALL)).L
    const shadedL = srgbToOkLab(await sampleCanvasColor(page, canvas, SHADED_EAST_WALL)).L
    const gap = sunlitL - shadedL
    logReading('sunlit south wall L', sunlitL.toFixed(4))
    logReading('shaded east wall L', shadedL.toFixed(4))
    logReading('sunlit wall gap', gap.toFixed(4))

    expect(
      gap,
      `sunlit south wall L ${sunlitL.toFixed(4)} against shaded east wall L ` +
        `${shadedL.toFixed(4)}: gap ${gap.toFixed(4)} is under the derived minimum ` +
        `${SUNLIT_WALL_MIN_GAP}, so the sun is not lighting the wall that faces it`,
    ).toBeGreaterThanOrEqual(SUNLIT_WALL_MIN_GAP)
  })
})
