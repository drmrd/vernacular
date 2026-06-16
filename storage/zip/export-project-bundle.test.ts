// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createUnderlay,
  type AssetReference,
  type Project,
} from '../../core'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { collectReferencedAssets, exportProjectBundle } from './export-project-bundle'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

const FURNITURE_HASH = 'f'.repeat(64)
const UNDERLAY_HASH = 'u'.repeat(64)
const GLB_BYTES = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 2, 3)

function projectWithUserFurniture(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const assetRef: AssetReference = { scope: 'user', contentHash: FURNITURE_HASH }
  const furniture = createFurnitureInstance({
    assetRef,
    position: { x: 100, y: 200 },
    footprint: { width: 600, depth: 600 },
  })
  const floor = createFloor('Ground', { id: 'g' })
  floor.furniture = [furniture]
  project.floors = [floor]
  return project
}

function projectWithFurnitureAndUnderlay(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const assetRef: AssetReference = { scope: 'user', contentHash: FURNITURE_HASH }
  const furniture = createFurnitureInstance({
    assetRef,
    position: { x: 100, y: 200 },
    footprint: { width: 600, depth: 600 },
  })
  const underlay = createUnderlay({
    image: { scope: 'project', contentHash: UNDERLAY_HASH },
    width: 1000,
    height: 800,
  })
  const floor = createFloor('Ground', { id: 'g' })
  floor.furniture = [furniture]
  floor.underlays = [underlay]
  project.floors = [floor]
  return project
}

describe('collectReferencedAssets', () => {
  it('includes both the furniture asset and the raster underlay asset for a project that has both', () => {
    const project = projectWithFurnitureAndUnderlay()
    const refs = collectReferencedAssets(project)
    const hashes = refs.map((r) => r.contentHash)
    expect(hashes).toContain(FURNITURE_HASH)
    expect(hashes).toContain(UNDERLAY_HASH)
  })

  it('returns an empty array for an empty project with no floors', () => {
    const project = createEmptyProject({
      name: 'Empty',
      units: 'metric',
      period: 'victorian',
      appVersion: '0.0.0',
    })
    expect(collectReferencedAssets(project)).toEqual([])
  })
})

describe('exportProjectBundle', () => {
  it('packs the referenced asset bytes into the bundle so they survive a round-trip', async () => {
    const project = projectWithUserFurniture()
    const cache = new InMemoryAssetCache()
    await cache.put(FURNITURE_HASH, GLB_BYTES)

    const bytes = await exportProjectBundle('current', project, cache)
    const reopened = await ZipBundleProjectStore.fromBundle('current', bytes)

    expect(await reopened.assetCache().get(FURNITURE_HASH)).toEqual(GLB_BYTES)
    const loaded = await reopened.load('current')
    expect(loaded.floors[0].furniture[0].assetRef.contentHash).toBe(FURNITURE_HASH)
  })

  it('omits asset bytes from a plain bundle that was not built with exportProjectBundle', async () => {
    const project = projectWithUserFurniture()

    const plain = new ZipBundleProjectStore('current')
    await plain.save('current', project)
    const plainBytes = await plain.exportBundle()

    const plainReopened = await ZipBundleProjectStore.fromBundle('current', plainBytes)
    expect(await plainReopened.assetCache().get(FURNITURE_HASH)).toBeUndefined()
  })
})
