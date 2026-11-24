import { test, expect } from '@playwright/test'
import {
  linearLevel,
  luminanceCodeSpread,
  sampleCanvasColor,
  samplePatchPixels,
} from './canvas-patch'
import { logReading, settledHarnessCanvas, squareRegion } from './scene-helpers'

// The grass texture gate. The ground draws the starter pack's mown-grass tile on the lawn, and
// this spec proves the change is visible without moving the lawn's level of light. It reads the
// sunlit lawn of the sun-to-shade gate in the `shadow-on-lawn` state: the lawn must vary from
// pixel to pixel, as a flat color does not, and its mean linear level must stay in a band about
// the flat lawn's, as a tile with the lawn's mean color in linear light should.
//
// It renders through the deterministic scene harness on the WebGL 2 backend, so it runs on
// darwin Metal and on the linux SwiftShader lane and self-skips only where no WebGL 2 context
// can be created. It commits no screenshot, so no baseline moves with it. The flat readings
// below come from the same build with the request for the grass image aborted, which leaves
// the flat lawn color in place (`data-ground-texture="failed"`).

// The canonical harness state this gate renders.
const SHADOW_ON_LAWN_QUERY = '&scene=shadow-on-lawn'

// The lawn in the sun east of the building's shadow: x 236..259, y 109..132. It is the sunlit
// square of the sun-to-shade gate (scene-sun-to-shade.spec.ts).
const SUNLIT_LAWN = squareRegion(236, 109, 24)

/**
 * The smallest standard deviation of the luminance display codes (0..255) of the pixels of the
 * sunlit lawn.
 *
 * Derived on 2026-11-24 on the development Mac (macOS, Apple Metal, WebGL 2 harness, 320x240
 * frame). Readings of the square:
 *
 *   flat lawn: 0.0273 (the shading across the square moves the blue channel by a code or so)
 *   grass (this build): 0.2023
 *   Linux: pending, to be read on the ubuntu runner after the branch is pushed. If the grass
 *   reads lower there, the minimum moves to the midpoint of the flat reading and the lower one.
 *
 * Five captures of each build gave the same readings to six decimals, so the noise band is 0.
 * The minimum is the midpoint of the two readings, (0.0273 + 0.2023) / 2 = 0.1148, rounded to
 * 0.115. It clears the grass by 0.087 and the flat lawn by 0.088. The grass reads only a fifth
 * of a code because the mip sample of each pixel averages many texels.
 */
const MIN_LAWN_LUMINANCE_SPREAD = 0.115

/**
 * The flat lawn's mean linear level in the square, read as the sun-to-shade gate reads it: the
 * mean display code of the square, taken back through the tone curve.
 *
 * Darwin, 2026-11-24, five captures, all the same: 0.5977765. Linux: pending, to be read on the
 * ubuntu runner after the branch is pushed. On 2026-11-16 the sun-to-shade gate read this square
 * of the same flat lawn at 0.5978 on darwin and 0.5979 on Linux.
 */
const FLAT_LAWN_LINEAR_LEVEL = 0.5977765

/**
 * σ, the tile's spread of texel luminance over its mean, in linear light, as
 * `scripts/pack/starter/grass-tile.test.mjs` computes it: 0.09978.
 */
const GRASS_TILE_SPREAD = 0.09978

/** γ, the exponent of the sRGB encoding. */
const ENCODING_EXPONENT = 1 / 2.4

/**
 * ε, the distance of the tile's mean luminance in linear light (0.211732) from the ground
 * bounce of ADR-0192 (0.21174), over 0.21174: 0.0000378. The tile test bounds the distance by
 * 0.0005, about 0.24 percent.
 */
const GRASS_TILE_LUMINANCE_ERROR = 0.0000378

/**
 * n, the larger of the relative noise of five captures of each build and the relative gap
 * between the darwin and Linux flat readings. The darwin captures were all the same, so the
 * noise is 0. The Linux gap is pending, to be read on the ubuntu runner after the branch is
 * pushed; the committed Linux flat baseline reads 0.5978571, so n is expected near 0.000135.
 */
const CAPTURE_NOISE = 0

/**
 * r, the rounding of the flat reading to whole display codes, which the plan's first band left
 * out. The flat lawn is one color across the square, so its red and green channels read one code
 * on every pixel (166 and 189 of 255, on darwin and in the committed Linux baseline), and the
 * reading can sit up to half a code a channel from the level the renderer computed, in a
 * direction the capture cannot show. Half a code on all three channels at once, taken through
 * `linearLevel`, moves the flat level by 1.209 percent up and 1.191 percent down. The term is the
 * larger, on both sides. The grass on darwin reads 0.115 percent above the flat reading, a tenth
 * of the term. The band so catches a tile mean off by more than about 1.2 percent; the tile test
 * holds it to 0.24 percent. If a GPU rounds each mip level of the tile to 8-bit sRGB, the grass
 * can read up to about 0.5 percent higher there; if Linux lands outside the band, derive a mip
 * term for it rather than widen this one.
 */
const FLAT_READING_ROUNDING = 0.01209

// The relative drop a square of single texels can read below the flat level: ½(1 − γ)σ².
const TEXEL_SPREAD_DROP = ((1 - ENCODING_EXPONENT) * GRASS_TILE_SPREAD ** 2) / 2

/**
 * The band the sunlit lawn's mean linear level must lie in with the grass drawn:
 * L_flat × (1 − ½(1 − γ)σ² − ε − n − r) to L_flat × (1 + ε + n + r), with r the rounding above.
 * On darwin the band is 0.58879 to 0.60503.
 *
 * Darwin, 2026-11-24, five captures of each build, all the same:
 *
 *   grass (this build): 0.5984666, 0.115 percent above the flat reading
 *   defect probe, the tile decoded as `linear` instead of `srgb`: 1.3765242, 2.3 times the flat
 *   reading and far above the band
 *   Linux: pending, to be read on the ubuntu runner after the branch is pushed.
 */
const LAWN_LEVEL_LOWER =
  FLAT_LAWN_LINEAR_LEVEL *
  (1 - TEXEL_SPREAD_DROP - GRASS_TILE_LUMINANCE_ERROR - CAPTURE_NOISE - FLAT_READING_ROUNDING)
const LAWN_LEVEL_UPPER =
  FLAT_LAWN_LINEAR_LEVEL * (1 + GRASS_TILE_LUMINANCE_ERROR + CAPTURE_NOISE + FLAT_READING_ROUNDING)

test.describe('Grass texture gate', () => {
  test('the sunlit lawn varies from pixel to pixel as the grass tile does', async ({ page }) => {
    const canvas = await settledHarnessCanvas(page, SHADOW_ON_LAWN_QUERY)

    const spread = luminanceCodeSpread(await samplePatchPixels(page, canvas, SUNLIT_LAWN))
    logReading('sunlit lawn luminance code spread', spread.toFixed(4))

    expect(
      spread,
      `the sunlit lawn's luminance codes spread by ${spread.toFixed(4)}, under the derived ` +
        `minimum ${MIN_LAWN_LUMINANCE_SPREAD}, so the lawn reads as a flat color`,
    ).toBeGreaterThanOrEqual(MIN_LAWN_LUMINANCE_SPREAD)
  })

  test('the sunlit lawn keeps the linear level of the flat lawn within the band', async ({
    page,
  }) => {
    const canvas = await settledHarnessCanvas(page, SHADOW_ON_LAWN_QUERY)

    const level = linearLevel(await sampleCanvasColor(page, canvas, SUNLIT_LAWN))
    logReading('sunlit lawn linear level', level.toFixed(7))

    const band = `${LAWN_LEVEL_LOWER.toFixed(5)} to ${LAWN_LEVEL_UPPER.toFixed(5)}`
    const message =
      `the sunlit lawn's linear level ${level.toFixed(5)} is outside ${band}, so the grass ` +
      `tile is decoded in the wrong color space or does not have the lawn's mean color`
    expect(level, message).toBeGreaterThanOrEqual(LAWN_LEVEL_LOWER)
    expect(level, message).toBeLessThanOrEqual(LAWN_LEVEL_UPPER)
  })
})
