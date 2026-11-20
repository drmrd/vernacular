/**
 * Test support for the edges of the archive reader: DEFLATE streams made by hand
 * from stored blocks (so a test controls where each block ends), and a recorder
 * of the chunks that the reader pushes to fflate. Production code does not import it.
 */
import { Deflate, Inflate } from 'fflate'
import { expect, vi } from 'vitest'
import type { ArchiveRead } from './read-archive'
import { assetEntry, buildZip, type TestZipEntry } from './zip-test-kit'
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

/** A copy of the bytes with a 16-bit little-endian number written at `at`. */
export function withUint16(bytes: Uint8Array, at: number, value: number): Uint8Array {
  const copy = bytes.slice()
  new DataView(copy.buffer).setUint16(at, value, true)
  return copy
}

/** A copy of the bytes with a 32-bit little-endian number written at `at`. */
export function withUint32(bytes: Uint8Array, at: number, value: number): Uint8Array {
  const copy = bytes.slice()
  new DataView(copy.buffer).setUint32(at, value, true)
  return copy
}

/** The bytes of `start`, then `flushes` sync flushes with no data between, then `end`, as one stream. */
export function flushedStream(start: Uint8Array, flushes: number, end: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  const deflate = new Deflate({ level: 6 }, (chunk) => chunks.push(chunk))
  deflate.push(start)
  for (let flush = 0; flush < flushes; flush += 1) deflate.flush(true)
  deflate.push(end, true)
  return joinBytes(chunks)
}

/** The places that the builder of shared data reads in a classic archive with no comment. */
const END_RECORD_BYTES = 22
const END_ENTRIES_AT = 10
const END_DIRECTORY_OFFSET_AT = 16
const CENTRAL = {
  bytes: 46,
  nameLengthAt: 28,
  extraLengthAt: 30,
  commentLengthAt: 32,
  localOffsetAt: 42,
}

/** Where each central directory entry starts, in an archive with a classic end record and no comment. */
export function centralEntryOffsets(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - END_RECORD_BYTES
  const count = view.getUint16(end + END_ENTRIES_AT, true)
  const offsets: number[] = []
  let at = view.getUint32(end + END_DIRECTORY_OFFSET_AT, true)
  for (let index = 0; index < count; index += 1) {
    offsets.push(at)
    const nameLength = view.getUint16(at + CENTRAL.nameLengthAt, true)
    const extraLength = view.getUint16(at + CENTRAL.extraLengthAt, true)
    at +=
      CENTRAL.bytes + nameLength + extraLength + view.getUint16(at + CENTRAL.commentLengthAt, true)
  }
  return offsets
}

/**
 * An archive whose central directory lists `owners`, each over its own local entry, and then
 * `sharers`, each over the local entry of `owners[ownerIndex]`. No sharer writes a local entry.
 * A sharer keeps the sizes of its own central directory entry, so give it data of the owner's
 * length: a copy of the owner under another name has it. The archive has no comment and no
 * ZIP64 end record, and no sharer gives its local offset in a ZIP64 block.
 */
export function buildSharedZip(
  owners: readonly TestZipEntry[],
  sharers: readonly TestZipEntry[],
  ownerIndex: number,
): Uint8Array {
  const bytes = buildZip([...owners, ...sharers])
  const view = new DataView(bytes.buffer)
  const offsets = centralEntryOffsets(bytes)
  const localOffsetOf = (entryAt: number) => view.getUint32(entryAt + CENTRAL.localOffsetAt, true)
  const ownerAt = offsets[ownerIndex]
  if (ownerAt === undefined) throw new Error(`no owner at index ${ownerIndex}`)
  const end = bytes.length - END_RECORD_BYTES
  const directoryOffset = view.getUint32(end + END_DIRECTORY_OFFSET_AT, true)
  const firstSharerAt = offsets[owners.length]
  const localsEnd = firstSharerAt === undefined ? directoryOffset : localOffsetOf(firstSharerAt)
  const ownerOffset = localOffsetOf(ownerAt)
  for (const sharerAt of offsets.slice(owners.length)) {
    view.setUint32(sharerAt + CENTRAL.localOffsetAt, ownerOffset, true)
  }
  view.setUint32(end + END_DIRECTORY_OFFSET_AT, localsEnd, true)
  return joinBytes([bytes.subarray(0, localsEnd), bytes.subarray(directoryOffset)])
}

const LOCAL_HEADER_BYTES = 30

function centralEntryAt(bytes: Uint8Array, entryIndex: number): number {
  const entryAt = centralEntryOffsets(bytes)[entryIndex]
  if (entryAt === undefined) throw new Error(`no central directory entry at index ${entryIndex}`)
  return entryAt
}

/** The offset of the local header that entry `entryIndex` gives in its classic field. */
export function localOffsetOfEntry(bytes: Uint8Array, entryIndex: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint32(centralEntryAt(bytes, entryIndex) + CENTRAL.localOffsetAt, true)
}

/**
 * A copy of the archive with the name of entry `entryIndex` replaced by the bytes `name`, in
 * its local header and in its central directory entry. Build the archive with a placeholder
 * name of the same byte length: the kit writes names with `TextEncoder`, so a name that is no
 * valid UTF-8 can only come in this way.
 */
export function withEntryName(bytes: Uint8Array, entryIndex: number, name: Uint8Array): Uint8Array {
  const copy = bytes.slice()
  const view = new DataView(copy.buffer)
  const entryAt = centralEntryAt(copy, entryIndex)
  if (view.getUint16(entryAt + CENTRAL.nameLengthAt, true) !== name.length) {
    throw new Error('the new name must have the byte length of the placeholder')
  }
  copy.set(name, entryAt + CENTRAL.bytes)
  copy.set(name, localOffsetOfEntry(copy, entryIndex) + LOCAL_HEADER_BYTES)
  return copy
}

function directoryOffsetOf(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint32(bytes.length - END_RECORD_BYTES + END_DIRECTORY_OFFSET_AT, true)
}

/**
 * Like `buildSharedZip`, but each sharer gives the owner's local offset in a ZIP64 block, and
 * the classic field of its central directory entry holds the marker.
 */
export function buildZip64SharedZip(
  owners: readonly TestZipEntry[],
  sharers: readonly TestZipEntry[],
  ownerIndex: number,
): Uint8Array {
  const ownersOnly = buildZip(owners)
  const ownerOffset = localOffsetOfEntry(ownersOnly, ownerIndex)
  const marked = sharers.map((sharer) => ({
    ...sharer,
    zip64: ['localOffset'] as const,
    zip64Values: { localOffset: ownerOffset },
  }))
  const bytes = buildZip([...owners, ...marked])
  const localsEnd = directoryOffsetOf(ownersOnly)
  const shared = joinBytes([bytes.subarray(0, localsEnd), bytes.subarray(directoryOffsetOf(bytes))])
  const view = new DataView(shared.buffer)
  view.setUint32(shared.length - END_RECORD_BYTES + END_DIRECTORY_OFFSET_AT, localsEnd, true)
  return shared
}

/** A copy of the archive in which entry `entryIndex` gives the length of the file as the offset of its local header. */
function withLocalOffsetPastTheEnd(bytes: Uint8Array, entryIndex: number): Uint8Array {
  return withUint32(bytes, centralEntryAt(bytes, entryIndex) + CENTRAL.localOffsetAt, bytes.length)
}

/**
 * A fault of one asset entry: the changes of the entry, made from its true content, and when
 * the entry alone cannot carry the fault, a change of the built archive at that entry.
 */
export interface AssetFault {
  readonly overrides: (content: Uint8Array) => Partial<TestZipEntry>
  readonly patch?: (bytes: Uint8Array, entryIndex: number) => Uint8Array
}

const GARBAGE_BYTES = 64
const ALL_BITS = 0xff
/** fflate refuses these bytes as an invalid block. */
const GARBAGE = new Uint8Array(GARBAGE_BYTES).fill(ALL_BITS)
const UNKNOWN_METHOD = 12
const ENCRYPTED_FLAG = 1
/** 2^60. */
const FAR_LOCAL_OFFSET = 1_152_921_504_606_846_976n
/** 2^40. */
const FAR_COMPRESSED_BYTES = 1_099_511_627_776n
const STORED_METHOD = 0
const NO_SIGNATURE = 0

/** A copy of the archive with the signature of the local header of entry `entryIndex` overwritten. */
function withoutLocalSignature(bytes: Uint8Array, entryIndex: number): Uint8Array {
  return withUint32(bytes, localOffsetOfEntry(bytes, entryIndex), NO_SIGNATURE)
}

/** Data that fflate refuses as an invalid block. */
export const CORRUPT_STREAM: AssetFault = { overrides: () => ({ data: GARBAGE }) }
/** The flag of an encrypted entry. */
export const ENCRYPTED_ENTRY: AssetFault = { overrides: () => ({ flags: ENCRYPTED_FLAG }) }
/** A local header offset in the classic field of the central directory entry, outside the file. */
export const LOCAL_HEADER_PAST_THE_END: AssetFault = {
  overrides: () => ({}),
  patch: withLocalOffsetPastTheEnd,
}

/** Each fault that keeps an asset entry from being read, with a short description. */
export const ASSET_FAULTS: readonly (readonly [string, AssetFault])[] = [
  ['a corrupt stream', CORRUPT_STREAM],
  [
    'a stream shorter than it declares',
    { overrides: (content) => ({ declaredBytes: content.length + 1 }) },
  ],
  ['an unsupported method', { overrides: () => ({ method: UNKNOWN_METHOD }) }],
  ['the encrypted flag', ENCRYPTED_ENTRY],
  [
    'stored data shorter than it declares',
    { overrides: (content) => ({ method: STORED_METHOD, declaredBytes: content.length + 1 }) },
  ],
  ['a classic local header offset outside the file', LOCAL_HEADER_PAST_THE_END],
  ['a wrong local header signature', { overrides: () => ({}), patch: withoutLocalSignature }],
  [
    'a ZIP64 compressed size of 2^40',
    {
      overrides: () => ({
        zip64: ['compressedBytes'],
        zip64Values: { compressedBytes: FAR_COMPRESSED_BYTES },
      }),
    },
  ],
  [
    'a ZIP64 local header offset of 2^60',
    {
      overrides: () => ({ zip64: ['localOffset'], zip64Values: { localOffset: FAR_LOCAL_OFFSET } }),
    },
  ],
]

/** An entry and the fault it carries, or `undefined` for a sound entry. */
export type EntryWithFault = readonly [TestZipEntry, AssetFault | undefined]

/** Builds the archive with the overrides of each fault, then makes the patch of each fault at its entry. */
export function buildZipWithFaults(entries: readonly EntryWithFault[]): Uint8Array {
  const built = buildZip(
    entries.map(([entry, fault]) => ({ ...entry, ...fault?.overrides(entry.content) })),
  )
  return entries.reduce((bytes, [, fault], index) => fault?.patch?.(bytes, index) ?? bytes, built)
}

/** An asset entry named by the hash of `namedFor` that holds `content`. */
export async function misnamedAssetEntry(
  content: Uint8Array,
  namedFor: Uint8Array,
  overrides: Partial<TestZipEntry> = {},
): Promise<TestZipEntry> {
  return { ...(await assetEntry(namedFor)), content, ...overrides }
}

/** A content hash and the bytes it names. */
export type HashedAsset = readonly [string, Uint8Array]

/** What an ok read holds: the document, the accepted assets in their order, and the rejected hashes. */
export interface ExpectedRead {
  readonly document: Uint8Array
  readonly assets: readonly HashedAsset[]
  readonly rejectedAssets: readonly string[]
}

/** The kind of a failed read, or the hashes of both lists of an ok read: short to print. */
export function readLists(read: ArchiveRead): unknown {
  if (!read.ok) return read.failure.kind
  return { assets: [...read.assets.keys()], rejectedAssets: read.rejectedAssets }
}

/** The read is ok and holds exactly `expected`, both lists in their order. */
export function expectRead(read: ArchiveRead, expected: ExpectedRead): void {
  const { document, assets, rejectedAssets } = expected
  expect(readLists(read)).toEqual({ assets: assets.map(([hash]) => hash), rejectedAssets })
  expect(read).toEqual({ ok: true, document, assets: new Map(assets), rejectedAssets })
}
