import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import { findByEntityId } from '../testing'
import {
  createEmptyProject,
  createFloor,
  createOpening,
  createWall,
  deriveSceneGraph,
  type Floor,
  type RoomSceneNode,
  type SceneGraph,
} from '../../core'

const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000
const ROOM_CEILING_HEIGHT_MM = 2600

const HOST_WALL_LENGTH_MM = 4000
const HOST_WALL_THICKNESS_MM = 120
const DOOR_POSITION_MM = 2000
const DOOR_WIDTH_MM = 900

const hostWall = () =>
  createWall(
    { x: 0, y: 0 },
    { x: HOST_WALL_LENGTH_MM, y: 0 },
    { id: 'w1', thickness: HOST_WALL_THICKNESS_MM },
  )

const projectWithFloor = (floor: Floor): SceneGraph => {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [floor]
  return deriveSceneGraph(project)
}

const wallMaterialNames = (root: THREE.Group, entityId: string): (string | undefined)[] => {
  const mesh = findByEntityId(root, entityId)
  expect(mesh).toBeInstanceOf(THREE.Mesh)
  const materials = (mesh as THREE.Mesh).material as THREE.Material[]
  return materials.map((material) => material.name)
}

/* eslint-disable-next-line max-lines-per-function --
 * A flat suite of buildScene cases, one `it` per scene-node kind. Each case owns
 * a self-contained SceneGraph literal (now seeding the required `furniture`
 * array), so the describe body length tracks the number of node kinds rather than
 * any single hard-to-read function. */
describe('buildScene', () => {
  it('creates one group per scene node carrying its id and elevation', () => {
    const graph: SceneGraph = {
      nodes: [
        { id: 'floor:a', kind: 'floor', name: 'Ground', elevation: 0 },
        { id: 'floor:b', kind: 'floor', name: 'Upper', elevation: 2700 },
      ],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const root = buildScene(graph)

    expect(root.children).toHaveLength(2)
    const [first, second] = root.children
    expect(first?.name).toBe('floor:a')
    expect(first?.userData.entityId).toBe('floor:a')
    expect(first?.position.y).toBe(0)
    expect(second?.userData.entityId).toBe('floor:b')
    expect(second?.position.y).toBe(2700)
  })

  it('parents each wall mesh under its floor group carrying the wall entity id', () => {
    const graph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
      walls: [
        {
          id: 'wall:w1',
          kind: 'wall',
          floorId: 'g',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          thickness: 100,
          height: 2400,
        },
        {
          id: 'wall:w2',
          kind: 'wall',
          floorId: 'g',
          start: { x: 1000, y: 0 },
          end: { x: 1000, y: 1000 },
          thickness: 100,
          height: 2400,
        },
      ],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const root = buildScene(graph)

    expect(root.children).toHaveLength(1)
    expect(findByEntityId(root, 'wall:w1')).not.toBeNull()
    expect(findByEntityId(root, 'wall:w2')).not.toBeNull()

    const floorGroup = root.children[0]
    expect(floorGroup).toBeDefined()
    if (floorGroup) {
      expect(findByEntityId(floorGroup, 'wall:w1')).not.toBeNull()
      expect(findByEntityId(floorGroup, 'wall:w2')).not.toBeNull()
    }
  })

  it('parents each room shell under its floor group carrying the room entity id', () => {
    const rectangle = [
      { x: 0, y: 0 },
      { x: ROOM_WIDTH_MM, y: 0 },
      { x: ROOM_WIDTH_MM, y: ROOM_DEPTH_MM },
      { x: 0, y: ROOM_DEPTH_MM },
    ]
    const room: RoomSceneNode = {
      id: 'room:r1',
      kind: 'room',
      floorId: 'g',
      polygon: rectangle,
      clearPolygon: rectangle,
      area: ROOM_WIDTH_MM * ROOM_DEPTH_MM,
      ceilingHeight: ROOM_CEILING_HEIGHT_MM,
    }
    const graph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
      walls: [],
      rooms: [room],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const root = buildScene(graph)

    expect(root.children).toHaveLength(1)
    expect(findByEntityId(root, 'room:r1')).not.toBeNull()

    const floorGroup = root.children[0]
    expect(floorGroup).toBeDefined()
    if (floorGroup) {
      expect(findByEntityId(floorGroup, 'room:r1')).not.toBeNull()
    }
  })

  it('cuts and lines an opening void in its host wall end to end through the derived graph', () => {
    const door = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: DOOR_POSITION_MM,
      width: DOOR_WIDTH_MM,
      id: 'o1',
    })
    const floor: Floor = {
      ...createFloor('Ground', { id: 'g', walls: [hostWall()] }),
      openings: [door],
    }

    const root = buildScene(projectWithFloor(floor))

    expect(wallMaterialNames(root, 'wall:w1')).toContain('reveal')
  })

  it('builds an opening-free wall as a plain box without a reveal material group', () => {
    const floor = createFloor('Ground', { id: 'g', walls: [hostWall()] })

    const root = buildScene(projectWithFloor(floor))

    expect(wallMaterialNames(root, 'wall:w1')).not.toContain('reveal')
  })
})

describe('buildScene opening fill', () => {
  it('parents an opening fill group under its floor group carrying the opening entity id', () => {
    const door = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: DOOR_POSITION_MM,
      width: DOOR_WIDTH_MM,
      id: 'o1',
    })
    const floor: Floor = {
      ...createFloor('Ground', { id: 'g', walls: [hostWall()] }),
      openings: [door],
    }
    const graph = projectWithFloor(floor)

    const root = buildScene(graph)

    const floorGroup = root.children.at(0)
    expect(floorGroup).toBeDefined()
    if (!floorGroup) return

    const opening = graph.openings.at(0)
    expect(opening).toBeDefined()
    if (!opening) return

    const fill = floorGroup.children.find((child) => child.userData.entityId === opening.id)
    expect(fill).toBeDefined()
    expect(fill?.children.length ?? 0).toBeGreaterThan(0)
  })
})

describe('buildScene surface edges', () => {
  it('adds an edge line to each structural mesh while keeping its entity id', () => {
    const graph: SceneGraph = {
      nodes: [{ id: 'floor:g', kind: 'floor', name: 'Ground', elevation: 0 }],
      walls: [
        {
          id: 'wall:w1',
          kind: 'wall',
          floorId: 'g',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
          thickness: 100,
          height: 2400,
        },
      ],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
      furniture: [],
    }

    const wall = findByEntityId(buildScene(graph), 'wall:w1')
    expect(wall).toBeInstanceOf(THREE.Mesh)
    const edges = (wall as THREE.Mesh).children.filter(
      (child): child is THREE.LineSegments => child instanceof THREE.LineSegments,
    )
    expect(edges).toHaveLength(1)
    expect((wall as THREE.Mesh).userData.entityId).toBe('wall:w1')
  })
})
