import { isMigrationPending, migrateProject, targetVersionOf } from '../../migrations/migrate'
import { MalformedProjectError, UnsupportedSchemaVersionError } from '../../migrations/types'
import type { Project } from '../../model/types'
import type { CodecOptions, ReadFailure } from './codec-types'
import { parseDocumentJson } from './document-json'
import { asRecord, isInteger } from './json-values'

const NOT_JSON_FALLBACK = 'The bytes are not UTF-8 JSON'
const MIGRATION_FAILED_FALLBACK = 'The migration failed'

/**
 * Stored bytes brought to the current version, not yet checked against the schema. `document` is
 * typed `Project` but unchecked: the format rules have not run on it.
 */
export type StoredDocumentRead =
  | {
      readonly ok: true
      readonly document: Project
      /** The `meta.schemaVersion` the bytes were stored at. */
      readonly storedVersion: number
      /** True when the stored version was below the target, so the document was migrated up. */
      readonly versionRaised: boolean
    }
  | { readonly ok: false; readonly failure: ReadFailure }

/** The message of a thrown value; `fallback` stands in when the message is empty. */
function describeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? fallback : message
}

function parseJson(bytes: Uint8Array): { json: unknown } | { message: string } {
  try {
    return { json: parseDocumentJson(bytes) }
  } catch (error) {
    return { message: describeError(error, NOT_JSON_FALLBACK) }
  }
}

/** The stored `meta.schemaVersion` when it is an integer; undefined for anything else. */
function readStoredVersion(json: unknown): number | undefined {
  const version = asRecord(asRecord(json)?.meta)?.schemaVersion
  return isInteger(version) ? version : undefined
}

/** The mapping from what a migration throws to a failure; `storedVersion` starts the chain. */
function migrationFailure(error: unknown, storedVersion: number): ReadFailure {
  if (error instanceof MalformedProjectError) return { kind: 'not-a-project' }
  if (error instanceof UnsupportedSchemaVersionError) {
    return {
      kind: 'newer-version',
      version: error.fromVersion,
      buildVersion: error.targetVersion,
    }
  }
  return {
    kind: 'migration-failed',
    fromVersion: storedVersion,
    message: describeError(error, MIGRATION_FAILED_FALLBACK),
  }
}

/** A migration to a higher version sets the revision back: the older file had none. */
function withoutRevision(project: Project): Project {
  const meta = { ...project.meta }
  delete meta.schemaRevision
  return { ...project, meta }
}

/** The document after the migration chain, which runs only when a step is pending. */
function migrateWhenPending(json: unknown, options: CodecOptions): Project {
  const pending = isMigrationPending(json, options.migration)
  return pending ? migrateProject(json, options.migration) : (json as Project)
}

function failed(failure: ReadFailure): StoredDocumentRead {
  return { ok: false, failure }
}

/**
 * Read the stored bytes of a document: parse, check the shape, refuse a version above the target,
 * migrate when a migration is pending, and reset the revision when the version rose (ADR-0178).
 * The one reader that decode and encode share. It does not check the format rules. Pure: no I/O.
 */
export function readStoredDocument(bytes: Uint8Array, options: CodecOptions): StoredDocumentRead {
  const parsed = parseJson(bytes)
  if ('message' in parsed) return failed({ kind: 'not-json', message: parsed.message })
  const storedVersion = readStoredVersion(parsed.json)
  if (storedVersion === undefined) return failed({ kind: 'not-a-project' })
  const targetVersion = targetVersionOf(options.migration)
  if (storedVersion > targetVersion) {
    return failed({ kind: 'newer-version', version: storedVersion, buildVersion: targetVersion })
  }
  try {
    const migrated = migrateWhenPending(parsed.json, options)
    const versionRaised = storedVersion < targetVersion
    const document = versionRaised ? withoutRevision(migrated) : migrated
    return { ok: true, document, storedVersion, versionRaised }
  } catch (error) {
    return failed(migrationFailure(error, storedVersion))
  }
}
