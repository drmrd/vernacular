import { useSyncExternalStore } from 'react'

import type { EnvironmentScene } from '../../core'
import { useEditorSession } from './editor-session-context'

// Shared snapshot for a project without saved scenes (the optional
// environmentScenes array, ADR-0143 shape, is absent). Frozen and reused
// across renders so useSyncExternalStore sees a referentially stable
// snapshot rather than a fresh array each call, which would otherwise force
// re-renders on every subscription check.
const EMPTY_SCENES = Object.freeze<EnvironmentScene[]>([]) as EnvironmentScene[]

/**
 * Subscribes the caller to the saved environment scenes on the editor session,
 * so the environment panel's scene list re-renders as scenes are saved or
 * removed.
 */
export function useProjectEnvironmentScenes(): EnvironmentScene[] {
  const session = useEditorSession()
  return useSyncExternalStore(
    session.subscribe,
    () => session.getProject().environmentScenes ?? EMPTY_SCENES,
  )
}
