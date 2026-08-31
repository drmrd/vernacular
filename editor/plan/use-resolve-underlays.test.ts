import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useResolveUnderlaysOnOpen } from './use-resolve-underlays'
import type { NotifyUser } from './notify-user'
import type { AssetCache } from '../../bridge'
import type { SceneGraph, UnderlaySceneNode } from '../../core'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const CONTENT_HASH = 'sha256-abc'
const SAVED_BYTES = new Uint8Array([137, 80, 78, 71])
const DECODED_SIZE = { width: 1, height: 1 }
const NO_BYTES = undefined

// A reopened project: one placed raster underlay whose pixels are expected to
// come back out of the asset cache under the node's content hash. Each call
// hands back a fresh graph object so a re-render looks like a graph change.
function graphWithSavedUnderlay(): SceneGraph {
  const node: UnderlaySceneNode = {
    id: 'underlay:a',
    kind: 'underlay',
    floorId: 'f',
    source: { kind: 'raster', image: { scope: 'project', contentHash: CONTENT_HASH } },
    width: 800,
    height: 600,
    placement: { offset: { x: 0, y: 0 }, millimetersPerPixel: 10, rotation: 0 },
    opacity: 1,
    visible: true,
  }
  return {
    nodes: [],
    walls: [],
    rooms: [],
    underlays: [node],
    openings: [],
    dimensions: [],
    stairs: [],
    furniture: [],
  }
}

// Stands in for the browser's raster decoder, which jsdom does not provide.
function stubDecoder(decode: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('createImageBitmap', decode)
}

// Opens the project with the given bytes stored (or nothing stored at all), and
// hands back what the user can observe: what they were told, what was decoded
// into the bitmap cache, and how often the stored bytes were asked for.
function openProjectWith(storedBytes: Uint8Array | undefined) {
  const get = vi.fn().mockResolvedValue(storedBytes)
  const assets = { get } as unknown as AssetCache
  const cache = new Map<string, ImageBitmap>()
  const notify = vi.fn<NotifyUser>()

  const view = renderHook(
    ({ graph }: { graph: SceneGraph }) =>
      useResolveUnderlaysOnOpen({ graph, assets, cache, notify }),
    { initialProps: { graph: graphWithSavedUnderlay() } },
  )

  return { get, cache, notify, view }
}

// Lets whatever the latest render scheduled run to completion, so a repeated
// lookup or a repeated report would have landed before it is counted.
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
  })
}

describe('useResolveUnderlaysOnOpen', () => {
  it('tells the user an underlay image is missing when the project stored no bytes for it', async () => {
    const { notify, view } = openProjectWith(NO_BYTES)

    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/underlay/i))
    expect(view.result.current).toBe(0)
  })

  it('reports a missing underlay image once however often the graph changes afterwards', async () => {
    const { get, notify, view } = openProjectWith(NO_BYTES)
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    view.rerender({ graph: graphWithSavedUnderlay() })
    await settle()

    expect(notify).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('tells the user an underlay image is unreadable when its stored bytes will not decode', async () => {
    stubDecoder(vi.fn().mockRejectedValue(new Error('bad image')))

    const { notify, view } = openProjectWith(SAVED_BYTES)

    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1))

    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/underlay/i))
    expect(view.result.current).toBe(0)
  })

  it('caches the decoded underlay and repaints without telling the user anything', async () => {
    stubDecoder(vi.fn().mockResolvedValue(DECODED_SIZE))

    const { cache, notify, view } = openProjectWith(SAVED_BYTES)

    await waitFor(() => expect(view.result.current).toBe(1))

    expect(cache.has(CONTENT_HASH)).toBe(true)
    expect(notify).not.toHaveBeenCalled()
  })
})
