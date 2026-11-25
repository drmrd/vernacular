import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../../core'
import { fixtureDocument } from '../../fixtures/projects/versions/fixture-documents'
import type { Json } from '../../fixtures/projects/versions/fixture-documents'
import {
  PROJECT_ID,
  REPLACED_PREFIX,
  SECOND_FILE_NAME,
  SET_ASIDE_PREFIX,
  UNREADABLE_PREFIX,
} from './conformance-run'
import type { BeginRun, NamedBytes } from './conformance-run'
import {
  EXTENSIONS_PAYLOAD,
  NOT_JSON,
  currentBytes,
  decodedOf,
  documentOfNewerVersion,
  documentWithExtensions,
  renamed,
  secondFileOf,
  soundProject,
  soundSecondFile,
  twoFilesOrThrow,
} from './conformance-documents'

const SAVED_NAME = 'Saved beside'

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

    await run.open().save(PROJECT_ID, renamed(soundProject(), SAVED_NAME))

    const stored = JSON.parse(new TextDecoder().decode(await run.secondFileBytes()))
    expect(stored.meta.name).toBe(SAVED_NAME)
    expect(stored.extensions).toEqual({
      ...(fixtureDocument(CURRENT_SCHEMA_VERSION).extensions as Json),
      ...EXTENSIONS_PAYLOAD,
    })
  })
}

function describeReadingBesideSecondFile(begin: BeginRun): void {
  it('reads the document back from the second file after a save beside a newer file', async () => {
    const run = await begin()
    await run.place(documentOfNewerVersion())
    await run.open().save(PROJECT_ID, renamed(soundProject(), SAVED_NAME))

    const read = await run.open().read(PROJECT_ID)

    expect(decodedOf(read).project.meta.name).toBe(SAVED_NAME)
    expect(secondFileOf(read)).toEqual({ name: SECOND_FILE_NAME, read: 'second' })
  })

  it('says that a second file exists when it reads a readable main file', async () => {
    const run = await begin()
    await run.place(currentBytes())
    await run.placeSecondFile(currentBytes())

    const read = await run.open().read(PROJECT_ID)

    expect(decodedOf(read).project.meta.name).toBe(soundProject().meta.name)
    expect(secondFileOf(read)).toEqual({ name: SECOND_FILE_NAME, read: 'main' })
  })

  it('writes the second file and leaves a newer main file as it was when it replaces the stored document', async () => {
    const run = await begin()
    const newer = documentOfNewerVersion()
    await run.place(newer)
    const project = renamed(soundProject(), SAVED_NAME)

    await run.open().replaceStored(PROJECT_ID, project)

    expect(await run.storedBytes()).toEqual(newer)
    expect(await run.secondFileBytes()).toEqual(encodeDocument(project, undefined).bytes)
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
    describeReadingBesideSecondFile(begin)
    describeProjectsWithSecondFile(begin, holdsMany)
  })
}

/** A save over a stored file that cannot be read keeps a copy of that file first. */
export function describeUnreadablePreviousFile(begin: BeginRun): void {
  describe('a save over a stored file that cannot be read', () => {
    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('keeps a copy of the bytes that it replaces, and the document reads back', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      const run = await begin()
      await run.place(NOT_JSON)

      await run.open().save(PROJECT_ID, renamed(soundProject(), SAVED_NAME))

      const copies = await run.backups()
      expect(copies).toHaveLength(1)
      expect(copies[0]?.name.startsWith(UNREADABLE_PREFIX)).toBe(true)
      expect(copies[0]?.bytes).toEqual(NOT_JSON)
      expect(decodedOf(await run.open().read(PROJECT_ID)).project.meta.name).toBe(SAVED_NAME)
    })
  })
}

function copiesNamedFrom(copies: readonly NamedBytes[], prefix: string): readonly NamedBytes[] {
  return copies.filter(({ name }) => name.startsWith(prefix))
}

/** A choice between the two document files of a project moves a file only after a copy of it exists. */
export function describeSecondFileChoice(begin: BeginRun): void {
  describe('a choice between a newer vernacular.json and the second document file', () => {
    it('keeps the main file, keeps a copy of the second file, and leaves no second file when the second file is set aside', async () => {
      const run = await begin()
      const newer = documentOfNewerVersion()
      const second = soundSecondFile(SAVED_NAME)
      await run.place(newer)
      await run.placeSecondFile(second)
      const files = await twoFilesOrThrow(run.open())

      const change = await run.open().setAsideSecondFile(PROJECT_ID, files)

      expect(change).toEqual({ ok: true })
      expect(await run.storedBytes()).toEqual(newer)
      expect(await run.secondFileBytes()).toBeUndefined()
      const copies = copiesNamedFrom(await run.backups(), SET_ASIDE_PREFIX)
      expect(copies.map(({ bytes }) => bytes)).toEqual([second])
    })

    it('keeps a copy of the main file, holds the second file document in the main file, and leaves no second file when the second file is promoted', async () => {
      const run = await begin()
      const newer = documentOfNewerVersion()
      const second = soundSecondFile(SAVED_NAME)
      await run.place(newer)
      await run.placeSecondFile(second)
      const files = await twoFilesOrThrow(run.open())

      const change = await run.open().promoteSecondFile(PROJECT_ID, files)

      expect(change).toEqual({ ok: true })
      const copies = copiesNamedFrom(await run.backups(), REPLACED_PREFIX)
      expect(copies.map(({ bytes }) => bytes)).toEqual([newer])
      expect(await run.storedBytes()).toEqual(second)
      expect(await run.secondFileBytes()).toBeUndefined()
      const read = await run.open().read(PROJECT_ID)
      expect(decodedOf(read).project.meta.name).toBe(SAVED_NAME)
      expect(secondFileOf(read)).toBeUndefined()
    })
  })
}
