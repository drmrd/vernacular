import { useMemo, useRef } from 'react'

import { useSceneSessionStoreOrLocal } from './scene-session-context'

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
  /** The build in flight has settled, however it settled: installed, discarded, or failed. */
  notePipelineSettled: () => void
  /** A frame has finished drawing and compositing. */
  noteFrameDrawn: () => void
}

/**
 * Turns the live view's render-pipeline events into the two session readiness facts.
 *
 * A frame drawn while a build is in flight shows the pipeline being replaced, not the one the
 * viewer is waiting on, so it does not count: the build start clears the drawn-frame fact and
 * only a frame after settlement sets it again. The fact therefore never latches, and a
 * screenshot taken on it is never of a half-swapped pipeline.
 */
export function useLiveViewReadiness(): LiveViewReadinessNotes {
  const store = useSceneSessionStoreOrLocal()
  // Whether a build is in flight lives in a ref rather than in the session: nothing renders
  // from it, it only decides whether the next drawn frame counts.
  const buildInFlightRef = useRef(false)
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
        if (buildInFlightRef.current) return
        store.updateSceneSession({ frameDrawnSincePipelineSettled: true })
      },
    }),
    [store],
  )
}
