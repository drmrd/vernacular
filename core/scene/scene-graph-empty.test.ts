import { describe, expect, it } from 'vitest'
import type { DimensionSceneNode, UnderlaySceneNode, WallSceneNode } from './scene-graph'
import { sceneGraphHasGeometry } from './scene-graph-empty'
import { emptySceneGraph } from './scene-graph-test-fixtures'

const FLOOR_ID = 'g'

const wallNode: WallSceneNode = {
  id: 'wall:w1',
  kind: 'wall',
  floorId: FLOOR_ID,
  start: { x: 0, y: 0 },
  end: { x: 1000, y: 0 },
  thickness: 100,
}

const underlayNode: UnderlaySceneNode = {
  id: 'underlay:u1',
  kind: 'underlay',
  floorId: FLOOR_ID,
  source: { kind: 'raster', image: { scope: 'project', contentHash: 'cafef00d' } },
  width: 1000,
  height: 800,
  placement: { offset: { x: 0, y: 0 }, millimetersPerPixel: 1, rotation: 0 },
  opacity: 1,
  visible: true,
}

const dimensionNode: DimensionSceneNode = {
  id: 'dimension:d1',
  kind: 'dimension',
  floorId: FLOOR_ID,
  start: { x: 0, y: 0 },
  end: { x: 300, y: 400 },
  offset: 200,
  length: 500,
}

describe('sceneGraphHasGeometry', () => {
  it('counts renderable geometry but not underlays or dimensions as having geometry', () => {
    expect(sceneGraphHasGeometry(emptySceneGraph())).toBe(false)

    expect(sceneGraphHasGeometry({ ...emptySceneGraph(), walls: [wallNode] })).toBe(true)

    expect(
      sceneGraphHasGeometry({
        ...emptySceneGraph(),
        underlays: [underlayNode],
        dimensions: [dimensionNode],
      }),
    ).toBe(false)
  })
})
