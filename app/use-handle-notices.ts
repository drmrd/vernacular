import { useEffect } from 'react'
import { useNotifications } from '../editor/design-system'
import type { DocumentHandle, HandleNotice } from '../session'
import { RECOVERY_COPY_KEPT } from './open-failure-text'

export const SAVED_WITH_FAULTS =
  'This project has a fault in its data. A copy of its last sound state is kept. You can export it.'
export const SAVED_IN_SECOND_FILE =
  "A newer version of Vernacular saved this project's plan file, and this version cannot read it. Your changes are saved in a second plan file. You can choose between the two plan files on the Projects page."
export const UNREADABLE_FILE_REPLACED =
  "The stored plan file could not be read. A copy of it is kept with the project's backups."
export const SAVED_BY_NEWER_BUILD =
  'A newer version of Vernacular saved this project. The data it added is kept.'

/**
 * Shows each notice of the handle once. A notice held before this hook subscribes goes to its first
 * listener and is then spent, so the second run of the effect under StrictMode gets nothing.
 */
export function useHandleNotices(handle: DocumentHandle): void {
  const { warning, info } = useNotifications()
  useEffect(
    () =>
      handle.onNotice((notice) => {
        showNotice(notice, warning, info)
      }),
    [handle, warning, info],
  )
}

/** Shows the sentence of one notice. The switch has no default, so a new kind needs its sentence. */
function showNotice(
  notice: HandleNotice,
  warning: (message: string) => void,
  info: (message: string) => void,
): void {
  switch (notice) {
    case 'saved-with-faults':
      warning(SAVED_WITH_FAULTS)
      return
    case 'saved-by-newer-build':
      info(SAVED_BY_NEWER_BUILD)
      return
    case 'recovery-copy-kept':
      warning(RECOVERY_COPY_KEPT)
      return
    case 'saved-in-second-file':
      warning(SAVED_IN_SECOND_FILE)
      return
    case 'unreadable-file-replaced':
      warning(UNREADABLE_FILE_REPLACED)
      return
    default:
      return assertNever(notice)
  }
}

function assertNever(notice: never): never {
  throw new Error(`Unhandled handle notice: ${String(notice)}`)
}
