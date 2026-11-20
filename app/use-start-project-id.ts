import { useEffect, useState } from 'react'
import { latestWorkspaceRecord, reconcileIndex, type SessionPorts } from '../session'

export const DEFAULT_PROJECT_ID = 'current'

/** The start id read from the index of one ports object. */
interface StartIdOfPorts {
  readonly ports: SessionPorts
  readonly id: string
}

// The id that opens at start: the override when one is given (tests), otherwise the id of the
// workspace record used last, or the default id when the index holds none. Null until the index
// of the current ports was read, so the boot never loads early. The two runs of a double effect
// share one run of reconcileIndex, which shares overlapping calls for each ports object.
export function useStartProjectId(
  ports: SessionPorts | null,
  override: string | undefined,
): string | null {
  const [read, setRead] = useState<StartIdOfPorts | null>(null)

  useEffect(() => {
    if (override !== undefined || ports === null) return
    let cancelled = false
    void reconcileIndex(ports).then((records) => {
      if (cancelled) return
      setRead({ ports, id: latestWorkspaceRecord(records)?.id ?? DEFAULT_PROJECT_ID })
    })
    return () => {
      cancelled = true
    }
  }, [ports, override])

  if (override !== undefined) return override
  return read !== null && read.ports === ports ? read.id : null
}
