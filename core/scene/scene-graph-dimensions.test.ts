import { describe, expect, it } from 'vitest'
import { dimensionLength } from '../geometry/dimension'
import { createDimension, createEmptyProject, createFloor, createWall } from '../model/factories'
import type { Floor } from '../model/types'
import {
  DIMENSION_NODE_PREFIX,
  deriveDimensionNodesForFloor,
  deriveSceneGraph,
} from './scene-graph'

const DIMENSION_START = { x: 0, y: 0 }
const DIMENSION_END = { x: 300, y: 400 }
const DIMENSION_OFFSET = 200
const DIMENSION_LENGTH = 500

function floorWithDimension(): Floor {
  const dimension = createDimension({
    start: DIMENSION_START,
    end: DIMENSION_END,
    offset: DIMENSION_OFFSET,
    id: 'd1',
  })
  return { ...createFloor('Ground', { id: 'g' }), dimensions: [dimension] }
}

describe('deriveDimensionNodesForFloor', () => {
  it('projects each dimension into a node with the floor id, endpoints, offset, and length', () => {
    const floor = floorWithDimension()

    const nodes = deriveDimensionNodesForFloor(floor)

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toEqual({
      id: `${DIMENSION_NODE_PREFIX}d1`,
      kind: 'dimension',
      floorId: 'g',
      start: DIMENSION_START,
      end: DIMENSION_END,
      offset: DIMENSION_OFFSET,
      length: DIMENSION_LENGTH,
    })
  })

  it('measures length from the start and end with dimensionLength', () => {
    const floor = floorWithDimension()

    const nodes = deriveDimensionNodesForFloor(floor)

    expect(nodes[0]?.length).toBe(dimensionLength({ start: DIMENSION_START, end: DIMENSION_END }))
  })
})

describe('deriveSceneGraph dimensions', () => {
  it('flat-maps each floor dimension into graph.dimensions, tagged with its floor id', () => {
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [floorWithDimension()]

    const graph = deriveSceneGraph(project)

    expect(graph.dimensions).toHaveLength(1)
    expect(graph.dimensions[0]).toMatchObject({
      id: `${DIMENSION_NODE_PREFIX}d1`,
      kind: 'dimension',
      floorId: 'g',
      start: DIMENSION_START,
      end: DIMENSION_END,
      offset: DIMENSION_OFFSET,
      length: DIMENSION_LENGTH,
    })
  })

  it('yields an empty dimensions array when no floor has a dimension', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1' })
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.1.0',
    })
    project.floors = [createFloor('Ground', { id: 'g', elevation: 0, walls: [wall] })]

    const graph = deriveSceneGraph(project)

    expect(graph.dimensions).toEqual([])
  })
})
