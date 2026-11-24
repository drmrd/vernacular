import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { luminanceCode, sampleCanvasColor } from './canvas-patch'
import {
  SOUTH_WEST_VIEW_SOUTH_WALL,
  SOUTH_WEST_VIEW_WEST_WALL,
  logReading,
  settledHarnessCanvas,
} from './scene-helpers'

// The low-sun gate (issue #771). Sunlight just above the horizon crosses so much air that almost
// none of it reaches the ground, so a white wall that faces a sun 1.5 degrees up should read
// close to a wall in shade, not close to a wall in full daylight. The sun's level used to keep a
// large share of its daylight value down to the horizon, and such a wall glowed a bright peach.
// In the low-sun state the sun stands 1.51 degrees up, a little north of due west, so the west
// exterior face looks straight at it and the south face turns just away from it. This spec
// paints the four exterior wall faces the matte daylight white and asserts that the west face
// reads no lighter in OKLab lightness than a derived maximum. It also logs the code of the west
// face and of the shaded south face, with no bound.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness state this gate renders, with the white paint.
const LOW_SUN_QUERY = '&scene=low-sun&paint=daylight-white'

// The state shares the south-west camera of the daylight-reference state, so the regions are the
// shared west and south wall squares of that view (scene-helpers.ts).

/**
 * The most OKLab lightness the white west wall may read when it faces a sun 1.51 degrees up.
 *
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame), after the sun's level came to fade by the Kasten and Young (1989) relative air
 * mass, at the same instant, camera, and paint on every build. Readings of this region:
 *
 *   before the air-path fade, a sun level of 4.54 (10.01 at the reference instant): L 0.8681,
 *   code 211.10, the region one color (224, 209, 191)
 *   the earlier air-path fade, exp(-0.21 * (1 / sin h - 1)), a sun level of 0.0046: L 0.5224,
 *   code 105.60, the region one color (93, 107, 124)
 *   the Kasten and Young fade (this build), a sun level of 0.122: L 0.5624, code 116.93, the
 *   region one color (113, 117, 127)
 *   Linux, the Kasten and Young fade (this build), a sun level of 0.122: L 0.5624, code 116.93
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0. The
 * bound is the midpoint of this build and the build before the air-path fade, 0.71523 from the
 * unrounded reading 0.56236, rounded to 0.7152, which clears this build by 0.1528 and that build
 * by 0.1529. Under the earlier fade the bound was 0.6953. The light model in core puts a white
 * wall facing this sun at code 117.32, within 0.4 of the render: the sky lights most of it, and
 * the sun adds about 12 codes (the model gave 105.76 under the earlier fade).
 */
const LOW_SUN_WALL_MAX_LIGHTNESS = 0.7152

test.describe('Low sun gate', () => {
  test('a white wall that faces a sun on the horizon reads close to shade', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, LOW_SUN_QUERY)

    const west = await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_WEST_WALL)
    const shadedSouth = await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_SOUTH_WALL)
    const westL = srgbToOkLab(west).L
    logReading('low-sun west wall L', westL.toFixed(4))
    // The two codes are logged, not gated. On this build the west face read code 116.93 and the
    // shaded south face 91.47; under the earlier fade 105.60 and 91.47; before the air-path fade
    // 211.10 and 92.24.
    logReading('low-sun west wall code', luminanceCode(west).toFixed(2))
    logReading('shaded south wall code', luminanceCode(shadedSouth).toFixed(2))

    expect(
      westL,
      `low-sun west wall L ${westL.toFixed(4)} is over ${LOW_SUN_WALL_MAX_LIGHTNESS}, so a sun ` +
        `on the horizon still lights the white wall that faces it like daylight`,
    ).toBeLessThanOrEqual(LOW_SUN_WALL_MAX_LIGHTNESS)
  })
})
