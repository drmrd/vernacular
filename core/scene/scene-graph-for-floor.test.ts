import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createWall,
} from '../model/factories'
import type { Floor, Project } from '../model/types'
import { createSceneGraphDeriver } from './scene-graph-deriver'
import { sceneGraphForFloor } from './scene-graph-for-floor'

function twoFloorProject(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    createFloor('A', {
      id: 'a',
      walls: [createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'wall-a' })],
    }),
    createFloor('B', {
      id: 'b',
      walls: [createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'wall-b' })],
    }),
  ]
  return project
}

function floorWithFurniture(name: string, id: string, instanceId: string): Floor {
  return {
    ...createFloor(name, { id }),
    furniture: [
      createFurnitureInstance({
        id: instanceId,
        assetRef: { scope: 'project', contentHash: 'cafef00d' },
        position: { x: 500, y: 500 },
        footprint: { width: 1000, depth: 600 },
      }),
    ],
  }
}

function twoFloorProjectWithFurniture(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.1.0',
  })
  project.floors = [
    floorWithFurniture('A', 'a', 'furniture-a'),
    floorWithFurniture('B', 'b', 'furniture-b'),
  ]
  return project
}

describe('sceneGraphForFloor', () => {
  it('keeps only floor A entities when narrowing to floor A', () => {
    const graph = createSceneGraphDeriver()(twoFloorProject())

    const narrowed = sceneGraphForFloor(graph, 'a')

    expect(narrowed.walls).toHaveLength(1)
    expect(narrowed.walls[0]?.floorId).toBe('a')
    expect(narrowed.rooms.every((node) => node.floorId === 'a')).toBe(true)
    expect(narrowed.openings.every((node) => node.floorId === 'a')).toBe(true)
    expect(narrowed.dimensions.every((node) => node.floorId === 'a')).toBe(true)
    expect(narrowed.underlays.every((node) => node.floorId === 'a')).toBe(true)
    expect(narrowed.stairs.every((node) => node.floorId === 'a')).toBe(true)
  })

  it('reports empty entity collections for the floors with no such entities', () => {
    const graph = createSceneGraphDeriver()(twoFloorProject())

    const narrowed = sceneGraphForFloor(graph, 'a')

    expect(narrowed.rooms).toHaveLength(0)
    expect(narrowed.openings).toHaveLength(0)
    expect(narrowed.dimensions).toHaveLength(0)
    expect(narrowed.underlays).toHaveLength(0)
    expect(narrowed.stairs).toHaveLength(0)
  })

  it('keeps only floor B entities when narrowing to floor B', () => {
    const graph = createSceneGraphDeriver()(twoFloorProject())

    const narrowed = sceneGraphForFloor(graph, 'b')

    expect(narrowed.walls).toHaveLength(1)
    expect(narrowed.walls[0]?.floorId).toBe('b')
  })

  it('keeps only the active floor furniture when narrowing', () => {
    const graph = createSceneGraphDeriver()(twoFloorProjectWithFurniture())

    const narrowed = sceneGraphForFloor(graph, 'a')

    expect(narrowed.furniture).toHaveLength(1)
    expect(narrowed.furniture.every((node) => node.floorId === 'a')).toBe(true)
  })

  it('seeds an empty furniture array when no floor is active', () => {
    const graph = createSceneGraphDeriver()(twoFloorProjectWithFurniture())

    const narrowed = sceneGraphForFloor(graph, null)

    expect(narrowed.furniture).toEqual([])
  })

  it('includes the active floor node and excludes other floor nodes', () => {
    const graph = createSceneGraphDeriver()(twoFloorProject())

    const narrowed = sceneGraphForFloor(graph, 'a')

    const nodeIds = narrowed.nodes.map((node) => node.id)
    expect(nodeIds).toContain('floor:a')
    expect(nodeIds).not.toContain('floor:b')
  })

  it('returns an empty graph when no floor is active', () => {
    const graph = createSceneGraphDeriver()(twoFloorProject())

    const narrowed = sceneGraphForFloor(graph, null)

    expect(narrowed.nodes).toHaveLength(0)
    expect(narrowed.walls).toHaveLength(0)
    expect(narrowed.rooms).toHaveLength(0)
    expect(narrowed.openings).toHaveLength(0)
    expect(narrowed.dimensions).toHaveLength(0)
    expect(narrowed.underlays).toHaveLength(0)
    expect(narrowed.stairs).toHaveLength(0)
  })
})
