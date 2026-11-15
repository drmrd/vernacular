import { useEffect, useState } from 'react'
import type { SnapshotsPort } from './app'
import { DEFAULT_PROJECT_ID } from './use-active-project-id'

// Resolves which SnapshotsPort (if any) drives autosave and crash recovery. A
// synchronously available port is returned immediately so the caller never waits
// on a promise. Otherwise the resolver runs once the project id is known and its
// result lands in state on a later render, so the first paint never blocks on
// snapshot resolution.
export function useResolvedSnapshots(
  injected: SnapshotsPort | undefined,
  resolveSnapshots: ((projectId: string) => Promise<SnapshotsPort | undefined>) | undefined,
  projectId: string | null = DEFAULT_PROJECT_ID,
): SnapshotsPort | undefined {
  const [resolved, setResolved] = useState<SnapshotsPort>()

  useEffect(() => {
    if (injected !== undefined || !resolveSnapshots || projectId === null) {
      return
    }
    let cancelled = false
    void resolveSnapshots(projectId).then((port) => {
      if (!cancelled) {
        setResolved(port)
      }
    })
    return () => {
      cancelled = true
    }
  }, [injected, resolveSnapshots, projectId])

  return injected ?? resolved
}
