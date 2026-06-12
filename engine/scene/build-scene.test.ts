import { describe, it, expect } from 'vitest'
import { buildScene } from './build-scene'
import { findByEntityId } from '../testing'
import type { RoomSceneNode, SceneGraph } from '../../core'

const ROOM_WIDTH_MM = 4000
const ROOM_DEPTH_MM = 3000
const ROOM_CEILING_HEIGHT_MM = 2600

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
})
