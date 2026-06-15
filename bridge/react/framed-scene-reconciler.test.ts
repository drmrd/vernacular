import { describe, it, expect } from 'vitest'
import type {
  Floor,
  Opening,
  Project,
  RoomSceneNode,
  SceneGraph,
  SceneNode,
  SurfaceTreatment,
  Wall,
} from '../../core'
import {
  OPENING_NODE_PREFIX,
  createEmptyProject,
  createFloor,
  createOpening,
  createSceneGraphDeriver,
  createWall,
  sceneGraphForFloor,
} from '../../core'
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
    }

    const framed = reconciler.reconcile(empty, emptyPaint())

    expect(framed.root).toBeDefined()
    expect(Number.isFinite(framed.pose.near)).toBe(true)
    expect(Number.isFinite(framed.pose.far)).toBe(true)
  })
})

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
})
