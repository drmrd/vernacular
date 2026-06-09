import { describe, it, expect } from 'vitest'
import {
  buildClipboardSnapshot,
  serializeClipboard,
  deserializeClipboard,
  instantiateClipboard,
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

function snapshotWithTwoWallsAnOrphanAndADimension(): ClipboardSnapshot {
  const w1 = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
  const w2 = createWall({ x: 0, y: 500 }, { x: 0, y: 1500 }, { id: 'w2' })
  const hosted = createOpening({
    type: 'single-swing-door',
    hostWallId: 'w1',
    position: 500,
    id: 'o1',
  })
  const orphan = createOpening({
    type: 'single-swing-door',
    hostWallId: 'missing',
    position: 500,
    id: 'orphan',
  })
  const d1 = createDimension({ start: { x: 0, y: 0 }, end: { x: 300, y: 400 }, id: 'd1' })
  return { walls: [w1, w2], openings: [hosted, orphan], dimensions: [d1] }
}

function sequentialMintId(): () => string {
  let n = 0
  return () => `new-${++n}`
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

describe('instantiateClipboard', () => {
  const offset = { x: 100, y: 0 }

  it('clones each wall with a fresh id and offsets its endpoints by the offset', () => {
    const snapshot = snapshotWithTwoWallsAnOrphanAndADimension()

    const instantiated = instantiateClipboard(snapshot, offset, sequentialMintId())

    expect(instantiated.walls).toHaveLength(2)
    for (const wall of instantiated.walls) {
      expect(wall.id).not.toBe('w1')
      expect(wall.id).not.toBe('w2')
    }
    const firstWallClone = instantiated.walls[0]
    expect(firstWallClone?.start).toEqual({ x: 100, y: 0 })
    expect(firstWallClone?.end).toEqual({ x: 1100, y: 0 })
  })

  it('drops an opening whose host wall is absent and remaps the survivor onto its cloned host', () => {
    const snapshot = snapshotWithTwoWallsAnOrphanAndADimension()

    const instantiated = instantiateClipboard(snapshot, offset, sequentialMintId())

    expect(instantiated.openings).toHaveLength(1)
    const opening = instantiated.openings[0]
    expect(opening?.id).not.toBe('o1')
    const clonedHost = instantiated.walls.find((wall) => wall.start.x === 100 && wall.start.y === 0)
    expect(opening?.hostWallId).toBe(clonedHost?.id)
  })

  it('clones the dimension with a fresh id and offsets its endpoints', () => {
    const snapshot = snapshotWithTwoWallsAnOrphanAndADimension()

    const instantiated = instantiateClipboard(snapshot, offset, sequentialMintId())

    expect(instantiated.dimensions).toHaveLength(1)
    const dimension = instantiated.dimensions[0]
    expect(dimension?.id).not.toBe('d1')
    expect(dimension?.start).toEqual({ x: 100, y: 0 })
    expect(dimension?.end).toEqual({ x: 400, y: 400 })
  })

  it('lists every minted id, all distinct and none reusing an original id', () => {
    const snapshot = snapshotWithTwoWallsAnOrphanAndADimension()

    const instantiated = instantiateClipboard(snapshot, offset, sequentialMintId())

    const expectedIds = [
      ...instantiated.walls.map((wall) => wall.id),
      ...instantiated.openings.map((opening) => opening.id),
      ...instantiated.dimensions.map((dimension) => dimension.id),
    ]
    expect(instantiated.ids).toHaveLength(4)
    expect([...instantiated.ids].sort()).toEqual([...expectedIds].sort())
    expect(new Set(instantiated.ids).size).toBe(instantiated.ids.length)
    for (const id of instantiated.ids) {
      expect(['w1', 'w2', 'o1', 'orphan', 'd1']).not.toContain(id)
    }
  })

  it('does not mutate the original snapshot entities', () => {
    const snapshot = snapshotWithTwoWallsAnOrphanAndADimension()
    const originalFirstWall = snapshot.walls[0]

    const instantiated = instantiateClipboard(snapshot, offset, sequentialMintId())

    expect(snapshot.walls[0]?.id).toBe('w1')
    expect(snapshot.walls[0]?.start).toEqual({ x: 0, y: 0 })
    expect(snapshot.walls[0]?.end).toEqual({ x: 1000, y: 0 })
    expect(instantiated.walls[0]).not.toBe(originalFirstWall)
  })
})
