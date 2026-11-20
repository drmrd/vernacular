/**
 * Test support for the edges of the archive reader: DEFLATE streams made by hand
 * from stored blocks (so a test controls where each block ends), and a recorder
 * of the chunks that the reader pushes to fflate. Production code does not import it.
 */
import { Inflate } from 'fflate'
import { vi } from 'vitest'
import { joinBytes } from './zip64-test-kit'

/** The header of a stored block: one byte of flags, then its length and the complement of it. */
export const STORED_BLOCK_HEADER_BYTES = 5
const FINAL_BLOCK = 1
const MORE_BLOCKS = 0
const LENGTH_AT = 1
const COMPLEMENT_AT = 3
const SHORT_MASK = 0xffff
const EMPTY = new Uint8Array(0)

/** One stored block: its header, then the bytes as they are. Not the last block unless `final`. */
export function storedBlock(content: Uint8Array, final: boolean): Uint8Array {
  const block = new Uint8Array(STORED_BLOCK_HEADER_BYTES + content.length)
  const view = new DataView(block.buffer)
  view.setUint8(0, final ? FINAL_BLOCK : MORE_BLOCKS)
  view.setUint16(LENGTH_AT, content.length, true)
  view.setUint16(COMPLEMENT_AT, ~content.length & SHORT_MASK, true)
  block.set(content, STORED_BLOCK_HEADER_BYTES)
  return block
}

/** `count` stored blocks with no content, none of them the last. Each is 5 bytes long. */
export function emptyStoredBlocks(count: number): Uint8Array {
  return joinBytes(Array.from({ length: count }, () => storedBlock(EMPTY, false)))
}

/** The last block of a stream: a stored block with no content. */
export function finalEmptyBlock(): Uint8Array {
  return storedBlock(EMPTY, true)
}

export interface PushedChunks {
  /** How many times the reader called `push` of fflate's streaming inflater. */
  readonly calls: number
  /** The sum of the lengths of the chunks it gave. */
  readonly bytes: number
  /** Whether the last call gave `final` true; undefined when there was no call. */
  readonly lastFinal: boolean | undefined
}

/**
 * Starts to record every chunk given to `Inflate.prototype.push`. The call passes
 * through. The test restores the spy with `vi.restoreAllMocks()`.
 */
export function recordPushedChunks(): () => PushedChunks {
  const spy = vi.spyOn(Inflate.prototype, 'push')
  return () => {
    const lengths = spy.mock.calls.map(([chunk]) => chunk.length)
    const bytes = lengths.reduce((sum, length) => sum + length, 0)
    return { calls: lengths.length, bytes, lastFinal: spy.mock.calls.at(-1)?.[1] }
  }
}
