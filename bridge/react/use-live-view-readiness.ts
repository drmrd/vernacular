import { useLayoutEffect, useMemo, useRef } from 'react'

import { useSceneSessionStoreOrLocal } from './scene-session-context'
import type { TextureStatus } from './texture-cache'

/**
 * The notes the live view sends as its render pipeline passes each readiness moment. The two
 * session facts behind `data-live-view-ready` (scene-session-provider.tsx) are written from
 * here, so the view's producers say what happened and this hook decides what that means for
 * readiness.
 */
export interface LiveViewReadinessNotes {
  /** The stored session (ADR-0170) has reached the live view. */
  noteSessionApplied: () => void
  /** A render-pipeline build has started, so frames drawn from here on are mid-build. */
  notePipelineBuildStarted: () => void
  /**
   * The build in flight has settled, however it settled: installed, discarded, failed, or
   * stopped by the takeover turning off or unmounting.
   */
  notePipelineSettled: () => void
  /** A frame has finished drawing and compositing. */
  noteFrameDrawn: () => void
}

/**
 * Turns the live view's render-pipeline events into the two session readiness facts.
 *
 * A frame drawn while a build or the ground texture is in flight shows the scene being
 * replaced, not the one the viewer is waiting on, so it does not count: the build start and a
 * ground texture that starts loading each clear the drawn-frame fact, and only a frame after
 * both have settled sets it again. The fact therefore never latches, and a screenshot taken on
 * it is never of a half-swapped pipeline or a ground still waiting for its grass.
 */
export function useLiveViewReadiness(groundTexture: TextureStatus): LiveViewReadinessNotes {
  const store = useSceneSessionStoreOrLocal()
  // Whether a build is in flight lives in a ref rather than in the session: nothing renders
  // from it, it only decides whether the next drawn frame counts.
  const buildInFlightRef = useRef(false)
  const groundInFlightRef = useRef(false)
  useLayoutEffect(() => {
    groundInFlightRef.current = groundTexture === 'loading'
    if (groundInFlightRef.current)
      store.updateSceneSession({ frameDrawnSincePipelineSettled: false })
  }, [store, groundTexture])
  return useMemo(
    () => ({
      noteSessionApplied: () => store.updateSceneSession({ sessionRestored: true }),
      notePipelineBuildStarted: () => {
        buildInFlightRef.current = true
        store.updateSceneSession({ frameDrawnSincePipelineSettled: false })
      },
      notePipelineSettled: () => {
        buildInFlightRef.current = false
      },
      noteFrameDrawn: () => {
        if (buildInFlightRef.current || groundInFlightRef.current) return
        store.updateSceneSession({ frameDrawnSincePipelineSettled: true })
      },
    }),
    [store],
  )
}
