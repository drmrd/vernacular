import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadImageFile } from './use-load-underlay-image'
import type { AssetReference } from '../../core'
import type { AssetCache, EditorSession } from '../../bridge'

const FLOOR_ID = 'f'
const IMAGE_BYTES = new Uint8Array([137, 80, 78, 71])
const DECODED_SIZE = { width: 10, height: 10 }
const SHA256_HEX = /^[0-9a-f]{64}$/

// jsdom's Blob carries no arrayBuffer(), so the picked file reads back its own
// bytes the way a browser's would.
function pickedImage(): File {
  const file = new File([IMAGE_BYTES], 'plan.png', { type: 'image/png' })
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new Uint8Array(IMAGE_BYTES).buffer,
  })
  return file
}

// Loads one picked image against a project holding the named floor (or no floor
// at all when it is null), and hands back the two effects a user can observe:
// what was dispatched and what they were told.
async function loadPickedImage(activeFloorId: string | null) {
  const dispatch = vi.fn()
  const notify = vi.fn()
  const floors = activeFloorId === null ? [] : [{ id: activeFloorId }]
  const session = { dispatch, getProject: () => ({ floors }) } as unknown as EditorSession
  const assets = { put: vi.fn().mockResolvedValue(undefined) } as unknown as AssetCache

  await loadImageFile(pickedImage(), {
    session,
    cache: new Map<string, ImageBitmap>(),
    assets,
    activeFloorId,
    notify,
  })

  return { dispatch, notify }
}

// Stands in for the browser's raster decoder, which jsdom does not provide.
function stubDecoder(decode: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('createImageBitmap', decode)
}

describe('loadImageFile', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tells the user there is no floor to place the underlay on when the project has none', async () => {
    const { dispatch, notify } = await loadPickedImage(null)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/floor/i))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('tells the user the image could not be loaded when decoding the picked file fails', async () => {
    stubDecoder(vi.fn().mockRejectedValue(new Error('bad image')))

    const { dispatch, notify } = await loadPickedImage(FLOOR_ID)

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/image/i))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('places the decoded underlay under its content hash and says nothing to the user', async () => {
    stubDecoder(vi.fn().mockResolvedValue(DECODED_SIZE))

    const { dispatch, notify } = await loadPickedImage(FLOOR_ID)

    expect(dispatch).toHaveBeenCalledTimes(1)
    const command = dispatch.mock.calls[0]![0] as {
      params: { underlay: { source: { image: AssetReference } } }
    }
    expect(command.params.underlay.source.image.contentHash).toMatch(SHA256_HEX)
    expect(notify).not.toHaveBeenCalled()
  })
})
