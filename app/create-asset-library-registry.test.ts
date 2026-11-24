import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GROUND_GRASS_REFERENCE, type AssetReference } from '../core'
import { describe, expect, it } from 'vitest'
import { AssetRegistry } from '../storage'
import {
  createHarnessAssetRegistry,
  createStarterPackSources,
} from './create-asset-library-registry'
import { loadPackSupplies } from './pack-supplies'
import { PUBLIC_DIRECTORY, servePublicFiles } from './serve-public-files-test-support'

const CURRENT_PACK_URL = '/packs/vernacular-starter-1.1.0'
const CURRENT_PACK_SCOPE = 'pack:vernacular-starter@1.1.0'
const GRASS_TILE_SIZE_MM = 2000
const PREVIOUS_PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const PREVIOUS_PACK_DIRECTORY = 'packs/vernacular-starter-1.0.0'
const PREVIOUS_CHAIR_HASH = '8a8a0cafbecb2446278c8b61e275c1ac78373a7ccd59ddd5ac7684bf1388341e'
const PREVIOUS_CHAIR_REFERENCE: AssetReference = {
  scope: PREVIOUS_PACK_SCOPE,
  contentHash: PREVIOUS_CHAIR_HASH,
}

interface ManifestAsset {
  contentHash: string
  kind: string
}

function currentModelHashes(): string[] {
  const manifest = JSON.parse(
    readFileSync(join(PUBLIC_DIRECTORY, CURRENT_PACK_URL, 'manifest.json'), 'utf8'),
  ) as { assets: ManifestAsset[] }
  return manifest.assets
    .filter((asset) => asset.kind !== 'texture')
    .map((asset) => asset.contentHash)
}

describe('the application starter pack sources', () => {
  it("the application's library reads starter pack 1.1.0", async () => {
    const fetchSpy = servePublicFiles()
    const registry = new AssetRegistry(createStarterPackSources(fetchSpy))

    const items = await registry.list()

    expect(fetchSpy).toHaveBeenCalledWith(`${CURRENT_PACK_URL}/manifest.json`)
    expect(items.map((item) => item.reference)).toEqual(
      currentModelHashes().map((contentHash) => ({ scope: CURRENT_PACK_SCOPE, contentHash })),
    )
    expect(items.map((item) => item.reference.contentHash)).not.toContain(PREVIOUS_CHAIR_HASH)
  })

  it('a reference to the chair of starter pack 1.0.0 still resolves', async () => {
    const registry = new AssetRegistry(createStarterPackSources(servePublicFiles()))
    const expectedBytes = new Uint8Array(
      readFileSync(
        join(PUBLIC_DIRECTORY, PREVIOUS_PACK_DIRECTORY, 'assets', `${PREVIOUS_CHAIR_HASH}.glb`),
      ),
    )

    const resolution = await registry.resolve(PREVIOUS_CHAIR_REFERENCE)

    expect(resolution).toMatchObject({
      outcome: 'resolved',
      resolvedScope: PREVIOUS_PACK_SCOPE,
      bytes: expectedBytes,
    })
  })

  it('the catalog includes the chair of starter pack 1.0.0', async () => {
    const registry = new AssetRegistry(createStarterPackSources(servePublicFiles()))

    const items = await registry.catalog()

    expect(items.map((item) => item.reference)).toContainEqual(PREVIOUS_CHAIR_REFERENCE)
  })

  it('describes the chair of starter pack 1.0.0', async () => {
    const registry = new AssetRegistry(createStarterPackSources(servePublicFiles()))

    const description = await registry.describe(PREVIOUS_CHAIR_REFERENCE)

    expect(description).toEqual({
      kind: 'model',
      mediaType: 'model/gltf-binary',
      dimensions: { width: 500, depth: 520, height: 800 },
    })
  })

  it('supplies the chair of starter pack 1.0.0 to the missing-asset check', async () => {
    const registry = new AssetRegistry(createStarterPackSources(servePublicFiles()))

    const supplies = await loadPackSupplies(registry)

    expect(supplies?.(PREVIOUS_CHAIR_REFERENCE)).toBe(true)
  })
})

describe('the scene harness registry', () => {
  it('resolves and describes the ground grass', async () => {
    const fetchSpy = servePublicFiles()
    const registry = createHarnessAssetRegistry(fetchSpy)

    const resolution = await registry.resolve(GROUND_GRASS_REFERENCE)
    const description = await registry.describe(GROUND_GRASS_REFERENCE)

    expect(resolution).toMatchObject({ outcome: 'resolved', resolvedScope: CURRENT_PACK_SCOPE })
    expect(fetchSpy).toHaveBeenCalledWith(
      `${CURRENT_PACK_URL}/assets/${GROUND_GRASS_REFERENCE.contentHash}.png`,
    )
    expect(description).toMatchObject({
      kind: 'texture',
      tileSize: { width: GRASS_TILE_SIZE_MM, height: GRASS_TILE_SIZE_MM },
    })
  })
})
