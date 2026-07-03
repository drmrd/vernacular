import { useSyncExternalStore } from 'react'

import type { EnvironmentScene } from '../../core'
import { useEditorSession } from './editor-session-context'

// A project without saved scenes yields this shared empty array, so the
// useSyncExternalStore snapshot stays referentially stable across renders when
// the optional environmentScenes array is absent (ADR-0143 shape).
const EMPTY_SCENES: EnvironmentScene[] = []

/**
 * Subscribes the caller to the saved environment scenes on the editor session,
 * so the environment panel's scene list re-renders as scenes are saved or
 * removed. A project without the optional array yields a stable empty snapshot.
 */
export function useProjectEnvironmentScenes(): EnvironmentScene[] {
  const session = useEditorSession()
  return useSyncExternalStore(
    session.subscribe,
    () => session.getProject().environmentScenes ?? EMPTY_SCENES,
  )
}
