import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GROUND_GRASS_REFERENCE } from '../core'
import type { AssetRegistry } from '../storage'
import { App } from './app'

const seenRegistries = vi.hoisted((): unknown[] => [])

vi.mock('../bridge', async (importOriginal) => {
  const original = await importOriginal<typeof import('../bridge')>()
  function RegistryProbe() {
    seenRegistries.push(original.useAssetRegistry())
    return null
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the export name of the module
  return { ...original, SceneHarnessView: RegistryProbe }
})

const PUBLIC_DIRECTORY = join(import.meta.dirname, '..', 'public')
const HTTP_OK = 200
const HTTP_NOT_FOUND = 404
const HARNESS_SEARCH = '?fixture=scene-harness'
const GRASS_TILE_SIZE_MM = 2000
const GRASS_PNG_URL = `/packs/vernacular-starter-1.1.0/assets/${GROUND_GRASS_REFERENCE.contentHash}.png`

function servePublicFiles() {
  return vi.fn(async (input: RequestInfo | URL): Promise<Response> => {
    try {
      return new Response(readFileSync(join(PUBLIC_DIRECTORY, String(input))), { status: HTTP_OK })
    } catch {
      return new Response(null, { status: HTTP_NOT_FOUND })
    }
  })
}

function lastSeenRegistry(): AssetRegistry {
  return seenRegistries[seenRegistries.length - 1] as AssetRegistry
}

describe('the scene harness in the application', () => {
  let originalAddress = ''
  let fetchSpy: ReturnType<typeof servePublicFiles>

  beforeEach(() => {
    originalAddress = window.location.pathname + window.location.search + window.location.hash
    window.history.replaceState(null, '', `/${HARNESS_SEARCH}`)
    seenRegistries.length = 0
    fetchSpy = servePublicFiles()
    vi.stubGlobal('fetch', fetchSpy)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', originalAddress)
  })

  it('gives the harness a registry that resolves and describes the ground grass', async () => {
    render(<App />)
    const registry = lastSeenRegistry()

    await registry.resolve(GROUND_GRASS_REFERENCE)
    const description = await registry.describe(GROUND_GRASS_REFERENCE)

    expect(fetchSpy).toHaveBeenCalledWith(GRASS_PNG_URL)
    expect(description).toMatchObject({
      kind: 'texture',
      tileSize: { width: GRASS_TILE_SIZE_MM, height: GRASS_TILE_SIZE_MM },
    })
  })

  it('keeps the same registry when the application renders again', () => {
    const { rerender } = render(<App />)
    const first = lastSeenRegistry()

    rerender(<App />)

    expect(seenRegistries.length).toBeGreaterThan(1)
    expect(lastSeenRegistry()).toBe(first)
  })
})
