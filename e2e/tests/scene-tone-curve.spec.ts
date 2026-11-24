import { test, expect } from '@playwright/test'
import {
  WHITE_CODE_FLOOR,
  agxNeutralResponse,
  computeEnvironmentLighting,
  linearLuminance,
  predictedMatteRadiance,
  referenceLightingInput,
  srgbToLinear,
} from '../../core'
import { CODE_RANGE, luminanceCode, sampleCanvasColor } from './canvas-patch'
import { SOUTH_WEST_VIEW_SOUTH_WALL, logReading, settledHarnessCanvas } from './scene-helpers'

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

// The sunlit south face is the shared south wall square of the south-west view
// (scene-helpers.ts). It was the square at x 157..162, y 142..147 until the low-sun state took
// the same camera; it moved down one row to keep 4 px from the window sill in that frame. Both
// squares held one color in this state, on this build and on the Neutral probe, so the readings
// are the same.

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
 * Derived again on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness,
 * 320x240 frame), after the ground half of the sky dome turned a neutral grey, the sun's level
 * took the air-path fade, and the visible sky's gain came to follow the sun's height. The
 * predicted code is 224.90. Readings of this region, measured minus predicted:
 *
 *   calibrated daylight under AgX (this build): code 224.86, difference -0.05
 *   probe, daylight mapped to the Neutral operator instead of AgX: code 248.29, difference
 *   +23.38
 *   Linux, calibrated daylight under AgX (this build): code 224.86, difference -0.05
 *
 * Five captures of each build came back byte-identical, so the noise band is 0. The tolerance
 * is the midpoint of the two differences' sizes, (0.05 + 23.38) / 2 = 11.715, rounded to 11.7,
 * which clears this build by 11.65 codes and the probe by 11.68. Before these three changes
 * the two differences were -0.40 and +24.00 and the tolerance was 12.2.
 */
const TONE_CURVE_TOLERANCE_CODES = 11.7

// The lowest code the sunlit white face may read: the white code floor of the calibration less
// the tone curve tolerance, 225 - 11.7 = 213.3. The face read 224.86 on this build.
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
  })
})
