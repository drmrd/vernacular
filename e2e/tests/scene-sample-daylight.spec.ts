import { test, expect, type Locator, type Page } from '@playwright/test'
import {
  agxNeutralResponse,
  computeEnvironmentLighting,
  linearLuminance,
  predictedMatteRadiance,
  referenceLightingInput,
  srgbToLinear,
  srgbToOkLab,
  type Vector3,
} from '../../core'
import { CODE_RANGE, sampleCanvasColor } from './canvas-patch'
import {
  SOUTH_WEST_VIEW_SOUTH_WALL,
  SOUTH_WEST_VIEW_WEST_WALL,
  logReading,
  settledHarnessCanvas,
} from './scene-helpers'

// The sample daylight gate. A project with no site location renders sample daylight: the sun
// is computed for a sample place, and north is implied so that the front of the building (the
// wall with the widest exterior door) faces due south. The sample-daylight state has a site
// with no location, the opening instant, and the camera of the daylight-reference state, which
// pins the sample place as a real site. So the front of the shell, its south wall, must take
// the sun while the west wall stays in shade, and both frames must show the same sun on the
// same walls. This spec reads both.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it.

// The two harness states this gate renders, both with the matte daylight white on the walls.
const SAMPLE_DAYLIGHT_QUERY = '&scene=sample-daylight&paint=daylight-white'
const DAYLIGHT_REFERENCE_QUERY = '&scene=daylight-reference&paint=daylight-white'

// The outward normals of the two faces (world south is +z, world west is -x).
const SOUTH_NORMAL: Vector3 = { x: 0, y: 0, z: 1 }
const WEST_NORMAL: Vector3 = { x: -1, y: 0, z: 0 }
// The daylight white paint is `#ededed`, so each channel's reflectance is the linear value of
// code 237, the reflectance the renderer uses.
const WHITE_PAINT_CODE = 237
const WHITE_PAINT_REFLECTANCE = srgbToLinear(WHITE_PAINT_CODE / CODE_RANGE)

/**
 * The smallest OKLab lightness gap the sunlit south wall may read above the shaded west wall.
 *
 * Derived on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame) under the calibrated daylight, from the light model in core, not by eye. The model is
 * predictedMatteRadiance for the daylight white (linear 0.8469 per channel) on each wall normal,
 * lit from the calibration's lighting input, which the sample place and the opening instant
 * reproduce. The luminance of each prediction goes through agxNeutralResponse and is read as a
 * grey. Model: south L 0.9095, west L 0.7203, gap 0.1891. These numbers hold on the calibrated
 * daylight: they were computed again after the calibration merged and did not move.
 *
 * Readings of these regions on 2026-11-16 on the development Mac, after the calibration merged
 * (the sun level that fades by air mass, the sky gain that follows the sun's height, and the
 * grey ground bounce), with the south square at x 157..162, y 143..148: south 0.9092, west
 * 0.7226, gap 0.1866. Linux SwiftShader on the same build, one CI capture on 2026-11-17:
 * south 0.9092, west 0.7233, gap 0.1859.
 *
 * Five captures came back identical, so the noise band is 0. The threshold is half the model
 * gap, 0.1891 / 2 = 0.0946, rounded to 0.095. The defect this gate is written for, sample
 * daylight that does not put the sun on the front, leaves the south wall reading like the
 * shaded west wall, a gap of zero, so half the model gap is the midpoint between the model and
 * that defect. The margin is 0.0916 below the Mac reading (0.0909 below the Linux one) and 0.095 above the defect.
 */
const SAMPLE_DAYLIGHT_MIN_GAP = 0.095

/**
 * The largest OKLab lightness difference the south wall of the sample-daylight frame may read
 * from the south wall of the daylight-reference frame.
 *
 * Measured on 2026-11-16 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame), after the calibration merged: in five of five captures the two frames read the same
 * in the south wall region (L 0.9092 in both, a difference of exactly 0) and in the west wall
 * region (L 0.7226 in both), so the noise band is 0. The tolerance is a small stated margin,
 * 0.001: about a third of the lightness change that a one-code step over the whole region makes
 * near this code (0.0030). Linux SwiftShader on the same build, one CI capture on 2026-11-17:
 * the two frames read the same in the south wall region (L 0.9092 in both) and in the west
 * wall region, a difference of 0.0000 in each.
 */
const SAME_SUN_TOLERANCE_L = 0.001

// The OKLab lightness the light model and the tone curve predict for a white face with this
// normal, lit from the calibration's own lighting input: the predicted luminance goes through
// the tone curve and is read as a grey.
function predictedWallLightness(normal: Vector3): number {
  const lighting = computeEnvironmentLighting(referenceLightingInput())
  const radiance = predictedMatteRadiance(lighting, {
    normal,
    reflectance: {
      r: WHITE_PAINT_REFLECTANCE,
      g: WHITE_PAINT_REFLECTANCE,
      b: WHITE_PAINT_REFLECTANCE,
    },
  })
  const grey = agxNeutralResponse(linearLuminance(radiance))
  return srgbToOkLab({ r: grey, g: grey, b: grey }).L
}

// The OKLab lightness of the south and west wall regions of a settled frame.
async function wallLightness(
  page: Page,
  canvas: Locator,
): Promise<{ south: number; west: number }> {
  const south = srgbToOkLab(await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_SOUTH_WALL)).L
  const west = srgbToOkLab(await sampleCanvasColor(page, canvas, SOUTH_WEST_VIEW_WEST_WALL)).L
  return { south, west }
}

test.describe('Sample daylight gate', () => {
  test('the front of a project with no site takes the sun', async ({ page }) => {
    const sample = await wallLightness(
      page,
      await settledHarnessCanvas(page, SAMPLE_DAYLIGHT_QUERY),
    )
    const gap = sample.south - sample.west
    const predictedSouth = predictedWallLightness(SOUTH_NORMAL)
    const predictedWest = predictedWallLightness(WEST_NORMAL)
    logReading('sample daylight south wall L', sample.south.toFixed(4))
    logReading('sample daylight west wall L', sample.west.toFixed(4))
    logReading('sample daylight gap', gap.toFixed(4))
    logReading('predicted south wall L', predictedSouth.toFixed(4))
    logReading('predicted west wall L', predictedWest.toFixed(4))
    logReading('predicted gap', (predictedSouth - predictedWest).toFixed(4))

    expect(
      gap,
      `sunlit south wall L ${sample.south.toFixed(4)} against shaded west wall L ` +
        `${sample.west.toFixed(4)}: gap ${gap.toFixed(4)} is under the derived minimum ` +
        `${SAMPLE_DAYLIGHT_MIN_GAP}, so the front of a project with no site is not in the sun`,
    ).toBeGreaterThanOrEqual(SAMPLE_DAYLIGHT_MIN_GAP)
  })

  test('sample daylight shows the sun of the reference site', async ({ page }) => {
    const sample = await wallLightness(
      page,
      await settledHarnessCanvas(page, SAMPLE_DAYLIGHT_QUERY),
    )
    const reference = await wallLightness(
      page,
      await settledHarnessCanvas(page, DAYLIGHT_REFERENCE_QUERY),
    )
    const southDifference = sample.south - reference.south
    logReading('reference south wall L', reference.south.toFixed(4))
    logReading('south wall difference', southDifference.toFixed(4))
    // The west wall is logged, not gated: the front is the face the implied north must light.
    logReading('west wall difference', (sample.west - reference.west).toFixed(4))

    expect(
      Math.abs(southDifference),
      `sample daylight south wall L ${sample.south.toFixed(4)} against the reference ` +
        `${reference.south.toFixed(4)}: the difference ${southDifference.toFixed(4)} is over ` +
        `${SAME_SUN_TOLERANCE_L}, so sample daylight does not show the sun of the sample place`,
    ).toBeLessThanOrEqual(SAME_SUN_TOLERANCE_L)
  })
})
