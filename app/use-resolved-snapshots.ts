import { useEffect, useState } from 'react'
import type { SnapshotsPort } from './app'

interface ResolvedSnapshots {
  projectId: string
  port: SnapshotsPort | undefined
}

// Resolves which SnapshotsPort (if any) drives autosave and crash recovery. A
// synchronously available port is returned immediately so the caller never waits
// on a promise. Otherwise the resolver runs once the project id is known, and again
// whenever it changes; its result lands in state on a later render, so the first
// paint never blocks on snapshot resolution. A port resolved for an earlier id is
// never returned, so a new project's snapshots never land in another project's directory.
export function useResolvedSnapshots(
  injected: SnapshotsPort | undefined,
  resolveSnapshots: ((projectId: string) => Promise<SnapshotsPort | undefined>) | undefined,
  projectId: string | null,
): SnapshotsPort | undefined {
  const [resolved, setResolved] = useState<ResolvedSnapshots>()

  useEffect(() => {
    if (injected !== undefined || !resolveSnapshots || projectId === null) {
      return
    }
    let cancelled = false
    void resolveSnapshots(projectId).then((port) => {
      if (!cancelled) {
        setResolved({ projectId, port })
      }
    })
    return () => {
      cancelled = true
    }
  }, [injected, resolveSnapshots, projectId])

  return injected ?? (resolved?.projectId === projectId ? resolved.port : undefined)
}
