import { test, expect } from '@playwright/test'
import {
  WHITE_CODE_FLOOR,
  agxNeutralResponse,
  computeEnvironmentLighting,
  linearLuminance,
  linearToSrgb,
  predictedMatteRadiance,
  referenceLightingInput,
  srgbToLinear,
  srgbToOkLab,
  type Srgb,
} from '../../core'
import {
  CODE_RANGE,
  SOUTH_WEST_VIEW_SOUTH_WALL,
  SOUTH_WEST_VIEW_WEST_WALL,
  logReading,
  sampleCanvasColor,
  settledHarnessCanvas,
} from './scene-helpers'

// The tone curve gate. The daylight-reference state paints the four exterior wall faces the
// matte daylight white and lights them from a clear mid-morning sky at the equinox, so the
// south face takes direct sun. The light model in core predicts what that face returns, with
// no shadow and no specular term, and the transcribed tone curve turns the prediction into the
// code a display shows. This spec reads the luminance code the harness renders on the sunlit
// south face and compares it with that predicted code: if the two drift apart, either the
// renderer's tone mapping or the model that the daylight calibration rests on is wrong. It
// also holds the face at the white code floor the calibration aims for.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The reference harness state and the white paint this gate renders.
const DAYLIGHT_REFERENCE_QUERY = '&scene=daylight-reference&paint=daylight-white'

// The regions are the shared wall squares of the south-west view (scene-helpers.ts): at this
// instant the south face takes the sun and the west face is in shade.

// The south face's outward normal (world south is +z).
const SOUTH_NORMAL = { x: 0, y: 0, z: 1 }
// The daylight white paint is `#ededed`, so each channel's reflectance is the linear value of
// code 237 (0.8469), the reflectance the renderer uses.
const WHITE_PAINT_CODE = 237
const WHITE_PAINT_REFLECTANCE = srgbToLinear(WHITE_PAINT_CODE / CODE_RANGE)

/**
 * The largest difference, in display codes, between the measured and the predicted code of the
 * sunlit south face.
 *
 * Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame). The predicted code is 224.90. Readings of this region, measured minus predicted:
 *
 *   calibrated daylight under AgX (this build): code 224.50, difference -0.40
 *   probe, daylight mapped to the Neutral operator instead of AgX: code 248.90, difference
 *   +24.00
 *   Linux SwiftShader (run 43820235938, 2026-11-16), calibrated daylight under AgX: code 224.50,
 *   difference -0.40, the same as the Mac
 *
 * Five captures of each build came back byte-identical, so the noise band is 0. The tolerance
 * is the midpoint of the two differences' sizes, (0.40 + 24.00) / 2 = 12.20, which clears each
 * reading by 11.80 codes.
 */
const TONE_CURVE_TOLERANCE_CODES = 12.2

// The lowest code the sunlit white face may read: the white code floor of the calibration less
// the tone curve tolerance, 225 - 12.2 = 212.8. The face read 224.50 on this build.
const SUNLIT_WHITE_MINIMUM_CODE = WHITE_CODE_FLOOR - TONE_CURVE_TOLERANCE_CODES

// The code the light model and the tone curve predict for the sunlit south face. The
// daylight-reference state (app/harness-environment.ts) renders at the reference place and
// instant of the daylight calibration in core, so the prediction lights the face from the
// calibration's own lighting input.
function predictedSouthWallCode(): number {
  const lighting = computeEnvironmentLighting(referenceLightingInput())
  const radiance = predictedMatteRadiance(lighting, {
    normal: SOUTH_NORMAL,
    reflectance: {
      r: WHITE_PAINT_REFLECTANCE,
      g: WHITE_PAINT_REFLECTANCE,
      b: WHITE_PAINT_REFLECTANCE,
    },
  })
  return agxNeutralResponse(linearLuminance(radiance)) * CODE_RANGE
}

// The display code of a sampled color's luminance: decode the channels, weigh them, encode.
function luminanceCode(color: Srgb): number {
  const linear = { r: srgbToLinear(color.r), g: srgbToLinear(color.g), b: srgbToLinear(color.b) }
  return linearToSrgb(linearLuminance(linear)) * CODE_RANGE
}

test.describe('Tone curve gate', () => {
  test('the sunlit white south wall shows the code the light model predicts', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, DAYLIGHT_REFERENCE_QUERY)

    const measured = luminanceCode(
      await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_SOUTH_WALL),
    )
    const predicted = predictedSouthWallCode()
    const difference = measured - predicted
    logReading('sunlit south wall code', measured.toFixed(2))
    logReading('predicted south wall code', predicted.toFixed(2))
    logReading('tone curve difference', difference.toFixed(2))

    expect(
      Math.abs(difference),
      `sunlit south wall code ${measured.toFixed(2)} against the predicted ` +
        `${predicted.toFixed(2)}: the difference ${difference.toFixed(2)} is over the tolerance ` +
        `${TONE_CURVE_TOLERANCE_CODES}, so the renderer's tone curve or the light model is wrong`,
    ).toBeLessThanOrEqual(TONE_CURVE_TOLERANCE_CODES)
    expect(
      measured,
      `sunlit south wall code ${measured.toFixed(2)} is under ${SUNLIT_WHITE_MINIMUM_CODE}, ` +
        `the white code floor ${WHITE_CODE_FLOOR} less the tone curve tolerance, so a white ` +
        `wall in the sun does not read white`,
    ).toBeGreaterThanOrEqual(SUNLIT_WHITE_MINIMUM_CODE)

    // The shaded west wall is logged, not gated. The light model predicts a green cast there,
    // since the sky dome below the horizon is the green lawn and lights the wall (issue #765),
    // and no bound on that cast has been decided, so the reading is recorded for the decision.
    // On 2026-11-16 on the development Mac the region held one color, (147, 169, 157), and read
    // a -0.0285 and b 0.0094 in five of five captures.
    const shadedWest = srgbToOkLab(await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_WEST_WALL))
    logReading('shaded west wall a', shadedWest.a.toFixed(4))
    logReading('shaded west wall b', shadedWest.b.toFixed(4))
  })
})
