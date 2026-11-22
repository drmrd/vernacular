import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../core'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import { FileSystemFolderProjectStore } from '../filesystem/file-system-folder-project-store'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { PassThroughDirectory, storeOver, treeOf } from './document-store-test-kit'

const HASH_LENGTH = 64
const FIRST_HASH = 'ab'.repeat(HASH_LENGTH / 2)
const SECOND_HASH = 'cd'.repeat(HASH_LENGTH / 2)
const KEPT_HASH = 'ef'.repeat(HASH_LENGTH / 2)
const ASSET_BYTES = Uint8Array.of(1, 2, 3)
const REMOVAL_FAILURE = new Error('the pool cannot remove this asset')

function assetPath(hash: string): string {
  return `${ASSET_DIRECTORY_PREFIX}/${hash}`
}

/** Test support: passes every call through, records each removal, and fails the given path. */
class RemovalRecordingDirectory extends PassThroughDirectory {
  readonly removed: string[] = []

  constructor(
    inner: InMemoryDirectory,
    private readonly failingPath?: string,
  ) {
    super(inner)
  }

  override async removeFile(path: string): Promise<void> {
    this.removed.push(path)
    if (path === this.failingPath) throw REMOVAL_FAILURE
    return super.removeFile(path)
  }
}

async function poolHolding(...hashes: string[]): Promise<InMemoryDirectory> {
  const root = new InMemoryDirectory()
  for (const hash of hashes) await root.writeFile(assetPath(hash), ASSET_BYTES)
  return root
}

async function saveProjects(root: InMemoryDirectory, ...ids: string[]): Promise<void> {
  const store = storeOver(root)
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  for (const id of ids) await store.save(id, project)
}

describe('removing assets from the pool of a workspace store', () => {
  it('removes the named assets and keeps the other assets', async () => {
    const root = await poolHolding(FIRST_HASH, SECOND_HASH, KEPT_HASH)

    await storeOver(root).removeAssets([FIRST_HASH, SECOND_HASH])

    expect(await root.readFile(assetPath(FIRST_HASH))).toBeUndefined()
    expect(await root.readFile(assetPath(SECOND_HASH))).toBeUndefined()
    expect(await root.readFile(assetPath(KEPT_HASH))).toEqual(ASSET_BYTES)
  })

  it('resolves when a named asset is absent', async () => {
    const root = await poolHolding(KEPT_HASH)

    await expect(storeOver(root).removeAssets([FIRST_HASH])).resolves.toBeUndefined()

    expect(await root.readFile(assetPath(KEPT_HASH))).toEqual(ASSET_BYTES)
  })

  it('resolves when the workspace has no asset pool at all', async () => {
    const root = new InMemoryDirectory()

    await expect(storeOver(root).removeAssets([FIRST_HASH])).resolves.toBeUndefined()

    expect(await treeOf(root)).toEqual({})
  })

  it('a value that is not a content hash removes no file', async () => {
    const inner = await poolHolding(FIRST_HASH)
    await saveProjects(inner, 'a')
    const before = await treeOf(inner)
    const root = new RemovalRecordingDirectory(inner)
    const notHashes = [
      '',
      'a',
      `${FIRST_HASH}/extra`,
      '../a/vernacular.json',
      FIRST_HASH.toUpperCase(),
      FIRST_HASH.slice(1),
    ]

    await storeOver(root).removeAssets(notHashes)

    expect(root.removed).toEqual([])
    expect(await treeOf(inner)).toEqual(before)
  })

  it('removing assets leaves the stored files of every project identical', async () => {
    const root = await poolHolding(FIRST_HASH, KEPT_HASH)
    await saveProjects(root, 'a', 'b')
    await root.writeFile(`a/${assetPath(FIRST_HASH)}`, ASSET_BYTES)
    await root.writeFile(`b/${assetPath(FIRST_HASH)}`, ASSET_BYTES)
    const before = { a: await treeOf(root, 'a'), b: await treeOf(root, 'b') }

    await storeOver(root).removeAssets([FIRST_HASH])

    expect(Object.keys(before.a).length).toBeGreaterThan(0)
    expect(await root.readFile(assetPath(FIRST_HASH))).toBeUndefined()
    expect({ a: await treeOf(root, 'a'), b: await treeOf(root, 'b') }).toEqual(before)
  })

  it('rejects when a removal fails, after it removed the assets before it', async () => {
    const inner = await poolHolding(FIRST_HASH, SECOND_HASH)
    const root = new RemovalRecordingDirectory(inner, assetPath(SECOND_HASH))

    await expect(storeOver(root).removeAssets([FIRST_HASH, SECOND_HASH])).rejects.toBe(
      REMOVAL_FAILURE,
    )

    expect(await inner.readFile(assetPath(FIRST_HASH))).toBeUndefined()
  })
})

describe('a folder project store', () => {
  it('has no removeAssets, because it keeps the assets of a project with the project', () => {
    // @ts-expect-error a folder store has no shared pool to remove assets from
    const removeAssets = FileSystemFolderProjectStore.prototype.removeAssets

    expect(removeAssets).toBeUndefined()
  })
})
