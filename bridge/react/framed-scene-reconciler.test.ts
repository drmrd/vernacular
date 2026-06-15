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

  it('rebuilds when the floor node reference changes', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const first = reconciler.reconcile(floorGraph(groundFloorNode()), paint)
    // An edit replaces the floor with a new object carrying the same id.
    const second = reconciler.reconcile(floorGraph(groundFloorNode()), paint)

    expect(second).not.toBe(first)
  })

  it('rebuilds when the paint reference changes', () => {
    const reconciler = createFramedSceneReconciler()
    const node = groundFloorNode()

    const first = reconciler.reconcile(floorGraph(node), emptyPaint())
    // Same unchanged floor node, but a new paint set: materials may differ, so rebuild.
    const second = reconciler.reconcile(floorGraph(node), emptyPaint())

    expect(second).not.toBe(first)
  })

  it('reuses a floor built earlier after switching to another floor and back', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()
    const ground = groundFloorNode()
    const upper: SceneNode = { id: 'floor:u', kind: 'floor', name: 'Upper', elevation: 2700 }

    const groundFirst = reconciler.reconcile(floorGraph(ground), paint)
    const upperBuild = reconciler.reconcile(floorGraph(upper), paint)
    // Switch back to the unchanged ground floor (same node reference).
    const groundAgain = reconciler.reconcile(floorGraph(ground), paint)

    expect(upperBuild).not.toBe(groundFirst)
    expect(groundAgain).toBe(groundFirst)
  })

  it('builds an empty graph without throwing and returns a finite pose', () => {
    const reconciler = createFramedSceneReconciler()
    const empty: SceneGraph = {
      nodes: [],
      walls: [],
      rooms: [],
      underlays: [],
      openings: [],
      dimensions: [],
      stairs: [],
    }

    const framed = reconciler.reconcile(empty, emptyPaint())

    expect(framed.root).toBeDefined()
    expect(Number.isFinite(framed.pose.near)).toBe(true)
    expect(Number.isFinite(framed.pose.far)).toBe(true)
  })
})
