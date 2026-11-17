import { CURRENT_SCHEMA_REVISION } from '../../model/factories'
import type { Project } from '../../model/types'
import { checkCurrentSchema } from '../current-schema'
import type { CodecOptions, EncodedDocument, GraftDropped } from './codec-types'
import { serializeDocumentJson } from './document-json'
import { preserveUnknown } from './graft'
import { readStoredDocument } from './read-stored-document'
import { checkModeFor, readRevision } from './revision'

/** What the previous stored bytes give to the graft: a document, or the reason for none. */
interface PreviousDocument {
  readonly document?: unknown
  readonly graftDropped?: GraftDropped
}

/**
 * The previous stored document as the build reads it: migrated when a migration is pending, so a
 * step that removed data is not undone by the graft. The format rules are not checked on it: a
 * document that only breaks them still serves the graft.
 */
function readPrevious(previous: Uint8Array | undefined, options: CodecOptions): PreviousDocument {
  if (previous === undefined) return {}
  const read = readStoredDocument(previous, options)
  return read.ok ? { document: read.document } : { graftDropped: read.failure }
}

/**
 * A revision never goes down within one version: the highest of the project's, the previous
 * stored document's, and the build's. A previous document whose version rose carries no revision
 * after it was brought current, so it counts as none. No versions are compared otherwise because
 * a project in memory is always at the build's version.
 */
function revisionToWrite(project: Project, previous: unknown): number {
  const previousRevision = previous === undefined ? 0 : readRevision(previous as Project)
  return Math.max(readRevision(project), previousRevision, CURRENT_SCHEMA_REVISION)
}

/**
 * Encode a document: graft the unknown data of the previous stored document, write
 * `meta.schemaRevision`, check the document that is written against the current schema, and
 * serialize (ADR-0178). A document written at a higher revision than the build's is checked
 * tolerantly. A failed check never blocks a save: the faults are reported and the bytes still hold
 * the document. Pure: no I/O.
 */
export function encodeDocument(
  project: Project,
  previous: Uint8Array | undefined,
  options: CodecOptions = {},
): EncodedDocument {
  const { document, graftDropped } = readPrevious(previous, options)
  const schemaRevision = revisionToWrite(project, document)
  const stamped: Project = { ...project, meta: { ...project.meta, schemaRevision } }
  const written = document === undefined ? stamped : preserveUnknown(document, stamped)
  const faults = checkCurrentSchema(written, checkModeFor(schemaRevision))
  const bytes = serializeDocumentJson(written)
  return graftDropped === undefined ? { bytes, faults } : { bytes, faults, graftDropped }
}
