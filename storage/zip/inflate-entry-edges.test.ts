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
const STORED_LEVEL = 0
const STANDARD_LEVEL = 6
const SLICES_AFTER_THE_END = 10
/** The slice that completes the output, and one more. */
const SLICES_FED_AT_MOST = 2
const PUSHES_AT_MOST = 3
const EMPTY_BLOCK_BYTES = STORED_BLOCK_HEADER_BYTES
const SLICES_OF_EMPTY_BLOCKS = 3
const SWEEP_RADIUS = 30
const SHORT_TAIL_BYTES = 100
const CONTENT = new TextEncoder().encode('a parlor, a hall, a kitchen, and a porch; '.repeat(3))

afterEach(() => {
  vi.restoreAllMocks()
})

function inflated(data: Uint8Array, declaredBytes: number) {
  return inflateEntry({ data, method: DEFLATED, declaredBytes })
}

describe('inflateEntry stops feeding a stream once its output is complete', () => {
  it('does not feed the bytes that follow the end of the stream', () => {
    const trailing = new Uint8Array(SLICES_AFTER_THE_END * INFLATE_SLICE_BYTES)
    const data = joinBytes([deflateSync(CONTENT), trailing])
    const pushed = recordPushedChunks()

    expect(inflated(data, CONTENT.length)).toEqual({ ok: true, bytes: CONTENT })

    expect(pushed().bytes).toBeLessThanOrEqual(SLICES_FED_AT_MOST * INFLATE_SLICE_BYTES)
    expect(pushed().calls).toBeLessThanOrEqual(PUSHES_AT_MOST)
  })

  it('a stream that has not ended one slice after the output is complete is corrupt', () => {
    const emptyBlocks = emptyStoredBlocks(
      Math.ceil((SLICES_OF_EMPTY_BLOCKS * INFLATE_SLICE_BYTES) / EMPTY_BLOCK_BYTES),
    )
    const data = joinBytes([storedBlock(CONTENT, false), emptyBlocks, finalEmptyBlock()])
    expect(inflateSync(data)).toEqual(CONTENT)

    expect(inflated(data, CONTENT.length)).toMatchObject({ ok: false, reason: 'corrupt' })
  })
})

describe('inflateEntry still reads a stream whose end comes after the output is complete', () => {
  const firstBlockBytes = INFLATE_SLICE_BYTES - STORED_BLOCK_HEADER_BYTES
  const firstBlock = seededBytes(firstBlockBytes)

  it('more output in the slice after the declared size is reached is passes-declared-size', () => {
    const tail = seededBytes(SHORT_TAIL_BYTES)
    const data = joinBytes([storedBlock(firstBlock, false), storedBlock(tail, true)])

    expect(inflated(data, firstBlockBytes)).toMatchObject({
      ok: false,
      reason: 'passes-declared-size',
    })
  })

  it('a final empty block in the slice after the output is complete is ok', () => {
    const data = joinBytes([storedBlock(firstBlock, false), finalEmptyBlock()])

    expect(inflated(data, firstBlockBytes)).toEqual({ ok: true, bytes: firstBlock })
  })

  const lengthsAround = (size: number) =>
    Array.from({ length: 2 * SWEEP_RADIUS + 1 }, (_, step) => size - SWEEP_RADIUS + step)

  it.each<[string, typeof STORED_LEVEL | typeof STANDARD_LEVEL]>([
    ['stored blocks', STORED_LEVEL],
    ['the standard level', STANDARD_LEVEL],
  ])('gives the content for every length around one and two slices: %s', (_case, level) => {
    const wrong = [1, 2].flatMap((slices) =>
      lengthsAround(slices * INFLATE_SLICE_BYTES).filter((length) => {
        const content = seededBytes(length)
        const result = inflated(deflateSync(content, { level }), length)
        return !(result.ok && Buffer.from(result.bytes).equals(content))
      }),
    )

    expect(wrong).toEqual([])
  })
})
