import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../../core'
import { fixtureDocument } from '../../fixtures/projects/versions/fixture-documents'
import type { Json } from '../../fixtures/projects/versions/fixture-documents'
import { PROJECT_ID } from './conformance-run'
import type { BeginRun } from './conformance-run'
import {
  EXTENSIONS_PAYLOAD,
  currentBytes,
  documentOfNewerVersion,
  documentWithExtensions,
  renamed,
  soundProject,
} from './conformance-documents'

const SECOND_FILE_NAME = `vernacular.format-${CURRENT_SCHEMA_VERSION}.json`

function describeSavingBesideNewerFile(begin: BeginRun): void {
  it('receives the save, which leaves the newer file byte for byte as it was', async () => {
    const run = await begin()
    const newer = documentOfNewerVersion()
    await run.place(newer)
    const project = soundProject()

    const report = await run.open().save(PROJECT_ID, project)

    expect(await run.storedBytes()).toEqual(newer)
    expect(await run.secondFileBytes()).toEqual(encodeDocument(project, undefined).bytes)
    expect(report.secondFile?.name).toBe(SECOND_FILE_NAME)
  })

  it('keeps an extensions payload through the next save', async () => {
    const run = await begin()
    await run.place(documentOfNewerVersion())
    await run.placeSecondFile(documentWithExtensions())

    await run.open().save(PROJECT_ID, renamed(soundProject(), 'Saved beside'))

    const stored = JSON.parse(new TextDecoder().decode(await run.secondFileBytes()))
    expect(stored.meta.name).toBe('Saved beside')
    expect(stored.extensions).toEqual({
      ...(fixtureDocument(CURRENT_SCHEMA_VERSION).extensions as Json),
      ...EXTENSIONS_PAYLOAD,
    })
  })
}

function describeProjectsWithSecondFile(begin: BeginRun, holdsMany: boolean): void {
  it('lists a project with both files once', async () => {
    const run = await begin()
    await run.place(currentBytes())
    await run.placeSecondFile(currentBytes())

    const listed = (await run.open().list()).map((summary) => summary.id)

    expect(listed).toEqual([PROJECT_ID])
  })

  it('does not list a second file that has no main file', async () => {
    const run = await begin()
    await run.placeSecondFile(currentBytes())

    expect(await run.open().list()).toEqual([])
  })

  if (holdsMany) {
    it('leaves no file of a deleted project that had both files', async () => {
      const run = await begin()
      await run.place(currentBytes())
      await run.placeSecondFile(currentBytes())

      await run.openWorkspace().delete(PROJECT_ID)

      expect(await run.storedBytes()).toBeUndefined()
      expect(await run.secondFileBytes()).toBeUndefined()
      expect(await run.root.list('')).not.toContain(PROJECT_ID)
    })
  }
}

/** A project whose main file is newer than this build keeps it, and the save goes beside it. */
export function describeSecondDocumentFile(begin: BeginRun, holdsMany: boolean): void {
  describe('a second document file beside a newer vernacular.json', () => {
    describeSavingBesideNewerFile(begin)
    describeProjectsWithSecondFile(begin, holdsMany)
  })
}
