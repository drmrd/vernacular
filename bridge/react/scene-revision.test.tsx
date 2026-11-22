import { renderHook } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it } from 'vitest'
import { createSceneRevisionCounter, useSceneRevision } from './scene-revision'

describe('createSceneRevisionCounter', () => {
  it('gives the first scene revision 1', () => {
    const counter = createSceneRevisionCounter<object>()

    expect(counter.revisionOf({})).toBe(1)
  })

  it('gives the same revision when it sees the same scene object again', () => {
    const counter = createSceneRevisionCounter<object>()
    const scene = {}

    const first = counter.revisionOf(scene)

    expect(counter.revisionOf(scene)).toBe(first)
  })

  it('gives one more than the previous revision for a different scene object', () => {
    const counter = createSceneRevisionCounter<object>()
    const first = counter.revisionOf({})

    expect(counter.revisionOf({})).toBe(first + 1)
  })

  it('never goes backwards when an earlier scene object returns', () => {
    const counter = createSceneRevisionCounter<object>()
    const sceneA = {}
    const sceneB = {}

    const revisions = [sceneA, sceneB, sceneA].map((scene) => counter.revisionOf(scene))

    expect(revisions).toEqual([1, 2, 3])
  })
})

describe('useSceneRevision', () => {
  it('keeps its revision across rerenders with the same scene', () => {
    const scene = {}
    const { result, rerender } = renderHook(({ framed }) => useSceneRevision(framed), {
      initialProps: { framed: scene },
    })
    const first = result.current

    rerender({ framed: scene })

    expect(result.current).toBe(first)
  })

  it('gives a larger revision after a rerender with a new scene', () => {
    const { result, rerender } = renderHook(({ framed }) => useSceneRevision(framed), {
      initialProps: { framed: {} },
    })
    const first = result.current

    rerender({ framed: {} })

    expect(result.current).toBeGreaterThan(first)
  })

  it('starts again at 1 on a fresh mount', () => {
    const firstMount = renderHook(() => useSceneRevision({}))
    firstMount.rerender()
    firstMount.unmount()

    const secondMount = renderHook(() => useSceneRevision({}))

    expect(secondMount.result.current).toBe(1)
  })

  it('gives 1 for the first scene under StrictMode double rendering', () => {
    const scene = {}

    const { result } = renderHook(() => useSceneRevision(scene), { wrapper: StrictMode })

    expect(result.current).toBe(1)
  })
})
