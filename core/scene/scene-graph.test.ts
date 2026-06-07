import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Floor, Project, RoomOverride } from '../model/types'
import { ROOM_ID_PREFIX, roomKey } from '../topology/rooms'
import { deriveRoomNodesForFloor, deriveSceneGraph, deriveWallNode } from './scene-graph'

function projectWithFloors(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    era: 'victorian',
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

describe('deriveSceneGraph walls', () => {
  it('derives a namespaced wall node per wall, carrying its floor id and geometry', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
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
      era: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [floor]

    const graph = deriveSceneGraph(project)

    expect(graph.rooms).toHaveLength(1)
    const room = graph.rooms[0]
    if (room === undefined) {
      throw new Error('expected one room node')
    }
    expect(room).toMatchObject({ kind: 'room', floorId: floor.id, area: 12_000_000 })
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

    expect(node).toMatchObject({ kind: 'room', floorId: floor.id, area: 12_000_000 })
    expect(node.polygon).toHaveLength(4)
    expect(node.name).toBeUndefined()
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
