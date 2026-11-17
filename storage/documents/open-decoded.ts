import { decodeDocument, encodeDocument } from '../../core'
import type {
  CodecOptions,
  DecodeFailure,
  EncodedDocument,
  FormatFault,
  GraftDropped,
  Project,
} from '../../core'
import { DocumentDecodeError } from './document-decode-error'

/** A document that a store or an import opened from stored bytes. */
export interface OpenedDocument {
  readonly project: Project
  /** The stored schema version when a migration ran; undefined when the file was current. */
  readonly migratedFrom: number | undefined
}

function warnFaults(message: string, faults: readonly FormatFault[]): void {
  console.warn(message, faults)
}

function warnGraftDropped(failure: GraftDropped): void {
  console.warn(
    'The previous stored document could not be read, so its unknown data is not kept.',
    failure,
  )
}

/** A decode failure of the one kind the interim rule opens anyway. */
export type FormatRulesFailure = Extract<DecodeFailure, { readonly kind: 'format-rules' }>

/** Whether the interim rule opens a document with this failure anyway. */
export function mayOpenDespiteFaults(failure: DecodeFailure): failure is FormatRulesFailure {
  return failure.kind === 'format-rules'
}

/**
 * The interim rule, in one place: a document that only breaks the format rules is opened anyway,
 * as its migrated document, with its faults reported in a warning. The cast of the failed document
 * to a Project is the deliberate gap of this interim rule: the document failed the check and still
 * opens, and the later refusal to open such a document removes the cast.
 */
export function openDespiteFaults(failure: FormatRulesFailure): Project {
  warnFaults('The stored document breaks the format rules; opening it anyway.', failure.faults)
  return failure.document as Project
}

/**
 * Read stored bytes through the codec: the one place where every read path decides what a failed
 * decode means. A document that only breaks the format rules opens through `openDespiteFaults`;
 * every other failure throws a DocumentDecodeError that carries the failure.
 */
export function openDecodedDocument(bytes: Uint8Array, options?: CodecOptions): OpenedDocument {
  const result = decodeDocument(bytes, options)
  if (result.ok) {
    return { project: result.value.project, migratedFrom: result.value.migratedFrom }
  }
  const { failure } = result
  if (!mayOpenDespiteFaults(failure)) {
    throw new DocumentDecodeError(failure)
  }
  return { project: openDespiteFaults(failure), migratedFrom: failure.migratedFrom }
}

/**
 * Report what a write found: a failed check, and a previous document that could not be read (its
 * unknown data is then dropped). Neither blocks the write; both are warnings.
 */
export function warnAboutEncodeProblems(encoded: EncodedDocument): void {
  if (encoded.graftDropped !== undefined) warnGraftDropped(encoded.graftDropped)
  if (encoded.faults.length > 0) {
    warnFaults(
      'The document being written breaks the format rules; writing it anyway.',
      encoded.faults,
    )
  }
}

/**
 * The bytes to store for a project, written over `previous` so unknown data carries over. A failed
 * check is reported in a warning and never blocks the write; so is a previous document that could
 * not be read, because its unknown data is then dropped.
 */
export function encodeForWrite(
  project: Project,
  previous?: Uint8Array,
  options?: CodecOptions,
): Uint8Array {
  const encoded = encodeDocument(project, previous, options)
  warnAboutEncodeProblems(encoded)
  return encoded.bytes
}
