import { migrateProject } from '../../migrations/migrate'
import {
  MalformedProjectError,
  MigrationFailedError,
  UnsupportedSchemaVersionError,
} from '../../migrations/types'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION } from '../../model/factories'
import type { Project } from '../../model/types'
import { checkCurrentSchema } from '../current-schema'
import type { CodecOptions, DecodeFailure, DecodeResult } from './codec-types'

const UNREADABLE_REVISION = 0
const NOT_JSON_FALLBACK = 'The bytes are not UTF-8 JSON.'
const MIGRATION_FAILED_FALLBACK = 'The migration failed.'

function fail(failure: DecodeFailure): DecodeResult {
  return { ok: false, failure }
}

/** The message of a thrown value; `fallback` stands in when the message is empty. */
function describeError(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : String(error)
  return message === '' ? fallback : message
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value)
}

function parseJson(bytes: Uint8Array): { json: unknown } | { message: string } {
  try {
    return { json: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
  } catch (error) {
    return { message: describeError(error, NOT_JSON_FALLBACK) }
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  const isRecord = typeof value === 'object' && value !== null && !Array.isArray(value)
  return isRecord ? (value as Record<string, unknown>) : undefined
}

/** The stored `meta.schemaVersion` when it is an integer; undefined for anything else. */
function readStoredVersion(json: unknown): number | undefined {
  const version = asRecord(asRecord(json)?.meta)?.schemaVersion
  return isInteger(version) ? version : undefined
}

/** The mapping from what a migration throws to a failure; `storedVersion` starts the chain. */
function migrationFailure(error: unknown, storedVersion: number): DecodeFailure {
  if (error instanceof MalformedProjectError) return { kind: 'not-a-project' }
  if (error instanceof UnsupportedSchemaVersionError) {
    return {
      kind: 'newer-version',
      version: error.fromVersion,
      buildVersion: error.targetVersion,
    }
  }
  const fromVersion = error instanceof MigrationFailedError ? error.fromVersion : storedVersion
  return {
    kind: 'migration-failed',
    fromVersion,
    message: describeError(error, MIGRATION_FAILED_FALLBACK),
  }
}

/** A migration to a higher version sets the revision back: the older file had none. */
function withoutRevision(project: Project): Project {
  const meta = { ...project.meta }
  delete meta.schemaRevision
  return { ...project, meta }
}

function readRevision(project: Project): number {
  const revision = project.meta.schemaRevision
  return isInteger(revision) ? revision : UNREADABLE_REVISION
}

function checkMigrated(project: Project, migratedFrom: number | undefined): DecodeResult {
  const savedByNewerBuild = readRevision(project) > CURRENT_SCHEMA_REVISION
  const faults = checkCurrentSchema(project, savedByNewerBuild ? 'tolerant' : 'strict')
  if (faults.length > 0) {
    return fail({ kind: 'format-rules', faults, document: project, migratedFrom })
  }
  return { ok: true, value: { project, migratedFrom, savedByNewerBuild } }
}

/**
 * Decode the stored bytes of a document: parse, refuse a version above this build's, migrate up
 * the chain, and check the result against the current schema (ADR-0178). A file at the build's
 * version and at or below its revision is checked strictly; a file at a higher revision is read
 * tolerantly and reported as saved by a newer build. Pure: no I/O.
 */
export function decodeDocument(bytes: Uint8Array, options: CodecOptions = {}): DecodeResult {
  const parsed = parseJson(bytes)
  if ('message' in parsed) return fail({ kind: 'not-json', message: parsed.message })
  const storedVersion = readStoredVersion(parsed.json)
  if (storedVersion === undefined) return fail({ kind: 'not-a-project' })
  let migrated: Project
  try {
    migrated = migrateProject(parsed.json, options.migration)
  } catch (error) {
    return fail(migrationFailure(error, storedVersion))
  }
  const targetVersion = options.migration?.targetVersion ?? CURRENT_SCHEMA_VERSION
  if (storedVersion === targetVersion) return checkMigrated(migrated, undefined)
  return checkMigrated(withoutRevision(migrated), storedVersion)
}
