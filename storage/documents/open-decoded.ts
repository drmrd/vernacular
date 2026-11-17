import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, FormatFault, Project } from '../../core'
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

/**
 * Read stored bytes through the codec: the one place where every read path decides what a failed
 * decode means. Interim rule: a document that only breaks the format rules is opened anyway, as its
 * migrated document, with its faults reported in a warning. Every other failure throws a
 * DocumentDecodeError that carries the failure.
 */
export function openDecodedDocument(bytes: Uint8Array, options?: CodecOptions): OpenedDocument {
  const result = decodeDocument(bytes, options)
  if (result.ok) {
    return { project: result.value.project, migratedFrom: result.value.migratedFrom }
  }
  const { failure } = result
  if (failure.kind !== 'format-rules') {
    throw new DocumentDecodeError(failure)
  }
  warnFaults('The stored document breaks the format rules; opening it anyway.', failure.faults)
  return { project: failure.document as Project, migratedFrom: failure.migratedFrom }
}

/**
 * The bytes to store for a project, written over `previous` so unknown data carries over. A failed
 * check is reported in a warning and never blocks the write.
 */
export function encodeForWrite(
  project: Project,
  previous: Uint8Array | undefined,
  options?: CodecOptions,
): Uint8Array {
  const { bytes, faults } = encodeDocument(project, previous, options)
  if (faults.length > 0) {
    warnFaults('The document being written breaks the format rules; writing it anyway.', faults)
  }
  return bytes
}
