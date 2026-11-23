import { vi } from 'vitest'
import type { Mock } from 'vitest'
import { resolvedAsset } from '../../core'
import type { AssetReference, ResolvedAsset, TextureDescription } from '../../core'
import type { TextureAppearance } from '../../engine'
import type { TextureSource, TextureState } from './texture-cache'
import { useGroundTexture } from './use-ground-texture'

export type FakeBitmap = { width: number; height: number; close: Mock }

export const reference: AssetReference = { scope: 'pack:grass@1.0.0', contentHash: 'sha256-grass' }
export const otherReference: AssetReference = {
  scope: 'pack:gravel@1.0.0',
  contentHash: 'sha256-gravel',
}
const description: TextureDescription = {
  kind: 'texture',
  mediaType: 'image/png',
  image: { width: 512, height: 768 },
  tileSize: { width: 1000, height: 1500 },
  colorSpace: 'srgb',
}
export const source: TextureSource = {
  resolve: async (asset) => resolvedAsset(new TextEncoder().encode('grass image'), asset.scope),
  describe: async () => description,
}

export type ProbeProps = { asset?: AssetReference; textureSource?: TextureSource }

export function recordingProbe(received: TextureState[]) {
  return function Probe({ asset = reference, textureSource = source }: ProbeProps) {
    received.push(useGroundTexture(asset, textureSource))
    return null
  }
}

export function handedOutTextures(received: TextureState[]): TextureAppearance['texture'][] {
  return received.flatMap((state) => (state.appearance ? [state.appearance.texture] : []))
}

export function stubImageDecoding(): FakeBitmap[] {
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

export type Deferred = ReturnType<typeof deferredAsset>

/** A source that answers each held asset with a deferred, and every other asset at once. */
export function holdableSource() {
  const holds = new Map<string, Deferred>()
  const holding: TextureSource = {
    ...source,
    resolve: (asset) => holds.get(asset.contentHash)?.promise ?? source.resolve(asset),
  }
  return {
    source: holding,
    hold: (asset: AssetReference) => {
      const deferred = deferredAsset()
      holds.set(asset.contentHash, deferred)
      return deferred
    },
  }
}
