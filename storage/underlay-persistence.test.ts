import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createUnderlay } from '../core'
import type { AssetReference } from '../core'
import { DirectoryAssetCache } from './directory-asset-cache'
import { InMemoryDirectory } from './fs/in-memory-directory'
import { DocumentStore } from './documents/document-store'
import { FolderFiles } from './project-files/folder-files'

const PROJECT_ID = 'house'
const CONTENT_HASH = 'deadbeef'
const RASTER_BYTES = Uint8Array.of(1, 2, 3, 4)
const UNDERLAY_WIDTH = 1024
const UNDERLAY_HEIGHT = 768

/** A store over one project folder: the document and the raster share the one directory. */
function storeOver(directory: InMemoryDirectory): DocumentStore {
  return new DocumentStore(new FolderFiles(PROJECT_ID, directory, { durable: true }))
}

describe('underlay persistence round-trip', () => {
  it('survives close and reopen through one directory with the underlay and raster intact', async () => {
    const directory = new InMemoryDirectory()
    const store = storeOver(directory)
    const cache = new DirectoryAssetCache(directory)

    await cache.put(CONTENT_HASH, RASTER_BYTES)

    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.0.0',
    })
    const image: AssetReference = { scope: 'project', contentHash: CONTENT_HASH }
    const underlay = createUnderlay({ image, width: UNDERLAY_WIDTH, height: UNDERLAY_HEIGHT })
    const floor = createFloor('Ground', { id: 'g' })
    floor.underlays = [underlay]
    project.floors = [floor]
    await store.save(PROJECT_ID, project)

    const freshStore = storeOver(directory)
    const freshCache = new DirectoryAssetCache(directory)

    const reopened = await freshStore.load(PROJECT_ID)
    expect(reopened.floors[0]?.underlays).toHaveLength(1)
    expect(reopened.floors[0]?.underlays[0]?.source).toEqual({ kind: 'raster', image })
    expect(reopened.floors[0]?.underlays[0]).toEqual(underlay)

    expect(await freshCache.get(CONTENT_HASH)).toEqual(RASTER_BYTES)
  })
})
