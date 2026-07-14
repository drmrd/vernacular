/* eslint-disable max-lines --
 * A behavior-organized suite whose cases each own a self-contained SceneGraph
 * literal (reconcile caching, whole-building stacking, ground plane, edge overlay,
 * and paint). The file length tracks the number of reconciler cases, not any
 * single hard-to-read unit. */
import { describe, it, expect } from 'vitest'
import { builtinFinishes, colorFromHex, getEntry, solidTreatment, surfaceKey } from '../../core'
import type { Point, SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { isGroundPlane, type SceneRoot } from '../../engine'
import { collectEntityIds, findByEntityId } from '../../engine/testing'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400
const UPPER_FLOOR_ELEVATION_MM = 2700

// A one-floor, one-wall graph wrapping the given floor node, mimicking the
// active-floor-scoped graph the preview feeds the reconciler. Passing the same
// floorNode object models an unchanged floor; a fresh object models an edit.
function floorGraph(floorNode: SceneNode): SceneGraph {
  const floorId = floorNode.id.slice('floor:'.length)
  return {
    nodes: [floorNode],
    walls: [
      {
        id: `wall:${floorId}1`,
        kind: 'wall',
        floorId,
        start: { x: 0, y: 0 },
        end: { x: WALL_LENGTH_MM, y: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

const groundFloorNode = (): SceneNode => ({
  id: 'floor:g',
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

const emptyPaint = (): Record<string, SurfaceTreatment> => ({})

describe('createFramedSceneReconciler', () => {
  it('reuses the built scene when the floor node and paint are unchanged', () => {
    const reconciler = createFramedSceneReconciler()
    const node = groundFloorNode()
    const paint = emptyPaint()

    const first = reconciler.reconcile(floorGraph(node), paint)
    // A later render passes a fresh scoped-graph container with the same floor node.
    const second = reconciler.reconcile(floorGraph(node), paint)

    expect(second).toBe(first)
  })

  it('rebuilds when the floor node reference changes', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const first = reconciler.reconcile(floorGraph(groundFloorNode()), paint)
    // An edit replaces the floor with a new object carrying the same id.
    const second = reconciler.reconcile(floorGraph(groundFloorNode()), paint)

    expect(second).not.toBe(first)
  })

  it('rebuilds when the paint reference changes', () => {
    const reconciler = createFramedSceneReconciler()
    const node = groundFloorNode()

    const first = reconciler.reconcile(floorGraph(node), emptyPaint())
    // Same unchanged floor node, but a new paint set: materials may differ, so rebuild.
    const second = reconciler.reconcile(floorGraph(node), emptyPaint())

    expect(second).not.toBe(first)
  })

  it('reuses a floor built earlier after switching to another floor and back', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const ground = groundFloorNode()
    const upper: SceneNode = {
      id: 'floor:u',
      kind: 'floor',
      name: 'Upper',
      elevation: UPPER_FLOOR_ELEVATION_MM,
    }

    const groundFirst = reconciler.reconcile(floorGraph(ground), paint)
    const upperBuild = reconciler.reconcile(floorGraph(upper), paint)
    // Switch back to the unchanged ground floor (same node reference).
    const groundAgain = reconciler.reconcile(floorGraph(ground), paint)

    expect(upperBuild).not.toBe(groundFirst)
    expect(groundAgain).toBe(groundFirst)
  })

  it('builds an empty graph without throwing and returns a finite pose', () => {
    const reconciler = createFramedSceneReconciler()
    const empty: SceneGraph = {
      nodes: [],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const framed = reconciler.reconcile(empty, emptyPaint())

    expect(framed.root).toBeDefined()
    expect(Number.isFinite(framed.pose.near)).toBe(true)
    expect(Number.isFinite(framed.pose.far)).toBe(true)
  })
})

// The upper floor's wall runs longer than the ground floor's, so the whole-building
// footprint (and its ground plane) reaches past the ground floor on its own.
const UPPER_WALL_LENGTH_MM = 5000

const upperFloorNode = (): SceneNode => ({
  id: 'floor:u',
  kind: 'floor',
  name: 'Upper',
  elevation: UPPER_FLOOR_ELEVATION_MM,
})

function floorWall(floorId: string, length: number): SceneGraph['walls'][number] {
  return {
    id: `wall:${floorId}1`,
    kind: 'wall',
    floorId,
    start: { x: 0, y: 0 },
    end: { x: length, y: 0 },
    thickness: WALL_THICKNESS_MM,
    height: WALL_HEIGHT_MM,
  }
}

// A two-floor whole-building graph (the projection sceneGraphForBuilding feeds the
// reconciler in building scope): one node per floor, each seated at its own elevation,
// with a wall on each floor so both floors' geometry is observable.
function twoFloorBuildingGraph(): SceneGraph {
  return {
    nodes: [groundFloorNode(), upperFloorNode()],
    walls: [floorWall('g', WALL_LENGTH_MM), floorWall('u', UPPER_WALL_LENGTH_MM)],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

describe('createFramedSceneReconciler whole building', () => {
  it('stacks every floor at its elevation and frames the whole building', () => {
    const framed = createFramedSceneReconciler().reconcile(twoFloorBuildingGraph(), emptyPaint())

    // Every floor renders, not just the ground floor (issue #479): the upper floor's
    // wall and floor group are both present.
    expect(findByEntityId(framed.root, 'wall:g1')).not.toBeNull()
    expect(findByEntityId(framed.root, 'wall:u1')).not.toBeNull()
    // Each floor group is seated at its own elevation (millimetres, no scale factor).
    const upperGroup = findByEntityId(framed.root, 'floor:u')
    expect(upperGroup).not.toBeNull()
    expect(upperGroup?.position.y).toBe(UPPER_FLOOR_ELEVATION_MM)
    // The camera frames the whole building: the bounds reach the upper floor's walls,
    // above the upper floor's own elevation, rather than being capped at the ground floor.
    expect(framed.bounds?.max.y ?? 0).toBeGreaterThan(UPPER_FLOOR_ELEVATION_MM)
  })

  it('seats one shared ground plane sized to the whole-building footprint', () => {
    const framed = createFramedSceneReconciler().reconcile(twoFloorBuildingGraph(), emptyPaint())

    const grounds = framed.root.children.filter(isGroundPlane)
    // A single site surface under the whole building, not one plane per floor.
    expect(grounds).toHaveLength(1)
    // Centered on the union footprint (reaching the wider upper floor), not on the
    // narrower ground floor alone.
    expect(grounds[0]?.position.x).toBeGreaterThan(WALL_LENGTH_MM)
  })

  it('renders a single-floor graph as exactly one floor group at its elevation (locks #206)', () => {
    const framed = createFramedSceneReconciler().reconcile(
      floorGraph(groundFloorNode()),
      emptyPaint(),
    )

    const floorIds = collectEntityIds(framed.root).filter((id) => id.startsWith('floor:'))
    expect(floorIds).toEqual(['floor:g'])
    expect(findByEntityId(framed.root, 'floor:g')?.position.y).toBe(0)
  })
})

const ROOM_SPAN_MM = 4000
const ROOM_CEILING_MM = 2400
const WINDOW_WIDTH_MM = 900
const WINDOW_HEIGHT_MM = 1200
const WINDOW_SILL_MM = 900
const CHAIR_MIN_MM = 1000
const CHAIR_MAX_MM = 1500
const CHAIR_HEIGHT_MM = 900

function furnishedWall(id: string, start: Point, end: Point): SceneGraph['walls'][number] {
  return {
    id,
    kind: 'wall',
    floorId: 'g',
    start,
    end,
    thickness: WALL_THICKNESS_MM,
    height: ROOM_CEILING_MM,
  }
}

// A furnished one-room graph: four walls enclosing a room, a window hosted on the
// south wall, and one furniture piece, so the overlay assertions can probe every
// sub-group kind the reconciler builds (walls, rooms, openings, furniture).
function furnishedRoomGraph(): SceneGraph {
  const span = ROOM_SPAN_MM
  const corners = [
    { x: 0, y: 0 },
    { x: span, y: 0 },
    { x: span, y: span },
    { x: 0, y: span },
  ]
  return {
    nodes: [groundFloorNode()],
    walls: [
      furnishedWall('wall:s', { x: 0, y: 0 }, { x: span, y: 0 }),
      furnishedWall('wall:e', { x: span, y: 0 }, { x: span, y: span }),
      furnishedWall('wall:n', { x: span, y: span }, { x: 0, y: span }),
      furnishedWall('wall:w', { x: 0, y: span }, { x: 0, y: 0 }),
    ],
    rooms: [
      {
        id: 'room:r',
        kind: 'room',
        floorId: 'g',
        polygon: corners,
        clearPolygon: corners,
        area: span * span,
        ceilingHeight: ROOM_CEILING_MM,
      },
    ],
    underlays: [],
    openings: [
      {
        id: 'opening:window',
        kind: 'opening',
        floorId: 'g',
        type: 'double-hung-window',
        center: { x: span / 2, y: 0 },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        width: WINDOW_WIDTH_MM,
        height: WINDOW_HEIGHT_MM,
        sillHeight: WINDOW_SILL_MM,
        hostThickness: WALL_THICKNESS_MM,
        orientation: { hinge: 'start', facing: 'positive' },
        hostWallId: 's',
      },
    ],
    dimensions: [],
    stairs: [],
    furniture: [
      {
        id: 'furniture:chair',
        kind: 'furniture',
        floorId: 'g',
        footprintCorners: [
          { x: CHAIR_MIN_MM, y: CHAIR_MIN_MM },
          { x: CHAIR_MAX_MM, y: CHAIR_MIN_MM },
          { x: CHAIR_MAX_MM, y: CHAIR_MAX_MM },
          { x: CHAIR_MIN_MM, y: CHAIR_MAX_MM },
        ],
        elevationZ: 0,
        height: CHAIR_HEIGHT_MM,
        assetRef: { scope: 'user', contentHash: 'c' },
      },
    ],
  }
}

// Whether any edge-overlay line sits under the group, structurally so the bridge test
// does not import three. The surface edge overlay is the only build step that adds
// LineSegments to the scene.
function containsEdgeLines(
  group: { traverse(cb: (object: { type: string }) => void): void } | null,
): boolean {
  if (group === null) return false
  let found = false
  group.traverse((object) => {
    if (object.type === 'LineSegments') found = true
  })
  return found
}

const BELOW_GRADE_MM = -600
const ABOVE_GRADE_MM = 300

// The ground planes seated directly under the assembled root. The site surface is a
// per-scene sibling of the floor group, not a child of any cached sub-group, so it
// shows up as a direct child of the root.
function groundPlanesOf(root: SceneRoot): SceneRoot['children'] {
  return root.children.filter(isGroundPlane)
}

describe('createFramedSceneReconciler ground plane', () => {
  it('seats the assembled root on a ground plane at the graph grade', () => {
    const reconciler = createFramedSceneReconciler()
    const graph: SceneGraph = { ...floorGraph(groundFloorNode()), gradeElevation: BELOW_GRADE_MM }

    const framed = reconciler.reconcile(graph, emptyPaint())

    const grounds = groundPlanesOf(framed.root)
    expect(grounds).toHaveLength(1)
    expect(grounds[0]?.position.y).toBeCloseTo(BELOW_GRADE_MM)
  })

  it('refreshes the ground plane to the new grade with no stale copy left behind', () => {
    const reconciler = createFramedSceneReconciler()
    // Same floor node and paint across both reconciles, so only the grade changes: the
    // cached build must refresh its ground rather than return the stale below-grade copy.
    const node = groundFloorNode()
    const paint = emptyPaint()

    const first = reconciler.reconcile(
      { ...floorGraph(node), gradeElevation: BELOW_GRADE_MM },
      paint,
    )
    expect(groundPlanesOf(first.root)).toHaveLength(1)
    expect(groundPlanesOf(first.root)[0]?.position.y).toBeCloseTo(BELOW_GRADE_MM)
    // Capture the wall sub-group before the second reconcile: the ground is per-scene,
    // so a grade-only edit must refresh it without rebuilding any floor sub-group.
    const wallFirstGroup = findByEntityId(first.root, 'wall:g1')
    expect(wallFirstGroup).not.toBeNull()

    const second = reconciler.reconcile(
      { ...floorGraph(node), gradeElevation: ABOVE_GRADE_MM },
      paint,
    )

    const grounds = groundPlanesOf(second.root)
    expect(grounds).toHaveLength(1)
    expect(grounds[0]?.position.y).toBeCloseTo(ABOVE_GRADE_MM)
    // The grade edit refreshed only the site ground: the unchanged floor's sub-groups
    // (here the wall group) are reused by reference, not rebuilt.
    expect(findByEntityId(second.root, 'wall:g1')).toBe(wallFirstGroup)
  })
})

describe('createFramedSceneReconciler edge overlay', () => {
  it('draws no surface edge overlay by default (an opt-in view toggle, ADR-0132)', () => {
    const framed = createFramedSceneReconciler().reconcile(furnishedRoomGraph(), emptyPaint())

    expect(containsEdgeLines(framed.root)).toBe(false)
  })

  it('draws the overlay on every sub-group kind when the view option turns it on', () => {
    const framed = createFramedSceneReconciler({ edgeOverlay: true }).reconcile(
      furnishedRoomGraph(),
      emptyPaint(),
    )

    expect(containsEdgeLines(findByEntityId(framed.root, 'wall:s'))).toBe(true)
    expect(containsEdgeLines(findByEntityId(framed.root, 'room:r'))).toBe(true)
    expect(containsEdgeLines(findByEntityId(framed.root, 'opening:window'))).toBe(true)
    expect(containsEdgeLines(findByEntityId(framed.root, 'chair'))).toBe(true)
  })
})

// Reads the roughness of the 'top' material on a painted floor mesh, structurally so
// the bridge test does not import three.
function topRoughnessOf(root: unknown): number | undefined {
  let roughness: number | undefined
  ;(root as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: unknown }
    if (Array.isArray(mesh.material)) {
      const top = (mesh.material as { name: string; roughness: number }[]).find(
        (material) => material.name === 'top',
      )
      if (top !== undefined) {
        roughness = top.roughness
      }
    }
  })
  return roughness
}

describe('createFramedSceneReconciler paint', () => {
  it('paints a room floor with the roughness of its gloss finish', () => {
    const hex = '#aa5500'
    const ref = { kind: 'floor', floorId: 'g' } as const
    const paint = { [surfaceKey(ref)]: solidTreatment(colorFromHex(hex), 'gloss') }
    const glossRoughness = getEntry(builtinFinishes, 'gloss')?.roughness

    const framed = createFramedSceneReconciler().reconcile(furnishedRoomGraph(), paint)

    expect(glossRoughness).toBeDefined()
    expect(topRoughnessOf(framed.root)).toBe(glossRoughness)
  })
})
