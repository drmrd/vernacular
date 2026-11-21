import { describe, it, expect } from 'vitest'
import {
  FLOOR_NODE_PREFIX,
  WALL_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createSceneGraphDeriver,
  sceneGraphForFloor,
} from '../../core'
import type {
  Floor,
  FurnitureInstance,
  Project,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
} from '../../core'
import { isGroundPlane } from '../../engine'
import { findByEntityId } from '../../engine/testing'
import type { Object3D } from '../../engine/testing'
import {
  expectEachDisposedOnce,
  expectEveryGeometryDisposedOnce,
  expectNoneDisposed,
  sharedResources,
  trackResources,
} from './dispose-tracking-test-support'
import {
  RIGHT_MM,
  WIDENED_RIGHT_MM,
  partitionedWalls,
  widenedWalls,
} from './partitioned-floor-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import type { FramedScene } from './framed-scene'

// Guards on the other side of the retirement rules: which resources releaseRetired() must leave
// alone, and which dropped scenes it must free exactly once. Like the sibling suite, these count
// real 'dispose' events on real built scenes.

const FLOOR_ID = 'g'
const FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${FLOOR_ID}`
const UPPER_FLOOR_ID = 'u'
const UPPER_FLOOR_NODE_ID = `${FLOOR_NODE_PREFIX}${UPPER_FLOOR_ID}`
const UPPER_ELEVATION_MM = 3000
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400
const CHAIR_ID = 'chair-moved'
const CHAIR_SIZE_MM = 500
const CHAIR_HEIGHT_MM = 900
const CHAIR_X_MM = 1000
const CHAIR_MOVED_X_MM = 1500
const CHAIR_Y_MM = 1000

const emptyPaint = (): Record<string, never> => ({})

function chairAt(x: number): FurnitureInstance {
  return createFurnitureInstance({
    id: CHAIR_ID,
    assetRef: { scope: 'user', contentHash: 'c' },
    position: { x, y: CHAIR_Y_MM },
    footprint: { width: CHAIR_SIZE_MM, depth: CHAIR_SIZE_MM },
    height: CHAIR_HEIGHT_MM,
  })
}

function projectWith(floor: Floor): Project {
  const base = createEmptyProject({
    name: 'Dispose guards',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  return { ...base, floors: [floor] }
}

function activeFloorGraph(derive: (project: Project) => SceneGraph, floor: Floor): SceneGraph {
  return sceneGraphForFloor(derive(projectWith(floor)), FLOOR_ID)
}

function groupOf(framed: FramedScene, entityId: string): Object3D {
  const group = findByEntityId(framed.root, entityId)
  if (group === null) {
    throw new Error(`expected the scene to hold a group for ${entityId}`)
  }
  return group
}

function groundOf(framed: FramedScene): Object3D {
  const ground = framed.root.children.find(isGroundPlane)
  if (ground === undefined) {
    throw new Error('expected the framed scene to seat a ground plane')
  }
  return ground
}

describe('createFramedSceneReconciler releases only what a scene change dropped', () => {
  it('frees only the old furniture box when a move leaves every wall and room unchanged', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const walls = partitionedWalls(RIGHT_MM)
    const floor: Floor = {
      ...createFloor('Ground', { id: FLOOR_ID, walls }),
      furniture: [chairAt(CHAIR_X_MM)],
    }
    const firstGraph = activeFloorGraph(derive, floor)
    const first = reconciler.reconcile(firstGraph, paint)
    const unchangedIds = [
      ...walls.map((wall) => `${WALL_NODE_PREFIX}${wall.id}`),
      ...firstGraph.rooms.map((room) => room.id),
    ]
    const unchangedFirstGroups = unchangedIds.map((id) => groupOf(first, id))
    const unchanged = unchangedFirstGroups.map((group) => trackResources(group))
    const chairFirstGroup = groupOf(first, CHAIR_ID)
    const chairOld = trackResources(chairFirstGroup)

    const moved: Floor = { ...floor, furniture: [chairAt(CHAIR_MOVED_X_MM)] }
    const second = reconciler.reconcile(activeFloorGraph(derive, moved), paint)
    const secondFloor = trackResources(groupOf(second, FLOOR_NODE_ID))
    // Only the chair was rebuilt: every wall and room group came through by reference.
    expect(groupOf(second, CHAIR_ID)).not.toBe(chairFirstGroup)
    unchangedIds.forEach((id, index) => {
      expect(groupOf(second, id)).toBe(unchangedFirstGroups[index])
    })
    expect(unchanged.length).toBeGreaterThan(walls.length)

    reconciler.releaseRetired(second)

    expectEveryGeometryDisposedOnce(chairOld)
    unchanged.forEach(expectNoneDisposed)
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
  id: UPPER_FLOOR_NODE_ID,
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

describe('createFramedSceneReconciler frees a dropped scene ground plane and empty scene', () => {
  it('frees only the whole-building ground plane when one floor replaces the whole building', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const whole = reconciler.reconcile(
      graphOf([groundNode(), upperNode()], [FLOOR_ID, UPPER_FLOOR_ID]),
      paint,
    )
    const wholeGround = trackResources(groundOf(whole))
    const wholeUpper = trackResources(groupOf(whole, UPPER_FLOOR_NODE_ID))

    const single = reconciler.reconcile(graphOf([groundNode()], [FLOOR_ID]), paint)
    const singleGround = trackResources(groundOf(single))
    const singleFloor = trackResources(groupOf(single, FLOOR_NODE_ID))
    expect(sharedResources(wholeGround, singleGround)).toEqual([])

    reconciler.releaseRetired(single)

    expectNoneDisposed(wholeUpper)
    expectNoneDisposed(singleGround)
    expectNoneDisposed(singleFloor)
    expectEachDisposedOnce(wholeGround)
  })

  it('frees the first scene ground plane once when a room edit replaces it under the same key', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const floor = createFloor('Ground', { id: FLOOR_ID, walls: partitionedWalls(RIGHT_MM) })

    const first = reconciler.reconcile(activeFloorGraph(derive, floor), paint)
    const firstGround = trackResources(groundOf(first))
    const edited: Floor = { ...floor, walls: partitionedWalls(WIDENED_RIGHT_MM) }
    const second = reconciler.reconcile(activeFloorGraph(derive, edited), paint)
    const secondGround = trackResources(groundOf(second))
    expect(second).not.toBe(first)
    expect(sharedResources(firstGround, secondGround)).toEqual([])

    reconciler.releaseRetired(second)
    reconciler.releaseRetired(second)

    expectEachDisposedOnce(firstGround)
    expectNoneDisposed(secondGround)
  })

  it('frees the empty-graph scene once when a one-floor scene replaces it', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const empty = reconciler.reconcile(graphOf([], []), paint)
    const emptyTree = trackResources(empty.root)
    const floor = reconciler.reconcile(graphOf([groundNode()], [FLOOR_ID]), paint)
    const floorTree = trackResources(floor.root)
    expect(sharedResources(emptyTree, floorTree)).toEqual([])
    expectNoneDisposed(emptyTree)

    reconciler.releaseRetired(floor)
    reconciler.releaseRetired(floor)

    expectEachDisposedOnce(emptyTree)
    expectNoneDisposed(floorTree)
  })
})

function rightmostRoom(graph: SceneGraph): RoomSceneNode {
  const [first, ...rest] = graph.rooms
  if (first === undefined) {
    throw new Error('expected the partitioned floor to derive rooms')
  }
  const maxX = (room: RoomSceneNode): number => Math.max(...room.polygon.map((point) => point.x))
  return rest.reduce((best, room) => (maxX(room) > maxX(best) ? room : best), first)
}

describe('createFramedSceneReconciler releases only for the scene the latest reconcile returned', () => {
  it('frees nothing for the scene from before an edit and frees the old room once for the edit scene', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const walls = partitionedWalls(RIGHT_MM)
    const floor = createFloor('Ground', { id: FLOOR_ID, walls })
    const firstGraph = activeFloorGraph(derive, floor)
    const first = reconciler.reconcile(firstGraph, paint)
    const rebuiltRoomId = rightmostRoom(firstGraph).id
    const oldRoom = trackResources(groupOf(first, rebuiltRoomId))
    const edited: Floor = { ...floor, walls: widenedWalls(walls) }
    const second = reconciler.reconcile(activeFloorGraph(derive, edited), paint)
    const liveFloor = trackResources(groupOf(second, FLOOR_NODE_ID))
    expect(groupOf(second, rebuiltRoomId)).not.toBe(groupOf(first, rebuiltRoomId))
    expect(oldRoom.geometries().length).toBeGreaterThan(0)

    reconciler.releaseRetired(first)

    expectNoneDisposed(oldRoom)

    reconciler.releaseRetired(second)

    expectEveryGeometryDisposedOnce(oldRoom)
    expectNoneDisposed(liveFloor)
  })
})
