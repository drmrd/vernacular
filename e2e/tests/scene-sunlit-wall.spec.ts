import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { sampleCanvasColor, settledHarnessCanvas, type SamplePatch } from './scene-helpers'

// The sunlit-wall gate (issue #491). Every wall face used to be wound inside out, so the
// shadow pass stored each wall's sun-side plane and every sunlit face was shadowed by its own
// wall: a face turned to the sun and a face turned away rendered the same value, and the
// standing scene tolerances (threshold 0.35, ratio 0.05) let that through for months. This
// spec measures the sun instead of photographing it. In the winter-afternoon state the sun
// stands low in the south-west, so the south exterior face takes direct sun and the east
// exterior face turns away from it; both see the same sky. The gate asserts the sunlit face
// reads lighter than the shaded face in OKLab lightness by at least a derived minimum.
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

// The south exterior face, the door wall (outward normal toward world south), clear of the
// door and the wall edges: x 143..166, y 148..171.
const SUNLIT_SOUTH_WALL = squareRegion(143, 148, 24)
// The east exterior face, the window wall (outward normal toward world east), between the
// south-east corner and the window: x 186..201, y 143..158. A 24 px patch here would take in
// two columns of the window reveal, so this region is 16 px.
const SHADED_EAST_WALL = squareRegion(186, 143, 16)

/**
 * The smallest OKLab lightness gap the sunlit south face may read above the shaded east face.
 *
 * Derived on 2026-11-15 on the development Mac (darwin Metal, 320x240 canvas) from a light
 * model, not by eye. Both faces receive the same sky light (the sky's spherical harmonics
 * carry no azimuth term), and the shaded face measures that sky-only level directly. The
 * south face adds the direct sun term, sun color times 1.6 times the sun intensity times
 * max(0, n.l) times the albedo over pi, with the sun direction from the pinned instant
 * (south n.l 0.596, east n.l -0.798), pushed through the realistic tone map and the sRGB
 * encode. Model: south L 0.5463, east L 0.4604, gap 0.0859. Readings of these regions:
 *
 *   inside-out walls (origin/main): south 0.4604, east 0.4595, gap 0.0009
 *   outward walls (this fix): south 0.5490, east 0.4606, gap 0.0884
 *
 * Five captures of the state came back byte-identical, so the noise band is 0. The defect
 * reading is a zero gap, so the threshold sits at the midpoint of the model gap and zero
 * (the two-probe midpoint of ADR-0157's amendment), 0.0859 / 2 rounded down to 0.043. The
 * measured gap sits a little above the model because the model leaves out the specular term.
 */
const SUNLIT_WALL_MIN_GAP = 0.043

test.describe('Sunlit wall gate', () => {
  test('the sunlit south wall renders lighter than the shaded east wall', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_QUERY)

    const sunlitL = srgbToOkLab(await sampleCanvasColor(page, canvas, SUNLIT_SOUTH_WALL)).L
    const shadedL = srgbToOkLab(await sampleCanvasColor(page, canvas, SHADED_EAST_WALL)).L
    const gap = sunlitL - shadedL

    expect(
      gap,
      `sunlit south wall L ${sunlitL.toFixed(4)} against shaded east wall L ` +
        `${shadedL.toFixed(4)}: gap ${gap.toFixed(4)} is under the derived minimum ` +
        `${SUNLIT_WALL_MIN_GAP}, so the sun is not lighting the wall that faces it`,
    ).toBeGreaterThanOrEqual(SUNLIT_WALL_MIN_GAP)
  })
})
