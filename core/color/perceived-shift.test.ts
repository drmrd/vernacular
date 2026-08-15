import { describe, expect, it } from 'vitest'
import { colorFromHex, colorFromOkLab, type Color } from './color'
import { COLOR_ACCURACY_TOLERANCE, withinColorTolerance } from './color-accuracy'
import { describePerceivedShift, PERCEIVED_AXIS_THRESHOLD } from './perceived-shift'

/**
 * Build a color from explicit OKLab components. `L` is the published OKLab
 * lightness axis name (see oklab.ts), not a renamable identifier.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- L is the published OKLab lightness axis, not a renamable identifier
function fromLab(L: number, a: number, b: number): Color {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- L is the published OKLab lightness axis, not a renamable identifier
  return colorFromOkLab({ L, a, b })
}

describe('describePerceivedShift', () => {
  it('reports a color compared with itself as faithful, with zero distance and unchanged axes', () => {
    const paint = colorFromHex('#cc6633')
    const shift = describePerceivedShift(paint, paint)
    expect(shift.distance).toBeCloseTo(0, 6)
    expect(shift.faithful).toBe(true)
    expect(shift.lightness).toBe('unchanged')
    expect(shift.warmth).toBe('unchanged')
  })

  it('reports a sample lighter than the reference by more than the axis threshold as lighter', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L + PERCEIVED_AXIS_THRESHOLD + 0.005,
      reference.oklab.a,
      reference.oklab.b,
    )
    expect(describePerceivedShift(sample, reference).lightness).toBe('lighter')
  })

  it('reports a sample darker than the reference by more than the axis threshold as darker', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L - PERCEIVED_AXIS_THRESHOLD - 0.005,
      reference.oklab.a,
      reference.oklab.b,
    )
    expect(describePerceivedShift(sample, reference).lightness).toBe('darker')
  })

  it('reports a sample with a higher b than the reference by more than the axis threshold as warmer', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L,
      reference.oklab.a,
      reference.oklab.b + PERCEIVED_AXIS_THRESHOLD + 0.005,
    )
    expect(describePerceivedShift(sample, reference).warmth).toBe('warmer')
  })

  it('reports a sample with a lower b than the reference by more than the axis threshold as cooler', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L,
      reference.oklab.a,
      reference.oklab.b - PERCEIVED_AXIS_THRESHOLD - 0.005,
    )
    expect(describePerceivedShift(sample, reference).warmth).toBe('cooler')
  })

  it('reports both axes unchanged when the shift stays within the axis threshold', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L + PERCEIVED_AXIS_THRESHOLD / 2,
      reference.oklab.a,
      reference.oklab.b - PERCEIVED_AXIS_THRESHOLD / 2,
    )
    const shift = describePerceivedShift(sample, reference)
    expect(shift.lightness).toBe('unchanged')
    expect(shift.warmth).toBe('unchanged')
  })

  it('reports a shift within the color-accuracy tolerance as faithful and one beyond it as not', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const insideSample = fromLab(reference.oklab.L + 0.059, reference.oklab.a, reference.oklab.b)
    const outsideSample = fromLab(reference.oklab.L + 0.061, reference.oklab.a, reference.oklab.b)
    expect(describePerceivedShift(insideSample, reference).faithful).toBe(true)
    expect(describePerceivedShift(outsideSample, reference).faithful).toBe(false)
  })

  it('agrees with the color-accuracy gate on whether a sample reads as faithful', () => {
    const reference = fromLab(0.5, 0.05, -0.02)
    const lightnessOffsets = [0, 0.02, 0.055, 0.059, 0.06, 0.061, 0.065, 0.1]
    for (const offset of lightnessOffsets) {
      const sample = fromLab(reference.oklab.L + offset, reference.oklab.a, reference.oklab.b)
      expect(describePerceivedShift(sample, reference).faithful).toBe(
        withinColorTolerance(sample, reference),
      )
    }
  })

  it('derives the axis threshold as the isotropic per-axis share of the color-accuracy tolerance', () => {
    expect(PERCEIVED_AXIS_THRESHOLD).toBeCloseTo(COLOR_ACCURACY_TOLERANCE / Math.sqrt(3), 10)

    const reference = fromLab(0.5, 0.05, -0.02)
    const sample = fromLab(
      reference.oklab.L + PERCEIVED_AXIS_THRESHOLD,
      reference.oklab.a + PERCEIVED_AXIS_THRESHOLD,
      reference.oklab.b + PERCEIVED_AXIS_THRESHOLD,
    )
    expect(describePerceivedShift(sample, reference).distance).toBeCloseTo(
      COLOR_ACCURACY_TOLERANCE,
      10,
    )
  })
})
