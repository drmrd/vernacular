import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createUnderlay } from '../core'
import type { AssetReference } from '../core'
import { DirectoryAssetCache } from './directory-asset-cache'
import { InMemoryDirectory } from './fs/in-memory-directory'
import { FolderProjectStore } from './folder/folder-project-store'

const CONTENT_HASH = 'deadbeef'
const RASTER_BYTES = Uint8Array.of(1, 2, 3, 4)
const UNDERLAY_WIDTH = 1024
const UNDERLAY_HEIGHT = 768

describe('underlay persistence round-trip', () => {
  it('survives close and reopen through one directory with the underlay and raster intact', async () => {
    const directory = new InMemoryDirectory()
    const store = new FolderProjectStore(directory)
    const cache = new DirectoryAssetCache(directory)

    await cache.put(CONTENT_HASH, RASTER_BYTES)

    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      era: 'victorian',
      appVersion: '0.0.0',
    })
    const image: AssetReference = { scope: 'project', contentHash: CONTENT_HASH }
    const underlay = createUnderlay({ image, width: UNDERLAY_WIDTH, height: UNDERLAY_HEIGHT })
    const floor = createFloor('Ground', { id: 'g' })
    floor.underlays = [underlay]
    project.floors = [floor]
    await store.saveProject(project)

    const freshStore = new FolderProjectStore(directory)
    const freshCache = new DirectoryAssetCache(directory)

    const reopened = await freshStore.loadProject()
    expect(reopened.floors[0]?.underlays).toHaveLength(1)
    expect(reopened.floors[0]?.underlays[0]?.image.contentHash).toBe(CONTENT_HASH)
    expect(reopened.floors[0]?.underlays[0]).toEqual(underlay)

    expect(await freshCache.get(CONTENT_HASH)).toEqual(RASTER_BYTES)
  })
})
