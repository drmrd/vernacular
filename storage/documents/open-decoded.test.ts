import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { openDespiteFaults } from '..'
import type { FormatRulesFailure } from '..'

const OLDER_VERSION = 8

/** The failure of a decode that fails only on the format rules; throws on any other outcome. */
function formatRulesFailureOf(bytes: Uint8Array): FormatRulesFailure {
  const decoded = decodeDocument(bytes)
  if (decoded.ok || decoded.failure.kind !== 'format-rules') {
    throw new Error(`Expected only the format rules to fail: ${JSON.stringify(decoded)}`)
  }
  return decoded.failure
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the storage entry', () => {
  it('gives openDespiteFaults, which opens a document that only breaks the format rules and warns with its faults', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const failure = formatRulesFailureOf(
      bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION))),
    )

    const project = openDespiteFaults(failure)

    expect(project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.floors[0]?.walls[0]).toHaveProperty(UNKNOWN_FIELD)
    expect(JSON.stringify(warn.mock.calls)).toContain(UNKNOWN_WALL_FIELD_PATH)
  })
})
