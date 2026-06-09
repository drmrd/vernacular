import { describe, it, expect } from 'vitest'
import {
  buildClipboardSnapshot,
  serializeClipboard,
  deserializeClipboard,
  type ClipboardSnapshot,
} from './clipboard'
import { createFloor, createWall, createOpening, createDimension } from '../model/factories'
import type { Floor } from '../model/types'

function clipboardSnapshotFixture(): ClipboardSnapshot {
  const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
  const opening = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 500,
    id: 'o1',
  })
  const dimension = createDimension({
    start: { x: 0, y: 0 },
    end: { x: 300, y: 400 },
    id: 'd1',
  })
  return { walls: [wall], openings: [opening], dimensions: [dimension] }
}

function floorWithWallsOpeningsAndDimension(): Floor {
  const w1 = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
  const w2 = createWall({ x: 0, y: 500 }, { x: 0, y: 1500 }, { id: 'w2' })
  const o1 = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 500,
    id: 'o1',
  })
  const o2 = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w2',
    position: 500,
    id: 'o2',
  })
  const d1 = createDimension({ start: { x: 0, y: 0 }, end: { x: 300, y: 400 }, id: 'd1' })
  const floor = createFloor('Ground', { id: 'g', walls: [w1, w2] })
  floor.openings = [o1, o2]
  floor.dimensions = [d1]
  return floor
}

describe('buildClipboardSnapshot', () => {
  it('gathers a selected wall, the openings hosted on it, and a selected dimension', () => {
    const floor = floorWithWallsOpeningsAndDimension()

    const snapshot = buildClipboardSnapshot(floor, ['w1', 'd1'])

    expect(snapshot.walls.map((wall) => wall.id)).toEqual(['w1'])
    expect(snapshot.openings.map((opening) => opening.id)).toEqual(['o1'])
    expect(snapshot.dimensions.map((dimension) => dimension.id)).toEqual(['d1'])
  })

  it('omits an opening whose host wall is not selected', () => {
    const floor = floorWithWallsOpeningsAndDimension()

    const snapshot = buildClipboardSnapshot(floor, ['o1'])

    expect(snapshot.openings).toEqual([])
    expect(snapshot.walls).toEqual([])
    expect(snapshot.dimensions).toEqual([])
  })

  it('includes both walls and every opening hosted on them when both walls are selected', () => {
    const floor = floorWithWallsOpeningsAndDimension()

    const snapshot = buildClipboardSnapshot(floor, ['w1', 'w2'])

    expect(snapshot.walls.map((wall) => wall.id)).toEqual(['w1', 'w2'])
    expect(snapshot.openings.map((opening) => opening.id)).toEqual(['o1', 'o2'])
  })
})

describe('serializeClipboard and deserializeClipboard', () => {
  it('round-trips a snapshot back to a deep-equal value', () => {
    const snapshot = clipboardSnapshotFixture()

    const restored = deserializeClipboard(serializeClipboard(snapshot))

    expect(restored).toEqual(snapshot)
  })

  it('returns undefined for text that is not valid JSON', () => {
    expect(deserializeClipboard('not json at all')).toBeUndefined()
  })

  it('returns undefined for a payload tagged with a foreign kind', () => {
    const foreign = JSON.stringify({ kind: 'something/else', version: 1 })

    expect(deserializeClipboard(foreign)).toBeUndefined()
  })

  it('returns undefined for a payload with an unsupported future version', () => {
    const future = JSON.stringify({
      kind: 'vernacular/clipboard',
      version: 999,
      snapshot: { walls: [], openings: [], dimensions: [] },
    })

    expect(deserializeClipboard(future)).toBeUndefined()
  })
})
