import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { sampleCanvasColor } from './canvas-patch'
import {
  DEFAULT_VIEW_EAST_WALL,
  DEFAULT_VIEW_SOUTH_WALL,
  SOUTH_WEST_VIEW_WEST_WALL,
  logReading,
  settledHarnessCanvas,
} from './scene-helpers'

// The daylight white gate. A white wall in daylight should read white at noon, cool where only
// the sky lights it, and a little warm where a low sun lights it. This spec paints
// the four exterior wall faces the matte daylight white and reads them in OKLab under two
// states: at equinox noon the south face takes the high sun, and on the winter afternoon the
// east face stands in shade while the south face takes the low sun from the south-west. Noon
// white is read as chroma and lightness, the shade and the low sun as the blue-yellow axis b
// (negative is cool, positive is warm). A third state, daylight-reference, shows the west face in
// shade from a south-west camera, and that shade is read on the green-red axis a (negative is
// green): the ground below the horizon lights a shaded wall, and a green ground would tint it.
//
// The bounds on noon white and on the low sun sit at the midpoint of this build's reading and the
// reading of the render before the daylight calibration, which painted the noon wall a dim grey
// and the low sun neutral. The bound on the shade sits at the midpoint of this build's reading
// and the reading of the build whose dome took the lawn's green color below the horizon, which
// warmed the shade. The shade must also read b under 0, a relation with no midpoint. The bound on
// the green axis sits at the midpoint of this build's reading and the reading of that same
// green-ground build.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness states this gate renders, each with the white paint.
const EQUINOX_NOON_QUERY = '&scene=equinox-noon&paint=daylight-white'
const WINTER_AFTERNOON_QUERY = '&scene=winter-afternoon&paint=daylight-white'
const DAYLIGHT_REFERENCE_QUERY = '&scene=daylight-reference&paint=daylight-white'

// The first two states share the default camera, so the gate reads the shared south and east
// wall squares of the default view (scene-helpers.ts), the same squares as the sunlit wall gate.
// The daylight-reference state has its own south-west camera, and the gate reads the shared west
// wall square of that view.

// Each reading below was taken on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL
// 2 harness, 320x240 frame). The bounds on noon white were derived after the ground half of the
// sky dome turned a neutral grey, the sun's level took the air-path fade, and the visible sky's
// gain came to follow the sun's height. The bounds on the shade and on the low sun were derived
// again after the sun's level came to fade by the Kasten and Young (1989) relative air mass,
// which moved both readings of the winter afternoon; the noon readings did not move. Five
// captures of each build came back identical to four decimals, so every noise band is 0. The
// before-calibration east wall reading came from the 16 px square at x 186..201, y 143..158,
// which held one color (92, 99, 113), so the 12 px square inside it reads the same.
// Linux: noon white wall chroma 0.0013 and L 0.9125; the other readings are on their own lines.
// The before-calibration readings were not taken on Linux.

/**
 * The most chroma the white south wall may show in the noon sun.
 *
 *   before the calibration: 0.0072
 *   this build: 0.0013
 *
 * The midpoint is 0.00425, rounded to 0.0043, which clears this build by 0.0030 and the earlier
 * build by 0.0029. Before the grey ground of the dome this build read 0.0042 and the bound was
 * 0.0057.
 */
const NOON_WHITE_MAX_CHROMA = 0.0043

/**
 * The least OKLab lightness the white south wall may read in the noon sun.
 *
 *   before the calibration: 0.7170
 *   this build: 0.9125
 *
 * The midpoint is 0.81475, rounded to 0.8148, which clears this build by 0.0977 and the earlier
 * build by 0.0978.
 */
const NOON_WHITE_MIN_LIGHTNESS = 0.8148

/**
 * The most OKLab b the shaded white east wall may read on the winter afternoon. It guards that
 * the shade takes the sky's blue once the ground bounce is neutral: when the ground half of the
 * dome carried the lawn's green, the bounce from below warmed the shade toward neutral.
 *
 *   before the ground bounce turned a neutral grey (green ground): -0.0094
 *   this build: -0.0300 on five of five captures (-0.0300, -0.0300, -0.0300, -0.0300,
 *   -0.0300), noise band 0; under the earlier fade, exp(-0.21 * (1 / sin h - 1)), -0.0317
 *   measured 2026-11-16 on the development Mac (macOS, WebGL 2 harness)
 *   Linux, this build: -0.0300
 *
 * The midpoint is -0.01970, rounded to -0.0197, which clears this build by 0.0103 and the
 * green-ground build by 0.0103. The gate also requires b under 0, which this build clears by
 * 0.0300.
 *
 * A known consequence: the shaded wall at a low sun is bluer on this build than on the render
 * before the daylight calibration (-0.0239). A follow-up issue on a white balance that follows
 * the scene's light tracks it. Earlier derivations of this bound used that render as the defect
 * reading: a floor of -0.0167 when the green ground made this build's shade the less blue one,
 * then a ceiling of -0.0278 with a margin of only 0.0039.
 */
const SHADE_MAX_B = -0.0197

/**
 * The least OKLab b the white south wall may read in the low winter sun.
 *
 *   before the calibration: 0.0015
 *   this build: 0.0168 on five of five captures, noise band 0
 *   measured 2026-11-16 on the development Mac (macOS, WebGL 2 harness)
 *   Linux, this build: 0.0168
 *
 * The midpoint is 0.00915 (0.00916 from the unrounded reading 0.01682), rounded to 0.0092, which
 * clears this build by 0.0076 and the earlier build by 0.0077. The sun 5 degrees up is a little
 * stronger under the Kasten and Young fade than under the earlier fade, which read 0.0139 with a
 * bound of 0.0077, and weaker than before the air-path fade, which read 0.0257 with a bound of
 * 0.0136.
 */
const LOW_SUN_MIN_B = 0.0092

/**
 * The least OKLab a the shaded white west wall may read in the daylight-reference state
 * (issue #765). Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2
 * harness, 320x240 frame), in the same region and state on both builds:
 *
 *   before the ground half of the sky dome turned a neutral grey (the lawn's green color
 *   lit the wall): -0.0285, a clear sage-green cast, the region one color (147, 169, 157)
 *   this build, a grey ground with the lawn's luminance: -0.0036, the region (160, 166, 173)
 *   Linux, this build: -0.0027
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0. The
 * midpoint is -0.01605, rounded to -0.0161, which clears this build by 0.0125 and the green
 * ground by 0.0124.
 */
const SHADE_MIN_A = -0.0161

test.describe('Daylight white gate', () => {
  test('the white south wall reads white in the noon sun', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, EQUINOX_NOON_QUERY)

    const south = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_SOUTH_WALL))
    const chroma = Math.hypot(south.a, south.b)
    logReading('noon south wall chroma', chroma.toFixed(4))
    logReading('noon south wall L', south.L.toFixed(4))

    expect(
      chroma,
      `noon south wall chroma ${chroma.toFixed(4)} is over ${NOON_WHITE_MAX_CHROMA}, so the ` +
        `white wall takes a tint in the noon sun`,
    ).toBeLessThanOrEqual(NOON_WHITE_MAX_CHROMA)
    expect(
      south.L,
      `noon south wall L ${south.L.toFixed(4)} is under ${NOON_WHITE_MIN_LIGHTNESS}, so the ` +
        `white wall reads grey in the noon sun`,
    ).toBeGreaterThanOrEqual(NOON_WHITE_MIN_LIGHTNESS)
  })

  test('the white walls read cool in shade and warm in the low sun', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_QUERY)

    const shadedEast = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_EAST_WALL))
    const lowSunSouth = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_SOUTH_WALL))
    logReading('afternoon shaded east wall b', shadedEast.b.toFixed(4))
    logReading('afternoon low-sun south wall b', lowSunSouth.b.toFixed(4))

    expect(
      shadedEast.b,
      `afternoon shaded east wall b ${shadedEast.b.toFixed(4)} is over ${SHADE_MAX_B}, so ` +
        `the shade on the white wall loses the sky's blue, as when a green ground bounce ` +
        `warmed it`,
    ).toBeLessThanOrEqual(SHADE_MAX_B)
    expect(
      shadedEast.b,
      `afternoon shaded east wall b ${shadedEast.b.toFixed(4)} is not under 0, so the shade on ` +
        `the white wall reads neutral or warm rather than cool`,
    ).toBeLessThan(0)
    expect(
      lowSunSouth.b,
      `afternoon low-sun south wall b ${lowSunSouth.b.toFixed(4)} is under ${LOW_SUN_MIN_B}, ` +
        `so the low sun does not warm the white wall`,
    ).toBeGreaterThanOrEqual(LOW_SUN_MIN_B)
  })

  test('the white wall in shade takes no green cast from the ground', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, DAYLIGHT_REFERENCE_QUERY)

    const shadedWest = srgbToOkLab(await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_WEST_WALL))
    logReading('shaded west wall a', shadedWest.a.toFixed(4))
    logReading('shaded west wall b', shadedWest.b.toFixed(4))

    expect(
      shadedWest.a,
      `shaded west wall a ${shadedWest.a.toFixed(4)} is under ${SHADE_MIN_A}, so the ground ` +
        `below the horizon gives the white wall in shade a green cast`,
    ).toBeGreaterThanOrEqual(SHADE_MIN_A)
  })
})
