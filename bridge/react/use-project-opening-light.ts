import { useSyncExternalStore } from 'react'

import type { OpeningLight } from '../../core'
import { useEditorSession } from './editor-session-context'

/**
 * Subscribes the caller to the project's stored opening light on the editor
 * session, so the environment rail's status line re-renders when the light is
 * stored, cleared, or restored by undo. Returns undefined when none is stored.
 */
export function useProjectOpeningLight(): OpeningLight | undefined {
  const session = useEditorSession()
  return useSyncExternalStore(session.subscribe, () => session.getProject().openingLight)
}
