import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Plan 21 of the corpus is a modern CAD line plan whose drawing labels an overall
// footprint of 35 ft by 30 ft. We trace that footprint from the wall geometry and
// require it to land inside a millimeter window wide enough to tolerate whether the
// CAD source measured to wall centerlines or to faces.
const fixturePath = resolve(
  'tests/fixtures/projects/corpus',
  '21-modern-cad-line-plan-30x35-parking-three-rooms.vernacular.json',
)

// 35 ft = 10668 mm; 30 ft = 9144 mm. The windows widen those nominal values to
// absorb centerline-vs-face and wall-thickness conventions.
const MIN_WIDTH_MM = 10000
const MAX_WIDTH_MM = 11200
const MIN_HEIGHT_MM = 8500
const MAX_HEIGHT_MM = 9600

interface Point {
  x: number
  y: number
}

interface Wall {
  start: Point
  end: Point
}

interface Floor {
  walls: Wall[]
}

interface CorpusDocument {
  floors: Floor[]
}

function loadFixture(): CorpusDocument {
  let raw: string
  try {
    raw = readFileSync(fixturePath, 'utf8')
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Expected the plan-21 Tier-1 corpus fixture at ${fixturePath}, but it could not be read: ${reason}`,
    )
  }
  return JSON.parse(raw) as CorpusDocument
}

function footprintOf(document: CorpusDocument): { width: number; height: number } {
  const endpoints = document.floors
    .flatMap((floor) => floor.walls)
    .flatMap((wall) => [wall.start, wall.end])
  const xs = endpoints.map((point) => point.x)
  const ys = endpoints.map((point) => point.y)
  const width = Math.max(...xs) - Math.min(...xs)
  const height = Math.max(...ys) - Math.min(...ys)
  return { width, height }
}

describe('plan-21 Tier-1 corpus footprint', () => {
  it('traces its labelled 35 ft by 30 ft overall footprint from the wall geometry', () => {
    const { width, height } = footprintOf(loadFixture())

    expect(
      width,
      `expected the overall width to trace the labelled 35 ft (within [${MIN_WIDTH_MM}, ${MAX_WIDTH_MM}] mm), but measured ${width} mm`,
    ).toBeGreaterThanOrEqual(MIN_WIDTH_MM)
    expect(
      width,
      `expected the overall width to trace the labelled 35 ft (within [${MIN_WIDTH_MM}, ${MAX_WIDTH_MM}] mm), but measured ${width} mm`,
    ).toBeLessThanOrEqual(MAX_WIDTH_MM)

    expect(
      height,
      `expected the overall height to trace the labelled 30 ft (within [${MIN_HEIGHT_MM}, ${MAX_HEIGHT_MM}] mm), but measured ${height} mm`,
    ).toBeGreaterThanOrEqual(MIN_HEIGHT_MM)
    expect(
      height,
      `expected the overall height to trace the labelled 30 ft (within [${MIN_HEIGHT_MM}, ${MAX_HEIGHT_MM}] mm), but measured ${height} mm`,
    ).toBeLessThanOrEqual(MAX_HEIGHT_MM)
  })
})
