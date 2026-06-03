import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Project } from '../model/types'
import { deriveSceneGraph, deriveWallNode } from './scene-graph'

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
    const project = projectWithFloors()
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    project.floors[0]!.walls = [wall]

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
