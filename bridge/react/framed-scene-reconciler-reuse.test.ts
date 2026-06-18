import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

function chairAt(x: number, id: string): FurnitureInstance {
  return createFurnitureInstance({
    id,
    assetRef: { scope: 'user', contentHash: 'c' },
    position: { x, y: CHAIR_Y_MM },
    footprint: { width: CHAIR_DIMENSION_MM, depth: CHAIR_DIMENSION_MM },
    height: CHAIR_HEIGHT_MM,
  })
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
})
