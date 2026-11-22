import { useEffect, useRef } from 'react'
import { useNotifications } from '../editor/design-system'
import type { DocumentHandle } from '../session'
import type { StorageCapabilities } from '../storage'

const BANNER_WITH_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it, or open a folder.'
const BANNER_WITHOUT_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it.'

// Raise the storage-degraded banner once for each mount, when the store that holds the work (the
// open project's, or with none open, the workspace's) lives in the tab alone and the capabilities
// are known. The text offers a folder only where the browser opens
// one. A dismissal holds: the ref remembers that the banner was raised, so a later project does
// not bring it back, and a durable project that opens later leaves it in place.
export function useDegradedStorageBanner(
  handle: Pick<DocumentHandle, 'durable'> | null,
  capabilities: StorageCapabilities | null,
): void {
  const { banner } = useNotifications()
  const raised = useRef(false)
  const tabOnly = handle !== null && !handle.durable
  useEffect(() => {
    if (!tabOnly || capabilities === null || raised.current) {
      return
    }
    raised.current = true
    banner({
      id: 'storage-degraded',
      severity: 'warning',
      message: capabilities.fileSystemAccess ? BANNER_WITH_FOLDERS : BANNER_WITHOUT_FOLDERS,
      dismissible: true,
    })
  }, [tabOnly, capabilities, banner])
}
