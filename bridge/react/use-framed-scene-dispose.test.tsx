import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

import { findByEntityId } from '../../engine/testing'
import {
  expectEachDisposedOnce,
  expectNoneDisposed,
  sharedResources,
  trackResources,
  type ResourceTracker,
} from './dispose-tracking-test-support'
import { useFramedScene } from './use-framed-scene'
import { FLOOR_NODE_ID, framedSceneEnvironment } from './use-framed-scene-test-support'

// The hook owns the reconciler's life: a superseded or unmounted reconciler frees what it holds,
// and the scene still on screen is never freed. These tests count real 'dispose' events on the
// real scenes the hook returns.

afterEach(cleanup)

const MOVED_PARTITION_X_MM = 4000

async function flushMicrotasks(): Promise<void> {
  await act(async () => {})
}

function expectEveryGeometryDisposedOnce(tracker: ResourceTracker): void {
  expect(tracker.geometries().length).toBeGreaterThan(0)
  expect(tracker.geometries().map((entry) => entry.disposeCount)).toEqual(
    tracker.geometries().map(() => 1),
  )
}

describe('useFramedScene frees what it stops using', () => {
  it('frees the superseded reconciler resources once when the overlay flips, and none of the live scene', () => {
    const { wrapper } = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper })
    const superseded = trackResources(result.current.framed.root)
    expectNoneDisposed(superseded)

    act(() => result.current.toggleEdgeOverlay())

    const live = trackResources(result.current.framed.root)
    expect(sharedResources(superseded, live)).toEqual([])
    expectEachDisposedOnce(superseded)
    expectNoneDisposed(live)
  })

  it('frees the geometry of a rebuilt room once the effect runs, and nothing the new scene draws', async () => {
    const env = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper: env.wrapper })
    const oldRooms = env.roomIds().map((id) => {
      const group = findByEntityId(result.current.framed.root, id)
      if (group === null) throw new Error(`expected the first scene to draw room ${id}`)
      return trackResources(group)
    })
    const before = result.current.framed

    act(() => env.movePartitionTo(MOVED_PARTITION_X_MM))
    await flushMicrotasks()

    const live = trackResources(findByEntityId(result.current.framed.root, FLOOR_NODE_ID))
    expect(result.current.framed).not.toBe(before)
    expect(oldRooms.length).toBeGreaterThan(0)
    oldRooms.forEach(expectEveryGeometryDisposedOnce)
    // The rebuilt rooms still draw the provider's held role materials, so old and live may share
    // resources. What must hold: nothing the live scene draws has been freed.
    expectNoneDisposed(live)
  })
})

describe('useFramedScene under StrictMode', () => {
  it('frees nothing on mount and frees the live reconciler once on unmount', async () => {
    const { strictWrapper } = framedSceneEnvironment()
    const { result, unmount } = renderHook(() => useFramedScene(), { wrapper: strictWrapper })
    const live = trackResources(result.current.framed.root)

    await flushMicrotasks()
    expectNoneDisposed(live)

    unmount()
    await flushMicrotasks()

    expectEachDisposedOnce(live)
  })

  it('leaves the committed scene of an empty project undisposed after mount', async () => {
    const { strictWrapper } = framedSceneEnvironment({ withoutFloors: true })
    const { result } = renderHook(() => useFramedScene(), { wrapper: strictWrapper })
    const live = trackResources(result.current.framed.root)

    await flushMicrotasks()

    expectNoneDisposed(live)
  })
})
