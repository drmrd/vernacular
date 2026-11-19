import { describe, expect, it } from 'vitest'
import type { Project } from '../../core'
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
  backupsOf,
  rootHolding,
  storeOver,
} from './document-store-test-kit'

const OLDEST_VERSION = 8
const OLDER_VERSION = 15
const NEXT_VERSION = 16
const AUTOSAVE_DIRECTORY = 'a/.house-autosave'

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
