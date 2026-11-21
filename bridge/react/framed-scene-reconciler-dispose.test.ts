import { describe, it, expect } from 'vitest'
import { createFloor, createSceneGraphDeriver, sceneGraphForFloor } from '../../core'
import type { Floor } from '../../core'
import { findByEntityId } from '../../engine/testing'
import {
  expectEachDisposedOnce,
  expectEveryGeometryDisposedOnce,
  expectNoneDisposed,
  liveOf,
  sharedResources,
  trackResources,
  type ResourceTracker,
} from './dispose-tracking-test-support'
import { RIGHT_MM, partitionedWalls, widenedWalls } from './partitioned-floor-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import {
  FLOOR_ID,
  FLOOR_NODE_ID,
  UPPER_FLOOR_ID,
  graphOf,
  groundNode,
  groundOf,
  projectWith,
  rightmostRoom,
  upperNode,
} from './framed-scene-reconciler-dispose-test-support'
import type { FramedScene } from './framed-scene'

// These tests count real 'dispose' events on the geometries and materials of real built scenes.
// The reconciler must queue every tree, ground plane, and provider it drops, and free them only
// when releaseRetired() runs (after commit), never while a live scene still draws with them.

const emptyPaint = (): Record<string, never> => ({})

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
  const moved = rightmostRoom(firstGraph)
  const kept = firstGraph.rooms.find((room) => room !== moved)
  if (kept === undefined) {
    throw new Error('expected the partitioned floor to derive two rooms')
  }
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
    expectEveryGeometryDisposedOnce(movedOld)
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

describe('createFramedSceneReconciler retirement of replaced scenes', () => {
  it('retires an evicted scene ground plane but not the floors another scene now holds', () => {
    const reconciler = createFramedSceneReconciler()
    const ground = groundNode()
    const paint = emptyPaint()

    const active = reconciler.reconcile(graphOf([ground], [FLOOR_ID]), paint)
    const activeFloor = trackResources(findByEntityId(active.root, FLOOR_NODE_ID))
    const activeGround = trackResources(groundOf(active))

    // The whole-building scene reuses the ground floor's build, which evicts the active scene.
    const whole = reconciler.reconcile(
      graphOf([ground, upperNode()], [FLOOR_ID, UPPER_FLOOR_ID]),
      paint,
    )
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
