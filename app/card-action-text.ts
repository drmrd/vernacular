import type { DeleteFailure, ExportFailure, RemoveFromListFailure, RenameFailure } from '../session'
import { OPEN_ELSEWHERE, openFailureReason } from './open-failure-text'

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

const UNCHECKED_COPY = 'This copy was not checked, because the project did not open.'
const NO_ASSETS = 'It has the project file only, and no assets.'

/** One sentence for an export that made no file. */
export function exportFailureText(failure: ExportFailure): string {
  return failure.kind === 'export-failed' ? failure.message : openFailureReason(failure)
}

/** The warning for a copy of a project that did not open, and what it holds. */
export function uncheckedCopyText(includedAssets: number): string {
  return includedAssets === 0 ? `${UNCHECKED_COPY} ${NO_ASSETS}` : UNCHECKED_COPY
}

const DELETE_FAILED = 'Could not delete the project: '

/** One sentence for a delete that did not happen. */
export function deleteFailureText(failure: DeleteFailure): string {
  switch (failure.kind) {
    case 'open-elsewhere':
      return OPEN_ELSEWHERE
    case 'flush-failed':
      return 'The changes of the open project could not be saved, so nothing was deleted.'
    case 'folder-project':
      return `${DELETE_FAILED}it is a folder project, which is removed from the list instead.`
    case 'storage-unavailable':
      return `${DELETE_FAILED}${failure.message}`
  }
}

const REMOVE_FAILED = 'Could not remove the folder from the list: '

/** One sentence for a folder that stays in the list. */
export function removeFromListFailureText(failure: RemoveFromListFailure): string {
  switch (failure.kind) {
    case 'open-elsewhere':
      return OPEN_ELSEWHERE
    case 'flush-failed':
      return 'The changes of the open project could not be saved, so the folder stays in the list.'
    case 'workspace-project':
      return `${REMOVE_FAILED}it is not a folder project.`
    case 'storage-unavailable':
      return `${REMOVE_FAILED}${failure.message}`
  }
}
