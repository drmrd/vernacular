import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { resolvedAsset } from '../../core'
import type { AssetReference, ResolvedAsset, TextureDescription } from '../../core'
import { Texture } from '../../engine/testing'
import type { TextureSource, TextureState } from './texture-cache'
import { useGroundTexture } from './use-ground-texture'

type FakeBitmap = { width: number; height: number; close: Mock }

const reference: AssetReference = { scope: 'pack:grass@1.0.0', contentHash: 'sha256-grass' }
const otherReference: AssetReference = { scope: 'pack:gravel@1.0.0', contentHash: 'sha256-gravel' }
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
  return function Probe({ asset = reference }: { asset?: AssetReference }) {
    received.push(useGroundTexture(asset, source))
    return null
  }
}

function handedOutTextures(received: TextureState[]): Texture[] {
  return received.flatMap((state) => (state.appearance ? [state.appearance.texture] : []))
}

function stubImageDecoding(): FakeBitmap[] {
  const decoded: FakeBitmap[] = []
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => {
      const bitmap = { width: 512, height: 768, close: vi.fn() }
      decoded.push(bitmap)
      return bitmap
    }),
  )
  return decoded
}

function deferredAsset() {
  let settle: (asset: ResolvedAsset) => void = () => {}
  const promise = new Promise<ResolvedAsset>((resolve) => {
    settle = resolve
  })
  return { promise, settle }
}

describe('useGroundTexture under StrictMode', () => {
  let decoded: FakeBitmap[]

  beforeEach(() => {
    decoded = stubImageDecoding()
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
    const handedOut = handedOutTextures(received)
    const freed = disposeTexture.mock.contexts
    expect(received[0]?.status).toBe('loading')
    expect(handedOut.length).toBeGreaterThan(0)
    expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])

    view.unmount()
  })

  it('the ground texture is freed when the view unmounts', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const texture = received.at(-1)?.appearance?.texture as Texture
    const bitmap = decoded.find((candidate) => candidate === texture.image) as FakeBitmap
    const disposeCalls = () => disposeTexture.mock.contexts.filter((held) => held === texture)

    expect(disposeCalls()).toHaveLength(0)
    expect(bitmap.close).not.toHaveBeenCalled()

    view.unmount()

    expect(disposeCalls()).toHaveLength(1)
    expect(bitmap.close).toHaveBeenCalledTimes(1)
  })

  it('when the reference changes, the view shows loading and never the freed texture of the old reference', async () => {
    const pending = deferredAsset()
    const changingSource: TextureSource = {
      ...source,
      resolve: (asset) =>
        asset.contentHash === otherReference.contentHash ? pending.promise : source.resolve(asset),
    }
    const received: TextureState[] = []
    const Probe = ({ asset }: { asset: AssetReference }) => {
      received.push(useGroundTexture(asset, changingSource))
      return null
    }
    const view = render(<Probe asset={reference} />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const oldTexture = received.at(-1)?.appearance?.texture

    const renderedBefore = received.length
    view.rerender(<Probe asset={otherReference} />)

    const afterChange = received.slice(renderedBefore)
    expect(afterChange.length).toBeGreaterThan(0)
    expect(afterChange.map((state) => state.status)).toEqual(afterChange.map(() => 'loading'))
    expect(afterChange.map((state) => state.appearance)).toEqual(afterChange.map(() => undefined))

    pending.settle(resolvedAsset(new Uint8Array([4, 5, 6]), otherReference.scope))
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const newTexture = received.at(-1)?.appearance?.texture
    expect(newTexture).toBeInstanceOf(Texture)
    expect(newTexture).not.toBe(oldTexture)

    view.unmount()
  })
})
