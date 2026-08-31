import { describe, it, expect } from 'vitest'

import type { Floor, SceneGraph, SurfaceTreatment } from '../../core'
import {
  createEmptyProject,
  createFloor,
  createSceneGraphDeriver,
  createWall,
  sceneGraphForFloor,
} from '../../core'
import {
  restoreNearWallTransparency,
  restoreUnenrolledNearWallTargets,
  updateNearWallTransparency,
} from '../../engine'
import { findByEntityId } from '../../engine/testing'
import { buildFramedScene } from './framed-scene'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const FADED_OPACITY = 0.1
const SPAN_MM = 4000
const WALL_THICKNESS_MM = 200
const CEILING_MM = 2400

// Outside the south wall: plan y maps to world -z, so the room sits at negative z and a
// camera at positive z looks at the south wall from its outside face.
const CAMERA_OUTSIDE_SOUTH = { x: 2000, z: 3000 }

// A square room whose four walls are all exterior, with a double-hung window in the south
// wall. The wall scene-node ids carry the `wall:` prefix while the window's hostWallId is
// the raw id, the convention a derived graph produces.
function squareRoomWithSouthWindow(): SceneGraph {
  const corners = [
    { x: 0, y: 0 },
    { x: SPAN_MM, y: 0 },
    { x: SPAN_MM, y: SPAN_MM },
    { x: 0, y: SPAN_MM },
  ]
  return {
    nodes: [{ id: 'floor:g', kind: 'floor', name: 'G', elevation: 0 }],
    walls: [
      wall('wall:s', { x: 0, y: 0 }, { x: SPAN_MM, y: 0 }),
      wall('wall:e', { x: SPAN_MM, y: 0 }, { x: SPAN_MM, y: SPAN_MM }),
      wall('wall:n', { x: SPAN_MM, y: SPAN_MM }, { x: 0, y: SPAN_MM }),
      wall('wall:w', { x: 0, y: SPAN_MM }, { x: 0, y: 0 }),
    ],
    rooms: [
      {
        id: 'room:r',
        kind: 'room',
        floorId: 'g',
        polygon: corners,
        clearPolygon: corners,
        area: SPAN_MM * SPAN_MM,
        ceilingHeight: CEILING_MM,
      },
    ],
    underlays: [],
    openings: [
      {
        id: 'opening:window',
        kind: 'opening',
        floorId: 'g',
        type: 'double-hung-window',
        center: { x: 2000, y: 0 },
        along: { x: 1, y: 0 },
        normal: { x: 0, y: 1 },
        width: 900,
        height: 1200,
        sillHeight: 900,
        hostThickness: WALL_THICKNESS_MM,
        orientation: { hinge: 'start', facing: 'positive' },
        hostWallId: 's',
      },
    ],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): SceneGraph['walls'][number] {
  return {
    id,
    kind: 'wall',
    floorId: 'g',
    start,
    end,
    thickness: WALL_THICKNESS_MM,
    height: CEILING_MM,
  }
}

// Reads the opacity of the 'glass' material under a built opening group, structurally so
// the bridge test does not import three.
function glassOpacityOf(group: unknown): number | undefined {
  let opacity: number | undefined
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { name?: string; opacity?: number } }
    if (
      mesh.material !== undefined &&
      !Array.isArray(mesh.material) &&
      mesh.material.name === 'glass'
    ) {
      opacity = mesh.material.opacity
    }
  })
  return opacity
}

// The distinct material opacities under a built group, structurally so the bridge test
// does not import three. Covers single- and multi-material meshes.
function opacitiesOf(group: unknown): number[] {
  const opacities = new Set<number>()
  ;(group as { traverse(cb: (object: unknown) => void): void }).traverse((object) => {
    const mesh = object as { material?: { opacity?: number } | { opacity?: number }[] }
    if (mesh.material === undefined) return
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of materials) {
      if (typeof material.opacity === 'number') opacities.add(material.opacity)
    }
  })
  return [...opacities]
}

// A furniture node whose axis-aligned footprint spans the given plan extents. The node id
// carries the `furniture:` prefix while the built group carries the raw instance id, the
// furniture-builder convention.
function furnitureNode(
  id: string,
  min: { x: number; y: number },
  max: { x: number; y: number },
): SceneGraph['furniture'][number] {
  return {
    id: `furniture:${id}`,
    kind: 'furniture',
    floorId: 'g',
    footprintCorners: [
      { x: min.x, y: min.y },
      { x: max.x, y: min.y },
      { x: max.x, y: max.y },
      { x: min.x, y: max.y },
    ],
    elevationZ: 0,
    height: 1800,
    assetRef: { scope: 'user', contentHash: `hash-of-a-${id}` },
  }
}

const emptyPaint = (): Record<string, SurfaceTreatment> => ({})

// The same floor renamed: a fresh floor node over the graph's very same wall, room, and
// opening node objects, the edit shape that rebuilds a floor while reusing its sub-groups.
function renamedFloor(graph: SceneGraph): SceneGraph {
  return { ...graph, nodes: [{ id: 'floor:g', kind: 'floor', name: 'Renamed', elevation: 0 }] }
}

// The same floor with a second room laid against the outside face of the south wall, so
// that wall now has a room on both faces and is an interior partition rather than an
// exterior wall. The floor is renamed as well, since the reconciler keys a floor's cached
// build on its node and would otherwise hand the previous build back untouched.
function roomAddedOutsideSouthWall(graph: SceneGraph): SceneGraph {
  const corners = [
    { x: 0, y: -SPAN_MM },
    { x: SPAN_MM, y: -SPAN_MM },
    { x: SPAN_MM, y: 0 },
    { x: 0, y: 0 },
  ]
  return renamedFloor({
    ...graph,
    rooms: [
      ...graph.rooms,
      {
        id: 'room:outside',
        kind: 'room',
        floorId: 'g',
        polygon: corners,
        clearPolygon: corners,
        area: SPAN_MM * SPAN_MM,
        ceilingHeight: CEILING_MM,
      },
    ],
  })
}

const STUB_FLOOR_ID = 'g'
const ENCLOSURE_DEPTH_MM = 3000
const ENCLOSURE_RIGHT_MM = 6000
const STUB_X_MM = 3000
const STUB_DEPTH_MM = 1500
/** All four perimeter walls of the enclosure are exterior; the stub inside it is not. */
const STUB_EXTERIOR_WALL_COUNT = 4

/**
 * A rectangular enclosure with a stub wall running inward from the bottom wall, derived
 * through the real deriver rather than hand-built so the wall topology carries a genuine
 * 3-way junction where the stub meets the perimeter. That junction gets a fill, and
 * because one of its incident walls is the exterior bottom wall, the fill enrolls as a
 * fade target on top of the four wall targets. A fade group whose edge indexes addressed
 * the wrong edges would leave the fill out and the count back at the wall count.
 */
function stubJunctionGraph(): SceneGraph {
  const floor: Floor = createFloor('Ground', {
    id: STUB_FLOOR_ID,
    walls: [
      createWall({ x: 0, y: 0 }, { x: ENCLOSURE_RIGHT_MM, y: 0 }, { id: 'wall-bottom' }),
      createWall(
        { x: 0, y: ENCLOSURE_DEPTH_MM },
        { x: ENCLOSURE_RIGHT_MM, y: ENCLOSURE_DEPTH_MM },
        { id: 'wall-top' },
      ),
      createWall({ x: 0, y: 0 }, { x: 0, y: ENCLOSURE_DEPTH_MM }, { id: 'wall-left' }),
      createWall(
        { x: ENCLOSURE_RIGHT_MM, y: 0 },
        { x: ENCLOSURE_RIGHT_MM, y: ENCLOSURE_DEPTH_MM },
        { id: 'wall-right' },
      ),
      createWall({ x: STUB_X_MM, y: 0 }, { x: STUB_X_MM, y: STUB_DEPTH_MM }, { id: 'wall-stub' }),
    ],
  })
  const base = createEmptyProject({
    name: 'Parity',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  const derive = createSceneGraphDeriver()
  return sceneGraphForFloor(derive({ ...base, floors: [floor] }), STUB_FLOOR_ID)
}

describe('createFramedSceneReconciler near-wall fade enrollment', () => {
  it('fades an opening fill on an exterior wall together with its host wall', () => {
    const reconciler = createFramedSceneReconciler()
    const { root, nearWallTargets } = reconciler.reconcile(
      squareRoomWithSouthWindow(),
      emptyPaint(),
    )

    updateNearWallTransparency(nearWallTargets, CAMERA_OUTSIDE_SOUTH)

    // The host wall fades in both scene-assembly paths; its window must fade with it.
    expect(opacitiesOf(findByEntityId(root, 'wall:s'))).toEqual([FADED_OPACITY])
    const window = findByEntityId(root, 'opening:window')
    expect(window).not.toBeNull()
    expect(glassOpacityOf(window)).toBe(FADED_OPACITY)
  })

  it('fades furniture standing against an exterior wall together with that wall', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = squareRoomWithSouthWindow()
    // A wardrobe flush against the south wall's interior face (plan y = 100), plus a
    // free-standing table mid-room that stands against no wall.
    graph.furniture = [
      furnitureNode('wardrobe', { x: 1700, y: 100 }, { x: 2300, y: 700 }),
      furnitureNode('table', { x: 1700, y: 1700 }, { x: 2300, y: 2300 }),
    ]
    const { root, nearWallTargets } = reconciler.reconcile(graph, emptyPaint())

    updateNearWallTransparency(nearWallTargets, CAMERA_OUTSIDE_SOUTH)

    // Furniture groups carry the raw instance id.
    expect(opacitiesOf(findByEntityId(root, 'wardrobe'))).toEqual([FADED_OPACITY])
    // The table keeps its own translucent massing baseline: it never drops to the fade
    // opacity with a wall it does not stand against.
    expect(opacitiesOf(findByEntityId(root, 'table'))).not.toContain(FADED_OPACITY)
  })

  it('enrolls the same targets through the full rebuild and the reconciler, junction fill included', () => {
    const graph = stubJunctionGraph()
    // The stub does not divide the enclosure, so the perimeter still rings one room and
    // all four of its walls stay exterior.
    expect(graph.rooms).toHaveLength(1)

    const rebuilt = buildFramedScene(graph)
    const reconciled = createFramedSceneReconciler().reconcile(graph, emptyPaint())

    // The junction fill enrolls on top of one target per exterior wall.
    expect(rebuilt.nearWallTargets.length).toBeGreaterThan(STUB_EXTERIOR_WALL_COUNT)
    // Both scene-assembly paths enroll through one seam, so neither can drift from the
    // other in what it fades.
    expect(reconciled.nearWallTargets).toHaveLength(rebuilt.nearWallTargets.length)
  })

  it('keeps the solid baseline when a rebuild re-enrolls a reused, already faded wall', () => {
    const reconciler = createFramedSceneReconciler()
    // One paint object across both reconciles: a fresh one would defeat sub-group reuse
    // and rebuild the wall from unfaded materials, hiding the baseline capture.
    const paint = emptyPaint()
    const graph = squareRoomWithSouthWindow()
    const first = reconciler.reconcile(graph, paint)

    const southWall = findByEntityId(first.root, 'wall:s')
    expect(southWall).not.toBeNull()
    const solid = opacitiesOf(southWall)
    expect(solid).not.toContain(FADED_OPACITY)

    // Orbit outside the south wall, leaving its materials sitting at the fade opacity.
    updateNearWallTransparency(first.nearWallTargets, CAMERA_OUTSIDE_SOUTH)
    expect(opacitiesOf(southWall)).toEqual([FADED_OPACITY])

    // Rename the floor mid-fade: a fresh floor node over the very same wall, room, and
    // opening nodes, so the floor rebuilds while every sub-group and mesh is reused.
    const second = reconciler.reconcile(renamedFloor(graph), paint)
    expect(findByEntityId(second.root, 'wall:s')).toBe(southWall)

    // Orbiting back inside restores the appearance the wall was built with, not the
    // faded state the rebuild happened to find it in.
    restoreNearWallTransparency(second.nearWallTargets)
    expect(opacitiesOf(southWall)).toEqual(solid)
  })

  it('restores a wall that leaves the enrollment set while it is faded', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const graph = squareRoomWithSouthWindow()
    const first = reconciler.reconcile(graph, paint)

    const southWall = findByEntityId(first.root, 'wall:s')
    expect(southWall).not.toBeNull()
    const solid = opacitiesOf(southWall)
    expect(solid).not.toContain(FADED_OPACITY)

    // Orbit outside the south wall, leaving its materials sitting at the fade opacity.
    updateNearWallTransparency(first.nearWallTargets, CAMERA_OUTSIDE_SOUTH)
    expect(opacitiesOf(southWall)).toEqual([FADED_OPACITY])

    // An edit that puts a room on the far side of the south wall reclassifies it as an
    // interior partition, so it drops out of enrollment while its meshes stay in the scene.
    const second = reconciler.reconcile(roomAddedOutsideSouthWall(graph), paint)
    expect(findByEntityId(second.root, 'wall:s')).toBe(southWall)
    expect(opacitiesOf(southWall)).toEqual([FADED_OPACITY])

    // Nothing enrolled can restore the wall now, so the sweep over what left the set has to.
    restoreUnenrolledNearWallTargets(first.nearWallTargets, second.nearWallTargets)
    expect(opacitiesOf(southWall)).toEqual(solid)
  })

  it('leaves a wall the rebuild still enrolls at its faded opacity', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const graph = squareRoomWithSouthWindow()
    const first = reconciler.reconcile(graph, paint)

    const southWall = findByEntityId(first.root, 'wall:s')
    updateNearWallTransparency(first.nearWallTargets, CAMERA_OUTSIDE_SOUTH)
    expect(opacitiesOf(southWall)).toEqual([FADED_OPACITY])

    // A rename leaves every wall exterior, so the rebuild enrolls the south wall again over
    // the very same materials, and the camera still sits outside it.
    const second = reconciler.reconcile(renamedFloor(graph), paint)
    expect(findByEntityId(second.root, 'wall:s')).toBe(southWall)

    // The sweep covers what left the set, so a target that is still enrolled keeps the
    // appearance the frame gave it rather than being reset behind the update's back.
    restoreUnenrolledNearWallTargets(first.nearWallTargets, second.nearWallTargets)
    expect(opacitiesOf(southWall)).toEqual([FADED_OPACITY])
  })
})
