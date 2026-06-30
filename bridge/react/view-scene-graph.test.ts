import { describe, it, expect } from 'vitest'

import { FLOOR_NODE_PREFIX, type SceneGraph } from '../../core'
import { emptySceneGraph } from '../../core/scene/scene-graph-test-fixtures'

import { sceneGraphForBuilding, viewSceneGraph } from './view-scene-graph'

// Storey rise in millimetres for the stacked test fixtures: a ground floor at the
// datum, an upper floor one storey above, and a basement one storey below grade.
const STOREY_RISE_MM = 3000

// Builds a one-wall floor at the given elevation so a fixture graph can stack several
// floors. The wall id is suffixed with the floor id to keep node ids unique.
function floorWithWall(floorId: string, elevation: number): SceneGraph {
  return {
    nodes: [{ id: `${FLOOR_NODE_PREFIX}${floorId}`, kind: 'floor', name: floorId, elevation }],
    walls: [
      {
        id: `wall:${floorId}`,
        kind: 'wall',
        floorId,
        start: { x: 0, y: 0 },
        end: { x: 1000, y: 0 },
        thickness: 100,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Concatenates several single-floor fixtures into one multi-floor scene graph.
function stack(...floors: SceneGraph[]): SceneGraph {
  return {
    nodes: floors.flatMap((floor) => floor.nodes),
    walls: floors.flatMap((floor) => floor.walls),
    rooms: floors.flatMap((floor) => floor.rooms),
    underlays: floors.flatMap((floor) => floor.underlays),
    openings: floors.flatMap((floor) => floor.openings),
    dimensions: floors.flatMap((floor) => floor.dimensions),
    stairs: floors.flatMap((floor) => floor.stairs),
    furniture: floors.flatMap((floor) => floor.furniture),
  }
}

describe('sceneGraphForBuilding', () => {
  it('keeps every floor and its walls so the whole building renders as one model', () => {
    const graph = stack(floorWithWall('ground', 0), floorWithWall('upper', STOREY_RISE_MM))

    const building = sceneGraphForBuilding(graph, { includeUnderground: true })

    expect(building.nodes.map((node) => node.id)).toEqual([
      `${FLOOR_NODE_PREFIX}ground`,
      `${FLOOR_NODE_PREFIX}upper`,
    ])
    expect(building.walls.map((wall) => wall.floorId)).toEqual(['ground', 'upper'])
  })

  it('drops below-grade floors and their walls when underground levels are excluded', () => {
    const graph = stack(
      floorWithWall('basement', -STOREY_RISE_MM),
      floorWithWall('ground', 0),
      floorWithWall('upper', STOREY_RISE_MM),
    )

    const building = sceneGraphForBuilding(graph, { includeUnderground: false })

    expect(building.nodes.map((node) => node.id)).toEqual([
      `${FLOOR_NODE_PREFIX}ground`,
      `${FLOOR_NODE_PREFIX}upper`,
    ])
    expect(building.walls.map((wall) => wall.floorId)).toEqual(['ground', 'upper'])
  })

  it('hides only floors below the model grade datum', () => {
    const graph: SceneGraph = {
      ...emptySceneGraph(),
      gradeElevation: -600,
      nodes: [
        { id: 'floor:above', kind: 'floor', name: 'Raised', elevation: -400 },
        { id: 'floor:below', kind: 'floor', name: 'Cellar', elevation: -800 },
      ],
    }

    const projected = sceneGraphForBuilding(graph, { includeUnderground: false })

    expect(projected.nodes.map((node) => node.id)).toEqual(['floor:above'])
  })

  it('forwards the grade elevation onto the projected building graph', () => {
    const graph: SceneGraph = { ...emptySceneGraph(), gradeElevation: -600 }

    expect(sceneGraphForBuilding(graph, { includeUnderground: false }).gradeElevation).toBe(-600)
  })
})

describe('viewSceneGraph', () => {
  const graph = stack(
    floorWithWall('basement', -STOREY_RISE_MM),
    floorWithWall('ground', 0),
    floorWithWall('upper', STOREY_RISE_MM),
  )

  it('narrows to the active floor in floor scope', () => {
    const view = viewSceneGraph({
      rawGraph: graph,
      scope: 'floor',
      activeFloorId: 'ground',
      includeUnderground: true,
    })

    expect(view.nodes.map((node) => node.id)).toEqual([`${FLOOR_NODE_PREFIX}ground`])
    expect(view.walls.map((wall) => wall.floorId)).toEqual(['ground'])
  })

  it('aggregates every floor in building scope, honoring the underground flag', () => {
    const view = viewSceneGraph({
      rawGraph: graph,
      scope: 'building',
      activeFloorId: 'ground',
      includeUnderground: false,
    })

    expect(view.walls.map((wall) => wall.floorId)).toEqual(['ground', 'upper'])
  })
})
