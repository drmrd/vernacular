import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import {
  DEFAULT_VIEW_EAST_WALL,
  DEFAULT_VIEW_SOUTH_WALL,
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
// (negative is cool, positive is warm).
//
// Every derived bound sits at the midpoint of this build's reading and the reading of the render
// before the daylight calibration, which painted the noon wall a dim grey, the shade a strong
// blue, and the low sun neutral. The shade must also read b under 0, a relation with no
// midpoint.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness states this gate renders, each with the white paint.
const EQUINOX_NOON_QUERY = '&scene=equinox-noon&paint=daylight-white'
const WINTER_AFTERNOON_QUERY = '&scene=winter-afternoon&paint=daylight-white'

// Both states share the default camera, so the gate reads the shared south and east wall squares
// of the default view (scene-helpers.ts), the same squares as the sunlit wall gate.

// Each bound below was measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL
// 2 harness, 320x240 frame), on this build and on the build before the daylight calibration.
// Five captures of each build came back identical to four decimals, so every noise band is 0.
// The earlier east wall reading came from the 16 px square at x 186..201, y 143..158, which
// held one color (92, 99, 113), so the 12 px square inside it reads the same. The Linux
// SwiftShader lane (run 43820235938, 2026-11-16) read the same four values on this build as the
// Mac: chroma 0.0042, lightness 0.9112, shaded east wall b -0.0094, low-sun south wall b 0.0257.
// The before-calibration readings were not taken on Linux.

/**
 * The most chroma the white south wall may show in the noon sun.
 *
 *   before the calibration: 0.0072
 *   this build: 0.0042
 *
 * The midpoint is 0.0057, which clears each reading by 0.0015.
 */
const NOON_WHITE_MAX_CHROMA = 0.0057

/**
 * The least OKLab lightness the white south wall may read in the noon sun.
 *
 *   before the calibration: 0.7170
 *   this build: 0.9112
 *
 * The midpoint is 0.8141, which clears each reading by 0.0971.
 */
const NOON_WHITE_MIN_LIGHTNESS = 0.8141

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
 *   this build: 0.0257
 *
 * The midpoint is 0.0136, which clears each reading by 0.0121.
 */
const LOW_SUN_MIN_B = 0.0136

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
})
