import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { resolvedAsset } from '../../core'
import type { AssetReference, ResolvedAsset, TextureDescription } from '../../core'
import { Texture } from '../../engine/testing'
import { LOADING } from './texture-cache'
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

type ProbeProps = { asset?: AssetReference; textureSource?: TextureSource }

function recordingProbe(received: TextureState[]) {
  return function Probe({ asset = reference, textureSource = source }: ProbeProps) {
    received.push(useGroundTexture(asset, textureSource))
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

type Deferred = ReturnType<typeof deferredAsset>

/** A source that answers each held asset with a deferred, and every other asset at once. */
function holdableSource() {
  const holds = new Map<string, Deferred>()
  const held: TextureSource = {
    ...source,
    resolve: (asset) => holds.get(asset.contentHash)?.promise ?? source.resolve(asset),
  }
  return {
    source: held,
    hold: (asset: AssetReference) => {
      const deferred = deferredAsset()
      holds.set(asset.contentHash, deferred)
      return deferred
    },
  }
}

type Journey = {
  first: ProbeProps
  change: ProbeProps
  back: ProbeProps
  holdChange: () => void
  holdReturn: () => Deferred
}

function referenceJourney(): Journey {
  const held = holdableSource()
  const view = (asset: AssetReference) => ({ asset, textureSource: held.source })
  return {
    first: view(reference),
    change: view(otherReference),
    back: view(reference),
    holdChange: () => held.hold(otherReference),
    holdReturn: () => held.hold(reference),
  }
}

function sourceJourney(): Journey {
  const original = holdableSource()
  const replacement = holdableSource()
  const view = (held: ReturnType<typeof holdableSource>) => ({
    asset: reference,
    textureSource: held.source,
  })
  return {
    first: view(original),
    change: view(replacement),
    back: view(original),
    holdChange: () => replacement.hold(reference),
    holdReturn: () => original.hold(reference),
  }
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

    render(<Probe />, { reactStrictMode: true })

    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const handedOut = handedOutTextures(received)
    const freed = disposeTexture.mock.contexts
    expect(received[0]?.status).toBe('loading')
    expect(handedOut.length).toBeGreaterThan(0)
    expect(handedOut.filter((texture) => freed.includes(texture))).toEqual([])
  })

  it('the ground texture is freed when the view unmounts', async () => {
    const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const texture = received.at(-1)?.appearance?.texture
    expect(texture).toBeInstanceOf(Texture)
    const bitmap = decoded.find((candidate) => candidate === texture?.image)
    expect(bitmap).toBeDefined()
    const disposeCalls = () => disposeTexture.mock.contexts.filter((held) => held === texture)

    expect(disposeCalls()).toHaveLength(0)
    expect(bitmap?.close).not.toHaveBeenCalled()

    view.unmount()

    expect(disposeCalls()).toHaveLength(1)
    expect(bitmap?.close).toHaveBeenCalledTimes(1)
  })

  it('when the reference changes, the view shows loading and never the freed texture of the old reference', async () => {
    const pending = deferredAsset()
    const changingSource: TextureSource = {
      ...source,
      resolve: (asset) =>
        asset.contentHash === otherReference.contentHash ? pending.promise : source.resolve(asset),
    }
    const received: TextureState[] = []
    const Probe = recordingProbe(received)
    const view = render(<Probe textureSource={changingSource} />, { reactStrictMode: true })
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const oldTexture = received.at(-1)?.appearance?.texture

    const renderedBefore = received.length
    view.rerender(<Probe asset={otherReference} textureSource={changingSource} />)

    const afterChange = received.slice(renderedBefore)
    expect(afterChange.length).toBeGreaterThan(0)
    expect(afterChange).toEqual(afterChange.map(() => LOADING))

    pending.settle(resolvedAsset(new Uint8Array([4, 5, 6]), otherReference.scope))
    await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
    const newTexture = received.at(-1)?.appearance?.texture
    expect(newTexture).toBeInstanceOf(Texture)
    expect(newTexture).not.toBe(oldTexture)
  })

  it.each([
    ['reference', referenceJourney],
    ['source', sourceJourney],
  ])(
    'returning to an earlier %s shows loading, never the texture its first load freed',
    async (_changed, journey) => {
      const disposeTexture = vi.spyOn(Texture.prototype, 'dispose')
      const { first, change, back, holdChange, holdReturn } = journey()
      holdChange()
      const received: TextureState[] = []
      const Probe = recordingProbe(received)
      const view = render(<Probe {...first} />, { reactStrictMode: true })
      await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
      const firstTexture = received.at(-1)?.appearance?.texture
      expect(firstTexture).toBeInstanceOf(Texture)

      const renderedBeforeChange = received.length
      view.rerender(<Probe {...change} />)
      expect(handedOutTextures(received.slice(renderedBeforeChange))).not.toContain(firstTexture)

      const settleReturn = holdReturn()
      const renderedBeforeReturn = received.length
      view.rerender(<Probe {...back} />)
      const afterReturn = received.slice(renderedBeforeReturn)
      expect(afterReturn.length).toBeGreaterThan(0)
      expect(afterReturn).toEqual(afterReturn.map(() => LOADING))

      settleReturn.settle(resolvedAsset(new Uint8Array([7, 8, 9]), reference.scope))
      await waitFor(() => expect(received.at(-1)?.status).toBe('ready'))
      const returnTexture = received.at(-1)?.appearance?.texture
      expect(returnTexture).toBeInstanceOf(Texture)
      expect(disposeTexture.mock.contexts).not.toContain(returnTexture)
    },
  )
})
