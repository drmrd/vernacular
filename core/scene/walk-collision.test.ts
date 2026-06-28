import { describe, it, expect } from 'vitest'
import type { FurnitureSceneNode, OpeningSceneNode, WallSceneNode } from './scene-graph'
import {
  furnitureSegmentsForWalk,
  passableDoorIds,
  resolveWalkCollision,
  wallSegmentsForWalk,
  type WallSegment,
} from './walk-collision'

function wallNode(overrides: Partial<WallSceneNode> = {}): WallSceneNode {
  return {
    id: 'wall:w1',
    kind: 'wall',
    floorId: 'f1',
    start: { x: 100, y: 200 },
    end: { x: 100, y: 800 },
    thickness: 100,
    ...overrides,
  }
}

function openingNode(overrides: Partial<OpeningSceneNode> = {}): OpeningSceneNode {
  return {
    id: 'opening:o1',
    kind: 'opening',
    floorId: 'f1',
    type: 'door',
    center: { x: 0, y: 0 },
    along: { x: 1, y: 0 },
    normal: { x: 0, y: 1 },
    width: 800,
    height: 2000,
    sillHeight: 0,
    hostThickness: 100,
    orientation: { hinge: 'start', facing: 'positive' },
    hostWallId: 'w1',
    ...overrides,
  }
}

function furnitureNode(overrides: Partial<FurnitureSceneNode> = {}): FurnitureSceneNode {
  return {
    id: 'furniture:f1',
    kind: 'furniture',
    floorId: 'f1',
    footprintCorners: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 },
    ],
    elevationZ: 0,
    height: 750,
    assetRef: { scope: 'project', contentHash: 'abc123' },
    ...overrides,
  }
}

// A wall lying along the world X axis at z = 0, long enough that its endpoints do
// not interfere with the near-origin cases. The walker is a circle of this radius
// in the horizontal (x, z) plane.
const wallAlongX: WallSegment = {
  start: { x: -1000, z: 0 },
  end: { x: 1000, z: 0 },
}
const radius = 300

describe('resolveWalkCollision', () => {
  it('clamps a straight-in move to the radius, slides a glancing move, and leaves clear moves alone', () => {
    // A position farther than the radius from the wall is untouched.
    const clear = resolveWalkCollision({ x: 0, z: -500 }, [wallAlongX], radius)
    expect(clear.x).toBeCloseTo(0, 5)
    expect(clear.z).toBeCloseTo(-500, 5)

    // Stepping straight into the wall is pushed back out to exactly the radius,
    // perpendicular to the wall, with no sideways drift.
    const straightIn = resolveWalkCollision({ x: 0, z: -100 }, [wallAlongX], radius)
    expect(straightIn.x).toBeCloseTo(0, 5)
    expect(straightIn.z).toBeCloseTo(-radius, 5)

    // A glancing move keeps its along-wall component (it slides) while the
    // into-wall component is clamped to the radius, rather than stopping dead.
    const glancing = resolveWalkCollision({ x: 400, z: -100 }, [wallAlongX], radius)
    expect(glancing.x).toBeCloseTo(400, 5)
    expect(glancing.z).toBeCloseTo(-radius, 5)

    // Past the end of a finite wall the nearest point is the endpoint, so a move
    // beyond the radius from that endpoint is not blocked.
    const pastEnd = resolveWalkCollision({ x: 1500, z: -100 }, [wallAlongX], radius)
    expect(pastEnd.x).toBeCloseTo(1500, 5)
    expect(pastEnd.z).toBeCloseTo(-100, 5)
  })
})

describe('furnitureSegmentsForWalk', () => {
  it('returns the four closed-loop perimeter segments of a footprint, mapping plan y to Z', () => {
    const segments = furnitureSegmentsForWalk([furnitureNode()])

    // The 4 corners trace a closed loop: 0->1, 1->2, 2->3, 3->0, with plan x kept
    // as world X and plan y mapped to world Z.
    expect(segments).toEqual([
      { start: { x: 0, z: 0 }, end: { x: 1000, z: 0 } },
      { start: { x: 1000, z: 0 }, end: { x: 1000, z: 500 } },
      { start: { x: 1000, z: 500 }, end: { x: 0, z: 500 } },
      { start: { x: 0, z: 500 }, end: { x: 0, z: 0 } },
    ])
  })
})

describe('passableDoorIds', () => {
  it('keeps open doors but drops open windows, closed openings, and unknown types', () => {
    const openDoor = openingNode({ id: 'opening:door-open', type: 'single-swing-door' })
    const openWindow = openingNode({ id: 'opening:window-open', type: 'double-hung-window' })
    const closedDoor = openingNode({ id: 'opening:door-closed', type: 'single-swing-door' })
    const openUnknown = openingNode({ id: 'opening:mystery', type: 'not-a-real-type' })

    const openIds = new Set([openDoor.id, openWindow.id, openUnknown.id])
    const passable = passableDoorIds([openDoor, openWindow, closedDoor, openUnknown], openIds)

    // Only the open door cuts a gap: a window is never walkable, a closed door is
    // not in the open set, and an unrecognized type is treated as not a door.
    expect(passable).toEqual(new Set([openDoor.id]))
  })
})

describe('wallSegmentsForWalk', () => {
  it('maps each wall centerline into a world-plane segment (plan x to X, plan y to Z)', () => {
    const segments = wallSegmentsForWalk([wallNode()], [])

    expect(segments).toHaveLength(1)
    expect(segments[0]?.start).toEqual({ x: 100, z: 200 })
    expect(segments[0]?.end).toEqual({ x: 100, z: 800 })
  })

  it('keeps a wall with a closed opening solid but cuts a gap for a passable one', () => {
    // A 2000-long wall along world X with an 800-wide opening centered on it.
    const wall = wallNode({ start: { x: -1000, y: 0 }, end: { x: 1000, y: 0 } })
    const opening = openingNode()

    // A closed opening (none marked passable) leaves the wall a single solid span,
    // so the walker cannot pass through a shut door or a window.
    const closed = wallSegmentsForWalk([wall], [opening])
    expect(closed).toHaveLength(1)
    expect(closed[0]?.start).toEqual({ x: -1000, z: 0 })
    expect(closed[0]?.end).toEqual({ x: 1000, z: 0 })

    // Marking the opening passable cuts the wall into the two solid stretches on
    // either side of the 800-wide gap, leaving an opening to walk through.
    const passable = wallSegmentsForWalk([wall], [opening], new Set([opening.id]))
    expect(passable).toHaveLength(2)
    expect(passable[0]?.start).toEqual({ x: -1000, z: 0 })
    expect(passable[0]?.end).toEqual({ x: -400, z: 0 })
    expect(passable[1]?.start).toEqual({ x: 400, z: 0 })
    expect(passable[1]?.end).toEqual({ x: 1000, z: 0 })
  })
})
