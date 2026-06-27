import { describe, expect, it } from 'vitest'

import type { FurnitureInstance, SceneGraph, UnderlaySceneNode, WallSceneNode } from '../../core'

import { planClickTarget } from './plan-click-target'

const WALL_THICKNESS_MM = 114

function wall(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number },
): WallSceneNode {
  return { id, kind: 'wall', floorId: 'g', start, end, thickness: WALL_THICKNESS_MM }
}

// Footprint spans x in [0, 2000] and y in [0, 2000] (offset is the top-left).
const underlayNode: UnderlaySceneNode = {
  id: 'underlay:u1',
  kind: 'underlay',
  floorId: 'g',
  source: { kind: 'raster', image: { scope: 'project', contentHash: 'abc' } },
  width: 200,
  height: 200,
  placement: { offset: { x: 0, y: 2000 }, millimetersPerPixel: 10, rotation: 0 },
  opacity: 1,
  visible: true,
}

function graphWith(walls: WallSceneNode[]): SceneGraph {
  return {
    nodes: [],
    walls,
    rooms: [],
    underlays: [underlayNode],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

const NO_FURNITURE: readonly FurnitureInstance[] = []

describe('planClickTarget', () => {
  it('returns the wall id when the point lies on a wall over an underlay', () => {
    const graph = graphWith([wall('wall:a', { x: 0, y: 1000 }, { x: 1000, y: 1000 })])

    expect(planClickTarget(graph, NO_FURNITURE, { x: 500, y: 1000 })).toBe('wall:a')
  })

  it('returns the underlay node id when the point is over only an underlay', () => {
    const graph = graphWith([wall('wall:a', { x: 0, y: 1000 }, { x: 1000, y: 1000 })])

    expect(planClickTarget(graph, NO_FURNITURE, { x: 1500, y: 1000 })).toBe('underlay:u1')
  })

  it('returns null when the point is over nothing', () => {
    const graph = graphWith([])

    expect(planClickTarget(graph, NO_FURNITURE, { x: 9000, y: 9000 })).toBeNull()
  })
})
