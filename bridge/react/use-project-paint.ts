import { useSyncExternalStore } from 'react'

import type { SurfaceTreatment } from '../../core'
import { useEditorSession } from './editor-session-context'

const EMPTY_PAINT: Record<string, SurfaceTreatment> = {}

/**
 * Subscribes the caller to the project paint store on the editor session, so the
 * three-dimensional view rebuilds with the new colors when paint is dispatched. The
 * store is the same `project.paint` record the two-dimensional Paint panel reads; an
 * unpainted project yields a stable empty record, so the external-store snapshot does
 * not churn.
 */
export function useProjectPaint(): Record<string, SurfaceTreatment> {
  const session = useEditorSession()
  return useSyncExternalStore(session.subscribe, () => session.getProject().paint ?? EMPTY_PAINT)
}
