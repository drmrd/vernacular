import { useCallback, useEffect, useRef } from 'react'
import type { DocumentHandle } from '../session'
import type { ActiveProjectIdStore } from '../storage'

export interface RememberSavedProjectContext {
  /** The id the boot read at start, which is already the remembered one; null until it is read. */
  startId: string | null
  activeProjectIds: ActiveProjectIdStore | undefined
}

// The remembered id follows the project that was last saved, so a reload opens it (ADR-0183).
// Only a project of the browser's own durable workspace is remembered: a folder cannot be opened
// again at start without a user gesture, and a project kept in memory is gone after a reload. The
// id is written only when it differs from the one read at start or written last. A failed write
// leaves the save as it is, and the next save tries again. The returned callback is stable.
export function useRememberSavedProject(
  context: RememberSavedProjectContext,
): (handle: DocumentHandle) => void {
  const latest = useRef(context)
  useEffect(() => {
    latest.current = context
  })
  const written = useRef<string | null>(null)

  return useCallback((handle: DocumentHandle) => {
    const { startId, activeProjectIds } = latest.current
    if (activeProjectIds === undefined || !handle.durable) return
    if (handle.location.kind !== 'workspace') return
    const known = written.current ?? startId
    const id = handle.id
    if (id === known) return
    written.current = id
    void Promise.resolve()
      .then(() => activeProjectIds.write(id))
      .catch(() => {
        if (written.current === id) written.current = known
      })
  }, [])
}
