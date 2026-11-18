import { describe, expect, expectTypeOf, it } from 'vitest'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import { ReadCountingDirectory } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { FolderFiles } from './folder-files'

const HASH = 'abc123'
const ASSET_PATH = `${ASSET_DIRECTORY_PREFIX}/${HASH}`
const DOCUMENT = Uint8Array.of(1, 2, 3)
const FOLDER_BYTES = Uint8Array.of(7, 7)
const SHARED_BYTES = Uint8Array.of(8, 8)

async function sharedPoolWith(hash: string, bytes: Uint8Array): Promise<InMemoryAssetCache> {
  const shared = new InMemoryAssetCache()
  await shared.put(hash, bytes)
  return shared
}

describe('FolderFiles', () => {
  it('has no way to remove a project, so it can never delete a file it did not write', () => {
    const files = new FolderFiles('p', new InMemoryDirectory(), { durable: true })

    expect('remove' in files).toBe(false)
    expectTypeOf(files).not.toHaveProperty('remove')
  })

  it('reflects the durable option', () => {
    const folder = new InMemoryDirectory()

    expect(new FolderFiles('p', folder, { durable: true }).durable).toBe(true)
    expect(new FolderFiles('p', folder, { durable: false }).durable).toBe(false)
  })

  it('lists no id for a folder that holds no document', async () => {
    const folder = new InMemoryDirectory()
    await folder.writeFile('notes.txt', Uint8Array.of(1))
    const files = new FolderFiles('p', folder, { durable: true })

    expect(await files.ids()).toEqual([])
  })

  it('lists its id once the folder holds a document, without reading a file', async () => {
    const folder = new ReadCountingDirectory(new InMemoryDirectory())
    await folder.writeFile('vernacular.json', DOCUMENT)
    const files = new FolderFiles('p', folder, { durable: true })

    expect(await files.ids()).toEqual(['p'])
    expect(folder.reads).toBe(0)
  })

  it('keeps the document at the root of the folder and leaves the user files beside it alone', async () => {
    const folder = new InMemoryDirectory()
    const notes = Uint8Array.of(9, 9)
    await folder.writeFile('notes.txt', notes)
    const files = new FolderFiles('p', folder, { durable: true })

    await files.projectDirectory('p').writeFile('vernacular.json', DOCUMENT)

    expect(await folder.readFile('vernacular.json')).toEqual(DOCUMENT)
    expect(await folder.readFile('notes.txt')).toEqual(notes)
  })

  it('throws when asked for the directory of a project that is not the one in the folder', () => {
    const files = new FolderFiles('p', new InMemoryDirectory(), { durable: true })

    expect(() => files.projectDirectory('other')).toThrow()
  })

  describe('asset cache', () => {
    it('puts the bytes into the assets directory of the folder', async () => {
      const folder = new InMemoryDirectory()
      const files = new FolderFiles('p', folder, { durable: true })

      await files.assetsFor('p').put(HASH, FOLDER_BYTES)

      expect(await folder.readFile(ASSET_PATH)).toEqual(FOLDER_BYTES)
      expect(await files.assetsFor('p').has(HASH)).toBe(true)
    })

    it('reports an asset as held only when the folder holds the bytes', async () => {
      const shared = await sharedPoolWith(HASH, SHARED_BYTES)
      const files = new FolderFiles('p', new InMemoryDirectory(), { durable: true, shared })

      expect(await files.assetsFor('p').has(HASH)).toBe(false)
    })

    it('reads from the shared pool when the folder lacks the bytes, without writing them', async () => {
      const folder = new InMemoryDirectory()
      const shared = await sharedPoolWith(HASH, SHARED_BYTES)
      const files = new FolderFiles('p', folder, { durable: true, shared })

      expect(await files.assetsFor('p').get(HASH)).toEqual(SHARED_BYTES)
      expect(await folder.readFile(ASSET_PATH)).toBeUndefined()
    })

    it('reads from the folder first when both hold the bytes', async () => {
      const folder = new InMemoryDirectory()
      await folder.writeFile(ASSET_PATH, FOLDER_BYTES)
      const shared = await sharedPoolWith(HASH, SHARED_BYTES)
      const files = new FolderFiles('p', folder, { durable: true, shared })

      expect(await files.assetsFor('p').get(HASH)).toEqual(FOLDER_BYTES)
    })

    it('reads nothing for a hash that neither the folder nor the shared pool holds', async () => {
      const shared = new InMemoryAssetCache()
      const files = new FolderFiles('p', new InMemoryDirectory(), { durable: true, shared })

      expect(await files.assetsFor('p').get(HASH)).toBeUndefined()
    })
  })
})
