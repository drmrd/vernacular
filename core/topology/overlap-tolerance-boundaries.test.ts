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
