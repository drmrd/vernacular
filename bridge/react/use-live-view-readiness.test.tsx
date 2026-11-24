import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, cleanup, renderHook } from '@testing-library/react'
import {
  createSceneSessionStore,
  type SceneSessionStore,
} from '../scene-session/scene-session-store'
import { SceneSessionProvider } from './scene-session-provider'
import type { TextureStatus } from './texture-cache'
import { useLiveViewReadiness } from './use-live-view-readiness'

afterEach(cleanup)

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function renderReadinessOn(store: SceneSessionStore, groundTexture: TextureStatus) {
  return renderHook(({ groundTexture }) => useLiveViewReadiness(groundTexture), {
    initialProps: { groundTexture },
    wrapper: providerAround(store),
  })
}

function frameDrawnFact(store: SceneSessionStore) {
  return store.getSceneSession().frameDrawnSincePipelineSettled
}

/** Leaves the fact true in the store, the way a live view opened earlier does. */
function leaveFrameDrawnFromAnEarlierOpen(store: SceneSessionStore) {
  const earlier = renderReadinessOn(store, 'ready')
  act(() => {
    earlier.result.current.noteFrameDrawn()
  })
  earlier.unmount()
  expect(frameDrawnFact(store)).toBe(true)
}

describe('useLiveViewReadiness', () => {
  it('re-arms the drawn-frame fact on every pipeline build, so a frame from a pipeline being replaced never counts', () => {
    const store = createSceneSessionStore()
    const { result } = renderReadinessOn(store, 'ready')

    // A schematic view draws straight through the renderer with no pipeline behind it, so
    // the frame it just drew is final. Drawing a frame says nothing about the stored session.
    act(() => {
      result.current.noteFrameDrawn()
    })
    expect(store.getSceneSession()).toMatchObject({
      sessionRestored: false,
      frameDrawnSincePipelineSettled: true,
    })

    // The stored camera, walk pose, and preset landing have been applied to the live view.
    act(() => {
      result.current.noteSessionApplied()
    })
    expect(store.getSceneSession().sessionRestored).toBe(true)

    // A pipeline build starts. The pixels on screen came from the pipeline being replaced.
    act(() => {
      result.current.notePipelineBuildStarted()
    })
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(false)

    // The frame loop keeps running while the build is in flight, and none of those frames
    // show the pipeline being built.
    act(() => {
      result.current.noteFrameDrawn()
    })
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(false)

    // The build settles. Installing a pipeline is not the same as having drawn through it.
    act(() => {
      result.current.notePipelineSettled()
    })
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(false)

    // The first frame after settlement draws through the pipeline that is now installed.
    act(() => {
      result.current.noteFrameDrawn()
    })
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(true)

    // A second build has to drop the fact again rather than leaving it latched from the
    // first settlement, which is the whole reason a capture can trust it.
    act(() => {
      result.current.notePipelineBuildStarted()
    })
    expect(store.getSceneSession().frameDrawnSincePipelineSettled).toBe(false)

    act(() => {
      result.current.notePipelineSettled()
      result.current.noteFrameDrawn()
    })
    expect(store.getSceneSession()).toMatchObject({
      sessionRestored: true,
      frameDrawnSincePipelineSettled: true,
    })
  })

  it('clears a drawn-frame fact left by an earlier open when a mount starts with the ground loading', () => {
    const store = createSceneSessionStore()
    leaveFrameDrawnFromAnEarlierOpen(store)

    renderReadinessOn(store, 'loading')

    expect(frameDrawnFact(store)).toBe(false)
  })

  it('does not count a frame drawn while the ground texture is loading', () => {
    const store = createSceneSessionStore()
    const { result } = renderReadinessOn(store, 'loading')

    act(() => {
      result.current.noteFrameDrawn()
    })

    expect(frameDrawnFact(store)).toBe(false)
  })

  it.each<TextureStatus>(['ready', 'failed'])(
    'settling the ground as %s writes nothing and the next frame counts',
    (settled) => {
      const store = createSceneSessionStore()
      leaveFrameDrawnFromAnEarlierOpen(store)
      const { result, rerender } = renderReadinessOn(store, 'loading')

      rerender({ groundTexture: settled })
      expect(frameDrawnFact(store)).toBe(false)

      act(() => {
        result.current.noteFrameDrawn()
      })
      expect(frameDrawnFact(store)).toBe(true)
    },
  )

  it('keeps a frame uncounted until both the pipeline build and the ground texture have settled', () => {
    const store = createSceneSessionStore()
    const { result, rerender } = renderReadinessOn(store, 'loading')
    act(() => {
      result.current.notePipelineBuildStarted()
    })

    rerender({ groundTexture: 'ready' })
    act(() => {
      result.current.noteFrameDrawn()
    })
    expect(frameDrawnFact(store)).toBe(false)

    act(() => {
      result.current.notePipelineSettled()
      result.current.noteFrameDrawn()
    })
    expect(frameDrawnFact(store)).toBe(true)
  })

  it('keeps a frame uncounted after the pipeline settles while the ground is still loading', () => {
    const store = createSceneSessionStore()
    const { result } = renderReadinessOn(store, 'loading')

    act(() => {
      result.current.notePipelineBuildStarted()
      result.current.notePipelineSettled()
      result.current.noteFrameDrawn()
    })

    expect(frameDrawnFact(store)).toBe(false)
  })

  it('clears a counted frame when the ground starts to load again', () => {
    const store = createSceneSessionStore()
    const { result, rerender } = renderReadinessOn(store, 'ready')
    act(() => {
      result.current.noteFrameDrawn()
    })
    expect(frameDrawnFact(store)).toBe(true)

    rerender({ groundTexture: 'loading' })

    expect(frameDrawnFact(store)).toBe(false)
  })
})
