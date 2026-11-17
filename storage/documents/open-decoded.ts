import { decodeDocument, encodeDocument } from '../../core'
import type { CodecOptions, FormatFault, GraftDropped, Project } from '../../core'
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
 * decode means. Interim rule: a document that only breaks the format rules is opened anyway, as its
 * migrated document, with its faults reported in a warning. Every other failure throws a
 * DocumentDecodeError that carries the failure. The cast of the failed document to a Project is the
 * deliberate gap of this interim rule: the document failed the check and still opens, and the later
 * refusal to open such a document removes the cast.
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
 * check is reported in a warning and never blocks the write; so is a previous document that could
 * not be read, because its unknown data is then dropped.
 */
export function encodeForWrite(
  project: Project,
  previous?: Uint8Array,
  options?: CodecOptions,
): Uint8Array {
  const { bytes, faults, graftDropped } = encodeDocument(project, previous, options)
  if (graftDropped !== undefined) warnGraftDropped(graftDropped)
  if (faults.length > 0) {
    warnFaults('The document being written breaks the format rules; writing it anyway.', faults)
  }
  return bytes
}
