import { describe, it, expect } from 'vitest'
import type { Point, SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { findByEntityId } from '../../engine/testing'
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
