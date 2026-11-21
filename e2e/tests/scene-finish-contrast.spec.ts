import { test, expect, type Locator, type Page } from '@playwright/test'
import { type Color, colorFromOkLab, perceptualDistance, srgbToOkLab } from '../../core'
import { settledHarnessCanvas, sampleCanvasColor } from './scene-helpers'

// The glossy-finish contrast gate (issue #541, slice A2 of the rendering-realism campaign).
// The finish-contrast harness state paints the shell floor semi-gloss and all four walls
// matte in one shared base color under the color-check reference condition (ADR-0156), so a
// floor sample and a wall sample differ only in how their finish answers the sky's
// image-based light. A regression that erases that difference is the #520 defect class, and
// this spec is what sees it. It renders through the deterministic scene harness on the
// WebGL 2 backend, so it runs on both darwin Metal and linux SwiftShader and self-skips only
// where no WebGL 2 context exists. It commits no pixel baseline; the assertion is the
// sampled distance, not an image. Same posture as the color-accuracy gate, ADR-0157.

// The harness environment state and the paint store this gate renders. They share a name and
// select different things, so each is named for what it selects.
const FINISH_CONTRAST_SCENE = 'finish-contrast'
const FINISH_CONTRAST_PAINT = 'finish-contrast'

// Where the two sample patches are centered, as fractions of frame width and height. The
// state looks straight down from just under the ceiling, so on the 320x240 harness canvas the
// camera sees the room face of each wall: the floor covers about x 33..287 and y 25..215, and
// a band of matte wall about 30 px wide runs down each side before the wall-floor crease.
// The floor patch is the frame centre, well inside the specular response and clear of the
// wall-floor junction shading. The wall patch is as far left as sampleCanvasColor can read:
// its 24 px origin is 320 * 0.0375 - 12 = 0, which keeps the patch on the left wall band and
// off the floor entirely.
const FLOOR_SPECULAR_PATCH = { x: 0.5, y: 0.5 }
const WALL_MATTE_PATCH = { x: 0.0375, y: 0.5 }

/**
 * The smallest OKLab distance the semi-gloss floor and the matte wall may sample at.
 *
 * Re-derived on 2026-11-20 on the development Mac (issue #629); the readings below are darwin
 * Metal values. Until #629 the sheen lobe had a black tint, so a finish's sheen added nothing
 * to the frame. The sheen now takes the paint color, which lifts the semi-gloss floor. (The
 * 2026-11-15 derivation, issue #491, moved the wall paint to the room side of the walls, so
 * the gate compares the floor against painted wall.) Five consecutive captures were taken of
 * each build, and all five came back byte-identical each time, so the noise band is 0.000000:
 *
 *   shipped registry (semi-gloss roughness 0.3, sheen 0.5, specular 0.4): 0.023911
 *   (0.010278 before the sheen took the paint color)
 *   collapsed probe (the semi-gloss entry set to the matte values, roughness 0.9, sheen 0,
 *   specular 0.04, which is the #520 defect class): 0.000000
 *   roughness-only probe (semi-gloss roughness set to 0.9, sheen and specular kept): 0.017105
 *
 * The threshold goes between the shipped and collapsed readings with a margin of at least
 * twice the noise band, the derivation rule that fixed the 0.06 color-accuracy tolerance
 * (ADR-0157). The true midpoint of the two readings is 0.011956; rounded down to 0.0119, it
 * leaves a margin of 0.023911 - 0.0119 = 0.012011 above and 0.0119 below. The roughness-only
 * probe now reads above the minimum, because the tinted sheen alone keeps the floor apart
 * from the wall, so this gate sees the full collapse and the finish-contrast pixel baseline in
 * scene-solar.spec.ts sees the roughness defect. The noise band over the byte-identical
 * captures is 0.000000, so the margin rule (at least twice the noise band) is satisfied on
 * both sides with room to spare.
 */
const FINISH_CONTRAST_MINIMUM = 0.0119

// Puts the harness in the finish-contrast state and returns its settled canvas.
async function gotoFinishContrast(page: Page): Promise<Locator> {
  return settledHarnessCanvas(
    page,
    `&scene=${FINISH_CONTRAST_SCENE}&paint=${FINISH_CONTRAST_PAINT}`,
    'the finish-contrast gate',
  )
}

// Averages the patch centered on the given frame fractions and reads it back as a color.
async function sampledColor(
  page: Page,
  canvas: Locator,
  center: { x: number; y: number },
): Promise<Color> {
  return colorFromOkLab(srgbToOkLab(await sampleCanvasColor(page, canvas, center)))
}

test.describe('Glossy finish contrast gate', () => {
  test('the semi-gloss floor samples apart from the matte wall', async ({ page }) => {
    const canvas = await gotoFinishContrast(page)

    const floor = await sampledColor(page, canvas, FLOOR_SPECULAR_PATCH)
    const wall = await sampledColor(page, canvas, WALL_MATTE_PATCH)
    const distance = perceptualDistance(floor, wall)

    expect(
      distance,
      `semi-gloss floor ${floor.srgbHex} against matte wall ${wall.srgbHex}: OKLab distance ` +
        `${distance.toFixed(6)} is under the minimum ${FINISH_CONTRAST_MINIMUM}, so the two ` +
        `finishes no longer separate`,
    ).toBeGreaterThanOrEqual(FINISH_CONTRAST_MINIMUM)
  })
})
