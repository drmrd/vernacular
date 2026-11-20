// @vitest-environment node
// Pure storage logic over a project in memory; node runs it as the other archive tests run.
import { describe, expect, it, vi } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createUnderlay,
  type AssetReference,
  type AssetScope,
  type Floor,
  type Project,
  type UnderlaySource,
} from '../../core'
import type { LibraryItem } from '../assets/asset-source'
import { neededAssetHashes, packSuppliesFrom } from './needed-assets'
import type { PackSupplies } from './needed-assets'

const FIRST = 'a'.repeat(64)
const SECOND = 'b'.repeat(64)
const THIRD = 'c'.repeat(64)
const PACK_HASH = 'd'.repeat(64)
const STARTER_PACK: AssetScope = 'pack:vernacular-starter@1.0.0'
const LATER_STARTER_PACK: AssetScope = 'pack:vernacular-starter@2.0.0'

const user = (contentHash: string): AssetReference => ({ scope: 'user', contentHash })
const inProject = (contentHash: string): AssetReference => ({ scope: 'project', contentHash })
const inPack = (contentHash: string, scope = STARTER_PACK): AssetReference => ({
  scope,
  contentHash,
})

function emptyProject(): Project {
  return createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
}

/** A floor with a piece of furniture for each of `furniture` and an underlay for each of `sources`. */
function floorWith(
  furniture: readonly AssetReference[],
  sources: readonly UnderlaySource[] = [],
): Floor {
  const floor = createFloor('Floor')
  floor.furniture = furniture.map((assetRef) =>
    createFurnitureInstance({
      assetRef,
      position: { x: 0, y: 0 },
      footprint: { width: 600, depth: 600 },
    }),
  )
  floor.underlays = sources.map((source) => ({
    ...createUnderlay({ image: user(FIRST), width: 1000, height: 800 }),
    source,
  }))
  return floor
}

function projectOf(...floors: Floor[]): Project {
  return { ...emptyProject(), floors }
}

/** A library item of furniture that lists `reference`. */
function libraryItem(reference: AssetReference): LibraryItem {
  return {
    reference,
    name: 'Chair',
    kind: 'furniture',
    categories: [],
    eras: [],
    footprint: { width: 500, depth: 500 },
    height: 750,
  }
}

describe('neededAssetHashes', () => {
  it('names each referenced hash once, in the order of first reference', () => {
    const project = projectOf(
      floorWith(
        [user(FIRST), user(SECOND), user(FIRST)],
        [{ kind: 'raster', image: inProject(FIRST) }],
      ),
      floorWith(
        [user(THIRD), user(SECOND)],
        [
          { kind: 'document', document: inProject(THIRD), page: 1 },
          { kind: 'scene', scene: inProject(FIRST) },
        ],
      ),
    )

    expect(neededAssetHashes(project)).toEqual([FIRST, SECOND, THIRD])
  })

  it('gives text hashes only for a reference whose hash is an array of one text', () => {
    const parsed: unknown = JSON.parse(JSON.stringify({ scope: 'user', contentHash: [SECOND] }))
    const project = projectOf(floorWith([user(FIRST), parsed as AssetReference]))

    expect(neededAssetHashes(project)).toEqual([FIRST])
  })

  it('is empty for a project with no floor', () => {
    expect(neededAssetHashes(emptyProject())).toEqual([])
  })

  it('leaves out a pack reference that packSupplies accepts', () => {
    const project = projectOf(floorWith([user(FIRST), inPack(PACK_HASH)]))
    const packSupplies: PackSupplies = (reference) => reference.contentHash === PACK_HASH

    expect(neededAssetHashes(project, packSupplies)).toEqual([FIRST])
  })

  it('keeps a pack reference when there is no packSupplies', () => {
    const project = projectOf(floorWith([user(FIRST), inPack(PACK_HASH)]))

    expect(neededAssetHashes(project)).toEqual([FIRST, PACK_HASH])
  })

  it('keeps a hash that a supplied pack reference and a user reference share', () => {
    const packFirst = projectOf(floorWith([inPack(PACK_HASH), user(PACK_HASH)]))
    const userFirst = projectOf(floorWith([user(PACK_HASH), inPack(PACK_HASH)]))
    const everyPackSupplies: PackSupplies = () => true

    expect(neededAssetHashes(packFirst, everyPackSupplies)).toEqual([PACK_HASH])
    expect(neededAssetHashes(userFirst, everyPackSupplies)).toEqual([PACK_HASH])
  })

  it('does not ask packSupplies about a user or a project reference', () => {
    const project = projectOf(
      floorWith([user(FIRST), inPack(PACK_HASH)], [{ kind: 'raster', image: inProject(SECOND) }]),
    )
    const packSupplies = vi.fn<PackSupplies>(() => false)

    neededAssetHashes(project, packSupplies)

    expect(packSupplies).toHaveBeenCalledTimes(1)
    expect(packSupplies).toHaveBeenCalledWith(inPack(PACK_HASH))
  })
})

describe('packSuppliesFrom', () => {
  it('accepts the hash of a pack item under any pack version, and refuses a hash that only a user item lists', () => {
    const supplies = packSuppliesFrom([libraryItem(inPack(PACK_HASH)), libraryItem(user(FIRST))])

    expect(supplies(inPack(PACK_HASH))).toBe(true)
    expect(supplies(inPack(PACK_HASH, LATER_STARTER_PACK))).toBe(true)
    expect(supplies(inPack(FIRST))).toBe(false)
  })
})
