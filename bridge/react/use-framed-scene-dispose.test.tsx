import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook, act, cleanup } from '@testing-library/react'

import { findByEntityId } from '../../engine/testing'
import type { FramedScene } from './framed-scene'
import {
  expectEachDisposedOnce,
  expectEveryGeometryDisposedOnce,
  expectNoneDisposed,
  sharedResources,
  trackResources,
  type ResourceTracker,
} from './dispose-tracking-test-support'
import { useFramedScene } from './use-framed-scene'
import type { FramedSceneState } from './use-framed-scene'
import { FLOOR_NODE_ID, framedSceneEnvironment } from './use-framed-scene-test-support'

vi.mock('./use-ground-texture', () => ({
  useGroundTexture: () => ({ status: 'failed' }),
}))

// The hook owns the reconciler's life: a superseded or unmounted reconciler frees what it holds,
// and the scene still on screen is never freed. These tests count real 'dispose' events on the
// real scenes the hook returns.

afterEach(cleanup)

const MOVED_PARTITION_X_MM = 4000
const MOVED_AGAIN_PARTITION_X_MM = 5000

async function flushMicrotasks(): Promise<void> {
  await act(async () => {})
}

type Environment = ReturnType<typeof framedSceneEnvironment>

function trackRooms(env: Environment, framed: FramedScene): ResourceTracker[] {
  return env.roomIds().map((id) => {
    const group = findByEntityId(framed.root, id)
    if (group === null) throw new Error(`expected the scene to draw room ${id}`)
    return trackResources(group)
  })
}

function trackFloor(framed: FramedScene): ResourceTracker {
  const floor = findByEntityId(framed.root, FLOOR_NODE_ID)
  if (floor === null) throw new Error('expected the scene to draw the floor')
  return trackResources(floor)
}

describe('useFramedScene frees what it stops using', () => {
  it('frees the superseded reconciler resources once when the overlay flips with no scene attached, and none of the live scene', () => {
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

  it('frees the geometry of a rebuilt room once the effect runs with no scene attached, and nothing the new scene draws', async () => {
    const env = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper: env.wrapper })
    const oldRooms = trackRooms(env, result.current.framed)
    const before = result.current.framed

    act(() => env.movePartitionTo(MOVED_PARTITION_X_MM))
    await flushMicrotasks()

    const live = trackFloor(result.current.framed)
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

// With a scene attached, the library root still draws the scene the hook replaced, so the hook
// frees nothing itself. The test plays the library root: it reports each scene it would commit
// through onSceneAttached and runs the returned function before the next report, as the layout
// effect beside the keyed primitive does.

type Detach = () => void
type HookResult = { current: FramedSceneState }

function attach(result: HookResult, scene: FramedScene = result.current.framed): Detach {
  let detach: Detach = () => {}
  act(() => {
    detach = result.current.onSceneAttached(scene)
  })
  return detach
}

describe('useFramedScene with a scene attached', () => {
  it('frees the geometry of a rebuilt room only when the new scene is attached', async () => {
    const env = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper: env.wrapper })
    const oldRooms = trackRooms(env, result.current.framed)
    const detach = attach(result)

    act(() => env.movePartitionTo(MOVED_PARTITION_X_MM))
    await flushMicrotasks()

    oldRooms.forEach(expectNoneDisposed)

    const live = trackFloor(result.current.framed)
    detach()
    attach(result)

    expect(oldRooms.length).toBeGreaterThan(0)
    oldRooms.forEach(expectEveryGeometryDisposedOnce)
    expectNoneDisposed(live)
  })

  it('frees the superseded reconciler resources once the scene of the flipped overlay is attached', async () => {
    const { wrapper } = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper })
    const superseded = trackResources(result.current.framed.root)
    const detach = attach(result)

    act(() => result.current.toggleEdgeOverlay())
    await flushMicrotasks()

    expectNoneDisposed(superseded)

    const live = trackResources(result.current.framed.root)
    detach()
    attach(result)

    expect(sharedResources(superseded, live)).toEqual([])
    expectEachDisposedOnce(superseded)
    expectNoneDisposed(live)
  })

  it('frees the resources of every superseded reconciler once the latest scene is attached', async () => {
    const { wrapper } = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper })
    const firstSuperseded = trackResources(result.current.framed.root)
    attach(result)

    act(() => result.current.toggleEdgeOverlay())
    const secondSuperseded = trackResources(result.current.framed.root)
    act(() => result.current.toggleEdgeOverlay())
    await flushMicrotasks()

    expectNoneDisposed(firstSuperseded)
    expectNoneDisposed(secondSuperseded)

    const live = trackResources(result.current.framed.root)
    attach(result)

    expectEachDisposedOnce(firstSuperseded)
    expectEachDisposedOnce(secondSuperseded)
    expectNoneDisposed(live)
  })

  it('frees nothing the attached scene of an earlier edit draws, and frees it once the latest scene is attached', async () => {
    const env = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper: env.wrapper })
    const detachInitial = attach(result)

    act(() => env.movePartitionTo(MOVED_PARTITION_X_MM))
    await flushMicrotasks()
    const firstEdit = result.current.framed
    const firstEditRooms = trackRooms(env, firstEdit)

    act(() => env.movePartitionTo(MOVED_AGAIN_PARTITION_X_MM))
    await flushMicrotasks()
    const live = trackFloor(result.current.framed)

    detachInitial()
    const detachFirstEdit = attach(result, firstEdit)

    expect(firstEditRooms.length).toBeGreaterThan(0)
    firstEditRooms.forEach(expectNoneDisposed)

    detachFirstEdit()
    attach(result)

    firstEditRooms.forEach(expectEveryGeometryDisposedOnce)
    expectNoneDisposed(live)
  })

  it('frees the geometry of a rebuilt room after the effect once the attached scene is released', async () => {
    const env = framedSceneEnvironment()
    const { result } = renderHook(() => useFramedScene(), { wrapper: env.wrapper })
    const oldRooms = trackRooms(env, result.current.framed)
    const detach = attach(result)
    detach()

    act(() => env.movePartitionTo(MOVED_PARTITION_X_MM))
    await flushMicrotasks()

    const live = trackFloor(result.current.framed)
    expect(oldRooms.length).toBeGreaterThan(0)
    oldRooms.forEach(expectEveryGeometryDisposedOnce)
    expectNoneDisposed(live)
  })

  it('frees the superseded and the live reconciler resources once each when it unmounts', async () => {
    const { wrapper } = framedSceneEnvironment()
    const { result, unmount } = renderHook(() => useFramedScene(), { wrapper })
    const superseded = trackResources(result.current.framed.root)
    attach(result)

    act(() => result.current.toggleEdgeOverlay())
    const live = trackResources(result.current.framed.root)
    await flushMicrotasks()

    expectNoneDisposed(superseded)
    expectNoneDisposed(live)

    unmount()
    await flushMicrotasks()

    expectEachDisposedOnce(superseded)
    expectEachDisposedOnce(live)
  })
})
