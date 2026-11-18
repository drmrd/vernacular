import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../../core'
import { versionFixtureBytes, VERSION_FIXTURE_VERSIONS } from '../../fixtures/projects/versions'
import {
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  firstWallOf,
} from '../../fixtures/projects/versions/fixture-documents'
import { PROJECT_ID } from './conformance-run'
import type { BeginRun } from './conformance-run'
import {
  decodedOf,
  documentBreakingFormatRules,
  failureOf,
  faultyProject,
  renamed,
} from './conformance-documents'

const BACKUP_DIRECTORY = '.house-backups/'

/** The files of the backup directory of the project, by their names, with their bytes. */
async function backupsOf(
  files: Promise<ReadonlyMap<string, Uint8Array>>,
): Promise<[string, Uint8Array][]> {
  const stored = [...(await files)]
  return stored
    .filter(([path]) => path.startsWith(BACKUP_DIRECTORY))
    .map(([path, bytes]) => [path.slice(BACKUP_DIRECTORY.length), bytes])
}

/** Every schema version from the oldest fixture to the current one opens, and a migration is kept. */
export function describeVersionFixtures(begin: BeginRun): void {
  describe('a document of an older or the current schema version', () => {
    it.each(VERSION_FIXTURE_VERSIONS)('opens the fixture of schema version %i', async (version) => {
      const run = await begin()
      const placed = versionFixtureBytes(version)
      await run.place(placed)
      const store = run.open()

      const read = await store.read(PROJECT_ID)

      expect(decodedOf(read).project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
      const backups = await backupsOf(store.storedFiles(PROJECT_ID))
      if (version === CURRENT_SCHEMA_VERSION) {
        expect(backups).toEqual([])
      } else {
        expect(backups.map(([name]) => name)).toEqual([
          expect.stringMatching(new RegExp(`^pre-migration-v${version}-.+\\.json$`)),
        ])
        expect(backups[0]?.[1]).toEqual(placed)
      }
    })
  })
}

/** A document that breaks the format rules fails to read, and a store still saves one. */
export function describeFormatRules(begin: BeginRun): void {
  describe('a document that breaks the format rules', () => {
    it('fails to read, and a save of a project that breaks them still writes it', async () => {
      const run = await begin()
      await run.place(documentBreakingFormatRules())
      const store = run.open()

      const failure = failureOf(await store.read(PROJECT_ID))
      const report = await store.save(PROJECT_ID, renamed(faultyProject(), 'Saved with faults'))

      expect(failure.kind === 'decode' && failure.decode.kind).toBe('format-rules')
      expect(report.faults.map((fault) => fault.path)).toContain(UNKNOWN_WALL_FIELD_PATH)
      const stored = await run.storedDocument()
      expect(stored.meta).toMatchObject({ name: 'Saved with faults' })
      expect(firstWallOf(stored)[UNKNOWN_FIELD]).toBe(1)
    })
  })
}
