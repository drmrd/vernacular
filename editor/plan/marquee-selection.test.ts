import { describe, expect, it } from 'vitest'
import { resolveMarqueeSelection } from './marquee-selection'
import type { Bounds } from './fit'
import type { SceneGraph, WallSceneNode } from '../../core'

const WALL_THICKNESS_MM = 114

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

function scene(walls: WallSceneNode[]): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

const rect: Bounds = { min: { x: 0, y: 0 }, max: { x: 1000, y: 1000 } }
const graph = scene([
  wall('wall:inside', { x: 100, y: 100 }, { x: 900, y: 900 }),
  wall('wall:straddling', { x: 500, y: 500 }, { x: 1500, y: 500 }),
])

describe('resolveMarqueeSelection', () => {
  it('replaces the standing selection with the window result', () => {
    const result = resolveMarqueeSelection(graph, new Set(['wall:other']), {
      rect,
      mode: 'window',
      operation: 'replace',
    })

    expect(result).toEqual(['wall:inside'])
  })

  it('adds the window result to the standing selection without duplicating', () => {
    const result = resolveMarqueeSelection(graph, new Set(['wall:other', 'wall:inside']), {
      rect,
      mode: 'window',
      operation: 'add',
    })

    expect(new Set(result)).toEqual(new Set(['wall:other', 'wall:inside']))
  })

  it('subtracts the window result from the standing selection', () => {
    const result = resolveMarqueeSelection(graph, new Set(['wall:other', 'wall:inside']), {
      rect,
      mode: 'window',
      operation: 'subtract',
    })

    expect(result).toEqual(['wall:other'])
  })

  it('grabs merely-crossing entities under the crossing mode', () => {
    const result = resolveMarqueeSelection(graph, new Set(), {
      rect,
      mode: 'crossing',
      operation: 'replace',
    })

    expect(new Set(result)).toEqual(new Set(['wall:inside', 'wall:straddling']))
  })
})
