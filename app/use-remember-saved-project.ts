import { useCallback, useEffect, useRef } from 'react'
import type { ActiveProjectIdStore } from '../storage'

export interface RememberSavedProjectContext {
  /** The id of the open project; null until the boot has one. */
  projectId: string | null
  /** The id the boot opened at start, which is already the remembered one. */
  activeProjectId: string | null
  /** False when the session runs on the in-memory fallback store. */
  durable: boolean
  activeProjectIds: ActiveProjectIdStore | undefined
}

// The remembered id moves to the open project after its first successful save to a
// durable store (ADR-0183). A failed write of the id leaves the save as it is, and the
// next save tries again. The returned callback is stable, so autosave never re-arms.
export function useRememberSavedProject(context: RememberSavedProjectContext): () => void {
  const latest = useRef(context)
  useEffect(() => {
    latest.current = context
  })
  const written = useRef<string | null>(null)

  return useCallback(() => {
    const { projectId, activeProjectId, durable, activeProjectIds } = latest.current
    if (!durable || activeProjectIds === undefined || projectId === null) return
    if (projectId === activeProjectId || projectId === written.current) return
    written.current = projectId
    void Promise.resolve()
      .then(() => activeProjectIds.write(projectId))
      .catch(() => {
        if (written.current === projectId) written.current = null
      })
  }, [])
}
