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

/**
 * A context for the directional snaps: a far-off horizontal reference wall (so no
 * endpoint, midpoint, or grid is in range), grid disabled, and an origin at the
 * world origin. The parallel line through the origin is then y = 0 and the
 * perpendicular line is x = 0.
 */
function directionalContext(): { wall: WallSceneNode; context: SnapContext } {
  const wall = wallNode({ start: { x: 0, y: 9000 }, end: { x: 4000, y: 9000 } })
  return {
    wall,
    context: { walls: [wall], gridSpacingMm: 0, toleranceMm: 50, origin: { x: 0, y: 0 } },
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
    const { wall, context } = directionalContext()

    // Cursor sits 8 mm above the parallel line y = 0, within tolerance.
    const result = snapPoint({ x: 2000, y: 8 }, context)
    expect(result?.kind).toBe('parallel')
    expect(result?.point).toEqual({ x: 2000, y: 0 })
    expect(result?.referenceId).toBe(wall.id)
  })

  it('does not produce a parallel snap when the cursor is far from the parallel line', () => {
    const { context } = directionalContext()

    // Cursor sits 800 mm off the parallel line; nothing else is in range either.
    expect(snapPoint({ x: 2000, y: 800 }, context)).toBeNull()
  })
})

describe('snapPoint perpendicular snapping', () => {
  it('projects the cursor onto the line through origin perpendicular to a reference wall', () => {
    // The reference wall is horizontal, so the perpendicular line through the
    // origin is vertical (x = 0) and the cursor is far from the parallel line.
    const { wall, context } = directionalContext()

    // Cursor sits 8 mm right of the vertical line x = 0 and 2000 mm down it.
    const result = snapPoint({ x: 8, y: 2000 }, context)
    expect(result?.kind).toBe('perpendicular')
    expect(result?.point).toEqual({ x: 0, y: 2000 })
    expect(result?.referenceId).toBe(wall.id)
  })

  it('prefers a perpendicular snap over a parallel one when the cursor is near both lines', () => {
    // Near the origin, the cursor is close to both the vertical perpendicular
    // line (x = 0) and the horizontal parallel line (y = 0).
    const { context } = directionalContext()

    const result = snapPoint({ x: 6, y: 6 }, context)
    expect(result?.kind).toBe('perpendicular')
  })
})

describe('snapPoint priority ordering', () => {
  // A short wall so a single cursor can sit within tolerance of an endpoint, the
  // midpoint, and a grid intersection at once.
  const shortWall = wallNode({ start: { x: 1000, y: 1000 }, end: { x: 1060, y: 1000 } })

  it('prefers an in-range endpoint over a nearer midpoint and the grid', () => {
    const context: SnapContext = {
      walls: [shortWall],
      gridSpacingMm: 100,
      toleranceMm: 50,
    }

    // 1 mm from the midpoint (1030, 1000), 29 mm from the end endpoint, and the
    // grid node (1000, 1000) is also in range: the endpoint must still win.
    expect(snapPoint({ x: 1031, y: 1000 }, context)?.kind).toBe('endpoint')
  })

  it('prefers an in-range midpoint over the grid when no endpoint is in range', () => {
    const context: SnapContext = {
      walls: [shortWall],
      gridSpacingMm: 100,
      toleranceMm: 20,
    }

    // Only the midpoint (2 mm away) and the grid are within the tight tolerance.
    expect(snapPoint({ x: 1032, y: 1000 }, context)?.kind).toBe('midpoint')
  })

  it('prefers an in-range endpoint over an origin-based perpendicular line', () => {
    const context: SnapContext = {
      walls: [shortWall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 1000, y: 1000 },
    }

    // The cursor is near the start endpoint (1000, 1000) and near the vertical
    // perpendicular line x = 1000 through the origin; the endpoint outranks it.
    expect(snapPoint({ x: 1002, y: 1005 }, context)?.kind).toBe('endpoint')
  })
})

describe('snapPoint underlay trace snapping', () => {
  it('snaps to a nearby underlay trace point when trace points are supplied', () => {
    const result = snapPoint(
      { x: 1005, y: 2003 },
      { walls: [], gridSpacingMm: 0, toleranceMm: 20, tracePoints: [{ x: 1000, y: 2000 }] },
    )
    expect(result).toEqual({ point: { x: 1000, y: 2000 }, kind: 'trace' })
  })

  it('does not snap to a trace point when none are supplied', () => {
    const result = snapPoint({ x: 1005, y: 2003 }, { walls: [], gridSpacingMm: 0, toleranceMm: 20 })
    expect(result).toBeNull()
  })
})

describe('snapPoint on-edge snapping', () => {
  // Wall from (1000,1000) to (5000,1000): endpoints at x=1000,5000; midpoint x=3000.
  it('snaps a cursor near a wall, away from endpoints and midpoint, to the nearest point on it', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2000, y: 1005 }, context)).toEqual({
      point: { x: 2000, y: 1000 },
      kind: 'edge',
      referenceId: wall.id,
    })
  })

  it('returns null when the cursor is farther from every wall than the tolerance', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2000, y: 1100 }, context)).toBeNull()
  })

  it('prefers the midpoint over the on-edge point when the cursor is near the midpoint', () => {
    const wall = wallNode()
    const context: SnapContext = { walls: [wall], gridSpacingMm: 0, toleranceMm: 50 }

    // 5 mm above the midpoint (3000,1000); both midpoint and on-edge are in range.
    expect(snapPoint({ x: 3002, y: 1005 }, context)?.kind).toBe('midpoint')
  })

  it('prefers the on-edge point over a perpendicular construction line', () => {
    const wall = wallNode()
    // Origin sits off the wall; the perpendicular line through it is x = 2000.
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 2000, y: 5000 },
    }

    // (2002,1005): 2 mm from the perpendicular line x=2000 and 5 mm from the wall.
    expect(snapPoint({ x: 2002, y: 1005 }, context)?.kind).toBe('edge')
  })
})

describe('snapPoint with nothing in range', () => {
  it('returns null when the grid is disabled, no feature is in range, and no origin is set', () => {
    const wall = wallNode({ start: { x: 9000, y: 9000 }, end: { x: 9500, y: 9000 } })
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 0, y: 0 }, context)).toBeNull()
  })

  it('returns null when the grid is disabled and there are no walls and no origin', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: -1,
      toleranceMm: 50,
    }

    expect(snapPoint({ x: 1234, y: 5678 }, context)).toBeNull()
  })
})
