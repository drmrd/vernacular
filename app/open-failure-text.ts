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

/** The kinds of failure that carry their own detail: a decode failure, a message, a file name. */
type DetailedKind =
  | 'did-not-open'
  | 'did-not-import'
  | 'did-not-restore'
  | 'storage-unavailable'
  | 'unsupported-file'

type DetailedCause = Extract<OpenFailureCause, { readonly kind: DetailedKind }>

/** The failures whose text never changes. */
type FixedCause = Exclude<OpenFailureCause, DetailedCause>

/**
 * The object literal must name every detailed kind. Its keys are computed names because the kinds
 * are kebab-case.
 */
const DETAILED_KINDS: ReadonlySet<string> = new Set(
  Object.keys({
    ['did-not-open']: true,
    ['did-not-import']: true,
    ['did-not-restore']: true,
    ['storage-unavailable']: true,
    ['unsupported-file']: true,
  } satisfies Record<DetailedKind, true>),
)

/**
 * The text of each failure that never changes. The record must name every fixed kind, so a new
 * kind of failure is a type error here until it has its text. A cancelled pick and a restore with
 * nothing to restore give the empty string, since they are never shown.
 */
const FIXED_REASONS: Readonly<Record<FixedCause['kind'], string>> = {
  ['open-elsewhere']: OPEN_ELSEWHERE,
  ['not-found']: NOT_STORED,
  ['folder-empty']: FOLDER_EMPTY,
  ['folder-permission']: FOLDER_PERMISSION,
  ['folder-unavailable']: FOLDER_UNAVAILABLE,
  ['flush-failed']: SAVE_FAILED_DURING_SWITCH,
  cancelled: '',
  ['nothing-to-restore']: '',
}

function isDetailed(failure: OpenFailureCause): failure is DetailedCause {
  return DETAILED_KINDS.has(failure.kind)
}

/** The text of a failure that carries its own detail. */
function detailedReason(failure: DetailedCause): string {
  switch (failure.kind) {
    case 'did-not-open':
    case 'did-not-import':
    case 'did-not-restore':
      return new DocumentDecodeError(failure.decode).message
    case 'storage-unavailable':
      return failure.message
    case 'unsupported-file':
      return `Unsupported project file: ${failure.fileName}`
  }
}

/**
 * The text of a failure whose text never changes, or undefined for a failure that carries detail.
 * The empty string means the failure is never shown.
 */
export function fixedFailureReason(failure: OpenFailureCause): string | undefined {
  return isDetailed(failure) ? undefined : FIXED_REASONS[failure.kind]
}

/** One sentence for a failure of a switch, an import, an open folder, or a restore. */
export function openFailureReason(failure: OpenFailureCause): string {
  return isDetailed(failure) ? detailedReason(failure) : FIXED_REASONS[failure.kind]
}
