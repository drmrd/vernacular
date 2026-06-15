import { describe, it, expect } from 'vitest'
import type { SceneGraph, SceneNode, SurfaceTreatment } from '../../core'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400

// A one-floor, one-wall graph wrapping the given floor node, mimicking the
// active-floor-scoped graph the preview feeds the reconciler. Passing the same
// floorNode object models an unchanged floor; a fresh object models an edit.
function floorGraph(floorNode: SceneNode): SceneGraph {
  const floorId = floorNode.id.slice('floor:'.length)
  return {
    nodes: [floorNode],
    walls: [
      {
        id: `wall:${floorId}1`,
        kind: 'wall',
        floorId,
        start: { x: 0, y: 0 },
        end: { x: WALL_LENGTH_MM, y: 0 },
        thickness: WALL_THICKNESS_MM,
        height: WALL_HEIGHT_MM,
      },
    ],
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
  }
}

const groundFloorNode = (): SceneNode => ({
  id: 'floor:g',
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

const emptyPaint = (): Record<string, SurfaceTreatment> => ({})

describe('createFramedSceneReconciler', () => {
  it('reuses the built scene when the floor node and paint are unchanged', () => {
    const reconciler = createFramedSceneReconciler()
    const node = groundFloorNode()
    const paint = emptyPaint()

    const first = reconciler.reconcile(floorGraph(node), paint)
    // A later render passes a fresh scoped-graph container with the same floor node.
    const second = reconciler.reconcile(floorGraph(node), paint)

    expect(second).toBe(first)
  })
})
