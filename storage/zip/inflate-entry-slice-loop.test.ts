// @vitest-environment node
// Pure inflation logic; node aligns Uint8Array realms with fflate.
import { deflateSync, inflateSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inflateEntry, INFLATE_SLICE_BYTES } from './inflate-entry'
import { blocksFilling } from './read-archive-test-kit'
import {
  emptyStoredBlocks,
  finalEmptyBlock,
  flushedStream,
  recordPushedChunks,
  storedBlock,
  STORED_BLOCK_HEADER_BYTES,
} from './zip-edges-test-kit'
import { seededBytes } from './zip-test-kit'
import { joinBytes } from './zip64-test-kit'

const DEFLATED = 8
const SLICE = INFLATE_SLICE_BYTES
const TWO_SLICES = 2 * SLICE
const SLICES_BEFORE_THE_END_MUST_FALL = 4 * SLICE
const EMPTY = new Uint8Array(0)
const EMPTY_BLOCK_BYTES = STORED_BLOCK_HEADER_BYTES
const CONTENT = new TextEncoder().encode('a parlor, a hall, a kitchen, and a porch; '.repeat(3))
const TIMEOUT_FOR_BIG_STREAMS_MS = 60_000

/** One stored block with one content byte is 6 bytes, so a slice holds it and 13,106 empty blocks. */
const SLICES_WITH_ONE_BYTE_EACH = 8
const BLOCKS_AFTER_ONE_BYTE = (SLICE - (EMPTY_BLOCK_BYTES + 1)) / EMPTY_BLOCK_BYTES
const SLICES_OF_SEEDED_CONTENT = 3
const SLICES_OF_ZERO_BYTES = 10
const FLUSHES = 50_000
const STREAM_SLACK_BYTES = 100
/** The head of the earlier cases: two slices, and the output equals its declared size. */
const HEAD_CONTENT_BYTES = 65_527
const HEAD_EMPTY_BLOCKS = 13_108
const STRAY_BYTE = 0x03
const SLICES_OF_EMPTY_BLOCKS_NOT_ENDED = 2.5

afterEach(() => {
  vi.restoreAllMocks()
})

function inflated(data: Uint8Array, declaredBytes: number) {
  return inflateEntry({ data, method: DEFLATED, declaredBytes })
}

function zeroSlices(count: number): Uint8Array {
  return new Uint8Array(count * SLICE)
}

function twoSliceHead(): Uint8Array {
  const content = seededBytes(HEAD_CONTENT_BYTES)
  return joinBytes([storedBlock(content, false), emptyStoredBlocks(HEAD_EMPTY_BLOCKS)])
}

/** Each slice starts with one content byte, and the last ends with the final empty block. */
function sliceWiseStream(content: Uint8Array): Uint8Array {
  const parts = Array.from(content, (byte, index) => {
    const lastSlice = index === content.length - 1
    const empties = BLOCKS_AFTER_ONE_BYTE - (lastSlice ? 1 : 0)
    const tail = lastSlice ? [finalEmptyBlock()] : []
    return joinBytes([storedBlock(Uint8Array.of(byte), false), emptyStoredBlocks(empties), ...tail])
  })
  return joinBytes(parts)
}

describe('inflateEntry counts the slices that give no output', () => {
  it('starts to count again after each slice that gives output', () => {
    const content = seededBytes(SLICES_WITH_ONE_BYTE_EACH)
    const data = sliceWiseStream(content)
    expect(data).toHaveLength(SLICES_WITH_ONE_BYTE_EACH * SLICE)
    expect(inflateSync(data)).toEqual(content)

    expect(inflated(data, content.length)).toEqual({ ok: true, bytes: content })
  })

  it('feeds the slice after two slices with no output', () => {
    const emptyRun = emptyStoredBlocks(Math.floor(TWO_SLICES / EMPTY_BLOCK_BYTES))
    const data = joinBytes([emptyRun, storedBlock(CONTENT, true), zeroSlices(1)])
    expect(inflateSync(data.subarray(0, data.length - SLICE))).toEqual(CONTENT)
    const pushed = recordPushedChunks()

    expect(inflated(data, CONTENT.length)).toEqual({ ok: true, bytes: CONTENT })

    expect(pushed()).toMatchObject({ calls: 3, lastFinal: true })
  })

  it(
    'a stream that ends late and below the declared size is refused after a few slices',
    () => {
      const content = seededBytes(SLICES_OF_SEEDED_CONTENT * SLICE)
      const stream = deflateSync(content, { level: 0 })
      const data = joinBytes([stream, zeroSlices(SLICES_OF_ZERO_BYTES)])
      const streamSlices = Math.ceil(stream.length / SLICE)
      const slicesWithNoOutputAfterwards = 3
      const pushed = recordPushedChunks()

      expect(inflated(data, content.length + 1)).toMatchObject({
        ok: false,
        reason: 'shorter-than-declared',
      })

      expect(pushed().calls).toBeLessThanOrEqual(streamSlices + slicesWithNoOutputAfterwards)
    },
    TIMEOUT_FOR_BIG_STREAMS_MS,
  )

  it('feeds the last slice of the data as the final one when no slice is left after it', () => {
    const stream = deflateSync(CONTENT)
    const data = joinBytes([stream, new Uint8Array(4 * SLICE - stream.length)])
    const pushed = recordPushedChunks()

    expect(inflated(data, CONTENT.length + 1)).toMatchObject({
      ok: false,
      reason: 'shorter-than-declared',
    })

    expect(pushed()).toMatchObject({ calls: 4, lastFinal: true })
  })
})

describe('inflateEntry refuses a stream that has not ended when the rules stop', () => {
  it('a declared size of 0 and a stream of empty blocks that has not ended is corrupt', () => {
    const emptyRun = blocksFilling(SLICES_OF_EMPTY_BLOCKS_NOT_ENDED * SLICE)
    const data = joinBytes([emptyRun, finalEmptyBlock()])
    const pushed = recordPushedChunks()

    expect(inflated(data, 0)).toMatchObject({ ok: false, reason: 'corrupt' })

    expect(pushed()).toMatchObject({ calls: 2, lastFinal: true })
  })

  it.each<[string, Uint8Array]>([
    ['a single stray byte', Uint8Array.of(STRAY_BYTE)],
    ['a final empty block', finalEmptyBlock()],
  ])('the head of two slices followed by %s is corrupt', (_case, tail) => {
    const data = joinBytes([twoSliceHead(), tail])

    expect(inflated(data, HEAD_CONTENT_BYTES)).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it(
    'a stream with a very long run of flushes and no data between is refused (a known limit)',
    () => {
      const hello = new TextEncoder().encode('hello')
      const world = new TextEncoder().encode('world')
      const stream = flushedStream(hello, FLUSHES, world)
      expect(inflateSync(stream)).toEqual(joinBytes([hello, world]))
      // A known limit of the rule for slices with no output: one slice with output, two without, and the slice pushed final do not reach the end.
      expect(stream.length - STREAM_SLACK_BYTES).toBeGreaterThan(SLICES_BEFORE_THE_END_MUST_FALL)

      expect(inflated(stream, hello.length + world.length)).toMatchObject({
        ok: false,
        reason: 'corrupt',
      })
    },
    TIMEOUT_FOR_BIG_STREAMS_MS,
  )
})

describe('inflateEntry gives an empty entry with no work', () => {
  it('empty data with a declared size of 0 is an empty entry and nothing is pushed', () => {
    const pushed = recordPushedChunks()

    expect(inflated(EMPTY, 0)).toEqual({ ok: true, bytes: EMPTY })

    expect(pushed().calls).toBe(0)
  })
})
