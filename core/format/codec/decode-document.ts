import { CURRENT_SCHEMA_REVISION } from '../../model/factories'
import type { Project } from '../../model/types'
import { checkCurrentSchema } from '../current-schema'
import type { CodecOptions, DecodeResult } from './codec-types'
import { readStoredDocument } from './read-stored-document'
import { checkModeFor, readRevision } from './revision'

function checkRead(project: Project, migratedFrom: number | undefined): DecodeResult {
  const revision = readRevision(project)
  const faults = checkCurrentSchema(project, checkModeFor(revision))
  if (faults.length > 0) {
    return { ok: false, failure: { kind: 'format-rules', faults, document: project, migratedFrom } }
  }
  const savedByNewerBuild = revision > CURRENT_SCHEMA_REVISION
  return { ok: true, value: { project, migratedFrom, savedByNewerBuild } }
}

/**
 * Decode the stored bytes of a document: read them through the shared reader (parse, refuse a
 * version above the build's, migrate when a migration is pending), then check the result against
 * the current schema (ADR-0178). A file at the build's version and at or below its revision is
 * checked strictly; a file at a higher revision is read tolerantly and reported as saved by a
 * newer build. Pure: no I/O.
 */
export function decodeDocument(bytes: Uint8Array, options: CodecOptions = {}): DecodeResult {
  const read = readStoredDocument(bytes, options)
  if (!read.ok) return read
  return checkRead(read.document, read.versionRaised ? read.storedVersion : undefined)
}
