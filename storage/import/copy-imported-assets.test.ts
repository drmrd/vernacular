// @vitest-environment node
// Pure storage logic over a pool in memory; node runs it as the archive tests run.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetCache } from '../asset-cache'
import { copyImportedAssets } from './copy-imported-assets'

const MODEL = 'a'.repeat(64)
const IMAGE = 'b'.repeat(64)
const STRAY = 'c'.repeat(64)
const ABSENT = 'd'.repeat(64)
const MODEL_BYTES = Uint8Array.of(1, 2, 3)
const IMAGE_BYTES = Uint8Array.of(4, 5, 6, 7)
const STRAY_BYTES = Uint8Array.of(8)
const NOT_CONTENT_HASHES = ['../../outside', '', 'A'.repeat(64), `${MODEL}/x`]

/** Which calls of the pool reject, by method and content hash. */
interface PoolFaults {
  readonly has?: readonly string[]
  readonly put?: readonly string[]
}

/** A pool over a map that records each call as `<method>:<hash>` and keeps what `put` received, as it was given. */
interface RecordingPool extends AssetCache {
  readonly calls: string[]
  readonly entries: Map<string, Uint8Array>
}

function recordingPool(faults: PoolFaults = {}): RecordingPool {
  const calls: string[] = []
  const entries = new Map<string, Uint8Array>()
  const call = (method: keyof PoolFaults | 'get', contentHash: string) => {
    calls.push(`${method}:${contentHash}`)
    if (method !== 'get' && faults[method]?.includes(contentHash)) {
      throw new Error(`the pool cannot ${method} ${contentHash}`)
    }
  }
  return {
    calls,
    entries,
    has: async (contentHash) => {
      call('has', contentHash)
      return entries.has(contentHash)
    },
    get: async (contentHash) => {
      call('get', contentHash)
      return entries.get(contentHash)
    },
    put: async (contentHash, bytes) => {
      call('put', contentHash)
      entries.set(contentHash, bytes)
    },
  }
}

function puts(pool: RecordingPool): string[] {
  return pool.calls.filter((call) => call.startsWith('put:'))
}

/** The value of each call of the pool, whatever the method. */
function hashesAsked(pool: RecordingPool): string[] {
  return pool.calls.map((call) => call.slice(call.indexOf(':') + 1))
}

const supplied = (...assets: (readonly [string, Uint8Array])[]) => new Map(assets)

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('copyImportedAssets', () => {
  it('puts each needed asset that is supplied, with the same bytes', async () => {
    const pool = recordingPool()
    const assets = supplied([MODEL, MODEL_BYTES], [IMAGE, IMAGE_BYTES])

    expect(await copyImportedAssets(pool, assets, [MODEL, IMAGE])).toEqual([])

    expect(puts(pool)).toEqual([`put:${MODEL}`, `put:${IMAGE}`])
    expect(pool.entries).toEqual(
      new Map([
        [MODEL, MODEL_BYTES],
        [IMAGE, IMAGE_BYTES],
      ]),
    )
  })

  it('hands the pool a copy of the bytes, not a view into the buffer of the supplied asset', async () => {
    const buffer = new Uint8Array(64)
    const view = buffer.subarray(8, 8 + MODEL_BYTES.length)
    view.set(MODEL_BYTES)
    const pool = recordingPool()

    await copyImportedAssets(pool, supplied([MODEL, view]), [MODEL])

    const received = pool.entries.get(MODEL)
    expect(received).toEqual(MODEL_BYTES)
    expect(received?.buffer).not.toBe(view.buffer)
    expect(received?.buffer.byteLength).toBe(MODEL_BYTES.length)
  })

  it('does not write an asset that is not needed', async () => {
    const pool = recordingPool()
    const assets = supplied([MODEL, MODEL_BYTES], [STRAY, STRAY_BYTES])

    await copyImportedAssets(pool, assets, [MODEL])

    expect(puts(pool)).toEqual([`put:${MODEL}`])
    expect(pool.entries.has(STRAY)).toBe(false)
  })

  it('does not write an asset the pool has, and its bytes stay', async () => {
    const pool = recordingPool()
    pool.entries.set(MODEL, STRAY_BYTES)

    expect(await copyImportedAssets(pool, supplied([MODEL, MODEL_BYTES]), [MODEL])).toEqual([])

    expect(puts(pool)).toEqual([])
    expect(pool.entries.get(MODEL)).toEqual(STRAY_BYTES)
  })

  it('names a needed hash that is neither supplied nor in the pool', async () => {
    const pool = recordingPool()

    const missing = await copyImportedAssets(pool, supplied([MODEL, MODEL_BYTES]), [MODEL, ABSENT])

    expect(missing).toEqual([ABSENT])
    expect(puts(pool)).toEqual([`put:${MODEL}`])
  })

  it('does not name a needed hash that the pool had', async () => {
    const pool = recordingPool()
    pool.entries.set(IMAGE, IMAGE_BYTES)

    expect(await copyImportedAssets(pool, supplied(), [IMAGE])).toEqual([])
  })
})

describe('copyImportedAssets when the pool fails or a value is no content hash', () => {
  it('a put that rejects names that hash, and the copy goes on', async () => {
    const pool = recordingPool({ put: [MODEL] })
    const assets = supplied([MODEL, MODEL_BYTES], [IMAGE, IMAGE_BYTES])

    expect(await copyImportedAssets(pool, assets, [MODEL, IMAGE])).toEqual([MODEL])

    expect(pool.entries.get(IMAGE)).toEqual(IMAGE_BYTES)
    expect(console.warn).toHaveBeenCalled()
  })

  it('a has that rejects names that hash, and the copy goes on', async () => {
    const pool = recordingPool({ has: [MODEL] })
    const assets = supplied([MODEL, MODEL_BYTES], [IMAGE, IMAGE_BYTES])

    expect(await copyImportedAssets(pool, assets, [MODEL, IMAGE])).toEqual([MODEL])

    expect(pool.entries.get(IMAGE)).toEqual(IMAGE_BYTES)
    expect(console.warn).toHaveBeenCalled()
  })

  it('a value that is not a content hash is named, and the pool is not asked about it', async () => {
    const pool = recordingPool()
    const assets = supplied(...NOT_CONTENT_HASHES.map((value) => [value, MODEL_BYTES] as const))

    const missing = await copyImportedAssets(pool, assets, [...NOT_CONTENT_HASHES, ABSENT])

    expect(missing).toEqual([...NOT_CONTENT_HASHES, ABSENT])
    expect(new Set(hashesAsked(pool))).toEqual(new Set([ABSENT]))
  })

  it('the result keeps the order of needed', async () => {
    const pool = recordingPool({ put: [IMAGE] })
    const assets = supplied([MODEL, MODEL_BYTES], [IMAGE, IMAGE_BYTES])
    const needed = [ABSENT, MODEL, NOT_CONTENT_HASHES[0]!, IMAGE]

    const missing = await copyImportedAssets(pool, assets, needed)

    expect(missing).toEqual([ABSENT, NOT_CONTENT_HASHES[0], IMAGE])
  })
})
