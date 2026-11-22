// core/daylight/doorway-flux-bound.test.ts
import { describe, expect, it } from 'vitest'
import { UNIFORM_SKY, createDaylightFieldSolver } from './sky-visibility'
import { EXTREME_SWEEP_ROW, ORDINARY_SWEEP_ROWS, sourceAndHalls } from './doorway-test-support'
import type { SweepRow } from './doorway-test-support'

function hallToSourceFluxRatio(row: SweepRow): number {
  const solver = createDaylightFieldSolver(sourceAndHalls({ ...row, halls: 1 }))
  return solver.enteringFlux(1, UNIFORM_SKY) / solver.enteringFlux(0, UNIFORM_SKY)
}

describe('a hall never takes more flux than the room that lights it', () => {
  it('holds for a source 100 by 40000 mm under a 6000 mm ceiling with a white floor', () => {
    expect(hallToSourceFluxRatio(EXTREME_SWEEP_ROW)).toBeLessThanOrEqual(1)
  })

  it.each(ORDINARY_SWEEP_ROWS)(
    'holds for a source $width by $depth mm with a floor of reflectance $label',
    (row) => {
      expect(hallToSourceFluxRatio(row)).toBeLessThanOrEqual(1)
    },
  )
})
