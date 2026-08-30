import { describe, it, expect } from 'vitest'
import { effectiveWallThickness } from './construction-profile'
import type { FurnitureSceneNode, OpeningSceneNode, WallSceneNode } from './scene-graph'
import {
  furnitureSegmentsForWalk,
  passableDoorIds,
  resolveWalkCollision,
  sweepWalkCollision,
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

describe('sweepWalkCollision', () => {
  it('stops a fast straight-across move on the near side instead of tunneling through the wall', () => {
    // A single frame proposes a move from one side of the wall to the other.
    // The walker starts clear on the -z side (farther than the radius) and the
    // proposed end point is clear on the far +z side.
    const from = { x: 0, z: -500 }
    const to = { x: 0, z: 500 }

    // A discrete resolve only inspects the proposed end point. Because that end
    // point is clear on the far side, resolveWalkCollision leaves the walker
    // there, having silently tunneled straight through the wall.
    const tunneled = resolveWalkCollision(to, [wallAlongX], radius)
    expect(tunneled.z).toBeCloseTo(500, 5)

    // The swept resolver inspects the whole path, so the wall lying between the
    // endpoints stops the walker on the near (-z) side at the radius standoff
    // rather than letting it cross.
    const result = sweepWalkCollision(from, to, { segments: [wallAlongX], radius })
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.z).toBeCloseTo(-radius, 5)
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

  // A cased opening is a trimmed hole in the wall with no leaf hung in it. There is
  // nothing there to open, so waiting for it to appear in the open set leaves the
  // walker stopped by thin air in a doorway that plainly reads as walk-through.
  it('passes a leafless opening even when nothing has been opened', () => {
    const casedOpening = openingNode({ id: 'opening:cased', type: 'cased-opening' })
    const shutDoor = openingNode({ id: 'opening:door-shut', type: 'single-swing-door' })

    const passable = passableDoorIds([casedOpening, shutDoor], new Set())

    // The cased opening passes on its own; the swing door has a leaf in the way and
    // still waits to be opened, so its passability is unchanged.
    expect(passable).toEqual(new Set([casedOpening.id]))
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

describe('wall-thickness standoff', () => {
  // A real wall is a solid slab, not a centerline. resolveWalkCollision pushes
  // the walker out of a segment, and that standoff must clear the wall FACE, not
  // the centerline. The near face sits half the wall's thickness off the
  // centerline, so a segment carrying `thickness: T` widens the standoff from
  // `radius` to `radius + T / 2`. Treating the wall as zero-thickness (today's
  // behavior) leaves the walker standing half-buried in the slab.
  it('pushes the walker clear of the wall face at radius plus half the thickness', () => {
    const wallThickness = 200
    const thickWall: WallSegment = {
      start: { x: -1000, z: 0 },
      end: { x: 1000, z: 0 },
      thickness: wallThickness,
    }

    const resolved = resolveWalkCollision({ x: 0, z: -100 }, [thickWall], radius)

    // The 200mm-thick wall's face is 100mm off its centerline, so a straight-in
    // step is pushed to radius + 100 = 400 from the centerline (not the old
    // centerline-only 300), with no sideways drift.
    expect(resolved.x).toBeCloseTo(0, 5)
    expect(resolved.z).toBeCloseTo(-(radius + wallThickness / 2), 5)
  })

  // Real walls must carry their own thickness into the collision segments so the
  // face-clearing standoff applies end to end. (Furniture footprints are exact
  // boundaries whose perimeter IS the solid edge, so those segments leave
  // `thickness` unset and keep the plain `radius` standoff.)
  it('propagates each wall node thickness onto its collision segment', () => {
    const segments = wallSegmentsForWalk([wallNode()], [])

    // wallNode() is 100mm thick, so its derived segment carries thickness 100;
    // without this the standoff would ignore the wall's real solid width.
    expect(segments[0]?.thickness).toBe(100)
  })

  // A wall that names a construction profile renders to the whole assembly: the 3D
  // wall builder extrudes its footprint from effectiveWallThickness, so the visible
  // face sits half the ASSEMBLY off the centerline. Standing the walker off half the
  // node's raw thickness instead leaves the camera clipped into the rendered slab.
  it('stops the walker at the construction assembly face, not the raw wall face', () => {
    // A plastered double-wythe brick bearing wall: the profile totals well past the
    // node's own thickness, so the two standoffs are far enough apart to tell apart.
    const masonryWall = wallNode({
      start: { x: -1000, y: 0 },
      end: { x: 1000, y: 0 },
      constructionProfile: 'solid-masonry-brick',
    })
    const assemblyThickness = effectiveWallThickness(masonryWall)
    expect(assemblyThickness).toBeGreaterThan(masonryWall.thickness)

    const resolved = resolveWalkCollision(
      { x: 0, z: -100 },
      wallSegmentsForWalk([masonryWall], []),
      radius,
    )

    expect(resolved.x).toBeCloseTo(0, 5)
    expect(resolved.z).toBeCloseTo(-(radius + assemblyThickness / 2), 5)
  })
})
