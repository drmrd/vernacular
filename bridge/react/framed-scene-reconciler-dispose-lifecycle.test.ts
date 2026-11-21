import { describe, it, expect } from 'vitest'
import {
  expectEachDisposedOnce,
  expectNoneDisposed,
  sharedResources,
  trackResources,
} from './dispose-tracking-test-support'
import { createFramedSceneReconciler } from './framed-scene-reconciler'
import { FLOOR_ID, graphOf, groundNode } from './framed-scene-reconciler-dispose-test-support'

// The edges of a reconciler's life: what dispose does with a pending empty-graph scene, what a
// reconcile after dispose builds, and what two reconciles of the same inputs may free. The
// last pair is what React StrictMode does to a memo: it runs the factory twice, keeps the first
// result, and the second call must not retire the scene that stays on screen.

const REBUILD_CYCLES = 3

const emptyPaint = (): Record<string, never> => ({})

describe('createFramedSceneReconciler dispose edges', () => {
  it('frees a pending empty-graph scene once on dispose, and a second dispose frees nothing more', () => {
    const reconciler = createFramedSceneReconciler()
    const empty = reconciler.reconcile(graphOf([], []), emptyPaint())
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
    const graph = graphOf([groundNode()], [FLOOR_ID])
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
    const graph = graphOf([groundNode()], [FLOOR_ID])
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
    const graph = graphOf([], [])
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

    const first = reconciler.reconcile(graphOf([], []), paint)
    const firstTree = trackResources(first.root)
    const second = reconciler.reconcile(graphOf([], []), paint)
    const secondTree = trackResources(second.root)
    reconciler.releaseRetired(second)

    expect(second).not.toBe(first)
    expect(sharedResources(firstTree, secondTree)).toEqual([])
    expectEachDisposedOnce(firstTree)
    expectNoneDisposed(secondTree)
  })
})
