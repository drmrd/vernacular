import { useSyncExternalStore } from 'react'

import type { Site } from '../../core'
import { useEditorSession } from './editor-session-context'

/**
 * Subscribes the caller to the project site on the editor session, so the
 * three-dimensional view re-lights when the site location, north bearing, or
 * timezone changes. The site is the same `project.site` the site panel edits;
 * a project without one yields undefined, a stable external-store snapshot.
 */
export function useProjectSite(): Site | undefined {
  const session = useEditorSession()
  return useSyncExternalStore(session.subscribe, () => session.getProject().site)
}
