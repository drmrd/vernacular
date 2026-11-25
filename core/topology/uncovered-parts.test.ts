import { expect, it } from 'vitest'
import {
  buildWallGraph,
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

it('uses the wall line after existing endpoints merge to decide what a new draw adds', () => {
  const walls = [
    createWall({ x: 0, y: -4000 }, { x: 0, y: 0 }, { id: 'vertical' }),
    createWall({ x: 0, y: 0.9 }, { x: 4000, y: 0.9 }, { id: 'horizontal' }),
  ]
  const covered = horizontal(100, 400, -0.8)
  const separate = horizontal(100, 400, 1.7)
  const coveredWall = createWall(covered.start, covered.end, { id: 'covered-draw' })
  const separateWall = createWall(separate.start, separate.end, { id: 'separate-draw' })

  expect
    .soft(buildWallGraph([...walls, coveredWall]).edges.map(({ wallId }) => wallId))
    .not.toContain(coveredWall.id)
  expect
    .soft(buildWallGraph([...walls, separateWall]).edges.map(({ wallId }) => wallId))
    .toContain(separateWall.id)

  expect.soft(uncoveredParts(walls, covered)).toEqual([])
  expect.soft(drawnWallNote(walls, covered)).toBe(coveredNote)
  expect.soft(uncoveredParts(walls, separate)).toEqual([separate])
  expect(drawnWallNote(walls, separate)).toBeUndefined()
})

it('adds nothing when a new draw retraces a wall between its merged endpoints', () => {
  const junction = { x: 0, y: 0 }
  const farEnd = { x: 4000, y: 0.9 }
  const walls = [
    createWall({ x: 0, y: -4000 }, junction, { id: 'vertical' }),
    createWall({ x: 0, y: 0.9 }, farEnd, { id: 'horizontal' }),
  ]

  for (const { label, draw } of [
    { label: 'from the junction', draw: { start: junction, end: farEnd } },
    { label: 'toward the junction', draw: { start: farEnd, end: junction } },
  ]) {
    const retrace = createWall(draw.start, draw.end, { id: 'retrace' })
    expect
      .soft(
        buildWallGraph([...walls, retrace]).edges.map(({ wallId }) => wallId),
        label,
      )
      .not.toContain(retrace.id)
    expect.soft(uncoveredParts(walls, draw), label).toEqual([])
    expect.soft(drawnWallNote(walls, draw), label).toBe(coveredNote)
  }
})

it('keeps the longitudinal extension when a rotated wall endpoint merges across the wall line', () => {
  const junction = { x: 0, y: 0 }
  const anchor = createWall({ x: -3000, y: 4000 }, junction, { id: 'anchor' })
  // A step of (-3, 4) is perpendicular to the saved run of (4000, 3000).
  const shifts = [
    { label: 'transverse shift', x: -3 / 8, y: 4 / 8, extensionMm: 0 },
    {
      label: 'transverse and longitudinal shift',
      x: -3 / 8 + 4 / 16,
      y: 4 / 8 + 3 / 16,
      extensionMm: 5 / 16,
    },
  ]

  for (const { label, x, y, extensionMm } of shifts) {
    const farEnd = { x: 4000 + x, y: 3000 + y }
    const walls = [anchor, createWall({ x, y }, farEnd, { id: 'diagonal' })]
    const extensionFraction = extensionMm / Math.hypot(farEnd.x, farEnd.y)
    const extensionEnd = {
      x: expect.closeTo(farEnd.x * extensionFraction, 3),
      y: expect.closeTo(farEnd.y * extensionFraction, 3),
    }

    for (const reversed of [false, true]) {
      const direction = reversed ? 'toward the junction' : 'from the junction'
      const description = `${label}, ${direction}`
      const draw = reversed ? { start: farEnd, end: junction } : { start: junction, end: farEnd }

      if (extensionMm === 0) {
        const retrace = createWall(draw.start, draw.end, { id: 'rotated-retrace' })
        expect
          .soft(buildWallGraph([...walls, retrace]).edges, description)
          .not.toContainEqual(expect.objectContaining({ wallId: retrace.id }))
        expect.soft(uncoveredParts(walls, draw), description).toEqual([])
        expect.soft(drawnWallNote(walls, draw), description).toBe(coveredNote)
      } else {
        const extension = reversed
          ? { start: extensionEnd, end: junction }
          : { start: junction, end: extensionEnd }
        expect.soft(uncoveredParts(walls, draw), description).toEqual([extension])
        expect.soft(drawnWallNote(walls, draw), description).toBe(partialNote)
      }
    }
  }
})

it('adds nothing when a new draw repeats the saved endpoints of a wall merged at a junction', () => {
  const junction = { x: 0, y: 0 }
  const anchor = createWall({ x: 0, y: -4000 }, junction, { id: 'anchor' })
  const retraces = [
    { label: 'saved start before the junction', savedX: -0.5, start: { x: -0.5, y: 0.5 } },
    { label: 'saved start past the junction', savedX: 0.5, start: { x: 0.5, y: 0.5 } },
    { label: 'merged start inside the saved extent', savedX: -0.5, start: junction },
  ]

  for (const { label, savedX, start } of retraces) {
    const saved = horizontal(savedX, savedX + 4000, 0.5)
    const walls = [anchor, createWall(saved.start, saved.end, { id: 'saved-wall' })]

    for (const { direction, draw } of [
      { direction: 'from the junction', draw: { start, end: saved.end } },
      { direction: 'toward the junction', draw: { start: saved.end, end: start } },
    ]) {
      const description = `${label}, ${direction}`
      const retrace = createWall(draw.start, draw.end, { id: 'retrace' })
      expect
        .soft(
          buildWallGraph([...walls, retrace]).edges.map(({ wallId }) => wallId),
          description,
        )
        .not.toContain(retrace.id)
      expect.soft(uncoveredParts(walls, draw), description).toEqual([])
      expect.soft(drawnWallNote(walls, draw), description).toBe(coveredNote)
    }
  }
})

it('keeps a tilted draw up to the saved end plane of a wall merged at a junction', () => {
  const walls = [
    createWall({ x: 0, y: -4000 }, { x: 0, y: 0 }, { id: 'anchor' }),
    createWall({ x: 0.5, y: 0.5 }, { x: 64, y: 0.5 }, { id: 'saved-wall' }),
  ]
  const outside = { x: 0.25, y: 0.125 }
  const inside = { x: 32.25, y: 0.25 }
  // The saved horizontal wall starts at x = 0.5. The draw rises 1/256 mm per mm.
  const boundary = { x: 0.5, y: 129 / 1024 }

  for (const { label, draw, exposed } of [
    {
      label: 'from outside the saved extent',
      draw: { start: outside, end: inside },
      exposed: { start: outside, end: boundary },
    },
    {
      label: 'toward the outside of the saved extent',
      draw: { start: inside, end: outside },
      exposed: { start: boundary, end: outside },
    },
  ]) {
    expect.soft(uncoveredParts(walls, draw), label).toEqual([exposed])
    expect.soft(drawnWallNote(walls, draw), label).toBe(partialNote)
  }
})
