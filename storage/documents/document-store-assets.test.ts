import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createFurnitureInstance } from '../../core'
import type { AssetScope, Project } from '../../core'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import type { AssetCache } from '../asset-cache'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { FolderFiles } from '../project-files/folder-files'
import { DocumentStore } from './document-store'
import { PassThroughDirectory, storeOver } from './document-store-test-kit'

const HASH_LENGTH = 64
const FIRST_HASH = 'ab'.repeat(HASH_LENGTH / 2)
const SECOND_HASH = 'cd'.repeat(HASH_LENGTH / 2)
const PACK_HASH = 'ef'.repeat(HASH_LENGTH / 2)
const PACK_SCOPE: AssetScope = 'pack:cottage-furniture@1.0.0'
const FIRST_BYTES = Uint8Array.of(1, 2, 3)
const SECOND_BYTES = Uint8Array.of(4, 5, 6)
const FOLDER_DOCUMENT = 'vernacular.json'
const WORKSPACE_ID = 'a'

function assetPath(hash: string): string {
  return `${ASSET_DIRECTORY_PREFIX}/${hash}`
}

/** Test support: passes every call through and records the paths read and the paths written. */
class RecordingDirectory extends PassThroughDirectory {
  readonly reads: string[] = []
  readonly writes: string[] = []

  /** Forgets what was recorded so far, so a test sees only the calls of the step it checks. */
  forget(): void {
    this.reads.length = 0
    this.writes.length = 0
  }

  override async readFile(path: string): Promise<Uint8Array | undefined> {
    this.reads.push(path)
    return super.readFile(path)
  }

  override async writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.writes.push(path)
    return super.writeFile(path, bytes)
  }
}

const SHARED_POOL_FAILURE = new Error('the shared pool cannot be read')

/** Test support: a shared pool that rejects every call with one known error. */
class FailingAssetCache implements AssetCache {
  has(): Promise<boolean> {
    return Promise.reject(SHARED_POOL_FAILURE)
  }

  get(): Promise<Uint8Array | undefined> {
    return Promise.reject(SHARED_POOL_FAILURE)
  }

  put(): Promise<void> {
    return Promise.reject(SHARED_POOL_FAILURE)
  }
}

function projectReferring(...references: { scope: AssetScope; contentHash: string }[]): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const floor = createFloor('Ground', { id: 'g' })
  floor.furniture = references.map((assetRef) =>
    createFurnitureInstance({
      assetRef,
      position: { x: 100, y: 200 },
      footprint: { width: 600, depth: 600 },
    }),
  )
  project.floors = [floor]
  return project
}

function userAsset(contentHash: string): { scope: AssetScope; contentHash: string } {
  return { scope: 'user', contentHash }
}

async function sharedPoolHolding(...hashes: string[]): Promise<InMemoryAssetCache> {
  const shared = new InMemoryAssetCache()
  for (const hash of hashes) await shared.put(hash, FIRST_BYTES)
  return shared
}

describe('saving a project that refers to assets, in a workspace', () => {
  it('reads no asset file', async () => {
    const inner = new InMemoryDirectory()
    await inner.writeFile(assetPath(FIRST_HASH), FIRST_BYTES)
    await inner.writeFile(assetPath(SECOND_HASH), SECOND_BYTES)
    const root = new RecordingDirectory(inner)
    const store = storeOver(root)
    root.forget()

    await store.save(WORKSPACE_ID, projectReferring(userAsset(FIRST_HASH), userAsset(SECOND_HASH)))

    expect(root.writes).toContain(`${WORKSPACE_ID}/${FOLDER_DOCUMENT}`)
    expect(root.reads.filter((path) => path.startsWith(`${ASSET_DIRECTORY_PREFIX}/`))).toEqual([])
  })
})

describe('saving a project that refers to assets, in a folder with a shared pool', () => {
  it('copies a missing asset into the folder before it writes the document', async () => {
    const folder = new RecordingDirectory(new InMemoryDirectory())
    const shared = await sharedPoolHolding(FIRST_HASH)
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))

    await store.save('p', projectReferring(userAsset(FIRST_HASH)))

    const copied = folder.writes.indexOf(assetPath(FIRST_HASH))
    const document = folder.writes.indexOf(FOLDER_DOCUMENT)
    expect(copied).toBeGreaterThanOrEqual(0)
    expect(document).toBeGreaterThanOrEqual(0)
    expect(copied).toBeLessThan(document)
  })

  it('rejects with the error of the failed copy and writes no document when the folder had none', async () => {
    const folder = new RecordingDirectory(new InMemoryDirectory())
    const shared = new FailingAssetCache()
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))

    await expect(store.save('p', projectReferring(userAsset(FIRST_HASH)))).rejects.toBe(
      SHARED_POOL_FAILURE,
    )

    expect(folder.writes).toEqual([])
    expect(await folder.list('')).toEqual([])
  })

  it('rejects with the error of the failed copy and leaves the stored document as it was', async () => {
    const folder = new RecordingDirectory(new InMemoryDirectory())
    const earlier = new DocumentStore(new FolderFiles('p', folder, { durable: true }))
    await earlier.save('p', projectReferring())
    const before = await folder.readFile(FOLDER_DOCUMENT)
    const listedBefore = (await folder.list('')).sort()
    folder.forget()
    const shared = new FailingAssetCache()
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))

    await expect(store.save('p', projectReferring(userAsset(FIRST_HASH)))).rejects.toBe(
      SHARED_POOL_FAILURE,
    )

    expect(before).toBeDefined()
    expect(await folder.readFile(FOLDER_DOCUMENT)).toEqual(before)
    expect(folder.writes).toEqual([])
    expect((await folder.list('')).sort()).toEqual(listedBefore)
  })

  it('does not read an asset that the folder already holds', async () => {
    const folder = new RecordingDirectory(new InMemoryDirectory())
    await folder.writeFile(assetPath(FIRST_HASH), FIRST_BYTES)
    const shared = await sharedPoolHolding(FIRST_HASH)
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))
    folder.forget()

    await store.save('p', projectReferring(userAsset(FIRST_HASH)))

    expect(folder.writes).toContain(FOLDER_DOCUMENT)
    expect(folder.reads).not.toContain(assetPath(FIRST_HASH))
  })

  it('does not copy an asset of a pack', async () => {
    const folder = new InMemoryDirectory()
    const shared = await sharedPoolHolding(PACK_HASH)
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))

    await store.save('p', projectReferring({ scope: PACK_SCOPE, contentHash: PACK_HASH }))

    expect(await folder.readFile(assetPath(PACK_HASH))).toBeUndefined()
    expect(await folder.readFile(FOLDER_DOCUMENT)).toBeDefined()
  })
})

describe('saving a project that refers to an asset the folder lacks, with no shared pool', () => {
  it('writes the document without an error', async () => {
    const folder = new InMemoryDirectory()
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true }))

    await expect(store.save('p', projectReferring(userAsset(FIRST_HASH)))).resolves.toBeDefined()

    expect(await folder.readFile(FOLDER_DOCUMENT)).toBeDefined()
    expect(await folder.readFile(assetPath(FIRST_HASH))).toBeUndefined()
  })
})
