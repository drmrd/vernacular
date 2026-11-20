// @vitest-environment node
// Pure inflation logic; node aligns Uint8Array realms with fflate.
import { deflateSync, inflateSync } from 'fflate'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { inflateEntry, INFLATE_SLICE_BYTES } from './inflate-entry'
import {
  emptyStoredBlocks,
  finalEmptyBlock,
  recordPushedChunks,
  storedBlock,
  STORED_BLOCK_HEADER_BYTES,
} from './zip-edges-test-kit'
import { seededBytes } from './zip-test-kit'
import { joinBytes } from './zip64-test-kit'

const DEFLATED = 8
const SLICES_AFTER_THE_END = 10
const SLICES_FED_AT_MOST = 4
const PUSHES_AT_MOST = 4
const SLICES_OF_ZERO_BYTES = 5
const TWO_SLICES = 2 * INFLATE_SLICE_BYTES
const CONTENT = new TextEncoder().encode('a parlor, a hall, a kitchen, and a porch; '.repeat(3))
const EMPTY = new Uint8Array(0)

/** The content of the first block of a head that is exactly two slices long. */
const HEAD_CONTENT_BYTES = 65_527
/**
 * Two slices are 131,072 bytes. The first block takes 5 + 65,527 = 65,532 of them,
 * and 131,072 - 65,532 = 65,540 = 5 * 13,108 bytes are left for empty blocks.
 */
const HEAD_EMPTY_BLOCKS = 13_108
const FILLED_TAIL_BYTES = 1_000
const FILL_BYTE = 0xff
const SHORT_TAIL_BYTES = 100
const SLICES_OF_EMPTY_BLOCKS_BEFORE_CONTENT = 3
const EMPTY_BLOCK_BYTES = STORED_BLOCK_HEADER_BYTES
const HALF_SLICE_BYTES = INFLATE_SLICE_BYTES / 2
const FULL_BLOCKS_STREAM_SLICES = 4

afterEach(() => {
  vi.restoreAllMocks()
})

function inflated(data: Uint8Array, declaredBytes: number) {
  return inflateEntry({ data, method: DEFLATED, declaredBytes })
}

function followedByZeroSlices(stream: Uint8Array, slices: number): Uint8Array {
  return joinBytes([stream, new Uint8Array(slices * INFLATE_SLICE_BYTES)])
}

function blocksFilling(bytes: number): Uint8Array {
  return emptyStoredBlocks(Math.ceil(bytes / EMPTY_BLOCK_BYTES))
}

/** Exactly two slices: a block of seeded content, then empty blocks, all non-final. */
function headOfTwoSlices(): { readonly head: Uint8Array; readonly content: Uint8Array } {
  const content = seededBytes(HEAD_CONTENT_BYTES)
  const head = joinBytes([storedBlock(content, false), emptyStoredBlocks(HEAD_EMPTY_BLOCKS)])
  return { head, content }
}

function expectFewSlicesPushed(pushed: () => { calls: number; bytes: number }) {
  expect(pushed().bytes).toBeLessThanOrEqual(SLICES_FED_AT_MOST * INFLATE_SLICE_BYTES)
  expect(pushed().calls).toBeLessThanOrEqual(PUSHES_AT_MOST)
}

describe('inflateEntry stops when a stream ends below its declared size', () => {
  it('does not feed the bytes after a stream that gives less than declared', () => {
    const data = followedByZeroSlices(deflateSync(CONTENT), SLICES_AFTER_THE_END)
    const pushed = recordPushedChunks()

    expect(inflated(data, CONTENT.length + 1)).toMatchObject({
      ok: false,
      reason: 'shorter-than-declared',
    })

    expectFewSlicesPushed(pushed)
  })

  it('does not feed the bytes after an empty stream that is declared to give one byte', () => {
    const data = followedByZeroSlices(deflateSync(EMPTY), SLICES_AFTER_THE_END)
    const pushed = recordPushedChunks()

    expect(inflated(data, 1)).toMatchObject({ ok: false, reason: 'shorter-than-declared' })

    expectFewSlicesPushed(pushed)
  })

  it('a stream with a long run of empty blocks before any content is refused', () => {
    const emptyRun = blocksFilling(SLICES_OF_EMPTY_BLOCKS_BEFORE_CONTENT * INFLATE_SLICE_BYTES)
    const data = joinBytes([emptyRun, storedBlock(CONTENT, true)])
    expect(inflateSync(data)).toEqual(CONTENT)

    expect(inflated(data, CONTENT.length)).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})

describe('inflateEntry reads one slice past the output that equals the declared size', () => {
  it('a stream of two slices that has not ended with a final block is corrupt', () => {
    const { head, content } = headOfTwoSlices()
    expect(head).toHaveLength(TWO_SLICES)
    const data = joinBytes([head, new Uint8Array(FILLED_TAIL_BYTES).fill(FILL_BYTE)])

    expect(inflated(data, content.length)).toMatchObject({ ok: false, reason: 'corrupt' })
  })

  it('output that comes after the one slice that is fed is not counted: the entry is corrupt', () => {
    const { head, content } = headOfTwoSlices()
    const tail = storedBlock(seededBytes(SHORT_TAIL_BYTES), true)
    const data = joinBytes([head, tail])
    expect(inflateSync(data)).toHaveLength(content.length + SHORT_TAIL_BYTES)

    expect(inflated(data, content.length)).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})

describe('inflateEntry does not stop a sound stream too early', () => {
  it('an empty stream with a declared size of 0 is ok and few slices are fed', () => {
    const data = followedByZeroSlices(deflateSync(EMPTY), SLICES_OF_ZERO_BYTES)
    const pushed = recordPushedChunks()

    expect(inflated(data, 0)).toEqual({ ok: true, bytes: EMPTY })

    expect(pushed().bytes).toBeLessThanOrEqual(TWO_SLICES)
  })

  it('output after one and a half slices of empty blocks is passes-declared-size for a size of 0', () => {
    const emptyRun = blocksFilling(INFLATE_SLICE_BYTES + HALF_SLICE_BYTES)
    const data = joinBytes([emptyRun, storedBlock(seededBytes(SHORT_TAIL_BYTES), true)])

    expect(inflated(data, 0)).toMatchObject({ ok: false, reason: 'passes-declared-size' })
  })

  it('a final block that ends exactly at the end of the data, one slice after the output, is ok', () => {
    const content = seededBytes(HEAD_CONTENT_BYTES)
    const data = joinBytes([
      storedBlock(content, false),
      emptyStoredBlocks(HEAD_EMPTY_BLOCKS - 1),
      finalEmptyBlock(),
    ])
    expect(data).toHaveLength(TWO_SLICES)
    const pushed = recordPushedChunks()

    expect(inflated(data, content.length)).toEqual({ ok: true, bytes: content })

    expect(pushed().lastFinal).toBe(true)
  })

  it('a level 0 stream of about four slices is ok when one slice gives no output', () => {
    const content = seededBytes(FULL_BLOCKS_STREAM_SLICES * INFLATE_SLICE_BYTES)
    const data = deflateSync(content, { level: 0 })

    const result = inflated(data, content.length)

    expect(result.ok && Buffer.from(result.bytes).equals(content)).toBe(true)
  })
})
