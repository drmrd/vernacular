import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument, encodeDocument } from '../../core'
import type { Project } from '../../core'
import { soundProject } from '../../tests/storage/conformance/conformance-documents'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { DirectoryPort } from '../fs/directory-port'
import type { StoreRead } from './document-store'
import {
  DOCUMENT_PATH,
  PassThroughDirectory,
  SECOND_FILE_NAME,
  SECOND_FILE_PATH,
  backupsOf,
  newerVersionBytes,
  rootHolding,
  rootHoldingFiles,
  storeOver,
} from './document-store-test-kit'

const OLDEST_VERSION = 8
const OLDER_VERSION = 15
const NEXT_VERSION = 16
const AUTOSAVE_DIRECTORY = 'a/.house-autosave'
const UNREADABLE_PREFIX = 'unreadable-previous-'
const DIGEST_PATTERN = '[0-9a-f]{64}'
const NOT_JSON = new TextEncoder().encode('{ not json')
const ANOTHER_NOT_JSON = new TextEncoder().encode('{ also not json')
const NOT_A_PROJECT = new TextEncoder().encode('{"title":"a list of errands"}')

/** Test support: rejects each write under a backup directory and passes everything else through. */
class BackupRefusingDirectory extends PassThroughDirectory {
  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.includes('.house-backups/')) return Promise.reject(new Error('the disk is full'))
    return super.writeFile(path, bytes)
  }
}

async function backupBytesOf(root: DirectoryPort): Promise<Uint8Array[]> {
  return (await backupsOf(root)).map(({ bytes }) => bytes)
}

function projectOf(read: StoreRead): Project {
  if (!read.ok) throw new Error(`Expected the read to succeed: ${JSON.stringify(read.failure)}`)
  return read.value.project
}

function anotherVersion8Document(): Uint8Array {
  const document = fixtureDocument(OLDEST_VERSION)
  metaOf(document).name = 'Another house at the same schema version'
  return bytesOf(document)
}

async function unreadableCopiesOf(
  root: DirectoryPort,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  return (await backupsOf(root)).filter(({ name }) => name.startsWith(UNREADABLE_PREFIX))
}

function unreadableNamePattern(version: number): RegExp {
  return new RegExp(`^${UNREADABLE_PREFIX}v${version}-${DIGEST_PATTERN}\\.json$`)
}

function refusal(call: () => Promise<unknown>): Promise<unknown> {
  return call().then(
    () => undefined,
    (error: unknown) => error,
  )
}

describe('the migration backups of a store', () => {
  it('writes a migrated read to the backup directory and nothing to the autosave directory', async () => {
    const original = versionFixtureBytes(OLDEST_VERSION)
    const root = await rootHolding(original)

    await storeOver(root).read('a')

    expect(await backupBytesOf(root)).toEqual([original])
    expect(await root.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })

  it('keeps both backups when a different file at the same old version is read later', async () => {
    const first = versionFixtureBytes(OLDEST_VERSION)
    const second = anotherVersion8Document()
    const root = await rootHolding(first)
    const store = storeOver(root)
    await store.read('a')

    await root.writeFile(DOCUMENT_PATH, second)
    await store.read('a')

    const backups = await backupBytesOf(root)
    expect(backups).toHaveLength(2)
    expect(backups).toContainEqual(first)
    expect(backups).toContainEqual(second)
  })

  it('keeps a backup for each version that a project was migrated from, as the build moves on', async () => {
    const atOlder = versionFixtureBytes(OLDER_VERSION)
    const atNext = versionFixtureBytes(NEXT_VERSION)
    const root = await rootHolding(atOlder)
    await storeOver(root, { migration: { targetVersion: NEXT_VERSION } }).read('a')
    await root.writeFile(DOCUMENT_PATH, atNext)

    await storeOver(root).read('a')

    const backups = await backupBytesOf(root)
    expect(backups).toHaveLength(2)
    expect(backups).toContainEqual(atOlder)
    expect(backups).toContainEqual(atNext)
  })

  it('removes the backups together with the project', async () => {
    const root = await rootHolding(versionFixtureBytes(OLDEST_VERSION))
    const store = storeOver(root)
    await store.read('a')

    await store.delete('a')

    expect(await root.list('a')).toEqual([])
  })
})

describe('a backup that cannot be written', () => {
  it('keeps the document from the caller on read and leaves the stored file as it was', async () => {
    const original = versionFixtureBytes(OLDEST_VERSION)
    const root = await rootHolding(original)
    const store = storeOver(new BackupRefusingDirectory(root))

    const error = await refusal(() => store.read('a'))

    expect(error).toBeInstanceOf(Error)
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(original)
  })
})

describe('a backup and the autosave cycle', () => {
  it('survives a snapshot, an explicit save, and a prune, and no snapshot file is left', async () => {
    const original = versionFixtureBytes(OLDEST_VERSION)
    const root = await rootHolding(original)
    const store = storeOver(root)
    const project = projectOf(await store.read('a'))

    await store.snapshots('a').writeSnapshot(project)
    await store.save('a', project)
    await store.snapshots('a').prune()

    expect(await backupBytesOf(root)).toEqual([original])
    expect(await root.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })
})

describe('a copy of an unreadable stored file before a save replaces it', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copies bytes that are not a project with version 0', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(decodeDocument(NOT_A_PROJECT)).toMatchObject({
      ok: false,
      failure: { kind: 'not-a-project' },
    })
    const root = await rootHolding(NOT_A_PROJECT)

    await storeOver(root).save('a', soundProject())

    const copies = await unreadableCopiesOf(root)
    expect(copies).toHaveLength(1)
    expect(copies[0]?.name).toMatch(unreadableNamePattern(0))
    expect(copies[0]?.bytes).toEqual(NOT_A_PROJECT)
  })

  it('keeps one copy for each different unreadable file, and one for the same bytes again', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = await rootHolding(NOT_JSON)
    await storeOver(root).save('a', soundProject())
    await root.writeFile(DOCUMENT_PATH, NOT_JSON)
    await storeOver(root).save('a', soundProject())
    expect(await unreadableCopiesOf(root)).toHaveLength(1)

    await root.writeFile(DOCUMENT_PATH, ANOTHER_NOT_JSON)
    await storeOver(root).save('a', soundProject())

    const copied = (await unreadableCopiesOf(root)).map(({ bytes }) => bytes)
    expect(copied).toHaveLength(2)
    expect(copied).toContainEqual(NOT_JSON)
    expect(copied).toContainEqual(ANOTHER_NOT_JSON)
  })

  it('rejects the save and leaves the stored file as it was when the copy cannot be written', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = await rootHolding(NOT_JSON)
    const store = storeOver(new BackupRefusingDirectory(root))

    const error = await refusal(() => store.save('a', soundProject()))

    expect(error).toBeInstanceOf(Error)
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(NOT_JSON)
  })

  it('keeps no copy for a save over a readable file or for a first save', async () => {
    const readable = await rootHolding(encodeDocument(soundProject(), undefined).bytes)
    const first = await rootHolding(undefined)

    await storeOver(readable).save('a', soundProject())
    await storeOver(first).save('a', soundProject())

    expect(await unreadableCopiesOf(readable)).toEqual([])
    expect(await unreadableCopiesOf(first)).toEqual([])
  })
})

describe('a copy of an unreadable second file before a save replaces it', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copies a second file that is not JSON, replaces it, and leaves the newer main file as it was', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const main = newerVersionBytes()
    const root = await rootHoldingFiles({ main, second: NOT_JSON })
    const project = soundProject()

    const report = await storeOver(root).save('a', project)

    expect(report.secondFile?.name).toBe(SECOND_FILE_NAME)
    expect(report.graftDropped).toBeDefined()
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(main)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    const copies = await unreadableCopiesOf(root)
    expect(copies).toHaveLength(1)
    expect(copies[0]?.name).toMatch(unreadableNamePattern(0))
    expect(copies[0]?.bytes).toEqual(NOT_JSON)
  })

  it('copies a second file at a newer version under that version, and replaces it', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const second = newerVersionBytes()
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second })
    const project = soundProject()

    await storeOver(root).save('a', project)

    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    const copies = await unreadableCopiesOf(root)
    expect(copies).toHaveLength(1)
    expect(copies[0]?.name).toMatch(unreadableNamePattern(CURRENT_SCHEMA_VERSION + 1))
    expect(copies[0]?.bytes).toEqual(second)
  })
})
