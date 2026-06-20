/* eslint-disable max-lines --
 * This file is an aggregate reconciler reuse/rebuild suite: one scenario per within-floor
 * entity kind plus the furniture-model build/swap cases, all sharing a single set of fixture
 * helpers. The behaviors belong together, so the per-file line cap is the wrong tool here.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import type {
  Floor,
  FurnitureInstance,
  Opening,
  Project,
  RoomSceneNode,
  SceneGraph,
  SurfaceTreatment,
  Wall,
} from '../../core'
import {
  FURNITURE_NODE_PREFIX,
  OPENING_NODE_PREFIX,
  WALL_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createOpening,
  createSceneGraphDeriver,
  createWall,
  sceneGraphForFloor,
} from '../../core'
import { parseFurnitureModel } from '../../engine'
import { findByEntityId } from '../../engine/testing'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const CUBE_GLB = resolve(dirname(fileURLToPath(import.meta.url)), '../../e2e/fixtures/cube.glb')

const emptyPaint = (): Record<string, SurfaceTreatment> => ({})

const REUSE_FLOOR_ID = 'g'
const ENCLOSURE_HEIGHT_MM = 3000
const ENCLOSURE_RIGHT_MM = 6000
const ENCLOSURE_WIDENED_RIGHT_MM = 9000
const PARTITION_X_MM = 3000
const SINGLE_ROOM_WIDTH_MM = 4000
const DOOR_POSITION_MM = 2000
const DOOR_WIDTH_MM = 900
const WIDENED_DOOR_WIDTH_MM = 1200

const BOTTOM_WALL_ID = 'wall-bottom'
const TOP_WALL_ID = 'wall-top'
const LEFT_WALL_ID = 'wall-left'
const RIGHT_WALL_ID = 'wall-right'
const PARTITION_WALL_ID = 'wall-partition'
const DOOR_OPENING_ID = 'opening-door'
const BOTTOM_DOOR_OPENING_ID = 'opening-door-bottom'
const TOP_DOOR_OPENING_ID = 'opening-door-top'

const EDITED_FURNITURE_ID = 'furniture-edited'
const PRESERVED_FURNITURE_ID = 'furniture-preserved'
const CHAIR_DIMENSION_MM = 500
const CHAIR_HEIGHT_MM = 900
const EDITED_CHAIR_X_MM = 1000
const EDITED_CHAIR_MOVED_X_MM = 1500
const PRESERVED_CHAIR_X_MM = 2500
const CHAIR_Y_MM = 1000

// A rectangle split by a partition wall at PARTITION_X_MM into a left cell and a
// right cell, so the floor derives exactly two rooms. The right wall sits at
// `rightX`, so widening it reshapes only the right (partition-to-right) room and
// leaves the left (left-to-partition) room untouched.
function partitionedWalls(rightX: number): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: rightX, y: 0 }, { id: BOTTOM_WALL_ID }),
    createWall(
      { x: 0, y: ENCLOSURE_HEIGHT_MM },
      { x: rightX, y: ENCLOSURE_HEIGHT_MM },
      {
        id: TOP_WALL_ID,
      },
    ),
    createWall({ x: 0, y: 0 }, { x: 0, y: ENCLOSURE_HEIGHT_MM }, { id: LEFT_WALL_ID }),
    createWall({ x: rightX, y: 0 }, { x: rightX, y: ENCLOSURE_HEIGHT_MM }, { id: RIGHT_WALL_ID }),
    createWall(
      { x: PARTITION_X_MM, y: 0 },
      { x: PARTITION_X_MM, y: ENCLOSURE_HEIGHT_MM },
      {
        id: PARTITION_WALL_ID,
      },
    ),
  ]
}

function singleRoomWalls(): Wall[] {
  return [
    createWall({ x: 0, y: 0 }, { x: SINGLE_ROOM_WIDTH_MM, y: 0 }, { id: BOTTOM_WALL_ID }),
    createWall(
      { x: SINGLE_ROOM_WIDTH_MM, y: 0 },
      { x: SINGLE_ROOM_WIDTH_MM, y: ENCLOSURE_HEIGHT_MM },
      {
        id: RIGHT_WALL_ID,
      },
    ),
    createWall(
      { x: SINGLE_ROOM_WIDTH_MM, y: ENCLOSURE_HEIGHT_MM },
      { x: 0, y: ENCLOSURE_HEIGHT_MM },
      {
        id: TOP_WALL_ID,
      },
    ),
    createWall({ x: 0, y: ENCLOSURE_HEIGHT_MM }, { x: 0, y: 0 }, { id: LEFT_WALL_ID }),
  ]
}

function doorOn(hostWallId: string, width: number, id = DOOR_OPENING_ID): Opening {
  return createOpening({
    id,
    type: 'single-swing-door',
    hostWallId,
    position: DOOR_POSITION_MM,
    width,
  })
}

function chairAt(x: number, id: string, contentHash = 'c'): FurnitureInstance {
  return createFurnitureInstance({
    id,
    assetRef: { scope: 'user', contentHash },
    position: { x, y: CHAIR_Y_MM },
    footprint: { width: CHAIR_DIMENSION_MM, depth: CHAIR_DIMENSION_MM },
    height: CHAIR_HEIGHT_MM,
  })
}

function firstMeshMaterialName(group: THREE.Object3D): string {
  let mesh: THREE.Mesh | undefined
  group.traverse((object) => {
    if (mesh === undefined && object instanceof THREE.Mesh) {
      mesh = object
    }
  })
  if (mesh === undefined) {
    throw new Error('expected the furniture box group to carry a mesh')
  }
  const material = mesh.material
  return Array.isArray(material) ? (material[0]?.name ?? '') : material.name
}

function projectWith(floor: Floor): Project {
  const base = createEmptyProject({
    name: 'Reuse',
    units: 'metric',
    period: 'period',
    appVersion: '0',
  })
  return { ...base, floors: [floor] }
}

function activeFloorGraph(derive: (project: Project) => SceneGraph, project: Project): SceneGraph {
  return sceneGraphForFloor(derive(project), REUSE_FLOOR_ID)
}

function maxPolygonX(room: RoomSceneNode): number {
  return Math.max(...room.polygon.map((point) => point.x))
}

/* eslint-disable-next-line max-lines-per-function --
 * One reuse/rebuild scenario per within-floor entity kind (rooms, walls, openings,
 * furniture). The block grows by one `it` per node kind the reconciler reuses, so the
 * per-function cap is the wrong tool for this aggregate behavior suite.
 */
describe('createFramedSceneReconciler within-floor reuse', () => {
  it('reuses an unchanged room group when a wall edit reshapes only another room', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const walls = partitionedWalls(ENCLOSURE_RIGHT_MM)
    const floor = createFloor('Ground', { id: REUSE_FLOOR_ID, walls })
    const firstGraph = activeFloorGraph(derive, projectWith(floor))
    const first = reconciler.reconcile(firstGraph, paint)

    expect(firstGraph.rooms).toHaveLength(2)
    const [roomA, roomB] = firstGraph.rooms
    if (roomA === undefined || roomB === undefined) {
      throw new Error('expected the partitioned floor to derive two rooms')
    }
    // The room adjacent to the right wall is the one with the larger x-extent; it
    // is the room the wall move reshapes. The other is the untouched kept room.
    const moved = maxPolygonX(roomA) >= maxPolygonX(roomB) ? roomA : roomB
    const kept = moved === roomA ? roomB : roomA
    const movedRoomId = moved.id
    const keptRoomId = kept.id

    // Capture the first build's room groups before the second reconcile: reusing a
    // group reparents it into the new root, which removes it from this one.
    const keptFirstGroup = findByEntityId(first.root, keptRoomId)
    const movedFirstGroup = findByEntityId(first.root, movedRoomId)
    expect(keptFirstGroup).not.toBeNull()
    expect(movedFirstGroup).not.toBeNull()

    // Immutably move only the right exterior wall, which bounds the moved room
    // alone. The partition and the kept room's walls keep their references.
    const movedWalls = walls.map((wall) =>
      wall.id === RIGHT_WALL_ID
        ? createWall(
            { x: ENCLOSURE_WIDENED_RIGHT_MM, y: 0 },
            { x: ENCLOSURE_WIDENED_RIGHT_MM, y: ENCLOSURE_HEIGHT_MM },
            { id: RIGHT_WALL_ID },
          )
        : wall,
    )
    const editedFloor: Floor = { ...floor, walls: movedWalls }
    const secondGraph = activeFloorGraph(derive, projectWith(editedFloor))
    const second = reconciler.reconcile(secondGraph, paint)

    expect(findByEntityId(second.root, keptRoomId)).toBe(keptFirstGroup)
    expect(findByEntityId(second.root, movedRoomId)).not.toBe(movedFirstGroup)
  })

  it('reuses every room group when an opening edit keeps the walls', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const walls = singleRoomWalls()
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls }),
      openings: [doorOn(BOTTOM_WALL_ID, DOOR_WIDTH_MM)],
    }
    const firstGraph = activeFloorGraph(derive, projectWith(floor))
    const first = reconciler.reconcile(firstGraph, paint)

    expect(firstGraph.rooms).toHaveLength(1)
    const room = firstGraph.rooms[0]
    if (room === undefined) {
      throw new Error('expected the single enclosure to derive one room')
    }
    const roomId = room.id
    // Capture before the second reconcile: a reused group reparents into the new root.
    const roomFirstGroup = findByEntityId(first.root, roomId)
    expect(roomFirstGroup).not.toBeNull()

    // Edit only the opening (a wider door), keeping the same walls array, so the
    // rooms are unchanged and every room group should be reused.
    const editedFloor: Floor = {
      ...floor,
      openings: [doorOn(BOTTOM_WALL_ID, WIDENED_DOOR_WIDTH_MM)],
    }
    const secondGraph = activeFloorGraph(derive, projectWith(editedFloor))
    const second = reconciler.reconcile(secondGraph, paint)

    expect(findByEntityId(second.root, roomId)).toBe(roomFirstGroup)
  })

  it('reuses an unchanged opening group when another opening is edited', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const walls = singleRoomWalls()
    // Two doors on two different walls, with distinct ids: the bottom door is the
    // one we edit; the top door is preserved by reference across the edit.
    const editedDoor = doorOn(BOTTOM_WALL_ID, DOOR_WIDTH_MM, BOTTOM_DOOR_OPENING_ID)
    const preservedDoor = doorOn(TOP_WALL_ID, DOOR_WIDTH_MM, TOP_DOOR_OPENING_ID)
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls }),
      openings: [editedDoor, preservedDoor],
    }
    const firstGraph = activeFloorGraph(derive, projectWith(floor))
    const first = reconciler.reconcile(firstGraph, paint)

    const editedOpeningEntityId = `${OPENING_NODE_PREFIX}${BOTTOM_DOOR_OPENING_ID}`
    const preservedOpeningEntityId = `${OPENING_NODE_PREFIX}${TOP_DOOR_OPENING_ID}`
    // Capture both opening groups before the second reconcile: a reused group
    // reparents into the new root, which removes it from this one.
    const editedFirstGroup = findByEntityId(first.root, editedOpeningEntityId)
    const preservedFirstGroup = findByEntityId(first.root, preservedOpeningEntityId)
    expect(editedFirstGroup).not.toBeNull()
    expect(preservedFirstGroup).not.toBeNull()

    // Edit only the bottom door (a wider leaf, a fresh Opening object) while keeping
    // the preserved door as the exact same object reference, so its derived
    // OpeningSceneNode reference is unchanged and its group should be reused.
    const editedFloor: Floor = {
      ...floor,
      openings: [
        doorOn(BOTTOM_WALL_ID, WIDENED_DOOR_WIDTH_MM, BOTTOM_DOOR_OPENING_ID),
        preservedDoor,
      ],
    }
    const secondGraph = activeFloorGraph(derive, projectWith(editedFloor))
    const second = reconciler.reconcile(secondGraph, paint)

    expect(findByEntityId(second.root, editedOpeningEntityId)).not.toBe(editedFirstGroup)
    expect(findByEntityId(second.root, preservedOpeningEntityId)).toBe(preservedFirstGroup)
  })

  it('reuses an unchanged furniture box group when another furniture piece is edited', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const walls = singleRoomWalls()
    // Two chairs with distinct ids: the edited chair is the one we move; the
    // preserved chair is kept by reference across the edit.
    const editedChair = chairAt(EDITED_CHAIR_X_MM, EDITED_FURNITURE_ID)
    const preservedChair = chairAt(PRESERVED_CHAIR_X_MM, PRESERVED_FURNITURE_ID)
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls }),
      furniture: [editedChair, preservedChair],
    }
    const firstGraph = activeFloorGraph(derive, projectWith(floor))
    const first = reconciler.reconcile(firstGraph, paint)

    // The furniture box group carries the raw instance id (no prefix) on its
    // userData.entityId. Capture both groups before the second reconcile: a reused
    // group reparents into the new root, which removes it from this one.
    const editedFirstGroup = findByEntityId(first.root, editedChair.id)
    const preservedFirstGroup = findByEntityId(first.root, preservedChair.id)
    expect(editedFirstGroup).not.toBeNull()
    expect(preservedFirstGroup).not.toBeNull()

    // Edit only the edited chair (a fresh FurnitureInstance at a new position carrying
    // the same id) while keeping the preserved chair as the exact same object
    // reference, so its derived FurnitureSceneNode reference is unchanged and its box
    // group should be reused.
    const editedReplacement = chairAt(EDITED_CHAIR_MOVED_X_MM, EDITED_FURNITURE_ID)
    const editedFloor: Floor = {
      ...floor,
      furniture: [editedReplacement, preservedChair],
    }
    const secondGraph = activeFloorGraph(derive, projectWith(editedFloor))
    const second = reconciler.reconcile(secondGraph, paint)

    expect(findByEntityId(second.root, editedChair.id)).not.toBe(editedFirstGroup)
    expect(findByEntityId(second.root, preservedChair.id)).toBe(preservedFirstGroup)
  })

  it('reuses the wall group and near-wall targets when an edit touches no wall or opening', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const walls = singleRoomWalls()
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls }),
      openings: [doorOn(BOTTOM_WALL_ID, DOOR_WIDTH_MM)],
    }
    const first = reconciler.reconcile(activeFloorGraph(derive, projectWith(floor)), paint)

    // Capture a wall mesh from the first build before editing: reusing the wall
    // group reparents it into the new root, which removes it from this one.
    // nearWallTargets is a plain array on the FramedScene and is not reparented.
    const wallMeshFirst = findByEntityId(first.root, WALL_NODE_PREFIX + BOTTOM_WALL_ID)
    expect(wallMeshFirst).not.toBeNull()

    // Rename the floor: a new Floor object that keeps the same walls and openings
    // arrays (and their element references), so no wall and no opening changes.
    const editedFloor: Floor = { ...floor, name: 'Renamed' }
    const second = reconciler.reconcile(activeFloorGraph(derive, projectWith(editedFloor)), paint)

    // The rename produces a new floor node, so the reconciler takes its rebuild
    // path rather than the unchanged-floor fast path.
    expect(second).not.toBe(first)
    // The whole wall sub-group (and therefore its meshes) is reused, as is the
    // wall-owned nearWallTargets array.
    expect(findByEntityId(second.root, WALL_NODE_PREFIX + BOTTOM_WALL_ID)).toBe(wallMeshFirst)
    expect(second.nearWallTargets).toBe(first.nearWallTargets)
  })
})

/* eslint-disable-next-line max-lines-per-function --
 * One scenario per furniture model-cache status: a ready mesh, the failed box, the
 * loading box, and the plain box, plus the loading-to-failed swap. The block grows by
 * one `it` per status the reconciler maps, so the per-function line cap is the wrong
 * tool for this aggregate behavior suite.
 */
describe('createFramedSceneReconciler furniture model', () => {
  it('builds a mesh sub-group for a ready model and a box otherwise', async () => {
    const derive = createSceneGraphDeriver()
    const chair = chairAt(0, 'chair-1')
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls: singleRoomWalls() }),
      furniture: [chair],
    }
    const graph = activeFloorGraph(derive, projectWith(floor))
    const node = graph.furniture[0]
    if (node === undefined) throw new Error('expected one furniture node')
    const template = await parseFurnitureModel(new Uint8Array(readFileSync(CUBE_GLB)))
    const models = {
      get: (hash: string) =>
        hash === node.assetRef.contentHash ? { status: 'ready' as const, template } : undefined,
    }

    const meshBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint(), models)
    const boxBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint())

    const meshGroup = findByEntityId(meshBuild.root, chair.id)
    const boxGroup = findByEntityId(boxBuild.root, chair.id)
    expect(meshGroup).not.toBeNull()
    expect(boxGroup).not.toBeNull()
    // The massing box carries an edge overlay (LineSegments); the real-model sub-group does not.
    expect(meshGroup?.getObjectByProperty('isLineSegments', true)).toBeUndefined()
    expect(boxGroup?.getObjectByProperty('isLineSegments', true)).toBeDefined()
  })

  it('builds the furnitureFailed box for a failed model entry and the plain box otherwise', () => {
    const derive = createSceneGraphDeriver()
    const chair = chairAt(0, 'chair-failed')
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls: singleRoomWalls() }),
      furniture: [chair],
    }
    const graph = activeFloorGraph(derive, projectWith(floor))
    const node = graph.furniture[0]
    if (node === undefined) throw new Error('expected one furniture node')
    const failedModels = {
      get: (hash: string) =>
        hash === node.assetRef.contentHash ? { status: 'failed' as const } : undefined,
    }

    const failedBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint(), failedModels)
    const plainBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint())

    const failedGroup = findByEntityId(failedBuild.root, chair.id)
    const plainGroup = findByEntityId(plainBuild.root, chair.id)
    expect(failedGroup).not.toBeNull()
    expect(plainGroup).not.toBeNull()
    // The failed stand-in is still a massing box, so it keeps the edge overlay (LineSegments).
    expect(failedGroup?.getObjectByProperty('isLineSegments', true)).toBeDefined()
    // The failed box mesh carries the distinct furnitureFailed material; the box-only
    // (no-entry/loading) fall-through keeps the plain furniture material.
    if (failedGroup === null || plainGroup === null) {
      throw new Error('expected both furniture box groups to exist')
    }
    expect(firstMeshMaterialName(failedGroup)).toBe('furnitureFailed')
    expect(firstMeshMaterialName(plainGroup)).toBe('furniture')
  })

  it('builds the furnitureLoading box for a loading model entry and the plain box otherwise', () => {
    const derive = createSceneGraphDeriver()
    const chair = chairAt(0, 'chair-loading')
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls: singleRoomWalls() }),
      furniture: [chair],
    }
    const graph = activeFloorGraph(derive, projectWith(floor))
    const node = graph.furniture[0]
    if (node === undefined) throw new Error('expected one furniture node')
    const loadingModels = {
      get: (hash: string) =>
        hash === node.assetRef.contentHash ? { status: 'loading' as const } : undefined,
    }

    const loadingBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint(), loadingModels)
    const plainBuild = createFramedSceneReconciler().reconcile(graph, emptyPaint())

    const loadingGroup = findByEntityId(loadingBuild.root, chair.id)
    const plainGroup = findByEntityId(plainBuild.root, chair.id)
    expect(loadingGroup).not.toBeNull()
    expect(plainGroup).not.toBeNull()
    // The loading stand-in is still a massing box, so it keeps the edge overlay (LineSegments).
    expect(loadingGroup?.getObjectByProperty('isLineSegments', true)).toBeDefined()
    // The loading box mesh carries the distinct furnitureLoading material; the box-only
    // (no-entry) fall-through keeps the plain furniture material.
    if (loadingGroup === null || plainGroup === null) {
      throw new Error('expected both furniture box groups to exist')
    }
    expect(firstMeshMaterialName(loadingGroup)).toBe('furnitureLoading')
    expect(firstMeshMaterialName(plainGroup)).toBe('furniture')
  })

  it('rebuilds only the piece whose model became ready', async () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const chairA = chairAt(EDITED_CHAIR_X_MM, 'chair-a', 'hash-a')
    const chairB = chairAt(PRESERVED_CHAIR_X_MM, 'chair-b', 'hash-b')
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls: singleRoomWalls() }),
      furniture: [chairA, chairB],
    }
    // Build the graph ONCE and reuse it (same node refs) across both reconciles, so the only
    // thing that changes between calls is the model readiness.
    const graph = activeFloorGraph(derive, projectWith(floor))
    const nodeA = graph.furniture.find((node) => node.id === `${FURNITURE_NODE_PREFIX}${chairA.id}`)
    if (nodeA === undefined) throw new Error('expected chair A to derive a furniture node')
    const template = await parseFurnitureModel(new Uint8Array(readFileSync(CUBE_GLB)))
    const noModels = { get: () => undefined }
    const aReadyModels = {
      get: (hash: string) =>
        hash === nodeA.assetRef.contentHash ? { status: 'ready' as const, template } : undefined,
    }

    const first = reconciler.reconcile(graph, paint, noModels)
    const aFirst = findByEntityId(first.root, chairA.id)
    const bFirst = findByEntityId(first.root, chairB.id)
    expect(aFirst).not.toBeNull()
    expect(bFirst).not.toBeNull()

    const second = reconciler.reconcile(graph, paint, aReadyModels)
    expect(findByEntityId(second.root, chairA.id)).not.toBe(aFirst) // A rebuilt as a mesh
    expect(findByEntityId(second.root, chairB.id)).toBe(bFirst) // B reused by identity
  })

  it('rebuilds only the piece whose model transitioned loading to failed', () => {
    const derive = createSceneGraphDeriver()
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const chairA = chairAt(EDITED_CHAIR_X_MM, 'chair-a', 'hash-a')
    const chairB = chairAt(PRESERVED_CHAIR_X_MM, 'chair-b', 'hash-b')
    const floor: Floor = {
      ...createFloor('Ground', { id: REUSE_FLOOR_ID, walls: singleRoomWalls() }),
      furniture: [chairA, chairB],
    }
    // Build the graph ONCE and reuse it (same node refs) across both reconciles, so the only
    // thing that changes between calls is chair A's model load status: still-loading (a plain
    // box) on the first reconcile, then failed (the distinct stand-in box) on the second.
    const graph = activeFloorGraph(derive, projectWith(floor))
    const nodeA = graph.furniture.find((node) => node.id === `${FURNITURE_NODE_PREFIX}${chairA.id}`)
    if (nodeA === undefined) throw new Error('expected chair A to derive a furniture node')
    const loadingModels = {
      get: (hash: string) =>
        hash === nodeA.assetRef.contentHash ? { status: 'loading' as const } : undefined,
    }
    const aFailedModels = {
      get: (hash: string) =>
        hash === nodeA.assetRef.contentHash ? { status: 'failed' as const } : undefined,
    }

    const first = reconciler.reconcile(graph, paint, loadingModels)
    const aFirst = findByEntityId(first.root, chairA.id)
    const bFirst = findByEntityId(first.root, chairB.id)
    expect(aFirst).not.toBeNull()
    expect(bFirst).not.toBeNull()

    const second = reconciler.reconcile(graph, paint, aFailedModels)
    const aSecond = findByEntityId(second.root, chairA.id)
    expect(aSecond).not.toBe(aFirst) // A rebuilt: the loading box is replaced by the failed box
    expect(findByEntityId(second.root, chairB.id)).toBe(bFirst) // B reused by identity
    // The rebuilt A box carries the distinct failed material, not the plain loading box's.
    if (aSecond === null) throw new Error('expected chair A to rebuild a furniture box group')
    expect(firstMeshMaterialName(aSecond)).toBe('furnitureFailed')
  })
})
