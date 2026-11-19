import type { FolderRefusal, ImportFailure, RestoreRefusal, SwitchFailure } from '../session'
import { DocumentDecodeError } from '../storage'

export const OPEN_ELSEWHERE = 'This project is open in another tab.'
export const NOT_STORED = 'This project is not stored in this browser.'
export const FOLDER_EMPTY = 'This folder holds no Vernacular project.'
export const FOLDER_PERMISSION = 'Vernacular has no permission to use this folder.'
export const FOLDER_UNAVAILABLE = 'The folder of this project cannot be reached.'
export const SAVE_FAILED_DURING_SWITCH =
  'The changes could not be saved, so the project stays open.'

/** Every reason a switch, an import, an open folder, or a restore can give for not opening. */
export type OpenFailureCause = SwitchFailure | ImportFailure | FolderRefusal | RestoreRefusal

/**
 * The failures whose text never changes. A cancelled pick and a restore with nothing to restore
 * give the empty string, since they are never shown.
 */
const FIXED_REASONS: ReadonlyMap<string, string> = new Map<OpenFailureCause['kind'], string>([
  ['open-elsewhere', OPEN_ELSEWHERE],
  ['not-found', NOT_STORED],
  ['folder-empty', FOLDER_EMPTY],
  ['folder-permission', FOLDER_PERMISSION],
  ['folder-unavailable', FOLDER_UNAVAILABLE],
  ['flush-failed', SAVE_FAILED_DURING_SWITCH],
  ['cancelled', ''],
  ['nothing-to-restore', ''],
])

/** The text of a failure that carries its own detail: a decode failure, a message, a file name. */
function detailedReason(failure: OpenFailureCause): string {
  switch (failure.kind) {
    case 'did-not-open':
    case 'did-not-import':
    case 'did-not-restore':
      return new DocumentDecodeError(failure.decode).message
    case 'storage-unavailable':
      return failure.message
    case 'unsupported-file':
      return `Unsupported project file: ${failure.fileName}`
    default:
      return ''
  }
}

/** One sentence for a failure of a switch, an import, an open folder, or a restore. */
export function openFailureReason(failure: OpenFailureCause): string {
  return FIXED_REASONS.get(failure.kind) ?? detailedReason(failure)
}
