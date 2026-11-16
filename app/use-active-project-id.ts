import { useEffect, useMemo, useState } from 'react'
import { InMemoryActiveProjectIdStore, type ActiveProjectIdStore } from '../storage'

export const DEFAULT_PROJECT_ID = 'current'

// The id the application opens at start: the override when one is given (tests),
// otherwise the remembered id, or the default id when nothing is remembered.
// Resolves to null until the port has been read, so the boot never loads early.
// Without a port nothing is remembered, as with a fresh in-memory one.
export function useActiveProjectId(
  override: string | undefined,
  provided: ActiveProjectIdStore | undefined,
): string | null {
  const activeProjectIds = useMemo(() => provided ?? new InMemoryActiveProjectIdStore(), [provided])
  const [remembered, setRemembered] = useState<string | null>(null)

  useEffect(() => {
    if (override !== undefined) return
    let cancelled = false
    // A port that breaks its contract and rejects counts as nothing remembered.
    void Promise.resolve()
      .then(() => activeProjectIds.read())
      .catch(() => null)
      .then((id) => {
        if (!cancelled) setRemembered(id ?? DEFAULT_PROJECT_ID)
      })
    return () => {
      cancelled = true
    }
  }, [override, activeProjectIds])

  return override ?? remembered
}
