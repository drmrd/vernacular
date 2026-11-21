import type { RenameFailure } from '../session'
import { openFailureReason } from './open-failure-text'

const RENAME_FAILED = 'Could not rename the project: '

/** One sentence for a rename that did not happen. */
export function renameFailureText(failure: RenameFailure): string {
  switch (failure.kind) {
    case 'did-not-open':
      return `${RENAME_FAILED}it did not open.`
    case 'storage-unavailable':
    case 'save-failed':
      return `${RENAME_FAILED}${failure.message}`
    default:
      return openFailureReason(failure)
  }
}
