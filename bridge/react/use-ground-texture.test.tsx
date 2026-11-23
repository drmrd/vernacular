import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { resolvedAsset } from '../../core'
import type { AssetReference, TextureDescription } from '../../core'
import { Texture } from '../../engine/testing'
import type { TextureSource, TextureState } from './texture-cache'
import { useGroundTexture } from './use-ground-texture'

const reference: AssetReference = { scope: 'pack:grass@1.0.0', contentHash: 'sha256-grass' }
const description: TextureDescription = {
  kind: 'texture',
  mediaType: 'image/png',
  image: { width: 512, height: 768 },
  tileSize: { width: 1000, height: 1500 },
  colorSpace: 'srgb',
}
const source: TextureSource = {
  resolve: async (asset) => resolvedAsset(new Uint8Array([1, 2, 3]), asset.scope),
  describe: async () => description,
}

function recordingProbe(received: TextureState[]) {
  return function Probe() {
    const state = useGroundTexture(reference, source)
    received.push(state)
    return null
  }
}

describe('useGroundTexture under StrictMode', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 512, height: 768, close: vi.fn() })),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('still becomes ready, and no appearance handed out is freed while the view is mounted', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)

    const view = render(<Probe />, { reactStrictMode: true })

    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const handedOut = received.flatMap((state) =>
      state.appearance ? [state.appearance.texture] : [],
    )
    const freed = disposeTexture.mock.contexts
    expect(received[0]?.status).toBe('loading')
    expect(handedOut.length).toBeGreaterThan(0)
    expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])

    view.unmount()
  })
})
