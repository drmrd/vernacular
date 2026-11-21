import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, EncodedDocument, FormatFault, GraftDropped, Project } from '../../core'
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

/**
 * Read stored bytes through the codec: the one place where every read path decides what a failed
 * decode means. Every failure throws a DocumentDecodeError that carries the failure, a document
 * that breaks the format rules included.
 */
export function openDecodedDocument(bytes: Uint8Array, options?: CodecOptions): OpenedDocument {
  const result = decodeDocument(bytes, options)
  if (!result.ok) {
    throw new DocumentDecodeError(result.failure)
  }
  return { project: result.value.project, migratedFrom: result.value.migratedFrom }
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
