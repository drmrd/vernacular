import type { ProjectRecord } from './project-index'

/** Shared set-up of the tests that need a project record. */

const SAMPLE_FLOOR_COUNT = 2
const HASH_BYTE_COUNT = 32
const SAMPLE_ASSET_HASH = 'ab'.repeat(HASH_BYTE_COUNT)

/**
 * A whole record of a workspace project, with the overrides applied. Each call builds new nested
 * objects and arrays, so a test can change one record without touching another.
 */
export function sampleRecord(overrides: Partial<ProjectRecord> = {}): ProjectRecord {
  return {
    id: 'house',
    location: { kind: 'workspace' },
    name: 'House',
    floorCount: SAMPLE_FLOOR_COUNT,
    preview: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    assetHashes: [SAMPLE_ASSET_HASH],
    assetListComplete: true,
    lastChangedAt: '2026-11-01T10:00:00.000Z',
    lastUsedAt: '2026-11-02T10:00:00.000Z',
    lastOpen: { opened: true, build: 'test-build' },
    ...overrides,
  }
}
