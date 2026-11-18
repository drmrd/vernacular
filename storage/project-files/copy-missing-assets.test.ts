import { describe, expect, it } from 'vitest'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { copyMissingAssets } from './copy-missing-assets'
import { FolderFiles } from './folder-files'

const HASH = 'abc123'
const OTHER_HASH = 'def456'
const ASSET_PATH = `${ASSET_DIRECTORY_PREFIX}/${HASH}`
const FOLDER_BYTES = Uint8Array.of(7, 7)
const SHARED_BYTES = Uint8Array.of(8, 8)

/** Test support: passes every call through and records the paths written. */
class WriteRecordingDirectory extends PassThroughDirectory {
  readonly written: string[] = []

  override async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.written.push(path)
    return super.writeFile(path, bytes)
  }
}

async function sharedPoolWith(hash: string, bytes: Uint8Array): Promise<InMemoryAssetCache> {
  const shared = new InMemoryAssetCache()
  await shared.put(hash, bytes)
  return shared
}

describe('copyMissingAssets', () => {
  it('copies an asset that the folder lacks from the shared pool into the folder', async () => {
    const folder = new InMemoryDirectory()
    const shared = await sharedPoolWith(HASH, SHARED_BYTES)
    const files = new FolderFiles('p', folder, { durable: true, shared })

    await copyMissingAssets(files.assetsFor('p'), [HASH])

    expect(await folder.readFile(ASSET_PATH)).toEqual(SHARED_BYTES)
    expect(await files.assetsFor('p').has(HASH)).toBe(true)
  })

  it('does not write an asset that the folder already holds', async () => {
    const folder = new WriteRecordingDirectory(new InMemoryDirectory())
    await folder.writeFile(ASSET_PATH, FOLDER_BYTES)
    folder.written.length = 0
    const shared = await sharedPoolWith(HASH, SHARED_BYTES)
    const files = new FolderFiles('p', folder, { durable: true, shared })

    await copyMissingAssets(files.assetsFor('p'), [HASH])

    expect(folder.written).toEqual([])
    expect(await folder.readFile(ASSET_PATH)).toEqual(FOLDER_BYTES)
  })

  it('skips a hash that neither the folder nor the shared pool holds, and copies the others', async () => {
    const folder = new InMemoryDirectory()
    const shared = await sharedPoolWith(HASH, SHARED_BYTES)
    const files = new FolderFiles('p', folder, { durable: true, shared })

    await expect(
      copyMissingAssets(files.assetsFor('p'), [OTHER_HASH, HASH]),
    ).resolves.toBeUndefined()

    expect(await folder.readFile(`${ASSET_DIRECTORY_PREFIX}/${OTHER_HASH}`)).toBeUndefined()
    expect(await folder.readFile(ASSET_PATH)).toEqual(SHARED_BYTES)
  })

  it('copies nothing and does not throw when the folder has no shared pool', async () => {
    const folder = new InMemoryDirectory()
    const files = new FolderFiles('p', folder, { durable: true })

    await expect(copyMissingAssets(files.assetsFor('p'), [HASH])).resolves.toBeUndefined()

    expect(await folder.list('')).toEqual([])
  })
})
