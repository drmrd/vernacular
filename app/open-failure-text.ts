import type { FolderRefusal, ImportFailure, RestoreRefusal, SwitchFailure } from '../session'
import { DocumentDecodeError, type ArchiveLimitName } from '../storage'
import { groupedNumber } from './grouped-number'

export const OPEN_ELSEWHERE = 'This project is open in another tab.'
export const NOT_STORED = 'This project is not stored in this browser.'
export const FOLDER_EMPTY = 'This folder holds no Vernacular project.'
export const FOLDER_PERMISSION = 'Vernacular has no permission to use this folder.'
export const FOLDER_UNAVAILABLE = 'The folder of this project cannot be reached.'
export const SAVE_FAILED_DURING_SWITCH =
  'The changes could not be saved, so the project stays open.'

/** The refusals that an import, an open folder, or a restore adds to the failures of a switch. */
export type FlowRefusal = ImportFailure | FolderRefusal | RestoreRefusal

/** Every reason a switch, an import, an open folder, or a restore can give for not opening. */
export type OpenFailureCause = SwitchFailure | FlowRefusal

const BYTES_PER_MEGABYTE = 1_048_576

/** A size in bytes as whole megabytes, the unit a person reads a file size in. */
function megabytes(bytes: number): string {
  return `${groupedNumber(Math.round(bytes / BYTES_PER_MEGABYTE))} MB`
}

/** The sentence for an archive above one of the limits of the archive reader. */
export function archiveTooLargeText(limit: ArchiveLimitName, allowed: number): string {
  switch (limit) {
    case 'archiveBytes':
      return `The file is larger than ${megabytes(allowed)}.`
    case 'inflatedBytes':
      return `The file unpacks to more than ${megabytes(allowed)}.`
    case 'entries':
      return `The file holds more than ${groupedNumber(allowed)} entries.`
    case 'documentBytes':
      return `The project document in the file is larger than ${megabytes(allowed)}.`
  }
}

/** The failure that a thrown value becomes when a flow or a boot step throws instead of failing. */
export function storageUnavailableOf(error: unknown): SwitchFailure {
  const message = error instanceof Error ? error.message : String(error)
  return { kind: 'storage-unavailable', message }
}

/** The kinds of failure that carry their own detail: a decode failure, a message, a file name. */
type DetailedKind =
  | 'archive-too-large'
  | 'did-not-open'
  | 'did-not-import'
  | 'did-not-restore'
  | 'storage-unavailable'
  | 'unsupported-file'

type DetailedCause = Extract<OpenFailureCause, { readonly kind: DetailedKind }>

/** The failures whose text never changes. */
type FixedCause = Exclude<OpenFailureCause, DetailedCause>

type FixedKind = FixedCause['kind']

/** The fixed kinds that the first switch of isDetailedKind leaves to the second one. */
type RestKind = Exclude<FixedKind, 'flush-failed' | 'open-elsewhere' | 'not-found'>

/**
 * The text of each failure that never changes. The switch names every fixed kind and has no
 * default, so a new kind of failure is a type error here until it has its text. A cancelled pick
 * and a restore with nothing to restore give the empty string, since they are never shown.
 */
function fixedReason(kind: FixedKind): string {
  switch (kind) {
    case 'open-elsewhere':
      return OPEN_ELSEWHERE
    case 'not-found':
      return NOT_STORED
    case 'folder-empty':
      return FOLDER_EMPTY
    case 'folder-permission':
      return FOLDER_PERMISSION
    case 'folder-unavailable':
      return FOLDER_UNAVAILABLE
    case 'flush-failed':
      return SAVE_FAILED_DURING_SWITCH
    case 'cancelled':
    case 'nothing-to-restore':
      return ''
  }
}

/** The last fixed kinds of isDetailedKind. None of them carries detail. */
function isDetailedRestKind(kind: RestKind): false {
  switch (kind) {
    case 'folder-permission':
    case 'folder-unavailable':
    case 'folder-empty':
    case 'cancelled':
    case 'nothing-to-restore':
      return false
  }
}

/**
 * Whether the kind carries its own detail. The switch names every detailed kind and some fixed
 * ones, and hands the rest of the kinds to a second switch. Neither has a default for a kind it
 * names, so a new kind of failure is a type error until it is placed.
 */
function isDetailedKind(kind: OpenFailureCause['kind']): boolean {
  switch (kind) {
    case 'archive-too-large':
    case 'did-not-open':
    case 'did-not-import':
    case 'did-not-restore':
    case 'storage-unavailable':
    case 'unsupported-file':
      return true
    case 'flush-failed':
    case 'open-elsewhere':
    case 'not-found':
      return false
    default:
      return isDetailedRestKind(kind)
  }
}

function isDetailed(failure: OpenFailureCause): failure is DetailedCause {
  return isDetailedKind(failure.kind)
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
    case 'archive-too-large':
      return archiveTooLargeText(failure.limit, failure.allowed)
  }
}

/**
 * The text of a failure whose text never changes, or undefined for a failure that carries detail.
 * The empty string means the failure is never shown.
 */
export function fixedFailureReason(failure: OpenFailureCause): string | undefined {
  return isDetailed(failure) ? undefined : fixedReason(failure.kind)
}

/** One sentence for a failure of a switch, an import, an open folder, or a restore. */
export function openFailureReason(failure: OpenFailureCause): string {
  return isDetailed(failure) ? detailedReason(failure) : fixedReason(failure.kind)
}
