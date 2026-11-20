/**
 * Test support shared by the archive reader cases: the refusal and limits of a read, the
 * hashed assets and the hash of no asset, and the buffers that the reader is given.
 * Production code does not import it.
 */
import { expect } from 'vitest'
import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { readArchive, type ArchiveRead } from './read-archive'
import {
  emptyStoredBlocks,
  STORED_BLOCK_HEADER_BYTES,
  type HashedAsset,
} from './zip-edges-test-kit'
import { contentHashOf, seededBytes } from './zip-test-kit'

const HEX_RADIX = 16
const HASH_DIGITS = 64
const BYTES_BEFORE_THE_ARCHIVE = 41
const BYTES_AFTER_THE_ARCHIVE = 59

/** A size that an asset entry declares and that its data is longer than. */
export const SHORT_DECLARED_BYTES = 10

export function tooLarge(limit: ArchiveLimitName, allowed: number): ArchiveRead {
  return { ok: false, failure: { kind: 'too-large', limit, allowed } }
}

export function limitsWith(overrides: Partial<ArchiveLimits>): ArchiveLimits {
  return { ...ARCHIVE_LIMITS, ...overrides }
}

export async function hashed(bytes: Uint8Array): Promise<HashedAsset> {
  return [await contentHashOf(bytes), bytes]
}

/** The hexadecimal digits of a hash that names no bytes of these tests. */
export function otherHash(index: number): string {
  return (index + 1).toString(HEX_RADIX).padStart(HASH_DIGITS, '0')
}

/** Reads the archive and checks that the promise resolves, so that no case can pass by a rejection. */
export async function readResolved(bytes: Uint8Array): Promise<ArchiveRead> {
  const read = readArchive(bytes)
  await expect(read).resolves.toBeDefined()
  return read
}

export function viewOf(data: BufferSource): Uint8Array {
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  return new Uint8Array(data)
}

/** The archive copied into a larger buffer of other bytes, as a view at a non-zero offset. */
export function inLargerBuffer(bytes: Uint8Array): Uint8Array {
  const total = BYTES_BEFORE_THE_ARCHIVE + bytes.length + BYTES_AFTER_THE_ARCHIVE
  const view = new Uint8Array(seededBytes(total).buffer, BYTES_BEFORE_THE_ARCHIVE, bytes.length)
  view.set(bytes)
  return view
}

/** Empty blocks that fill at least `bytes` bytes, none of them the last. */
export function blocksFilling(bytes: number): Uint8Array {
  return emptyStoredBlocks(Math.ceil(bytes / STORED_BLOCK_HEADER_BYTES))
}
