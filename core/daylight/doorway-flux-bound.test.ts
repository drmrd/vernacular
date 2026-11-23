// core/daylight/doorway-flux-bound.test.ts
import { describe, expect, it } from 'vitest'
import {
  UNIFORM_SKY,
  UNPAINTED_SURFACE_REFLECTANCE,
  createDaylightFieldSolver,
} from './sky-visibility'
import {
  BLACK,
  EXTREME_SWEEP_ROW,
  GRAY,
  ORDINARY_SWEEP_ROWS,
  WHITE,
  sourceAndHalls,
} from './doorway-test-support'
import type { SweepRow } from './doorway-test-support'
import { commonEdgeFormFactor } from './upright-form-factor-test-support'

const TOLERANCE = 1e-9
const PINNED_TOLERANCE = 1e-8
const WIDTHS = [100, 1000, 4000]
const DEPTHS = [2000, 40000]
const CEILING_HEIGHTS = [2400, 6000]
const FLOOR_COLORS = [BLACK, GRAY, WHITE]
// 500 by 6000 mm with a white floor, the ordinary row with the largest share.
const NARROW_WHITE_ROW: SweepRow = {
  width: 500,
  depth: 6000,
  floorColor: WHITE,
  ceilingHeight: 2600,
  label: 1,
}
const SHAPE_SWEEP_ROWS: readonly SweepRow[] = WIDTHS.flatMap((width) =>
  DEPTHS.flatMap((depth) =>
    CEILING_HEIGHTS.flatMap((ceilingHeight) =>
      FLOOR_COLORS.map((floorColor) => ({
        width,
        depth,
        ceilingHeight,
        floorColor,
        label: floorColor.r,
      })),
    ),
  ),
)

function hallToSourceFluxRatios(row: SweepRow, halls: 1 | 2): number[] {
  const solver = createDaylightFieldSolver(sourceAndHalls({ ...row, halls }))
  const sourceFlux = solver.enteringFlux(0, UNIFORM_SKY)
  return Array.from(
    { length: halls },
    (_, hall) => solver.enteringFlux(hall + 1, UNIFORM_SKY) / sourceFlux,
  )
}

function hallToSourceFluxRatio(row: SweepRow): number {
  return hallToSourceFluxRatios(row, 1).reduce((only, ratio) => only + ratio, 0)
}

/**
 * The window's whole-wall share of its flux, `s`: window and doorway are whole walls that meet at a
 * corner over the same heights, so the share is the textbook common-edge factor.
 */
function windowShare(row: SweepRow): number {
  return commonEdgeFormFactor(row.ceilingHeight, row.width, row.depth)
}

/**
 * s + (1 - n s) A rhoFloor / (S (1 - rho) + n A): the hall's share of the source flux, for n equal
 * doorways that each take the share s of the window light.
 */
function expectedHallShare(row: SweepRow, halls: 1 | 2): number {
  const { width, depth, ceilingHeight, floorColor } = row
  const floorArea = width * depth
  const surfaceArea = 2 * floorArea + 2 * (width + depth) * ceilingHeight
  const absorbingArea =
    surfaceArea -
    floorArea * floorColor.r -
    (surfaceArea - floorArea) * UNPAINTED_SURFACE_REFLECTANCE
  const doorwayArea = depth * ceilingHeight
  const share = windowShare(row)
  const reflected =
    ((1 - halls * share) * doorwayArea * floorColor.r) / (absorbingArea + halls * doorwayArea)
  return share + reflected
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

describe('a hall takes A rhoFloor / (S (1 - rho) + A) of the flux that lights its source', () => {
  it.each([...ORDINARY_SWEEP_ROWS, EXTREME_SWEEP_ROW])(
    'gives the hall A rhoFloor / (S (1 - rho) + A) of the source flux for a source $width by $depth mm with a floor of reflectance $label',
    (row) => {
      const ratio = hallToSourceFluxRatio(row)
      expect(Math.abs(ratio / expectedHallShare(row, 1) - 1)).toBeLessThan(TOLERANCE)
      expect(ratio).toBeLessThanOrEqual(1)
    },
  )

  it.each([NARROW_WHITE_ROW, EXTREME_SWEEP_ROW])(
    'shares one bound between two halls that open along both long walls of one source $width by $depth mm',
    (row) => {
      const ratios = hallToSourceFluxRatios(row, 2)
      for (const ratio of ratios) {
        expect(Math.abs(ratio / expectedHallShare(row, 2) - 1)).toBeLessThan(TOLERANCE)
      }
      expect(ratios.reduce((sum, ratio) => sum + ratio, 0)).toBeLessThanOrEqual(1)
    },
  )

  it.each(SHAPE_SWEEP_ROWS)(
    'holds for every room shape of the sweep: $width by $depth mm, ceiling $ceilingHeight mm, floor $label',
    (row) => {
      const ratio = hallToSourceFluxRatio(row)
      expect(ratio).toBeLessThanOrEqual(1)
    },
  )

  it.each(SHAPE_SWEEP_ROWS.filter((row) => row.floorColor === BLACK))(
    'gives a hall behind a black floor exactly the window share: $width by $depth mm, ceiling $ceilingHeight mm',
    (row) => {
      const ratio = hallToSourceFluxRatio(row)
      expect(Math.abs(ratio / windowShare(row) - 1)).toBeLessThan(TOLERANCE)
    },
  )

  it('gives 0.464967258 to a hall behind a black floor of a source 100 by 2000 mm under 2400 mm', () => {
    const row = { width: 100, depth: 2000, ceilingHeight: 2400, floorColor: BLACK, label: 0 }
    expect(Math.abs(hallToSourceFluxRatio(row) / 0.464967258 - 1)).toBeLessThan(PINNED_TOLERANCE)
  })
})
