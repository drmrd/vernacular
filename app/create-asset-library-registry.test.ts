import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { AssetRegistry } from '../storage'
import { createStarterPackSources } from './create-asset-library-registry'

const PUBLIC_DIRECTORY = join(import.meta.dirname, '..', 'public')
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const CURRENT_PACK_URL = '/packs/vernacular-starter-1.1.0'
const CURRENT_PACK_SCOPE = 'pack:vernacular-starter@1.1.0'
const PREVIOUS_PACK_SCOPE = 'pack:vernacular-starter@1.0.0'
const PREVIOUS_PACK_DIRECTORY = 'packs/vernacular-starter-1.0.0'
const PREVIOUS_CHAIR_HASH = '8a8a0cafbecb2446278c8b61e275c1ac78373a7ccd59ddd5ac7684bf1388341e'

interface ManifestAsset {
  contentHash: string
  kind: string
}

function servePublicFiles() {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    try {
      const body = readFileSync(join(PUBLIC_DIRECTORY, String(input)))
      return new Response(body, { status: HTTP_OK })
    } catch {
      return new Response(null, { status: HTTP_NOT_FOUND })
    }
  })
}

function currentFurnitureHash(): string {
  const manifest = JSON.parse(
    readFileSync(join(PUBLIC_DIRECTORY, CURRENT_PACK_URL, 'manifest.json'), 'utf8'),
  ) as { assets: ManifestAsset[] }
  const furniture = manifest.assets.find((asset) => asset.kind === 'furniture')
  if (furniture === undefined) throw new Error('the current starter pack has no furniture asset')
  return furniture.contentHash
}

describe('the application starter pack sources', () => {
  it("the application's library reads starter pack 1.1.0", async () => {
    const fetchSpy = servePublicFiles()
    const registry = new AssetRegistry(createStarterPackSources(fetchSpy))

    const items = await registry.list()

    expect(fetchSpy).toHaveBeenCalledWith(`${CURRENT_PACK_URL}/manifest.json`)
    expect(items.map((item) => item.reference)).toEqual([
      { scope: CURRENT_PACK_SCOPE, contentHash: currentFurnitureHash() },
    ])
    expect(items.map((item) => item.reference.contentHash)).not.toContain(PREVIOUS_CHAIR_HASH)
  })

  it('a reference to the chair of starter pack 1.0.0 still resolves', async () => {
    const registry = new AssetRegistry(createStarterPackSources(servePublicFiles()))
    const expectedBytes = new Uint8Array(
      readFileSync(
        join(PUBLIC_DIRECTORY, PREVIOUS_PACK_DIRECTORY, 'assets', `${PREVIOUS_CHAIR_HASH}.glb`),
      ),
    )

    const resolution = await registry.resolve({
      scope: PREVIOUS_PACK_SCOPE,
      contentHash: PREVIOUS_CHAIR_HASH,
    })

    expect(resolution).toMatchObject({ outcome: 'resolved', resolvedScope: PREVIOUS_PACK_SCOPE })
    expect(resolution.outcome === 'resolved' && resolution.bytes).toEqual(expectedBytes)
  })
})
