import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import {
  DEFAULT_VIEW_EAST_WALL,
  DEFAULT_VIEW_SOUTH_WALL,
  SOUTH_WEST_VIEW_WEST_WALL,
  logReading,
  sampleCanvasColor,
  settledHarnessCanvas,
} from './scene-helpers'

// The daylight white gate. A white wall in daylight should read white at noon, a little cool
// where only the sky lights it, and a little warm where a low sun lights it. This spec paints
// the four exterior wall faces the matte daylight white and reads them in OKLab under two
// states: at equinox noon the south face takes the high sun, and on the winter afternoon the
// east face stands in shade while the south face takes the low sun from the south-west. Noon
// white is read as chroma and lightness, the shade and the low sun as the blue-yellow axis b
// (negative is cool, positive is warm). A third state, daylight-reference, shows the west face in
// shade from a south-west camera, and that shade is read on the green-red axis a (negative is
// green): the ground below the horizon lights a shaded wall, and a green ground would tint it.
//
// Every derived bound on the first two states sits at the midpoint of this build's reading and
// the reading of the render before the daylight calibration, which painted the noon wall a dim
// grey, the shade a strong blue, and the low sun neutral. The shade must also read b under 0, a
// relation with no midpoint. The bound on the green axis sits at the midpoint of this build's
// reading and the reading of the build whose dome took the lawn's green color below the horizon.
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
// 2 harness, 320x240 frame), on this build and on the build before the daylight calibration.
// The bounds on noon white and on the low sun were derived again on this build, after the
// ground half of the sky dome turned a neutral grey, the sun's level took the air-path fade, and
// the visible sky's gain came to follow the sun's height. The lower bound on the shade keeps its
// earlier derivation. Five captures of each build came back identical to four decimals, so every
// noise band is 0. The earlier east wall reading came from the 16 px square at x 186..201,
// y 143..158, which held one color (92, 99, 113), so the 12 px square inside it reads the same.
// Linux: not yet recorded for this derivation. The before-calibration readings were not taken
// on Linux.

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
 * The least OKLab b the shaded white east wall may read on the winter afternoon. The shade is
 * cool on both builds; before the calibration it read a strong blue.
 *
 *   before the calibration: -0.0239
 *   this build: -0.0094
 *
 * The midpoint is -0.01665, rounded to -0.0167, which clears this build by 0.0073 and the
 * earlier build by 0.0072. The gate also requires b under 0. Together the two bounds hold the
 * shade between -0.0167 and 0: cool, since a b of 0 or above is neutral or warm, but not the
 * strong blue of the earlier build. The upper bound is a relation with no midpoint; this build
 * clears it by 0.0094.
 */
const SHADE_MIN_B = -0.0167

/**
 * The least OKLab b the white south wall may read in the low winter sun.
 *
 *   before the calibration: 0.0015
 *   this build: 0.0139
 *
 * The midpoint is 0.0077, which clears each reading by 0.0062. The sun 5 degrees up is much
 * weaker under the air-path fade, so the wall reads less warm than the 0.0257 it read before,
 * when the bound was 0.0136, but still warmer than the earlier build.
 */
const LOW_SUN_MIN_B = 0.0077

/**
 * The least OKLab a the shaded white west wall may read in the daylight-reference state
 * (issue #765). Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2
 * harness, 320x240 frame), in the same region and state on both builds:
 *
 *   before the ground half of the sky dome turned a neutral grey (the lawn's green color
 *   lit the wall): -0.0285, a clear sage-green cast, the region one color (147, 169, 157)
 *   this build, a grey ground with the lawn's luminance: -0.0036, the region (160, 166, 173)
 *   Linux: not yet recorded for this derivation
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
      `afternoon shaded east wall b ${shadedEast.b.toFixed(4)} is under ${SHADE_MIN_B}, so ` +
        `the shade on the white wall reads a strong blue rather than a cool white`,
    ).toBeGreaterThanOrEqual(SHADE_MIN_B)
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
