import fc from 'fast-check'
import { expect, it } from 'vitest'
import { createWall, drawnWallNote, uncoveredParts, type WallPart } from '../index'

interface Drawing {
  label: string
  existing: readonly WallPart[]
  drawn: WallPart
  exposed: readonly WallPart[]
  note?: string
}

function horizontal(from: number, to: number): WallPart {
  return { start: { x: from, y: 0 }, end: { x: to, y: 0 } }
}

it('honors the same overlap boundaries in either direction and preserves open gaps', () => {
  const diagonal = { start: { x: 0, y: 0 }, end: { x: 40, y: 30 } }
  const oneMillimeterOff = { start: { x: 13, y: 11 }, end: { x: 17, y: 14 } }
  const existing = horizontal(99.1, 200)
  const forward = horizontal(0, 100.1)
  const backward = horizontal(100.1, 0)
  const level = horizontal(0, 2.5)
  const tilted = { start: { x: 1, y: -0.75 }, end: { x: 3, y: 0.75 } }
  const separated = [horizontal(0, 64), horizontal(64.5, 128)]
  const cases: Drawing[] = [
    {
      label: 'one millimeter perpendicular to an enclosing diagonal',
      existing: [diagonal],
      drawn: oneMillimeterOff,
      exposed: [],
      note: 'This wall was already there.',
    },
    {
      label: 'exactly one millimeter shared in the forward direction',
      existing: [existing],
      drawn: forward,
      exposed: [forward],
    },
    {
      label: 'exactly one millimeter shared in the reverse direction',
      existing: [existing],
      drawn: backward,
      exposed: [backward],
    },
    {
      label: 'equal lengths with the tilted segment drawn second',
      existing: [level],
      drawn: tilted,
      exposed: [tilted],
    },
    {
      label: 'equal lengths with the level segment drawn second',
      existing: [tilted],
      drawn: level,
      exposed: [level],
    },
    {
      label: 'an open half-millimeter gap between two covering walls',
      existing: separated,
      drawn: horizontal(0, 128),
      exposed: [horizontal(64, 64.5)],
      note: 'Part of this wall was already there.',
    },
  ]

  for (const { label, existing, drawn, exposed, note } of cases) {
    const walls = existing.map(({ start, end }, index) =>
      createWall(start, end, { id: `wall-${index}` }),
    )

    expect.soft(uncoveredParts(walls, drawn), label).toEqual(exposed)
    expect.soft(drawnWallNote(walls, drawn), label).toBe(note)
  }
})

it('preserves physical wall coverage across drawing order and direction at numeric boundaries', () => {
  const level = horizontal(0, 1.625)
  const tilted = { start: { x: 0.625, y: -0.25 }, end: { x: 2.125, y: 0.375 } }

  for (const { existing, drawn, label } of [
    { existing: level, drawn: tilted, label: 'tilted wall drawn second' },
    { existing: tilted, drawn: level, label: 'level wall drawn second' },
  ]) {
    const walls = [createWall(existing.start, existing.end, { id: 'existing' })]

    expect.soft(uncoveredParts(walls, drawn), label).toEqual([drawn])
    expect.soft(drawnWallNote(walls, drawn), label).toBeUndefined()
  }

  const diagonal = createWall({ x: 0, y: 0 }, { x: 99, y: 20 }, { id: 'diagonal' })
  const oneMillimeterOff = { start: { x: 14.75, y: 4 }, end: { x: 39.5, y: 9 } }

  expect.soft(uncoveredParts([diagonal], oneMillimeterOff)).toEqual([])
  expect.soft(drawnWallNote([diagonal], oneMillimeterOff)).toBe('This wall was already there.')

  const nextCoordinate = 1 + Number.EPSILON
  const covering = horizontal(100, nextCoordinate)
  const walls = [createWall(covering.start, covering.end, { id: 'covering' })]

  for (const { drawn, exposed, label } of [
    { drawn: horizontal(100, 1), exposed: horizontal(nextCoordinate, 1), label: 'uncovered tail' },
    { drawn: horizontal(1, 100), exposed: horizontal(1, nextCoordinate), label: 'uncovered head' },
  ]) {
    expect.soft(uncoveredParts(walls, drawn), label).toEqual([exposed])
    expect.soft(drawnWallNote(walls, drawn), label).toBe('Part of this wall was already there.')
  }
})

it('fully covers an offset draw across the shared endpoint of adjacent walls', () => {
  const cases = [
    {
      label: 'equal wall lengths',
      left: -10.2,
      junction: -0.2,
      right: 9.8,
      drawStart: -1.3,
      drawEnd: 0.9,
    },
    {
      label: 'unequal wall lengths',
      left: -1,
      junction: 2.1,
      right: 34.1,
      drawStart: -0.5,
      drawEnd: 10,
    },
  ]

  for (const { label, left, junction, right, drawStart, drawEnd } of cases) {
    const sharedEnd = { x: junction, y: 0 }
    const walls = [
      createWall({ x: left, y: 0 }, sharedEnd, { id: 'left-wall' }),
      createWall(sharedEnd, { x: right, y: 0 }, { id: 'right-wall' }),
    ]
    const start = { x: drawStart, y: 0.5 }
    const end = { x: drawEnd, y: 0.5 }

    for (const { direction, draw } of [
      { direction: 'left to right', draw: { start, end } },
      { direction: 'right to left', draw: { start: end, end: start } },
    ]) {
      const description = `${label}, ${direction}`
      expect.soft(uncoveredParts(walls, draw), description).toEqual([])
      expect.soft(drawnWallNote(walls, draw), description).toBe('This wall was already there.')
    }
  }
})

it('preserves full coverage when a wall is split into collinear pieces', () => {
  const geometry = fc.record({
    leftLength: fc.integer({ min: 64, max: 512 }),
    rightLength: fc.integer({ min: 64, max: 512 }),
    splitNumerator: fc.integer({ min: -(2 ** 50), max: 2 ** 50 }),
    extraSplit: fc.boolean(),
    startTrim: fc.integer({ min: 2, max: 7 }),
    endTrim: fc.integer({ min: 2, max: 7 }),
    offset: fc.integer({ min: -6, max: 6 }),
    tilt: fc.constantFrom(-3, -1, 1, 3),
  })

  fc.assert(
    fc.property(
      geometry,
      ({
        leftLength,
        rightLength,
        splitNumerator,
        extraSplit,
        startTrim,
        endTrim,
        offset,
        tilt,
      }) => {
        const first = -leftLength / 8
        const last = rightLength / 8
        // A fine dyadic cut remains exactly collinear even when the run ends are much farther away.
        const splitAt = splitNumerator / 2 ** 52
        const stops = extraSplit ? [splitAt, 3.25, last] : [splitAt, last]

        for (const [dx, dy] of [
          [1, 0],
          [0, 1],
          [4, 3],
        ] as const) {
          const at = (station: number, across = 0) => ({
            x: dx * station - (dy * across) / 64,
            y: dy * station + (dx * across) / 64,
          })
          const whole = createWall(at(first), at(last), { id: 'whole' })
          let previous = first
          const pieces = stops.map((station) => {
            const piece = { start: at(previous), end: at(station) }
            previous = station
            return piece
          })
          const split = pieces.map(({ start, end }, index) =>
            createWall(start, end, { id: `piece-${index}` }),
          )
          const reversed = [...pieces]
            .reverse()
            .map(({ start, end }, index) => createWall(end, start, { id: `piece-${index}` }))
          const coverings = [
            { label: 'whole wall', walls: [whole] },
            { label: 'split wall', walls: split },
            { label: 'reversed split wall', walls: reversed },
          ]

          const draws = [offset, offset + tilt].flatMap((endOffset) => {
            const start = at(first + startTrim / 8, offset)
            const end = at(last - endTrim / 8, endOffset)
            return [
              { start, end },
              { start: end, end: start },
            ]
          })

          for (const draw of draws) {
            for (const { label, walls } of coverings) {
              expect(
                { parts: uncoveredParts(walls, draw), note: drawnWallNote(walls, draw) },
                `${label} along (${dx}, ${dy}) with draw ${JSON.stringify(draw)}`,
              ).toEqual({ parts: [], note: 'This wall was already there.' })
            }
          }
        }
      },
    ),
    { seed: 284531, numRuns: 48 },
  )
})

it('fully covers an offset draw across a shared endpoint of near-collinear walls', () => {
  const junction = { x: 0, y: 0 }
  const left = createWall({ x: -100, y: 0 }, junction, { id: 'left-wall' })
  const shallow = createWall(junction, { x: 100, y: 1 }, { id: 'shallow-wall' })
  const steep = createWall(junction, { x: 100, y: 16 }, { id: 'steep-wall' })
  const start = { x: -10, y: -0.5 }
  const end = { x: 10, y: -0.5 }
  const seam = { x: 0, y: -0.5 }

  for (const { label, draw, uncovered } of [
    {
      label: 'left to right',
      draw: { start, end },
      uncovered: { start: seam, end },
    },
    {
      label: 'right to left',
      draw: { start: end, end: start },
      uncovered: { start: end, end: seam },
    },
  ]) {
    expect.soft(uncoveredParts([left, shallow], draw), label).toEqual([])
    expect.soft(drawnWallNote([left, shallow], draw), label).toBe('This wall was already there.')
    expect.soft(uncoveredParts([left, steep], draw), label).toEqual([uncovered])
    expect
      .soft(drawnWallNote([left, steep], draw), label)
      .toBe('Part of this wall was already there.')
  }
})

it('keeps a draw fully covered when another nearby wall overlaps it', () => {
  const junction = { x: 0, y: 0 }
  const left = createWall({ x: -100, y: 0 }, junction, { id: 'left-wall' })
  const right = createWall(junction, { x: 100, y: 1 }, { id: 'right-wall' })
  const nearby = createWall({ x: -5, y: -1.4 }, { x: 0.002, y: -1.4 }, { id: 'nearby-wall' })
  const start = { x: -10, y: -0.5 }
  const end = { x: 10, y: -0.5 }

  for (const draw of [
    { start, end },
    { start: end, end: start },
  ]) {
    const direction = `from x=${draw.start.x} to x=${draw.end.x}`
    expect
      .soft(drawnWallNote([nearby], draw), direction)
      .toBe('Part of this wall was already there.')

    for (const pair of [
      [left, right],
      [right, left],
    ]) {
      for (const index of [0, 1, 2]) {
        const walls = [...pair.slice(0, index), nearby, ...pair.slice(index)]
        const label = `${direction} with ${walls.map(({ id }) => id).join(', ')}`
        expect
          .soft({ parts: uncoveredParts(walls, draw), note: drawnWallNote(walls, draw) }, label)
          .toEqual({ parts: [], note: 'This wall was already there.' })
      }
    }
  }
})
