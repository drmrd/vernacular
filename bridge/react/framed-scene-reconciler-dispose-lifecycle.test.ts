import { describe, it, expect } from 'vitest'
import { FLOOR_NODE_PREFIX } from '../../core'
import type { SceneGraph, SceneNode } from '../../core'
import {
  expectEachDisposedOnce,
  expectNoneDisposed,
  sharedResources,
  trackResources,
} from './dispose-tracking-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'

// The edges of a reconciler's life: what dispose does with a pending empty-graph scene, what a
// reconcile after dispose builds, and what two reconciles of the same inputs may free. The
// last pair is what React StrictMode does to a memo: it runs the factory twice, keeps the first
// result, and the second call must not retire the scene that stays on screen.

const FLOOR_ID = 'g'
const WALL_LENGTH_MM = 2000
const WALL_THICKNESS_MM = 120
const WALL_HEIGHT_MM = 2400
const REBUILD_CYCLES = 3

const emptyPaint = (): Record<string, never> => ({})

const groundNode = (): SceneNode => ({
  id: `${FLOOR_NODE_PREFIX}${FLOOR_ID}`,
  kind: 'floor',
  name: 'Ground',
  elevation: 0,
})

function graphOf(nodes: SceneNode[]): SceneGraph {
  return {
    nodes,
    walls: nodes.map(() => ({
      id: `wall:${FLOOR_ID}1`,
      kind: 'wall',
      floorId: FLOOR_ID,
      start: { x: 0, y: 0 },
      end: { x: WALL_LENGTH_MM, y: 0 },
      thickness: WALL_THICKNESS_MM,
      height: WALL_HEIGHT_MM,
    })),
    rooms: [],
    underlays: [],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

describe('createFramedSceneReconciler dispose edges', () => {
  it('frees a pending empty-graph scene once on dispose, and a second dispose frees nothing more', () => {
    const reconciler = createFramedSceneReconciler()
    const empty = reconciler.reconcile(graphOf([]), emptyPaint())
    const emptyTree = trackResources(empty.root)
    expectNoneDisposed(emptyTree)

    reconciler.dispose()
    expectEachDisposedOnce(emptyTree)

    reconciler.dispose()
    reconciler.releaseRetired(empty)
    expectEachDisposedOnce(emptyTree)
  })

  it('builds a fresh scene after dispose and frees each scene once over repeated cycles', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphOf([groundNode()])
    const paint = emptyPaint()
    const freed: ReturnType<typeof trackResources>[] = []

    for (let cycle = 0; cycle < REBUILD_CYCLES; cycle += 1) {
      const scene = reconciler.reconcile(graph, paint)
      const tree = trackResources(scene.root)
      freed.forEach((earlier) => expect(sharedResources(earlier, tree)).toEqual([]))
      reconciler.releaseRetired(scene)
      expectNoneDisposed(tree)

      reconciler.dispose()

      expectEachDisposedOnce(tree)
      freed.push(tree)
      freed.forEach(expectEachDisposedOnce)
    }
  })
})

describe('createFramedSceneReconciler reconciling the same inputs twice', () => {
  it('returns one scene for the same floor graph and paint and frees nothing', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphOf([groundNode()])
    const paint = emptyPaint()

    const first = reconciler.reconcile(graph, paint)
    const second = reconciler.reconcile(graph, paint)
    const tree = trackResources(first.root)
    reconciler.releaseRetired(second)

    expect(second).toBe(first)
    expectNoneDisposed(tree)
  })

  it('returns one scene for the same empty graph and paint and frees nothing', () => {
    const reconciler = createFramedSceneReconciler()
    const graph = graphOf([])
    const paint = emptyPaint()

    const first = reconciler.reconcile(graph, paint)
    const tree = trackResources(first.root)
    const second = reconciler.reconcile(graph, paint)
    reconciler.releaseRetired(second)

    expect(second).toBe(first)
    expectNoneDisposed(tree)
  })

  it('frees the first empty-graph scene once a different empty graph replaces it', () => {
    const reconciler = createFramedSceneReconciler()
    const paint = emptyPaint()

    const first = reconciler.reconcile(graphOf([]), paint)
    const firstTree = trackResources(first.root)
    const second = reconciler.reconcile(graphOf([]), paint)
    const secondTree = trackResources(second.root)
    reconciler.releaseRetired(second)

    expect(second).not.toBe(first)
    expect(sharedResources(firstTree, secondTree)).toEqual([])
    expectEachDisposedOnce(firstTree)
    expectNoneDisposed(secondTree)
  })
})
