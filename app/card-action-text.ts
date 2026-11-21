import type { ExportFailure, RenameFailure } from '../session'
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
