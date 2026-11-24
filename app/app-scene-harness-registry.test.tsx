import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { GROUND_GRASS_REFERENCE } from '../core'
import type { AssetRegistry } from '../storage'
import { App } from './app'
import { servePublicFiles } from './serve-public-files-test-support'

const seenRegistries = vi.hoisted((): AssetRegistry[] => [])

vi.mock('../bridge', async (importOriginal) => {
  const original = await importOriginal<typeof import('../bridge')>()
  function RegistryProbe() {
    seenRegistries.push(original.useAssetRegistry())
    return null
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the export name of the module
  return { ...original, SceneHarnessView: RegistryProbe }
})

const HARNESS_SEARCH = '?fixture=scene-harness'
const GRASS_TILE_SIZE_MM = 2000
const GRASS_PNG_URL = `/packs/vernacular-starter-1.1.0/assets/${GROUND_GRASS_REFERENCE.contentHash}.png`

function lastSeenRegistry(): AssetRegistry {
  const registry = seenRegistries.at(-1)
  if (!registry) throw new Error('the harness has not asked for a registry yet')
  return registry
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
