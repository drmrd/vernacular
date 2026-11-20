// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it, vi } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  type AssetReference,
  type AssetScope,
  type Project,
} from '../../core'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { exportProjectBundle } from './export-project-bundle'
import type { PackSupplies } from './needed-assets'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

const FIRST = 'a'.repeat(64)
const SECOND = 'b'.repeat(64)
const THIRD = 'c'.repeat(64)
const PACK_HASH = 'd'.repeat(64)
const NOT_A_CONTENT_HASH = 'not-a-content-hash'
const STARTER_PACK: AssetScope = 'pack:vernacular-starter@1.0.0'
const MODEL_BYTES = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 2, 3)
const FOOTPRINT = { width: 600, depth: 600 }

const user = (contentHash: string): AssetReference => ({ scope: 'user', contentHash })
const inPack = (contentHash: string): AssetReference => ({ scope: STARTER_PACK, contentHash })

/** A project with one floor that holds a piece of furniture for each reference, in order. */
function projectReferencing(...references: readonly AssetReference[]): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const floor = createFloor('Ground', { id: 'g' })
  floor.furniture = references.map((assetRef) =>
    createFurnitureInstance({ assetRef, position: { x: 0, y: 0 }, footprint: FOOTPRINT }),
  )
  project.floors = [floor]
  return project
}

/** A pool that holds model bytes for each hash. */
async function poolHolding(...hashes: readonly string[]): Promise<InMemoryAssetCache> {
  const pool = new InMemoryAssetCache()
  for (const hash of hashes) await pool.put(hash, MODEL_BYTES)
  return pool
}

/** What the bundle carries of a hash. */
async function carriedBy(bytes: Uint8Array, hash: string): Promise<Uint8Array | undefined> {
  const reopened = await ZipBundleProjectStore.fromBundle('current', bytes)
  return reopened.assetCache().get(hash)
}

describe('what an export reports as missing', () => {
  it('writes the file and names an asset that the pool lacks', async () => {
    const project = projectReferencing(user(FIRST), user(SECOND))
    const pool = await poolHolding(FIRST)

    const exported = await exportProjectBundle('current', project, { assets: pool })

    expect(exported.missingAssets).toEqual([SECOND])
    expect(await carriedBy(exported.bytes, FIRST)).toEqual(MODEL_BYTES)
    expect(await carriedBy(exported.bytes, SECOND)).toBeUndefined()
  })

  it('names nothing when the pool holds every asset', async () => {
    const project = projectReferencing(user(FIRST), user(SECOND))
    const pool = await poolHolding(FIRST, SECOND)

    const exported = await exportProjectBundle('current', project, { assets: pool })

    expect(exported.missingAssets).toEqual([])
  })

  it('names the missing assets in the order of their first reference', async () => {
    const project = projectReferencing(user(THIRD), user(FIRST), user(SECOND), user(FIRST))

    const exported = await exportProjectBundle('current', project, {
      assets: new InMemoryAssetCache(),
    })

    expect(exported.missingAssets).toEqual([THIRD, FIRST, SECOND])
  })

  it('carries, names, and counts an asset once when the project refers to it twice', async () => {
    const project = projectReferencing(user(FIRST), user(SECOND), user(FIRST), user(SECOND))
    const pool = await poolHolding(FIRST)
    const read = vi.spyOn(pool, 'get')
    const progress: Array<[number, number]> = []

    const exported = await exportProjectBundle('current', project, {
      assets: pool,
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(exported.missingAssets).toEqual([SECOND])
    expect(await carriedBy(exported.bytes, FIRST)).toEqual(MODEL_BYTES)
    expect(read.mock.calls.filter(([hash]) => hash === FIRST)).toHaveLength(1)
    expect(read).toHaveBeenCalledTimes(2)
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('keeps the order of first reference when carried and missing assets interleave', async () => {
    const project = projectReferencing(user(THIRD), user(FIRST), user(SECOND))
    const pool = await poolHolding(FIRST)

    const exported = await exportProjectBundle('current', project, { assets: pool })

    expect(exported.missingAssets).toEqual([THIRD, SECOND])
  })

  it('rejects when a pool read rejects', async () => {
    const project = projectReferencing(user(FIRST))
    const pool = await poolHolding(FIRST)
    vi.spyOn(pool, 'get').mockRejectedValue(new Error('pool down'))

    await expect(exportProjectBundle('current', project, { assets: pool })).rejects.toThrow(
      'pool down',
    )
  })

  it('counts a reference whose hash is not a content hash in the progress', async () => {
    const project = projectReferencing(user(FIRST), user(NOT_A_CONTENT_HASH))
    const pool = await poolHolding(FIRST)
    const progress: Array<[number, number]> = []

    await exportProjectBundle('current', project, {
      assets: pool,
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('leaves a pack asset that packSupplies accepts out of the progress total', async () => {
    const project = projectReferencing(user(FIRST), inPack(PACK_HASH))
    const pool = await poolHolding(FIRST, PACK_HASH)
    const progress: Array<[number, number]> = []

    await exportProjectBundle('current', project, {
      assets: pool,
      packSupplies: () => true,
      onProgress: (completed, total) => progress.push([completed, total]),
    })

    expect(progress).toEqual([[1, 1]])
  })

  it('names a reference whose hash is not a content hash without asking the pool', async () => {
    const project = projectReferencing(user(FIRST), user(NOT_A_CONTENT_HASH))
    const pool = await poolHolding(FIRST, NOT_A_CONTENT_HASH)
    const read = vi.spyOn(pool, 'get')

    const exported = await exportProjectBundle('current', project, { assets: pool })

    expect(exported.missingAssets).toEqual([NOT_A_CONTENT_HASH])
    expect(read).not.toHaveBeenCalledWith(NOT_A_CONTENT_HASH)
  })
})

describe('what an export does about a pack asset', () => {
  it('neither carries nor names a pack asset that packSupplies accepts, also when the pool holds it', async () => {
    const project = projectReferencing(user(FIRST), inPack(PACK_HASH))
    const pool = await poolHolding(FIRST, PACK_HASH)
    const packSupplies: PackSupplies = () => true

    const exported = await exportProjectBundle('current', project, {
      assets: pool,
      packSupplies,
    })

    expect(exported.missingAssets).toEqual([])
    expect(await carriedBy(exported.bytes, PACK_HASH)).toBeUndefined()
    expect(await carriedBy(exported.bytes, FIRST)).toEqual(MODEL_BYTES)
  })

  it('carries a pack asset that packSupplies refuses when the pool holds it, and names it when not', async () => {
    const project = projectReferencing(inPack(PACK_HASH), inPack(SECOND))
    const pool = await poolHolding(PACK_HASH)
    const packSupplies: PackSupplies = () => false

    const exported = await exportProjectBundle('current', project, {
      assets: pool,
      packSupplies,
    })

    expect(exported.missingAssets).toEqual([SECOND])
    expect(await carriedBy(exported.bytes, PACK_HASH)).toEqual(MODEL_BYTES)
  })

  it('treats a pack reference as one that no pack supplies when there is no packSupplies', async () => {
    const project = projectReferencing(inPack(PACK_HASH), inPack(SECOND))
    const pool = await poolHolding(PACK_HASH)

    const exported = await exportProjectBundle('current', project, { assets: pool })

    expect(exported.missingAssets).toEqual([SECOND])
    expect(await carriedBy(exported.bytes, PACK_HASH)).toEqual(MODEL_BYTES)
  })
})
