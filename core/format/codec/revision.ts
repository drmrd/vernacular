import { CURRENT_SCHEMA_REVISION } from '../../model/factories'
import type { Project } from '../../model/types'
import type { SchemaMode } from '../current-schema'
import { isInteger } from './json-values'

/** The revision of a document that stores none, or none that is an integer. */
const UNREADABLE_REVISION = 0

/** The stored `meta.schemaRevision` when it is an integer; the unreadable revision otherwise. */
export function readRevision(document: Project): number {
  const revision = document.meta.schemaRevision
  return isInteger(revision) ? revision : UNREADABLE_REVISION
}

/** A revision above this build's is read tolerantly (a newer build wrote it); any other strictly. */
export function checkModeFor(revision: number): SchemaMode {
  return revision > CURRENT_SCHEMA_REVISION ? 'tolerant' : 'strict'
}
