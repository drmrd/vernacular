import { expect, it } from 'vitest'
import {
  createWall,
  DERIVATION_LENGTH_TOLERANCE_MM,
  drawnWallNote,
  uncoveredParts,
  type WallPart,
} from '../index'

interface DrawingCase {
  name: string
  existing: readonly WallPart[]
  drawn: WallPart
  parts: readonly WallPart[]
  note?: string
}

function horizontal(from: number, to: number, y = 0): WallPart {
  return { start: { x: from, y }, end: { x: to, y } }
}

const partialNote = 'Part of this wall was already there.'
const coveredNote = 'This wall was already there.'
const distance = DERIVATION_LENGTH_TOLERANCE_MM

const drawings: DrawingCase[] = [
  {
    name: 'drawn beyond the end of one wall',
    existing: [horizontal(0, 4000)],
    drawn: horizontal(1000, 5000),
    parts: [horizontal(4000, 5000)],
    note: partialNote,
  },
  {
    name: 'drawn beyond both ends of one wall',
    existing: [horizontal(0, 4000)],
    drawn: horizontal(-1000, 5000),
    parts: [horizontal(-1000, 0), horizontal(4000, 5000)],
    note: partialNote,
  },
  {
    name: 'drawn entirely inside one wall',
    existing: [horizontal(0, 4000)],
    drawn: horizontal(1000, 3000),
    parts: [],
    note: coveredNote,
  },
  {
    name: 'on the same line with a gap',
    existing: [horizontal(0, 4000)],
    drawn: horizontal(4500, 5000),
    parts: [horizontal(4500, 5000)],
  },
  {
    name: 'crossing another wall',
    existing: [{ start: { x: 2000, y: -1000 }, end: { x: 2000, y: 1000 } }],
    drawn: horizontal(0, 4000),
    parts: [horizontal(0, 4000)],
  },
  {
    name: 'parallel beyond the allowed line distance',
    existing: [horizontal(1000, 3000, 2 * distance)],
    drawn: horizontal(0, 4000),
    parts: [horizontal(0, 4000)],
  },
  {
    name: 'only one endpoint of the shorter wall is close enough',
    existing: [{ start: { x: 1000, y: distance / 2 }, end: { x: 3000, y: 2 * distance } }],
    drawn: horizontal(0, 4000),
    parts: [horizontal(0, 4000)],
  },
  {
    name: 'both endpoints of the shorter draw are close enough',
    existing: [{ start: { x: 0, y: 0 }, end: { x: 4000, y: 16 * distance } }],
    drawn: horizontal(100, 200),
    parts: [],
    note: coveredNote,
  },
  {
    name: 'shared length equal to the derivation tolerance',
    existing: [horizontal(-4000, 0)],
    drawn: horizontal(-distance, 1000),
    parts: [horizontal(-distance, 1000)],
  },
  {
    name: 'shared length longer than the derivation tolerance',
    existing: [horizontal(-4000, 0)],
    drawn: horizontal(-2 * distance, 1000),
    parts: [horizontal(0, 1000)],
    note: partialNote,
  },
  {
    name: 'diagonal wall drawn in the reverse direction',
    existing: [{ start: { x: 800, y: 600 }, end: { x: 3200, y: 2400 } }],
    drawn: { start: { x: 4000, y: 3000 }, end: { x: 0, y: 0 } },
    parts: [
      { start: { x: 4000, y: 3000 }, end: { x: 3200, y: 2400 } },
      { start: { x: 800, y: 600 }, end: { x: 0, y: 0 } },
    ],
    note: partialNote,
  },
  {
    name: 'adjacent and overlapping walls with a gap beyond them',
    existing: [
      horizontal(3100, 3600),
      horizontal(800, 1200),
      horizontal(1200, 2400),
      horizontal(2700, 2100),
    ],
    drawn: horizontal(0, 4000),
    parts: [horizontal(0, 800), horizontal(2700, 3100), horizontal(3600, 4000)],
    note: partialNote,
  },
  {
    name: 'an existing wall of zero length',
    existing: [horizontal(1500, 1500)],
    drawn: horizontal(0, 4000),
    parts: [horizontal(0, 4000)],
  },
  {
    name: 'a draw of zero length on one wall',
    existing: [horizontal(0, 4000)],
    drawn: horizontal(1500, 1500),
    parts: [horizontal(1500, 1500)],
  },
]

it('keeps the uncovered parts of a wall in drawing order and reports any covered stretch', () => {
  expect({ uncoveredParts: typeof uncoveredParts, drawnWallNote: typeof drawnWallNote }).toEqual({
    uncoveredParts: 'function',
    drawnWallNote: 'function',
  })

  for (const { name, existing, drawn, parts, note } of drawings) {
    const walls = existing.map(({ start, end }, index) =>
      createWall(start, end, { id: `wall-${index}` }),
    )

    expect.soft(uncoveredParts(walls, drawn), name).toEqual(parts)
    expect.soft(drawnWallNote(walls, drawn), name).toBe(note)
  }
})

it('reports full coverage when a snapped retrace leaves no distinct endpoints', () => {
  const existing = horizontal(2500, 6250, -1900)
  const walls = [createWall(existing.start, existing.end, { id: 'existing-wall' })]
  const retrace = { start: { x: 2500, y: -1899.9999999999998 }, end: existing.end }
  // This is the next representable coordinate below the existing wall's start.
  const shortExtension = horizontal(2499.9999999999995, 6250, -1900)

  expect.soft(uncoveredParts(walls, retrace)).toEqual([])
  expect.soft(drawnWallNote(walls, retrace)).toBe(coveredNote)
  expect
    .soft(uncoveredParts(walls, shortExtension))
    .toEqual([horizontal(shortExtension.start.x, existing.start.x, -1900)])
  expect(drawnWallNote(walls, shortExtension)).toBe(partialNote)
})

it('uses only the physical stretches of saved walls to cover a new draw', () => {
  const owner = createWall({ x: 0, y: 0 }, { x: 100, y: 0 }, { id: 'owner' })
  const covered = createWall({ x: 0, y: 0.75 }, { x: 100, y: 0.75 }, { id: 'covered' })
  const withExposedTail = createWall(covered.start, { x: 200, y: 0.75 }, { id: 'longer' })
  const independent = horizontal(20, 80, 1.5)

  for (const wall of [covered, withExposedTail]) {
    expect.soft(uncoveredParts([owner, wall], independent), wall.id).toEqual([independent])
    expect.soft(drawnWallNote([owner, wall], independent), wall.id).toBeUndefined()
  }

  const alongTail = horizontal(175, 190, 1.5)
  expect.soft(uncoveredParts([owner, withExposedTail], alongTail)).toEqual([])
  expect.soft(drawnWallNote([owner, withExposedTail], alongTail)).toBe(coveredNote)
})
