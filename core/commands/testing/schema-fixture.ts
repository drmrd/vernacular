// A project document for the test that every command leaves a document that
// passes the current schema. It is the extensions fixture without the unknown
// key that the extensions fixture plants on its objects, so the strict check can
// pass, and it keeps every id, so the command samples still match.

import { UNKNOWN_PROBE_KEY, createExtensionsFixture } from './extensions-fixture'
import type { Project } from '../../model/types'

function withoutProbeKey(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(withoutProbeKey)
  }
  if (typeof value !== 'object' || value === null) {
    return value
  }
  const kept = Object.entries(value).filter(([key]) => key !== UNKNOWN_PROBE_KEY)
  return Object.fromEntries(kept.map(([key, entry]) => [key, withoutProbeKey(entry)]))
}

/** A fresh document with the ids of the extensions fixture and no planted unknown key. */
export function schemaFixture(): Project {
  return withoutProbeKey(createExtensionsFixture()) as Project
}
