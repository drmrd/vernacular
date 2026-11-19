import { useEffect } from 'react'
import { useNotifications } from '../editor/design-system'
import type { DocumentHandle } from '../session'

export const SAVED_WITH_FAULTS =
  'This project has a fault in its data. A copy of its last sound state is kept. You can export it.'
export const SAVED_BY_NEWER_BUILD =
  'A newer version of Vernacular saved this project. The data it added is kept.'

/**
 * Shows each notice of the handle once. The handle delivers a notice to one listener only, also a
 * notice it held before this hook subscribed, so a second run of the effect gets nothing again.
 */
export function useHandleNotices(handle: DocumentHandle): void {
  const { warning, info } = useNotifications()
  useEffect(
    () =>
      handle.onNotice((notice) => {
        if (notice === 'saved-with-faults') {
          warning(SAVED_WITH_FAULTS)
        } else {
          info(SAVED_BY_NEWER_BUILD)
        }
      }),
    [handle, warning, info],
  )
}
