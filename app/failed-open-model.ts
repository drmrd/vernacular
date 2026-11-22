import { CURRENT_SCHEMA_VERSION, type DecodeFailure, type RepairOffer } from '../core'
import type { FailedOpenCause, FailedOpenDetails } from '../editor/projects'
import type { ImportFailure, SwitchFailure } from '../session'
import { openFailureReason } from './open-failure-text'

/** What the failed-open dialog shows for a failure, and the repair that it offers. */
export interface FailedOpenModel {
  readonly cause: FailedOpenCause
  readonly details: FailedOpenDetails
  /** The repair that would let the document open, when there is one. */
  readonly repair?: RepairOffer | undefined
}

/** The cause of a document that did not decode. Bytes that are not JSON hold no project. */
function decodeCause(decode: DecodeFailure): FailedOpenCause {
  switch (decode.kind) {
    case 'not-json':
    case 'not-a-project':
      return 'not-a-project'
    case 'newer-version':
      return 'newer-version'
    case 'migration-failed':
      return 'migration-failed'
    case 'format-rules':
      return 'format-rules'
  }
}

/** The format version of the stored document, when the failure tells it. */
function formatVersionOf(decode: DecodeFailure): number | undefined {
  switch (decode.kind) {
    case 'newer-version':
      return decode.version
    case 'migration-failed':
      return decode.fromVersion
    case 'format-rules':
      return decode.migratedFrom ?? CURRENT_SCHEMA_VERSION
    case 'not-json':
    case 'not-a-project':
      return undefined
  }
}

/** The model of a document that did not decode, with its faults and its repair. */
function decodeModel(
  failure: Extract<SwitchFailure | ImportFailure, { readonly decode: DecodeFailure }>,
  build: string,
): FailedOpenModel {
  const { decode, repair } = failure
  const faults = decode.kind === 'format-rules' ? decode.faults : []
  const formatVersion = formatVersionOf(decode)
  return {
    cause: decodeCause(decode),
    details: {
      error: openFailureReason(failure),
      faults: faults.map(({ path, message }) => ({ path, message })),
      ...(formatVersion === undefined ? {} : { formatVersion }),
      build,
      removedPaths: repair?.removedPaths ?? [],
    },
    repair,
  }
}

/** The model of a failure that names no document: only its sentence and the build. */
function plainModel(
  cause: FailedOpenCause,
  failure: SwitchFailure | ImportFailure,
  build: string,
): FailedOpenModel {
  return {
    cause,
    details: { error: openFailureReason(failure), faults: [], build, removedPaths: [] },
  }
}

/** The kinds of failure that the failed-open dialog shows. */
type DialogKind =
  | 'did-not-open'
  | 'did-not-import'
  | 'storage-unavailable'
  | 'folder-unavailable'
  | 'archive-too-large'

/** A kind of failure that the dialog does not show. */
type OtherNoticeKind = Exclude<(SwitchFailure | ImportFailure)['kind'], DialogKind>

/**
 * No model for a failure that another notice says: the page's sentence, or the toast of a file of
 * another type. A new kind of failure fails the typecheck here until it is given a case.
 */
function otherNoticeModel(kind: OtherNoticeKind): undefined {
  switch (kind) {
    case 'open-elsewhere':
    case 'not-found':
    case 'folder-permission':
    case 'flush-failed':
    case 'unsupported-file':
      return undefined
    default:
      return kind satisfies never
  }
}

/**
 * The cause and the details of a failure that the failed-open dialog shows, or `undefined` for a
 * failure that another notice says.
 */
export function failedOpenModel(
  failure: SwitchFailure | ImportFailure,
  build: string,
): FailedOpenModel | undefined {
  switch (failure.kind) {
    case 'did-not-open':
    case 'did-not-import':
      return decodeModel(failure, build)
    case 'storage-unavailable':
    case 'folder-unavailable':
      return plainModel(failure.kind, failure, build)
    case 'archive-too-large':
      return plainModel('file-too-large', failure, build)
    default:
      return otherNoticeModel(failure.kind)
  }
}
