import { describe, expect, it } from 'vitest'

import type { SceneGraph, UnderlaySceneNode } from '../../core'

import { floorUnderlayTracePoints, underlayTracePoints } from './underlay-trace-points'

const node: UnderlaySceneNode = {
  id: 'underlay:u1',
  kind: 'underlay',
  floorId: 'f1',
  source: { kind: 'raster', image: { scope: 'project', contentHash: 'abc' } },
  width: 100,
  height: 50,
  placement: { offset: { x: 1000, y: 2000 }, millimetersPerPixel: 10, rotation: 0 },
  opacity: 1,
  visible: true,
}

describe('underlayTracePoints', () => {
  it('returns the four calibrated footprint corners in plan millimeters', () => {
    const points = underlayTracePoints(node)
    // Footprint: offset (1000, 2000), size 100 * 10 by 50 * 10 = 1000 by 500.
    expect(points).toHaveLength(4)
    expect(points).toContainEqual({ x: 1000, y: 2000 })
    expect(points).toContainEqual({ x: 2000, y: 2000 })
    expect(points).toContainEqual({ x: 2000, y: 2500 })
    expect(points).toContainEqual({ x: 1000, y: 2500 })
  })
})

const visibleUnderlayNode = node
const hiddenUnderlayNode: UnderlaySceneNode = {
  ...node,
  id: 'underlay:u2',
  visible: false,
}

describe('floorUnderlayTracePoints', () => {
  it('returns the footprint corners of every visible underlay when enabled', () => {
    const graph = {
      underlays: [visibleUnderlayNode, hiddenUnderlayNode],
    } as SceneGraph

    // Only the visible underlay contributes its four footprint corners.
    expect(floorUnderlayTracePoints(graph, true)).toHaveLength(4)
  })

  it('returns undefined when the trace snap is disabled', () => {
    const graph = {
      underlays: [visibleUnderlayNode, hiddenUnderlayNode],
    } as SceneGraph

    expect(floorUnderlayTracePoints(graph, false)).toBeUndefined()
  })
})
