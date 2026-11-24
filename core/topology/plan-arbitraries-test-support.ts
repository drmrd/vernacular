import fc from 'fast-check'
import type { Arbitrary } from 'fast-check'
import { SUPPORTED_EXTENT_MM } from '../geometry/tolerance'
import type { Point, Wall } from '../model/types'
import {
  ALL_HARD_CASES,
  FULL_TURN,
  NO_STYLE,
  THIN_WALL_THICKNESSES_MM,
  WALL_THICKNESSES_MM,
  applyHardCases,
  cyclic,
  hardCaseRepeatsArbitrary,
  lerp,
  makeWall,
  sharpestTurn,
  splitWallAt,
  unit,
  wallStyleArbitrary,
} from './plan-hard-cases-test-support'
import type { GeneratedPlan, HardCase, WallEnds, WallStyle } from './plan-hard-cases-test-support'

export { ALL_HARD_CASES, splitWallAt }
export type { GeneratedPlan, HardCase }

/** How many runs each property gets in the unit tier. */
export const PROPERTY_RUNS: number = 200

const DEFAULT_MAX_WALLS = 24
const DEFAULT_EXTENT_MM = 20_000
const DEFAULT_MAX_CORNERS = 8

const MIN_COLUMNS = 2
const MAX_COLUMNS = 5
const MIN_ROWS = 2
const MAX_ROWS = 4
const MIN_SPACING_MM = 1500
const MAX_SPACING_MM = 4000
const JITTER_FRACTION = 0.1
const MAX_WALLS_PER_CELL = 4
/** The least `extentMm` that holds the largest grid, jitter included. */
const MIN_EXTENT_MM = ((MAX_COLUMNS - 1) * MAX_SPACING_MM) / 2 + MAX_SPACING_MM * JITTER_FRACTION
const TEE_FOOT_MIN = 0.3
const TEE_FOOT_SPAN = 0.4
const TEE_REACH = 0.6
const LOOP_CIRCUMRADIUS_SHARE = 0.2
const TRIANGLE_CORNERS = 3
const SQUARE_CORNERS = 4
const CELL_CORNERS = 4

const signedUnit = fc.double({ min: -1, max: 1, noNaN: true })
const angle = fc.double({ min: 0, max: FULL_TURN, noNaN: true })

/** An array of exactly `length` draws, so a plan's shape decides how many draws it needs. */
function sized<T>(arbitrary: Arbitrary<T>, length: number): Arbitrary<T[]> {
  return fc.array(arbitrary, { minLength: length, maxLength: length })
}

// 'none' appears twice so that a third of the cells stay empty.
const CELL_KINDS = ['none', 'none', 'diagonal', 'cross', 'tee', 'loop'] as const

interface Cell {
  readonly kind: (typeof CELL_KINDS)[number]
  readonly teeFraction: number
  readonly teeThickness: number
  readonly loopThickness: number
  readonly square: boolean
  readonly turn: number
}

const cellArbitrary: Arbitrary<Cell> = fc.record({
  kind: fc.constantFrom(...CELL_KINDS),
  teeFraction: unit,
  teeThickness: fc.constantFrom(...WALL_THICKNESSES_MM),
  loopThickness: fc.constantFrom(...THIN_WALL_THICKNESSES_MM),
  square: fc.boolean(),
  turn: angle,
})

interface GridDims {
  readonly columns: number
  readonly rows: number
  readonly spacing: number
}

/**
 * Every draw behind one jittered grid. Thickness is set per straight run: one value for each
 * grid row, each grid column, all main diagonals, all anti-diagonals, and each tee stub. This is
 * the named exclusion of the inset defect (#1165), which only the area properties need: `insetPolygon` applies no miter limit, so where
 * two walls of different thickness meet nearly straight, the clear corner flies off and the room
 * area is wildly wrong. The fix for #1165 removes this rule.
 * `PlanOptions.mixThicknesses` turns it off, as the totality property does.
 */
interface GridDraw extends GridDims {
  readonly origin: Point
  readonly jitter: readonly Point[]
  readonly edgeOn: readonly boolean[]
  readonly cells: readonly Cell[]
  readonly rowThickness: readonly number[]
  readonly columnThickness: readonly number[]
  readonly mainThickness: number
  readonly antiThickness: number
  readonly styles: readonly WallStyle[]
  readonly order: readonly number[]
}

/** The origin keeps the grid, jitter included, within plus or minus `extentMm` on both axes. */
function originArbitrary(dims: GridDims, extentMm: number): Arbitrary<Point> {
  const margin = dims.spacing * JITTER_FRACTION
  const axis = (count: number): Arbitrary<number> => {
    const min = margin - extentMm
    const max = extentMm - (count - 1) * dims.spacing - margin
    return fc.double({ min, max, noNaN: true })
  }
  return fc.record({ x: axis(dims.columns), y: axis(dims.rows) })
}

function gridDetailArbitrary(dims: GridDims, extentMm: number): Arbitrary<GridDraw> {
  const { columns, rows } = dims
  const edgeCount = rows * (columns - 1) + columns * (rows - 1)
  const cellCount = (columns - 1) * (rows - 1)
  const wallBound = edgeCount + MAX_WALLS_PER_CELL * cellCount
  const thickness = fc.constantFrom(...WALL_THICKNESSES_MM)
  return fc.record({
    columns: fc.constant(columns),
    rows: fc.constant(rows),
    spacing: fc.constant(dims.spacing),
    origin: originArbitrary(dims, extentMm),
    jitter: sized(fc.record({ x: signedUnit, y: signedUnit }), columns * rows),
    edgeOn: sized(fc.boolean(), edgeCount),
    cells: sized(cellArbitrary, cellCount),
    rowThickness: sized(thickness, rows),
    columnThickness: sized(thickness, columns),
    mainThickness: thickness,
    antiThickness: thickness,
    styles: sized(wallStyleArbitrary, wallBound),
    order: sized(unit, wallBound),
  })
}

function gridDrawArbitrary(extentMm: number): Arbitrary<GridDraw> {
  return fc
    .record({
      columns: fc.integer({ min: MIN_COLUMNS, max: MAX_COLUMNS }),
      rows: fc.integer({ min: MIN_ROWS, max: MAX_ROWS }),
      spacing: fc.integer({ min: MIN_SPACING_MM, max: MAX_SPACING_MM }),
    })
    .chain((dims) => gridDetailArbitrary(dims, extentMm))
}

interface Segment extends WallEnds {
  readonly thickness: number
}

function nodeAt(grid: GridDraw, column: number, row: number): Point {
  const jitter = grid.jitter[row * grid.columns + column] ?? { x: 0, y: 0 }
  const reach = grid.spacing * JITTER_FRACTION
  return {
    x: grid.origin.x + column * grid.spacing + jitter.x * reach,
    y: grid.origin.y + row * grid.spacing + jitter.y * reach,
  }
}

/** The grid edges, the rows first and then the columns, kept where the drawn boolean pattern is set. */
function edgeSegments(grid: GridDraw): Segment[] {
  const edges: Segment[] = []
  for (let row = 0; row < grid.rows; row += 1) {
    for (let column = 0; column + 1 < grid.columns; column += 1) {
      const thickness = grid.rowThickness[row] ?? 0
      edges.push({ a: nodeAt(grid, column, row), b: nodeAt(grid, column + 1, row), thickness })
    }
  }
  for (let row = 0; row + 1 < grid.rows; row += 1) {
    for (let column = 0; column < grid.columns; column += 1) {
      const thickness = grid.columnThickness[column] ?? 0
      edges.push({ a: nodeAt(grid, column, row), b: nodeAt(grid, column, row + 1), thickness })
    }
  }
  return edges.filter((_, k) => grid.edgeOn[k])
}

/** A triangle or a square of circumradius spacing/5 about `center`, turned by any angle. */
function loopSegments(center: Point, grid: GridDraw, cell: Cell): Segment[] {
  const count = cell.square ? SQUARE_CORNERS : TRIANGLE_CORNERS
  const radius = grid.spacing * LOOP_CIRCUMRADIUS_SHARE
  const corners = Array.from({ length: count }, (_, k) => ({
    x: center.x + radius * Math.cos(cell.turn + (FULL_TURN * k) / count),
    y: center.y + radius * Math.sin(cell.turn + (FULL_TURN * k) / count),
  }))
  return corners.map((a, k) => ({ a, b: cyclic(corners, k + 1), thickness: cell.loopThickness }))
}

function featureSegments(grid: GridDraw, column: number, row: number): Segment[] {
  const cell = grid.cells[row * (grid.columns - 1) + column]
  const p00 = nodeAt(grid, column, row)
  const p10 = nodeAt(grid, column + 1, row)
  const p01 = nodeAt(grid, column, row + 1)
  const p11 = nodeAt(grid, column + 1, row + 1)
  const main = { a: p00, b: p11, thickness: grid.mainThickness }
  const anti = { a: p10, b: p01, thickness: grid.antiThickness }
  const center = {
    x: (p00.x + p10.x + p01.x + p11.x) / CELL_CORNERS,
    y: (p00.y + p10.y + p01.y + p11.y) / CELL_CORNERS,
  }
  switch (cell?.kind) {
    case 'diagonal':
      return [main]
    case 'cross':
      return [main, anti]
    case 'tee': {
      const foot = lerp(p00, p10, TEE_FOOT_MIN + TEE_FOOT_SPAN * cell.teeFraction)
      return [{ a: foot, b: lerp(foot, center, TEE_REACH), thickness: cell.teeThickness }]
    }
    case 'loop':
      return loopSegments(center, grid, cell)
    default:
      return []
  }
}

function gridSegments(grid: GridDraw): Segment[] {
  const features: Segment[] = []
  for (let row = 0; row + 1 < grid.rows; row += 1) {
    for (let column = 0; column + 1 < grid.columns; column += 1) {
      features.push(...featureSegments(grid, column, row))
    }
  }
  return [...edgeSegments(grid), ...features]
}

/** Builds the walls with ids `w0`, `w1`, and so on, shuffles them, and keeps at most `maxWalls`. */
function gridWalls(grid: GridDraw, maxWalls: number, mixThicknesses: boolean): Wall[] {
  const walls = gridSegments(grid).map((segment, k) => {
    const style = grid.styles[k] ?? NO_STYLE
    // Grid walls take their thickness from their run, unless the plan mixes thicknesses.
    const thickness = mixThicknesses ? style.thickness : segment.thickness
    return makeWall(`w${k}`, segment, { ...style, thickness })
  })
  return walls
    .map((wall, k) => ({ wall, k, key: grid.order[k] ?? 0 }))
    .sort((x, y) => x.key - y.key || x.k - y.k)
    .slice(0, maxWalls)
    .map(({ wall }) => wall)
}

/** The options of {@link planArbitrary}. */
export interface PlanOptions {
  /** The most base walls a plan keeps after the shuffle. The default is 24. */
  readonly maxWalls?: number
  /**
   * The base walls, jitter included, lie within plus or minus this on both axes. Hard cases may
   * reach past it (an overlap by 0.3 of a wall, an end by 3 tolerances). The default is 20_000.
   */
  readonly extentMm?: number
  /** The hard cases applied to the base walls. The default is none. */
  readonly hardCases?: readonly HardCase[]
  /** Draws each wall's thickness on its own, so walls along a straight run may differ. Default false. */
  readonly mixThicknesses?: boolean
}

/**
 * Plans from a jittered grid of 2 to 5 by 2 to 4 nodes at a spacing of 1500 to 4000 mm. Each cell
 * may add a diagonal, a cross, a tee stub, or a free-standing loop. Throws `RangeError` when
 * `extentMm` is above `SUPPORTED_EXTENT_MM` or too small to hold the largest grid.
 */
export function planArbitrary(options: PlanOptions = {}): Arbitrary<GeneratedPlan> {
  const {
    maxWalls = DEFAULT_MAX_WALLS,
    extentMm = DEFAULT_EXTENT_MM,
    hardCases = [],
    mixThicknesses = false,
  } = options
  if (extentMm > SUPPORTED_EXTENT_MM || extentMm < MIN_EXTENT_MM) {
    throw new RangeError(
      `extentMm ${extentMm} is outside ${MIN_EXTENT_MM} to ${SUPPORTED_EXTENT_MM}`,
    )
  }
  return fc
    .record({
      grid: gridDrawArbitrary(extentMm),
      repeats: hardCaseRepeatsArbitrary(hardCases.length),
    })
    .map(({ grid, repeats }) => {
      const walls = applyHardCases(gridWalls(grid, maxWalls, mixThicknesses), hardCases, repeats)
      const cases = hardCases.join(',') || 'none'
      const shape = `${grid.columns}x${grid.rows} spacing ${grid.spacing}`
      return { walls, label: `grid ${shape} walls ${walls.length} hard ${cases}` }
    })
}

const MIN_CORNERS = 3
const MIN_LOOP_RADIUS_MM = 3000
const MAX_LOOP_RADIUS_MM = 8000
const MIN_RADIUS_SHARE = 0.6
const LOOP_CENTER_RANGE_MM = 10_000
const MIN_CORNER_TURN_DEGREES = 5
const HALF_TURN_DEGREES = 180
const MIN_CORNER_TURN_RAD = (MIN_CORNER_TURN_DEGREES * Math.PI) / HALF_TURN_DEGREES

interface LoopDraw {
  readonly corners: number
  readonly radius: number
  readonly gaps: readonly number[]
  readonly radii: readonly number[]
  readonly turn: number
  readonly center: Point
  readonly styles: readonly WallStyle[]
}

/** The corners of a star-shaped polygon: gaps scale to a full turn, radii lie in [0.6, 1] of R. */
function loopCorners(draw: LoopDraw): Point[] {
  const gaps = draw.gaps.slice(0, draw.corners)
  const total = gaps.reduce((sum, gap) => sum + gap, 0)
  let heading = draw.turn
  return gaps.map((gap, k) => {
    const radius = draw.radius * (draw.radii[k] ?? 1)
    const corner = {
      x: draw.center.x + radius * Math.cos(heading),
      y: draw.center.y + radius * Math.sin(heading),
    }
    heading += (FULL_TURN * gap) / total
    return corner
  })
}

/**
 * A star-shaped simple polygon with 3 to `maxCorners` corners, one wall per side, each with its own
 * thickness. Every corner turns by at least 5 degrees unless `allowSharpCorners` is set. This is a
 * named exclusion of the inset defect (#1165), which only the area properties need: without it, about 1.7 percent of loops have a corner of under 1 degree, and
 * where walls of different thickness meet that straight, the clear corner flies off. The fix for
 * #1165 removes this rule.
 */
export function closedLoopArbitrary(
  options: { readonly maxCorners?: number; readonly allowSharpCorners?: boolean } = {},
): Arbitrary<GeneratedPlan> {
  const { maxCorners = DEFAULT_MAX_CORNERS, allowSharpCorners = false } = options
  return fc
    .record({
      corners: fc.integer({ min: MIN_CORNERS, max: maxCorners }),
      radius: fc.integer({ min: MIN_LOOP_RADIUS_MM, max: MAX_LOOP_RADIUS_MM }),
      gaps: sized(fc.double({ min: 1, max: 2, noNaN: true }), maxCorners),
      radii: sized(fc.double({ min: MIN_RADIUS_SHARE, max: 1, noNaN: true }), maxCorners),
      turn: angle,
      center: fc.record({
        x: fc.double({ min: -LOOP_CENTER_RANGE_MM, max: LOOP_CENTER_RANGE_MM, noNaN: true }),
        y: fc.double({ min: -LOOP_CENTER_RANGE_MM, max: LOOP_CENTER_RANGE_MM, noNaN: true }),
      }),
      styles: sized(wallStyleArbitrary, maxCorners),
    })
    .filter((draw) => allowSharpCorners || sharpestTurn(loopCorners(draw)) >= MIN_CORNER_TURN_RAD)
    .map((draw) => {
      const corners = loopCorners(draw)
      const walls = corners.map((corner, k) => {
        const style = draw.styles[k] ?? NO_STYLE
        return makeWall(
          `w${k}`,
          { a: corner, b: cyclic(corners, k + 1) },
          { ...style, swap: false },
        )
      })
      return { walls, label: `loop ${draw.corners} corners radius ${draw.radius}` }
    })
}
