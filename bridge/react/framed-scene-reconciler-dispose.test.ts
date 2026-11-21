import { describe, it, expect } from 'vitest'
import {
  FLOOR_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createSceneGraphDeriver,
  createWall,
  sceneGraphForFloor,
} from '../../core'
import type { Floor, Project, RoomSceneNode, SceneGraph, SceneNode, Wall } from '../../core'
import { isGroundPlane } from '../../engine'
import { findByEntityId } from '../../engine/testing'
import type { Object3D } from '../../engine/testing'
import {
  expectEachDisposedOnce,
  expectNoneDisposed,
  liveOf,
  sharedResources,
  trackResources,
  type ResourceTracker,
} from './dispose-tracking-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import type { FramedScene } from './framed-scene'

// These tests count real 'dispose' events on the geometries and materials of real built scenes.
// The reconciler must queue every tree, ground plane, and provider it drops, and free them only
// when releaseRetired() runs (after commit), never while a live scene still draws with them.

const FLOOR_ID = 'g'
const FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${FLOOR_ID}`
const HEIGHT_MM = 3000
const RIGHT_MM = 6000
const WIDENED_RIGHT_MM = 9000
const PARTITION_X_MM = 3000
const UPPER_ELEVATION_MM = 3000
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400
const WIDENED_WALL_IDS = ['wall-right', 'wall-bottom', 'wall-top']

const emptyPaint = (): Record<string, never> => ({})

// A rectangle split by a partition at PARTITION_X_MM, so the floor derives two rooms.
function partitionedWalls(rightX: number): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: rightX, y: 0 }, { id: 'wall-bottom' }),
    createWall({ x: 0, y: HEIGHT_MM }, { x: rightX, y: HEIGHT_MM }, { id: 'wall-top' }),
    createWall({ x: 0, y: 0 }, { x: 0, y: HEIGHT_MM }, { id: 'wall-left' }),
    createWall({ x: rightX, y: 0 }, { x: rightX, y: HEIGHT_MM }, { id: 'wall-right' }),
    createWall(
      { x: PARTITION_X_MM, y: 0 },
      { x: PARTITION_X_MM, y: HEIGHT_MM },
      { id: 'wall-partition' },
    ),
  ]
}

// Widens only the right room: the three walls around it are replaced, the left wall and the
// partition keep their references, so the left room's slab and group are reused.
function widenedWalls(walls: Wall[]): Wall[] {
  const widened = partitionedWalls(WIDENED_RIGHT_MM)
  return walls.map((wall) =>
    WIDENED_WALL_IDS.includes(wall.id) ? (widened.find((w) => w.id === wall.id) ?? wall) : wall,
  )
}

function projectWith(floor: Floor): Project {
  const base = createEmptyProject({
    name: 'Dispose',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  return { ...base, floors: [floor] }
}

function maxX(room: RoomSceneNode): number {
  return Math.max(...room.polygon.map((point) => point.x))
}

function groundOf(framed: FramedScene): Object3D {
  const ground = framed.root.children.find(isGroundPlane)
  if (ground === undefined) {
    throw new Error('expected the framed scene to seat a ground plane')
  }
  return ground
}

interface RoomEdit {
  reconciler: ReturnType<typeof createFramedSceneReconciler>
  movedOld: ResourceTracker
  keptOld: ResourceTracker
  secondFloor: ResourceTracker
  latest: FramedScene
}

// Builds a two-room floor, then widens the right room so the left room's group is reused,
// tracking the old right room, the reused left room, and everything the new floor draws.
function editOneRoom(): RoomEdit {
  const derive = createSceneGraphDeriver()
  const reconciler = createFramedSceneReconciler()
  const paint = emptyPaint()
  const walls = partitionedWalls(RIGHT_MM)
  const floor = createFloor('Ground', { id: FLOOR_ID, walls })
  const firstGraph = sceneGraphForFloor(derive(projectWith(floor)), FLOOR_ID)
  const first = reconciler.reconcile(firstGraph, paint)
  const [roomA, roomB] = firstGraph.rooms
  if (roomA === undefined || roomB === undefined) {
    throw new Error('expected the partitioned floor to derive two rooms')
  }
  const moved = maxX(roomA) >= maxX(roomB) ? roomA : roomB
  const kept = moved === roomA ? roomB : roomA
  const movedFirstGroup = findByEntityId(first.root, moved.id)
  const keptFirstGroup = findByEntityId(first.root, kept.id)
  if (movedFirstGroup === null || keptFirstGroup === null) {
    throw new Error('expected both room groups in the first build')
  }
  const movedOld = trackResources(movedFirstGroup)
  const keptOld = trackResources(keptFirstGroup)
  const edited: Floor = { ...floor, walls: widenedWalls(walls) }
  const secondGraph = sceneGraphForFloor(derive(projectWith(edited)), FLOOR_ID)
  const second = reconciler.reconcile(secondGraph, paint)
  // The edit rebuilt the right room and reused the left room's group, reparenting it.
  expect(findByEntityId(second.root, moved.id)).not.toBe(movedFirstGroup)
  expect(findByEntityId(second.root, kept.id)).toBe(keptFirstGroup)
  const secondFloor = trackResources(findByEntityId(second.root, FLOOR_NODE_ID))
  return { reconciler, movedOld, keptOld, secondFloor, latest: second }
}

describe('createFramedSceneReconciler retirement of replaced builds', () => {
  it('frees the geometry of a rebuilt room only when releaseRetired runs', () => {
    const { reconciler, movedOld, keptOld, latest } = editOneRoom()

    // Reconciling is part of render, so it frees nothing yet.
    expect(movedOld.geometries().length).toBeGreaterThan(0)
    expect(liveOf(movedOld)).toBe(movedOld.all().length)

    reconciler.releaseRetired(latest)

    // The rebuilt room's own geometry is freed once. The reused room's is untouched.
    expect(movedOld.geometries().map((entry) => entry.disposeCount)).toEqual(
      movedOld.geometries().map(() => 1),
    )
    expect(liveOf(keptOld)).toBe(keptOld.all().length)
  })

  it('keeps the reused groups and the provider materials they draw with live after release', () => {
    const { reconciler, secondFloor, latest } = editOneRoom()

    reconciler.releaseRetired(latest)

    // Every geometry and material the new floor draws, wall, reused room, and the shared
    // provider materials among them, is still live: a disposed material on a live floor
    // would be re-uploaded every frame.
    expectNoneDisposed(secondFloor)
    expect(secondFloor.materials().length).toBeGreaterThan(0)
  })

  it('retires the whole prior build and its provider when a paint edit rebuilds the floor', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const floor = createFloor('Ground', { id: FLOOR_ID, walls: partitionedWalls(RIGHT_MM) })
    const graph = sceneGraphForFloor(derive(projectWith(floor)), FLOOR_ID)
    const first = reconciler.reconcile(graph, emptyPaint())
    const firstFloor = trackResources(findByEntityId(first.root, FLOOR_NODE_ID))

    // A new paint reference rebuilds the floor whole, with a new material provider.
    const second = reconciler.reconcile(graph, emptyPaint())
    const secondFloor = trackResources(findByEntityId(second.root, FLOOR_NODE_ID))

    expect(sharedResources(firstFloor, secondFloor)).toEqual([])
    reconciler.releaseRetired(second)

    // Every old geometry and every old provider material is freed exactly once.
    expectEachDisposedOnce(firstFloor)
    expect(firstFloor.materials().length).toBeGreaterThan(0)
    expectNoneDisposed(secondFloor)
  })
})

const groundNode = (): SceneNode => ({
  id: FLOOR_NODE_ID,
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

const upperNode = (): SceneNode => ({
  id: `${FLOOR_NODE_PREFIX}u`,
  kind: 'floor',
  name: 'Upper',
  elevation: UPPER_ELEVATION_MM,
})

function floorWall(floorId: string): SceneGraph['walls'][number] {
  return {
    id: `wall:${floorId}1`,
    kind: 'wall',
    floorId,
    start: { x: 0, y: 0 },
    end: { x: WALL_LENGTH_MM, y: 0 },
    thickness: WALL_THICKNESS_MM,
    height: WALL_HEIGHT_MM,
  }
}

function graphOf(nodes: SceneNode[], floorIds: string[]): SceneGraph {
  return {
    nodes,
    walls: floorIds.map(floorWall),
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

describe('createFramedSceneReconciler retirement of replaced scenes', () => {
  it('retires an evicted scene ground plane but not the floors another scene now holds', () => {
    const reconciler = createFramedSceneReconciler()
    const ground = groundNode()
    const paint = emptyPaint()

    const active = reconciler.reconcile(graphOf([ground], [FLOOR_ID]), paint)
    const activeFloor = trackResources(findByEntityId(active.root, FLOOR_NODE_ID))
    const activeGround = trackResources(groundOf(active))

    // The whole-building scene reuses the ground floor's build, which evicts the active scene.
    const whole = reconciler.reconcile(graphOf([ground, upperNode()], [FLOOR_ID, 'u']), paint)
    const wholeGround = trackResources(groundOf(whole))
    // The ground floor's sub-groups moved into the whole-building scene's floor group.
    const wholeFloor = trackResources(findByEntityId(whole.root, FLOOR_NODE_ID))
    expect(sharedResources(activeFloor, wholeFloor).length).toBeGreaterThan(0)

    reconciler.releaseRetired(whole)

    expectEachDisposedOnce(activeGround)
    expectNoneDisposed(activeFloor)
    expectNoneDisposed(wholeGround)
  })

  it('retires a superseded empty-graph scene and keeps the current one', () => {
    const reconciler = createFramedSceneReconciler()
    const empty = graphOf([], [])

    const first = reconciler.reconcile(empty, emptyPaint())
    const firstTree = trackResources(first.root)
    const second = reconciler.reconcile(empty, emptyPaint())
    const secondTree = trackResources(second.root)

    expect(second).not.toBe(first)
    expectNoneDisposed(firstTree)

    reconciler.releaseRetired(second)

    expectEachDisposedOnce(firstTree)
    expectNoneDisposed(secondTree)
  })
})
