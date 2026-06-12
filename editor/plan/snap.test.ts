/* eslint-disable max-lines -- the full snapPoint suite: the along-wall and intersection kinds
   (ADR-0053) and the angle lock (ADR-0054) reconcile here, so this file exercises every snap kind
   (endpoint, intersection, midpoint, edge, angle, perpendicular, parallel, grid, trace) against the
   one resolver under test. The cases are cohesive, not a missing split. */
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
    context: {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 0, y: 0 },
      // Free the angle lock so these tests keep exercising the perpendicular and
      // parallel kinds; the default-on lock would otherwise pre-empt them.
      freeAngle: true,
    },
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

describe('snapPoint angle snapping', () => {
  it('locks a near-horizontal drag onto the world 0-degree ray', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 0,
      toleranceMm: 1,
      origin: { x: 0, y: 0 },
    }

    // The origin-to-cursor bearing is about 3 degrees, so the nearest world ray
    // is 0 degrees and the cursor projects onto the x-axis.
    expect(snapPoint({ x: 1000, y: 50 }, context)).toEqual({
      point: { x: 1000, y: 0 },
      kind: 'angle',
    })
  })

  it('locks a near-diagonal drag onto the world 45-degree ray', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 0,
      toleranceMm: 1,
      origin: { x: 0, y: 0 },
    }

    // The bearing is about 42 degrees, so the nearest world ray is 45 degrees.
    const result = snapPoint({ x: 1000, y: 900 }, context)
    expect(result?.kind).toBe('angle')
    expect(result?.point.x).toBeCloseTo(950, 5)
    expect(result?.point.y).toBeCloseTo(950, 5)
  })

  it('does not lock before a segment starts', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 0,
      toleranceMm: 1,
    }

    expect(snapPoint({ x: 1000, y: 50 }, context)).toBeNull()
  })

  it('does not lock when the cursor sits on the origin', () => {
    const context: SnapContext = {
      walls: [],
      gridSpacingMm: 0,
      toleranceMm: 1,
      origin: { x: 0, y: 0 },
    }

    expect(snapPoint({ x: 0, y: 0 }, context)).toBeNull()
  })

  it('locks a drawn wall direction relative to the nearest wall', () => {
    // A wall running at 30 degrees from the origin, so its direction is off the
    // world axes. The nearest wall-relative ray is its own 30-degree direction.
    const radPerDeg = Math.PI / 180
    const wall = wallNode({
      start: { x: 0, y: 0 },
      end: { x: 1000 * Math.cos(30 * radPerDeg), y: 1000 * Math.sin(30 * radPerDeg) },
    })
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 1,
      origin: { x: 0, y: 0 },
    }

    // The origin-to-cursor bearing is 33 degrees: nearer the wall's 30-degree ray
    // than the world 45-degree ray, so the lock squares to the angled wall.
    const result = snapPoint(
      { x: 1000 * Math.cos(33 * radPerDeg), y: 1000 * Math.sin(33 * radPerDeg) },
      context,
    )
    expect(result?.kind).toBe('angle')
    expect(result?.referenceId).toBe(wall.id)
    const bearing = (Math.atan2(result!.point.y, result!.point.x) * 180) / Math.PI
    expect(bearing).toBeCloseTo(30, 4)
  })

  it('prefers an in-range endpoint over the angle lock', () => {
    // The wall's start endpoint sits at an off-45 bearing (about 17 degrees) from
    // the origin, and the cursor is within tolerance of that endpoint.
    const wall = wallNode({ start: { x: 1000, y: 300 }, end: { x: 5000, y: 300 } })
    const context: SnapContext = {
      walls: [wall],
      gridSpacingMm: 0,
      toleranceMm: 50,
      origin: { x: 0, y: 0 },
    }

    expect(snapPoint({ x: 1002, y: 301 }, context)?.kind).toBe('endpoint')
  })

  it('snaps to the nearest open run corner as an endpoint, above the angle lock', () => {
    const context = {
      walls: [],
      gridSpacingMm: 100,
      toleranceMm: 20,
      origin: { x: 0, y: 0 },
      openVertices: [{ x: 500, y: 0 }],
    }

    const result = snapPoint({ x: 506, y: 5 }, context)

    expect(result).toEqual({ point: { x: 500, y: 0 }, kind: 'endpoint' })
  })

  it('ignores open corners outside the tolerance', () => {
    const context = {
      walls: [],
      gridSpacingMm: 100,
      toleranceMm: 20,
      openVertices: [{ x: 500, y: 0 }],
    }

    expect(snapPoint({ x: 560, y: 0 }, context)?.kind).not.toBe('endpoint')
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

describe('snapPoint wall-line intersection snapping', () => {
  it('snaps to where two wall lines cross, even past the segment ends', () => {
    // A: line y=1000 over x in [1000,2000]. B: line x=4000 over y in [2000,3000].
    // The lines cross at (4000,1000), which lies past the end of both segments.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 2000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 4000, y: 2000 }, end: { x: 4000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    const result = snapPoint({ x: 4003, y: 1004 }, context)
    expect(result?.kind).toBe('intersection')
    expect(result?.point).toEqual({ x: 4000, y: 1000 })
  })

  it('prefers an intersection over the on-edge point when they coincide on a wall', () => {
    // A horizontal line y=1000; B vertical line x=2000 crossing it at (2000,1000),
    // which also lies on segment A, so the on-edge snap would otherwise fire there.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 5000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 2000, y: 2000 }, end: { x: 2000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 2003, y: 1004 }, context)?.kind).toBe('intersection')
  })

  it('produces no intersection for parallel walls', () => {
    // Two parallel horizontal walls; the cursor sits clear of both edges.
    const a = wallNode({ id: 'wall:a', start: { x: 1000, y: 1000 }, end: { x: 5000, y: 1000 } })
    const b = wallNode({ id: 'wall:b', start: { x: 1000, y: 3000 }, end: { x: 5000, y: 3000 } })
    const context: SnapContext = { walls: [a, b], gridSpacingMm: 0, toleranceMm: 50 }

    expect(snapPoint({ x: 3000, y: 2000 }, context)).toBeNull()
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
