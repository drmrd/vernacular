import { useEffect, useState } from 'react'
import type { SnapshotsPort } from './app'

// Resolves which SnapshotsPort (if any) drives autosave and crash recovery. An
// injected port is returned immediately so synchronous callers (tests) never wait
// on a promise. Otherwise the resolver runs once and its result lands in state on a
// later render, so the first paint never blocks on snapshot resolution.
export function useResolvedSnapshots(
  injected: SnapshotsPort | undefined,
  resolveSnapshots?: () => Promise<SnapshotsPort | undefined>,
): SnapshotsPort | undefined {
  const [resolved, setResolved] = useState<SnapshotsPort | undefined>(undefined)

  useEffect(() => {
    if (injected || !resolveSnapshots) {
      return
    }
    let cancelled = false
    void resolveSnapshots().then((port) => {
      if (!cancelled) {
        setResolved(port)
      }
    })
    return () => {
      cancelled = true
    }
  }, [injected, resolveSnapshots])

  return injected ?? resolved
}
