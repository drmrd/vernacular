import { describe, expect, it } from 'vitest'
import type { AssetReference } from '../model/asset-reference'
import {
  createEmptyProject,
  createFloor,
  createStair,
  createUnderlay,
  createWall,
  DEFAULT_WALL_THICKNESS_MM,
} from '../model/factories'
import type { Floor, Project, RoomOverride, Underlay } from '../model/types'
import { ROOM_ID_PREFIX, roomKey } from '../topology/rooms'
import {
  deriveRoomNodesForFloor,
  deriveSceneGraph,
  deriveUnderlayNode,
  deriveUnderlayNodesForFloor,
  deriveWallNode,
} from './scene-graph'

function projectWithFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    createFloor('Ground', { id: 'g', elevation: 0 }),
    createFloor('Upper', { id: 'u', elevation: 2800 }),
  ]
  return project
}

describe('deriveSceneGraph', () => {
  it('derives a stable node per floor', () => {
    const graph = deriveSceneGraph(projectWithFloors())

    expect(graph.nodes.map((node) => node.id)).toEqual(['floor:g', 'floor:u'])
    expect(graph.nodes.map((node) => node.kind)).toEqual(['floor', 'floor'])
    expect(graph.nodes.map((node) => node.name)).toEqual(['Ground', 'Upper'])
  })

  it('is a pure projection: equal input yields equal output', () => {
    const project = projectWithFloors()

    expect(deriveSceneGraph(project)).toEqual(deriveSceneGraph(project))
  })
})

describe('deriveSceneGraph stairs', () => {
  it('projects each stair into a stair node on its lower floor, recording the upper floor as its well', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [createFloor('Ground', { id: 'f1' }), createFloor('Upper', { id: 'f2' })]
    project.stairs = [createStair({ id: 's1', connection: { fromFloorId: 'f1', toFloorId: 'f2' } })]

    const graph = deriveSceneGraph(project)

    expect(graph.stairs).toHaveLength(1)
    expect(graph.stairs[0]).toMatchObject({
      kind: 'stair',
      floorId: 'f1',
      wellFloorId: 'f2',
      runType: 'straight',
    })
  })
})

describe('deriveSceneGraph walls', () => {
  it('derives a namespaced wall node per wall, carrying its floor id and geometry', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [createFloor('Ground', { id: 'g', elevation: 0, walls: [wall] })]

    const graph = deriveSceneGraph(project)

    expect(graph.walls).toHaveLength(1)
    expect(graph.walls[0]).toEqual({
      id: 'wall:w1',
      kind: 'wall',
      floorId: 'g',
      start: { x: 0, y: 0 },
      end: { x: 1000, y: 0 },
      thickness: wall.thickness,
    })
  })

  it('namespaces the wall node id under its source wall', () => {
    const floor = createFloor('Ground', { id: 'g' })
    const node = deriveWallNode(floor, createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'w9' }))

    expect(node.id).toBe('wall:w9')
    expect(node.floorId).toBe('g')
  })
})

describe('deriveSceneGraph rooms', () => {
  it('projects each room a floor encloses into a room node carrying its polygon and area', () => {
    const floor = createFloor('Ground', {
      id: 'g',
      walls: [
        createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }),
        createWall({ x: 4000, y: 0 }, { x: 4000, y: 3000 }),
        createWall({ x: 4000, y: 3000 }, { x: 0, y: 3000 }),
        createWall({ x: 0, y: 3000 }, { x: 0, y: 0 }),
      ],
    })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [floor]

    const graph = deriveSceneGraph(project)

    expect(graph.rooms).toHaveLength(1)
    const room = graph.rooms[0]
    if (room === undefined) {
      throw new Error('expected one room node')
    }
    expect(room).toMatchObject({
      kind: 'room',
      floorId: floor.id,
      area: (4000 - DEFAULT_WALL_THICKNESS_MM) * (3000 - DEFAULT_WALL_THICKNESS_MM),
    })
    expect(room.polygon).toHaveLength(4)
  })
})

const ROOM_WIDTH = 4000
const ROOM_HEIGHT = 3000
const CUSTOM_WIDTH = 2000
const CUSTOM_HEIGHT = 5000
const CUSTOM_AREA = CUSTOM_WIDTH * CUSTOM_HEIGHT

function oneRoomFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: ROOM_WIDTH, y: 0 }),
      createWall({ x: ROOM_WIDTH, y: 0 }, { x: ROOM_WIDTH, y: ROOM_HEIGHT }),
      createWall({ x: ROOM_WIDTH, y: ROOM_HEIGHT }, { x: 0, y: ROOM_HEIGHT }),
      createWall({ x: 0, y: ROOM_HEIGHT }, { x: 0, y: 0 }),
    ],
  })
}

function soleRoomNode(floor: Floor, overrides?: Readonly<Record<string, RoomOverride>>) {
  const nodes = deriveRoomNodesForFloor(floor, overrides)
  const node = nodes[0]
  if (node === undefined) {
    throw new Error('expected one room node')
  }
  return node
}

function overrideKeyFor(floor: Floor): string {
  const room = soleRoomNode(floor)
  return room.id.slice(ROOM_ID_PREFIX.length)
}

describe('deriveRoomNodesForFloor with overrides', () => {
  it('matches the slice-1 derivation and carries no name when given no overrides', () => {
    const floor = oneRoomFloor()

    const node = soleRoomNode(floor)

    expect(node).toMatchObject({
      kind: 'room',
      floorId: floor.id,
      area: (ROOM_WIDTH - DEFAULT_WALL_THICKNESS_MM) * (ROOM_HEIGHT - DEFAULT_WALL_THICKNESS_MM),
    })
    expect(node.polygon).toHaveLength(4)
    expect(node.name).toBeUndefined()
  })

  it('copies the clear (thickness-aware) polygon onto the room node', () => {
    const floor = oneRoomFloor()
    const inset = DEFAULT_WALL_THICKNESS_MM / 2

    const node = soleRoomNode(floor)

    expect(node.clearPolygon).toHaveLength(4)
    for (const corner of [
      { x: inset, y: inset },
      { x: ROOM_WIDTH - inset, y: inset },
      { x: ROOM_WIDTH - inset, y: ROOM_HEIGHT - inset },
      { x: inset, y: ROOM_HEIGHT - inset },
    ]) {
      expect(node.clearPolygon).toContainEqual(corner)
    }
  })

  it('keys correctly: the override key matches the derived room id', () => {
    const floor = oneRoomFloor()

    expect(roomKey({ wallIds: floor.walls.map((wall) => wall.id) })).toBeDefined()
    expect(soleRoomNode(floor).id).toBe(ROOM_ID_PREFIX + overrideKeyFor(floor))
  })

  it('sets the room node name from a name override, leaving polygon and area unchanged', () => {
    const floor = oneRoomFloor()
    const key = overrideKeyFor(floor)
    const baseline = soleRoomNode(floor)

    const node = soleRoomNode(floor, { [key]: { name: 'Parlor' } })

    expect(node.name).toBe('Parlor')
    expect(node.id).toBe(baseline.id)
    expect(node.polygon).toEqual(baseline.polygon)
    expect(node.area).toBe(baseline.area)
  })

  it('replaces the polygon and recomputes the area from a custom-polygon override', () => {
    const floor = oneRoomFloor()
    const key = overrideKeyFor(floor)
    const baseline = soleRoomNode(floor)
    const customPolygon = [
      { x: 0, y: 0 },
      { x: CUSTOM_WIDTH, y: 0 },
      { x: CUSTOM_WIDTH, y: CUSTOM_HEIGHT },
      { x: 0, y: CUSTOM_HEIGHT },
    ]

    const node = soleRoomNode(floor, { [key]: { customPolygon } })

    expect(node.id).toBe(baseline.id)
    expect(node.polygon).toEqual(customPolygon)
    expect(node.area).toBe(CUSTOM_AREA)
    expect(node.area).toBeGreaterThanOrEqual(0)
  })
})

const OUTER_LOOP_SIDE = 6000
const INNER_LOOP_NEAR = 2000
const INNER_LOOP_FAR = 4000
const INNER_LOOP_CORNERS = 4

function donutFloor(): Floor {
  return createFloor('Ground', {
    id: 'g',
    walls: [
      createWall({ x: 0, y: 0 }, { x: OUTER_LOOP_SIDE, y: 0 }, { id: 'outer-bottom' }),
      createWall(
        { x: OUTER_LOOP_SIDE, y: 0 },
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { id: 'outer-right' },
      ),
      createWall(
        { x: OUTER_LOOP_SIDE, y: OUTER_LOOP_SIDE },
        { x: 0, y: OUTER_LOOP_SIDE },
        { id: 'outer-top' },
      ),
      createWall({ x: 0, y: OUTER_LOOP_SIDE }, { x: 0, y: 0 }, { id: 'outer-left' }),
      createWall(
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_NEAR },
        { x: INNER_LOOP_FAR, y: INNER_LOOP_NEAR },
        { id: 'inner-bottom' },
      ),
      createWall(
        { x: INNER_LOOP_FAR, y: INNER_LOOP_NEAR },
        { x: INNER_LOOP_FAR, y: INNER_LOOP_FAR },
        { id: 'inner-right' },
      ),
      createWall(
        { x: INNER_LOOP_FAR, y: INNER_LOOP_FAR },
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_FAR },
        { id: 'inner-top' },
      ),
      createWall(
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_FAR },
        { x: INNER_LOOP_NEAR, y: INNER_LOOP_NEAR },
        { id: 'inner-left' },
      ),
    ],
  })
}

function largestAreaRoomNode(floor: Floor) {
  const nodes = deriveRoomNodesForFloor(floor)
  const container = nodes.reduce<(typeof nodes)[number] | undefined>((largest, node) => {
    if (largest === undefined || node.area > largest.area) {
      return node
    }
    return largest
  }, undefined)
  if (container === undefined) {
    throw new Error('expected at least one room node')
  }
  return container
}

describe('deriveRoomNodesForFloor with interior voids', () => {
  it('projects the inner loop as a single hole ring onto the container room node', () => {
    const container = largestAreaRoomNode(donutFloor())

    expect(container.holes).toHaveLength(1)
    expect(container.holes?.[0]).toHaveLength(INNER_LOOP_CORNERS)
  })

  it('omits the holes field for a floor with a single plain loop', () => {
    const node = soleRoomNode(oneRoomFloor())

    expect(node.holes).toBeUndefined()
  })
})

const UNDERLAY_IMAGE: AssetReference = { scope: 'project', contentHash: 'deadbeef' }
const UNDERLAY_WIDTH = 1024
const UNDERLAY_HEIGHT = 768

function underlayWithId(id: string): Underlay {
  return {
    ...createUnderlay({ image: UNDERLAY_IMAGE, width: UNDERLAY_WIDTH, height: UNDERLAY_HEIGHT }),
    id,
  }
}

function floorWithUnderlay(underlay: Underlay): Floor {
  return { ...createFloor('Ground', { id: 'g' }), underlays: [underlay] }
}

describe('deriveUnderlayNode', () => {
  it('namespaces the underlay node id under its source underlay and carries the floor id', () => {
    const underlay = underlayWithId('u1')
    const floor = createFloor('Ground', { id: 'g' })

    const node = deriveUnderlayNode(floor, underlay)

    expect(node.id).toBe('underlay:u1')
    expect(node.floorId).toBe('g')
  })

  it('projects the underlay into a node copying its source, dimensions, placement, and display fields', () => {
    const underlay = underlayWithId('u1')
    const floor = createFloor('Ground', { id: 'g' })

    const node = deriveUnderlayNode(floor, underlay)

    expect(node).toEqual({
      id: 'underlay:u1',
      kind: 'underlay',
      floorId: 'g',
      source: underlay.source,
      width: underlay.width,
      height: underlay.height,
      placement: underlay.placement,
      opacity: underlay.opacity,
      visible: underlay.visible,
    })
  })

  it('derives one node per underlay on a floor, each tagged with that floor id', () => {
    const floor = { ...createFloor('Ground', { id: 'g' }), underlays: [underlayWithId('u1')] }

    const nodes = deriveUnderlayNodesForFloor(floor)

    expect(nodes).toHaveLength(1)
    expect(nodes.map((node) => node.id)).toEqual(['underlay:u1'])
    expect(nodes.map((node) => node.floorId)).toEqual(['g'])
  })
})

describe('deriveSceneGraph underlays', () => {
  it('flat-maps each floor underlay into graph.underlays, tagged with its floor id', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [floorWithUnderlay(underlayWithId('u1'))]

    const graph = deriveSceneGraph(project)

    expect(graph.underlays).toHaveLength(1)
    expect(graph.underlays[0]).toEqual({
      id: 'underlay:u1',
      kind: 'underlay',
      floorId: 'g',
      source: { kind: 'raster', image: UNDERLAY_IMAGE },
      width: UNDERLAY_WIDTH,
      height: UNDERLAY_HEIGHT,
      placement: project.floors[0]?.underlays[0]?.placement,
      opacity: 1,
      visible: true,
    })
  })

  it('yields an empty underlays array and unchanged wall/room derivation when no floor has an underlay', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [createFloor('Ground', { id: 'g', elevation: 0, walls: [wall] })]

    const graph = deriveSceneGraph(project)

    expect(graph.underlays).toEqual([])
    expect(graph.walls).toHaveLength(1)
    expect(graph.walls[0]).toMatchObject({ id: 'wall:w1', kind: 'wall', floorId: 'g' })
  })
})
