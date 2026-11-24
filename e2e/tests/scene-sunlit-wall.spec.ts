import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { sampleCanvasColor } from './canvas-patch'
import {
  DEFAULT_VIEW_EAST_WALL,
  DEFAULT_VIEW_SOUTH_WALL,
  logReading,
  settledHarnessCanvas,
} from './scene-helpers'

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

// The regions are the shared wall squares of the default view (scene-helpers.ts): on this
// afternoon the south face takes the sun and the east face is in shade.

/**
 * The smallest OKLab lightness gap the sunlit south face may read above the shaded east face.
 *
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame), after the sun's level came to fade by the Kasten and Young (1989) relative air
 * mass. It comes from the light model in core, not by eye. The two faces do not receive the same
 * sky: the sky brightens toward the sun and the ground lights the walls from below, so each face
 * is predicted on its own. The model is predictedMatteRadiance: the wall color (#d8d4cc, linear
 * 0.687, 0.658, 0.604) times the sun color times the sun level times max(0, n.l) over pi, plus
 * the sky's light on that normal from its spherical harmonics, with the sun from the pinned
 * instant (5.23 degrees up, level 1.672; south n.l 0.596, east n.l -0.798). The luminance of
 * each prediction goes through agxNeutralResponse and is read as a grey. Model: south L 0.6734,
 * east L 0.3825, gap 0.2909. Readings of these regions:
 *
 *   calibrated daylight (this build): south 0.6760, east 0.3937, gap 0.2823
 *   under the earlier fade, exp(-0.21 * (1 / sin h - 1)): south 0.6526, east 0.3929, gap 0.2597
 *   Linux, calibrated daylight (this build): south 0.6760, east 0.3938, gap 0.2822
 *
 * Five captures came back identical to four decimals, so the noise band is 0. The threshold is
 * half the model gap, 0.2909 / 2 = 0.14543, rounded to 0.145. The east face reads a little above
 * the model, so the measured gap is 0.0086 under it. The margin is 0.1373 below the reading.
 * The defect this gate was written for, a wall that shades its own sunlit face, made the two
 * walls read the same, a gap of zero, so half the model gap is the midpoint between the model
 * and that defect. Under today's sky, which brightens toward the sun, the same defect would leave
 * the south face its sky light alone: the model puts that face at L 0.4685, a gap of 0.0860 over
 * the east face, 0.0590 under the threshold. Under the earlier fade the sun stood at level 1.344,
 * the model gap was 0.2692, and the threshold 0.135; before that fade the model gap was 0.3975,
 * the reading 0.3914, and the threshold 0.199. The east region was the 16 px square at
 * x 186..201, y 143..158 until an earlier derivation; it held one color, so the 12 px square
 * inside it reads the same.
 */
const SUNLIT_WALL_MIN_GAP = 0.145

test.describe('Sunlit wall gate', () => {
  test('the sunlit south wall renders lighter than the shaded east wall', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_QUERY)

    const sunlitL = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_SOUTH_WALL)).L
    const shadedL = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_EAST_WALL)).L
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
