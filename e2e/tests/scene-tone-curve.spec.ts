import { test, expect } from '@playwright/test'
import {
  WHITE_CODE_FLOOR,
  agxNeutralResponse,
  computeEnvironmentLighting,
  linearToSrgb,
  predictedMatteRadiance,
  srgbToLinear,
  type EnvironmentLightingInput,
  type LinearRgb,
  type Srgb,
} from '../../core'
import { logReading, sampleCanvasColor, settledHarnessCanvas, squareRegion } from './scene-helpers'

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

// The south exterior face, below the south window and left of the door, clear of the window
// sill, the wall's west corner, and the darkening where the wall meets the lawn: x 157..162,
// y 142..147. The south face is small in this south-west view, and this is the largest square
// on it that keeps 4 px from every edge, so the region is 6 px.
const SUNLIT_SOUTH_WALL = squareRegion(157, 142, 6)

// The site and instant of the daylight-reference state (app/harness-environment.ts), which are
// the reference place and instant of the daylight calibration in core: 40 N, 1.86 E, UTC, north
// up, the March equinox at 10:30, and a clear sky.
const REFERENCE_LIGHTING_INPUT: EnvironmentLightingInput = {
  latLong: { latitude: 40, longitude: 1.86 },
  northBearing: 0,
  utcOffsetMinutes: 0,
  observedAt: { date: '2026-03-20', minutesSinceMidnight: 630 },
  cloudCover: 0,
}

// The south face's outward normal (world south is +z).
const SOUTH_NORMAL = { x: 0, y: 0, z: 1 }
// The 8-bit code range a display shows.
const CODE_RANGE = 255
// The daylight white paint is `#ededed`, so each channel's reflectance is the linear value of
// code 237 (0.8469), the reflectance the renderer uses.
const WHITE_PAINT_CODE = 237
const WHITE_PAINT_REFLECTANCE = srgbToLinear(WHITE_PAINT_CODE / CODE_RANGE)

// Rec. 709 luminance weights.
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 }

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
 *   Linux SwiftShader readings: not yet recorded.
 *
 * Five captures of each build came back byte-identical, so the noise band is 0. The tolerance
 * is the midpoint of the two differences' sizes, (0.40 + 24.00) / 2 = 12.20, which clears each
 * reading by 11.80 codes.
 */
const TONE_CURVE_TOLERANCE_CODES = 12.2

// The lowest code the sunlit white face may read: the white code floor of the calibration less
// the tone curve tolerance, 225 - 12.2 = 212.8. The face read 224.50 on this build.
const SUNLIT_WHITE_MINIMUM_CODE = WHITE_CODE_FLOOR - TONE_CURVE_TOLERANCE_CODES

function luminance(color: LinearRgb): number {
  return (
    LUMINANCE_WEIGHTS.r * color.r + LUMINANCE_WEIGHTS.g * color.g + LUMINANCE_WEIGHTS.b * color.b
  )
}

// The code the light model and the tone curve predict for the sunlit south face.
function predictedSouthWallCode(): number {
  const lighting = computeEnvironmentLighting(REFERENCE_LIGHTING_INPUT)
  const radiance = predictedMatteRadiance(lighting, {
    normal: SOUTH_NORMAL,
    reflectance: {
      r: WHITE_PAINT_REFLECTANCE,
      g: WHITE_PAINT_REFLECTANCE,
      b: WHITE_PAINT_REFLECTANCE,
    },
  })
  return agxNeutralResponse(luminance(radiance)) * CODE_RANGE
}

// The display code of a sampled color's luminance: decode the channels, weigh them, encode.
function luminanceCode(color: Srgb): number {
  const linear = { r: srgbToLinear(color.r), g: srgbToLinear(color.g), b: srgbToLinear(color.b) }
  return linearToSrgb(luminance(linear)) * CODE_RANGE
}

test.describe('Tone curve gate', () => {
  test('the sunlit white south wall shows the code the light model predicts', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, DAYLIGHT_REFERENCE_QUERY)

    const measured = luminanceCode(await sampleCanvasColor(page, canvas, SUNLIT_SOUTH_WALL))
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
  })
})
