import { useEffect } from 'react'
import { useNotifications } from '../editor/design-system'
import { isStorageDegraded, type StorageCapabilities } from '../storage'

// Raise the storage-degraded banner once capabilities resolve and report no durable backend
// (neither OPFS nor IndexedDB). The stable 'storage-degraded' id makes re-emits idempotent
// (replace in place), and because the banner emitter is a stable reference, the effect runs only
// when capabilities change, so dismissing the banner does not immediately re-raise it.
export function useDegradedStorageBanner(capabilities: StorageCapabilities | null): void {
  const { banner } = useNotifications()
  useEffect(() => {
    if (capabilities !== null && isStorageDegraded(capabilities)) {
      banner({
        id: 'storage-degraded',
        severity: 'warning',
        message: 'Storage is unavailable, so your work will not be saved between sessions.',
        dismissible: true,
      })
    }
  }, [capabilities, banner])
}
