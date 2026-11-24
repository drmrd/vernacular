import { test, expect } from '@playwright/test'
import { srgbToOkLab } from '../../core'
import { CODE_RANGE, sampleCanvasColor } from './canvas-patch'
import {
  DEFAULT_VIEW_SOUTH_WALL,
  logReading,
  settledHarnessCanvas,
  squareRegion,
} from './scene-helpers'

// The sky gate. A clear sky should read blue and darker than a white wall in the sun, with no
// channel clipped to white. This spec reads the sky in the equinox-noon state, where the four
// exterior wall faces wear the matte daylight white, and compares it with the sunlit south wall
// of the same frame.
//
// It also reads the sky of the winter-afternoon state, with the sun about 5 degrees up, and
// asserts that sky is not near black (issue #763). The visible sky used to carry one fixed gain,
// fitted at equinox noon, which left a low-sun sky dark brown while the house and the lawn were
// still in daylight; its gain now follows the sun's height.
//
// The overcast sky has no bound yet. In the overcast-noon state this region renders the same
// pixels as the clear sky (chroma 0.0204 on both, measured on 2026-11-16), because the sky mesh
// draws its clouds only above the horizon, fading them out toward it, and this view shows
// almost no sky above the horizon. With no gap
// between the overcast and the clear reading there is no midpoint to set a bound at.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The canonical harness state this gate renders: clear noon with the white paint.
const CLEAR_NOON_QUERY = '&scene=equinox-noon&paint=daylight-white'
// The winter afternoon, a sun about 5 degrees up, with the white paint, the state of the earlier
// reading.
const WINTER_AFTERNOON_SKY_QUERY = '&scene=winter-afternoon&paint=daylight-white'

// The sky the viewer sees above the far edge of the lawn, at the top left of the frame:
// x 12..35, y 12..35. The camera looks 35 degrees down, so the true horizon crosses the frame
// near row 9 and only rows 0 to 8 look above it. That strip is too narrow for a square that
// keeps clear of the frame's edge, and its color changes by about 2 codes a row. This square
// is the sky mesh drawn just below the true horizon, about 0.5 to 5.8 degrees below it, where
// the sky reads almost flat (2 codes of spread). The lawn's far edge lies near row 107 below
// it and the building far to its right.
const SKY = squareRegion(12, 12, 24)
// The sunlit wall it is compared with is the shared south wall square of the default view
// (scene-helpers.ts), the same square as the sunlit wall gate. The winter-afternoon state shares
// the default camera, so the same square reads its sky. There the rows of the square read flat
// (L 0.540 to 0.544), and the sky brightens toward the left of the frame, so the square spreads
// 7, 5, and 4 codes in red, green, and blue.

/**
 * The most OKLab b the clear sky may read: it must lean blue.
 *
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame), after the ground half of the sky dome turned a neutral grey, the sun's level
 * took the air-path fade, and the visible sky's gain came to follow the sun's height. Readings
 * of this region:
 *
 *   before the daylight calibration, a near-white sky: -0.0029
 *   calibrated daylight (this build): -0.0104
 *   Linux, calibrated daylight (this build): -0.0104
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0. The
 * bound is the midpoint, -0.00665, rounded to -0.0067, which clears this build by 0.0037 and the
 * earlier build by 0.0038.
 */
const CLEAR_SKY_MAX_B = -0.0067

/**
 * The code the clear sky's largest channel must stay under, so no channel is near clipping.
 * This is a relation with no midpoint. The largest channel read 243.00 before the daylight
 * calibration and 157.20 on this build.
 */
const CLEAR_SKY_CHANNEL_CEILING = 250

/**
 * The least OKLab lightness the sky may read on the winter afternoon, with the sun about 5
 * degrees up (issue #763).
 *
 * Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame). Readings of this region in the winter-afternoon state with the white paint:
 *
 *   one fixed gain for the visible sky, fitted at equinox noon: 0.3477, a dark brown
 *   (66, 56, 44)
 *   a gain that follows the sun's height (this build): 0.5417, a dim warm grey (122, 109, 94)
 *   Linux, a gain that follows the sun's height (this build): 0.5417
 *
 * Five captures of each build came back identical to four decimals, so the noise band is 0. The
 * bound is the midpoint, 0.4447, which clears each reading by 0.0970.
 */
const WINTER_AFTERNOON_SKY_MIN_LIGHTNESS = 0.4447

// The clear sky must also read darker in OKLab lightness than the sunlit white wall of the same
// frame, another relation with no midpoint. Before the daylight calibration the sky read 0.9574
// against a wall of 0.7170; on this build it reads 0.6730 against 0.9125.

test.describe('Sky gate', () => {
  test('the clear sky reads blue, unclipped, and darker than the sunlit white wall', async ({
    page,
  }) => {
    const canvas = await settledHarnessCanvas(page, CLEAR_NOON_QUERY)

    const skyColor = await sampleCanvasColor(page, canvas, SKY)
    const sky = srgbToOkLab(skyColor)
    const largestChannel = Math.max(skyColor.r, skyColor.g, skyColor.b) * CODE_RANGE
    const wallL = srgbToOkLab(await sampleCanvasColor(page, canvas, DEFAULT_VIEW_SOUTH_WALL)).L
    logReading('clear sky b', sky.b.toFixed(4))
    logReading('clear sky largest channel code', largestChannel.toFixed(2))
    logReading('clear sky L', sky.L.toFixed(4))
    logReading('sunlit south wall L', wallL.toFixed(4))

    expect(
      sky.b,
      `clear sky b ${sky.b.toFixed(4)} is over ${CLEAR_SKY_MAX_B}, so the clear sky reads ` +
        `near white rather than blue`,
    ).toBeLessThanOrEqual(CLEAR_SKY_MAX_B)
    expect(
      largestChannel,
      `clear sky largest channel code ${largestChannel.toFixed(2)} is not under ` +
        `${CLEAR_SKY_CHANNEL_CEILING}, so the sky is near clipping`,
    ).toBeLessThan(CLEAR_SKY_CHANNEL_CEILING)
    expect(
      sky.L,
      `clear sky L ${sky.L.toFixed(4)} is not under the sunlit white wall's L ` +
        `${wallL.toFixed(4)}, so the sky outshines a white wall in the sun`,
    ).toBeLessThan(wallL)
  })

  test('the sky with the sun 5 degrees up is not near black', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, WINTER_AFTERNOON_SKY_QUERY)

    const sky = srgbToOkLab(await sampleCanvasColor(page, canvas, SKY))
    logReading('winter-afternoon sky L', sky.L.toFixed(4))

    expect(
      sky.L,
      `winter-afternoon sky L ${sky.L.toFixed(4)} is under ` +
        `${WINTER_AFTERNOON_SKY_MIN_LIGHTNESS}, so the sky with a low sun reads near black ` +
        `while the house and the lawn are in daylight`,
    ).toBeGreaterThanOrEqual(WINTER_AFTERNOON_SKY_MIN_LIGHTNESS)
  })
})
