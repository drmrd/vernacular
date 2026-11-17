import { CURRENT_SCHEMA_REVISION } from '../../model/factories'
import type { Project } from '../../model/types'
import { checkCurrentSchema } from '../current-schema'
import type { CodecOptions, EncodedDocument, GraftDropped } from './codec-types'
import { decodeDocument } from './decode-document'
import { serializeDocumentJson } from './document-json'
import { preserveUnknown } from './graft'

const UNREADABLE_REVISION = 0

/** What the previous stored bytes give to the graft: a document, or the reason for none. */
interface PreviousDocument {
  readonly document?: unknown
  readonly graftDropped?: GraftDropped
}

/**
 * The previous stored document as the build reads it: migrated when a migration is pending (the
 * decode runs the chain, which changes nothing when none is), so a step that removed data is not
 * undone by the graft. A document that only fails the format rules still serves the graft.
 */
function readPrevious(previous: Uint8Array | undefined, options: CodecOptions): PreviousDocument {
  if (previous === undefined) return {}
  const decoded = decodeDocument(previous, options)
  if (decoded.ok) return { document: decoded.value.project }
  const { failure } = decoded
  return failure.kind === 'format-rules'
    ? { document: failure.document }
    : { graftDropped: failure }
}

/** Within one version a revision never goes down: the higher of the document's and the build's. */
function revisionToWrite(project: Project): number {
  const revision = project.meta.schemaRevision
  const own = Number.isInteger(revision) ? (revision as number) : UNREADABLE_REVISION
  return Math.max(own, CURRENT_SCHEMA_REVISION)
}

/**
 * Encode a document: check it against the current schema, graft the unknown data of the previous
 * stored document, write `meta.schemaRevision`, and serialize (ADR-0178). A document at a higher
 * revision than the build's is checked tolerantly. A failed check never blocks a save: the faults
 * are reported and the bytes still hold the document. Pure: no I/O.
 */
export function encodeDocument(
  project: Project,
  previous: Uint8Array | undefined,
  options: CodecOptions = {},
): EncodedDocument {
  const schemaRevision = revisionToWrite(project)
  const stamped: Project = { ...project, meta: { ...project.meta, schemaRevision } }
  const mode = schemaRevision > CURRENT_SCHEMA_REVISION ? 'tolerant' : 'strict'
  const faults = checkCurrentSchema(stamped, mode)
  const { document, graftDropped } = readPrevious(previous, options)
  const written = document === undefined ? stamped : preserveUnknown(document, stamped)
  const bytes = serializeDocumentJson(written)
  return graftDropped === undefined ? { bytes, faults } : { bytes, faults, graftDropped }
}
