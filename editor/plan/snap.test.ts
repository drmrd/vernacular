import { describe, it, expect } from 'vitest'
import type { WallSceneNode } from '../../core'
import { snapPoint, type SnapContext } from './snap'

function wallNode(overrides: Partial<WallSceneNode> = {}): WallSceneNode {
  return {
    id: 'wall:a',
    kind: 'wall',
    floorId: 'g',
    start: { x: 1000, y: 1000 },
    end: { x: 5000, y: 1000 },
    thickness: 114,
    ...overrides,
  }
}

describe('snapPoint endpoint snapping', () => {
  it('snaps a cursor near a wall endpoint to that endpoint', () => {
    const wall = wallNode()
    // Grid spacing that does not coincide with the endpoint at (1000, 1000),
    // so the endpoint wins over any grid candidate.
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 70,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 1003, y: 998 }, context)).toEqual({
      point: { x: 1000, y: 1000 },
      kind: 'endpoint',
      referenceId: wall.id,
    })
  })

  it('snaps to the nearer endpoint when the cursor is near the wall end', () => {
    const wall = wallNode()
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 70,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 4996, y: 1002 }, context)).toEqual({
      point: { x: 5000, y: 1000 },
      kind: 'endpoint',
      referenceId: wall.id,
    })
  })
})

describe('snapPoint midpoint snapping', () => {
  it('snaps a cursor near a wall midpoint, away from the endpoints, to the midpoint', () => {
    // Wall from (1000, 1000) to (5000, 1000) has midpoint (3000, 1000).
    const wall = wallNode()
    // Grid spacing that does not coincide with the midpoint (3000, 1000).
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 700,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 3004, y: 997 }, context)).toEqual({
      point: { x: 3000, y: 1000 },
      kind: 'midpoint',
      referenceId: wall.id,
    })
  })
})

describe('snapPoint grid snapping', () => {
  it('snaps to the nearest grid intersection when no wall feature is in range', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 100,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 1240, y: 1860 }, context)).toEqual({
      point: { x: 1200, y: 1900 },
      kind: 'grid',
    })
  })

  it('omits the referenceId for a grid snap', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 100,
      toleranceMm: 50,
    }

    const result = snapPoint({ x: 1240, y: 1860 }, context)
    expect(result).not.toBeNull()
    expect(result?.referenceId).toBeUndefined()
  })
})

describe('snapPoint parallel snapping', () => {
  it('projects the cursor onto the line through origin parallel to a reference wall', () => {
    // Horizontal reference wall placed far from the cursor so neither endpoint,
    // midpoint, nor (disabled) grid is in range. The parallel line through the
    // origin runs horizontally (y = 0).
    const wall = wallNode({ start: { x: 0, y: 9000 }, end: { x: 4000, y: 9000 } })
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 0, y: 0 },
    }

    // Cursor sits 8 mm above the parallel line y = 0, within tolerance.
    const result = snapPoint({ x: 2000, y: 8 }, context)
    expect(result?.kind).toBe('parallel')
    expect(result?.point).toEqual({ x: 2000, y: 0 })
    expect(result?.referenceId).toBe(wall.id)
  })

  it('does not produce a parallel snap when the cursor is far from the parallel line', () => {
    const wall = wallNode({ start: { x: 0, y: 9000 }, end: { x: 4000, y: 9000 } })
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 0, y: 0 },
    }

    // Cursor sits 800 mm off the parallel line; nothing else is in range either.
    expect(snapPoint({ x: 2000, y: 800 }, context)).toBeNull()
  })
})
