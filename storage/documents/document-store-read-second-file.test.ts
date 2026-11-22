import { describe, expect, it } from 'vitest'
import { encodeDocument } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  currentBytes,
  decodedOf,
  documentBreakingFormatRules,
  failureOf,
  renamed,
  secondFileOf,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import type { DirectoryPort } from '../fs/directory-port'
import {
  DOCUMENT_PATH,
  NEWER_SECOND_FILE_PATH,
  SECOND_FILE_NAME,
  SECOND_FILE_PATH,
  backupsOf,
  newerVersionBytes,
  rootHolding,
  rootHoldingFiles,
  storeOver,
  treeOf,
} from './document-store-test-kit'

const OLDER_VERSION = 8
const OLDER_SECOND_FILE_NAME = `vernacular.format-${OLDER_VERSION}.json`
const OLDER_SECOND_FILE_PATH = `a/${OLDER_SECOND_FILE_NAME}`
const SECOND_FILE_PROJECT_NAME = 'Saved beside the newer file'
const NOT_JSON = new TextEncoder().encode('{ not json')

/** A sound document of the current version that is told apart from the fixture by its name. */
function soundSecondFile(): Uint8Array {
  return encodeDocument(renamed(soundProject(), SECOND_FILE_PROJECT_NAME), undefined).bytes
}

async function preRepairBackups(
  root: DirectoryPort,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  return (await backupsOf(root)).filter(({ name }) => name.startsWith('pre-repair-'))
}

describe('reading a project whose vernacular.json is newer', () => {
  it('reads the second file, names it, and writes nothing', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: soundSecondFile() })
    const before = await treeOf(root)

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).project.meta.name).toBe(SECOND_FILE_PROJECT_NAME)
    expect(secondFileOf(read)).toEqual({ name: SECOND_FILE_NAME, read: 'second' })
    expect(await treeOf(root)).toEqual(before)
  })

  it('reads the second file of the higher version when two are at or below the build version', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: soundSecondFile() })
    await root.writeFile(OLDER_SECOND_FILE_PATH, versionFixtureBytes(OLDER_VERSION))

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).project.meta.name).toBe(SECOND_FILE_PROJECT_NAME)
    expect(secondFileOf(read)).toEqual({ name: SECOND_FILE_NAME, read: 'second' })
  })

  it('reads a lone second file of an older version as migrated and keeps its bytes in a backup', async () => {
    const original = versionFixtureBytes(OLDER_VERSION)
    const root = await rootHolding(newerVersionBytes())
    await root.writeFile(OLDER_SECOND_FILE_PATH, original)

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).migratedFrom).toBe(OLDER_VERSION)
    expect(secondFileOf(read)).toEqual({ name: OLDER_SECOND_FILE_NAME, read: 'second' })
    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.bytes).toEqual(original)
  })

  it('fails as a newer version when the only second file is above the build version too', async () => {
    const root = await rootHolding(newerVersionBytes())
    await root.writeFile(NEWER_SECOND_FILE_PATH, newerVersionBytes())

    const read = await storeOver(root).read('a')

    expect(failureOf(read)).toMatchObject({ kind: 'decode', decode: { kind: 'newer-version' } })
  })

  it.each([
    { name: 'is not JSON', bytes: NOT_JSON, kind: 'not-json' },
    { name: 'breaks the format rules', bytes: documentBreakingFormatRules(), kind: 'format-rules' },
  ])('fails with the decode failure of a second file that $name, and writes nothing', async (c) => {
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second: c.bytes })
    const before = await treeOf(root)

    const read = await storeOver(root).read('a')

    expect(failureOf(read)).toMatchObject({ kind: 'decode', decode: { kind: c.kind } })
    expect(await treeOf(root)).toEqual(before)
  })
})

describe('reading a project with a readable vernacular.json', () => {
  it('reads the main file and names the second file that sits beside it', async () => {
    const root = await rootHoldingFiles({ main: currentBytes(), second: soundSecondFile() })

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).project.meta.name).toBe(soundProject().meta.name)
    expect(secondFileOf(read)).toEqual({ name: SECOND_FILE_NAME, read: 'main' })
  })

  it('has no word on a second file when the project has none', async () => {
    const root = await rootHolding(currentBytes())

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).project.meta.name).toBe(soundProject().meta.name)
    expect(read).not.toHaveProperty('secondFile')
  })

  it('has no word on a second file that is above the build version', async () => {
    const root = await rootHolding(currentBytes())
    await root.writeFile(NEWER_SECOND_FILE_PATH, newerVersionBytes())

    const read = await storeOver(root).read('a')

    expect(decodedOf(read).project.meta.name).toBe(soundProject().meta.name)
    expect(read).not.toHaveProperty('secondFile')
  })

  it('does not find a project that has only a second file', async () => {
    const root = await rootHoldingFiles({ second: soundSecondFile() })

    const read = await storeOver(root).read('a')

    expect(read).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('fails with the decode failure of a main file that is not JSON beside a sound second file', async () => {
    const root = await rootHoldingFiles({ main: NOT_JSON, second: soundSecondFile() })

    const read = await storeOver(root).read('a')

    expect(failureOf(read)).toMatchObject({ kind: 'decode', decode: { kind: 'not-json' } })
  })
})

describe('replacing the stored document beside a second file', () => {
  it('writes the second file, backs up its earlier bytes, and leaves a newer main file as it was', async () => {
    const newer = newerVersionBytes()
    const earlier = documentBreakingFormatRules()
    const root = await rootHoldingFiles({ main: newer, second: earlier })
    const project = soundProject()

    await storeOver(root).replaceStored('a', project)

    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(newer)
    const backups = await preRepairBackups(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.bytes).toEqual(earlier)
  })

  it('writes the second file of this build when a newer main file has none beside it', async () => {
    const newer = newerVersionBytes()
    const root = await rootHolding(newer)
    const project = soundProject()

    await storeOver(root).replaceStored('a', project)

    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(newer)
  })

  it('writes the main file and leaves the second file as it was when the main file is readable', async () => {
    const second = soundSecondFile()
    const root = await rootHoldingFiles({ main: currentBytes(), second })
    const project = soundProject()

    await storeOver(root).replaceStored('a', project)

    expect(await root.readFile(DOCUMENT_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(second)
  })
})
