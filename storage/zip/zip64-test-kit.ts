/**
 * Test support for the ZIP64 forms of an archive: the values of 8 bytes, the
 * blocks of an extra field, the ZIP64 end record and its locator, and two
 * fixtures written by real archivers. Production code does not import it.
 * `zip-test-kit.ts` imports this file, never the other way.
 */

/** A value of 8 bytes. A bigint can be 2^53 or more. */
export type Wide = number | bigint
/** The classic fields of a central directory entry that a ZIP64 block can give, in the block's fixed order. */
export type Zip64EntryField = 'declaredBytes' | 'compressedBytes' | 'localOffset'
export type Zip64EntryValues = Partial<Record<Zip64EntryField, Wide>>
/** The six fields of the end record, each with a ZIP64 form in the ZIP64 end record. */
export type Zip64EndField =
  | 'disk'
  | 'directoryDisk'
  | 'entriesOnDisk'
  | 'entries'
  | 'directoryBytes'
  | 'directoryOffset'

export interface TestZip64End {
  /** The classic fields of the end record that hold their marker; default the two counts, the size, and the offset. */
  readonly markers?: readonly Zip64EndField[]
  /** A value of the ZIP64 end record in place of the true one. */
  readonly values?: Partial<Record<Zip64EndField, Wide>>
  /** Default 0x06064b50. */
  readonly recordSignature?: number
  /** The record's own size field (8 bytes at 4); default 44. */
  readonly recordSize?: Wide
  /** Default 0x07064b50; with another value the file has no locator. */
  readonly locatorSignature?: number
  /** The offset of the ZIP64 end record that the locator gives; default the true one. */
  readonly locatorOffset?: Wide
  /** Default 0. */
  readonly locatorDisk?: number
  /** Default 1. */
  readonly totalDisks?: number
}

/** The true facts of a built central directory. */
export interface DirectoryFacts {
  readonly entries: number
  readonly directoryBytes: number
  readonly directoryOffset: number
}

export const ZIP64_BLOCK_ID = 0x0001
/** The fixed order of the values in a ZIP64 block of a central directory entry. */
const ZIP64_ENTRY_FIELDS: readonly Zip64EntryField[] = [
  'declaredBytes',
  'compressedBytes',
  'localOffset',
]
/** The six fields of the end record in the order of both records. */
export const ZIP64_END_FIELDS: readonly Zip64EndField[] = [
  'disk',
  'directoryDisk',
  'entriesOnDisk',
  'entries',
  'directoryBytes',
  'directoryOffset',
]
const DEFAULT_END_MARKERS: readonly Zip64EndField[] = [
  'entriesOnDisk',
  'entries',
  'directoryBytes',
  'directoryOffset',
]

const WIDE_BYTES = 8
const BLOCK = { idAt: 0, lengthAt: 2, headerBytes: 4 }
const ZIP64_END = {
  signature: 0x06064b50,
  bytes: 56,
  recordSizeAt: 4,
  versionMadeAt: 12,
  versionNeededAt: 14,
  defaultRecordSize: 44,
  version: 45,
}
/** Where each of the six values stands in the ZIP64 end record, and whether it is 8 bytes wide. */
const ZIP64_END_VALUES: Record<Zip64EndField, { readonly at: number; readonly wide: boolean }> = {
  disk: { at: 16, wide: false },
  directoryDisk: { at: 20, wide: false },
  entriesOnDisk: { at: 24, wide: true },
  entries: { at: 32, wide: true },
  directoryBytes: { at: 40, wide: true },
  directoryOffset: { at: 48, wide: true },
}
const LOCATOR = {
  signature: 0x07064b50,
  bytes: 20,
  diskAt: 4,
  recordOffsetAt: 8,
  totalDisksAt: 16,
  defaultTotalDisks: 1,
}

/** Each value as 8 bytes, little-endian. */
export function wideBytes(values: readonly Wide[]): Uint8Array {
  const bytes = new Uint8Array(values.length * WIDE_BYTES)
  const view = new DataView(bytes.buffer)
  values.forEach((value, index) => view.setBigUint64(index * WIDE_BYTES, BigInt(value), true))
  return bytes
}

/** One block of an extra field: the id, the length of the data (default its true length), the data. */
export function extraBlock(id: number, data: Uint8Array, declaredLength = data.length): Uint8Array {
  const bytes = new Uint8Array(BLOCK.headerBytes + data.length)
  const view = new DataView(bytes.buffer)
  view.setUint16(BLOCK.idAt, id, true)
  view.setUint16(BLOCK.lengthAt, declaredLength, true)
  bytes.set(data, BLOCK.headerBytes)
  return bytes
}

export function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    joined.set(part, offset)
    offset += part.length
  }
  return joined
}

/** The ZIP64 block of a central directory entry: the values of the marked fields, in the fixed order. */
export function entryZip64Block(
  marked: readonly Zip64EntryField[],
  trueValues: Readonly<Record<Zip64EntryField, Wide>>,
  replaced: Zip64EntryValues = {},
): Uint8Array {
  const values = { ...trueValues, ...replaced }
  const present = ZIP64_ENTRY_FIELDS.filter((field) => marked.includes(field))
  return extraBlock(ZIP64_BLOCK_ID, wideBytes(present.map((field) => values[field])))
}

/** The classic fields of the end record that hold their marker; none when the file has no ZIP64 records. */
export function endMarkers(end: TestZip64End | undefined): readonly Zip64EndField[] {
  return end === undefined ? [] : (end.markers ?? DEFAULT_END_MARKERS)
}

/** The true value of each of the six fields: disk 0 twice, the count twice, the size and the offset. */
export function trueEndValues(
  facts: DirectoryFacts,
  count: number = facts.entries,
): Record<Zip64EndField, Wide> {
  return {
    disk: 0,
    directoryDisk: 0,
    entriesOnDisk: count,
    entries: count,
    directoryBytes: facts.directoryBytes,
    directoryOffset: facts.directoryOffset,
  }
}

function zip64EndRecord(end: TestZip64End, values: Record<Zip64EndField, Wide>): Uint8Array {
  const bytes = new Uint8Array(ZIP64_END.bytes)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, end.recordSignature ?? ZIP64_END.signature, true)
  const recordSize = BigInt(end.recordSize ?? ZIP64_END.defaultRecordSize)
  view.setBigUint64(ZIP64_END.recordSizeAt, recordSize, true)
  view.setUint16(ZIP64_END.versionMadeAt, ZIP64_END.version, true)
  view.setUint16(ZIP64_END.versionNeededAt, ZIP64_END.version, true)
  for (const field of ZIP64_END_FIELDS) {
    const { at, wide } = ZIP64_END_VALUES[field]
    if (wide) view.setBigUint64(at, BigInt(values[field]), true)
    else view.setUint32(at, Number(values[field]), true)
  }
  return bytes
}

function zip64Locator(end: TestZip64End, recordOffset: number): Uint8Array {
  const bytes = new Uint8Array(LOCATOR.bytes)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, end.locatorSignature ?? LOCATOR.signature, true)
  view.setUint32(LOCATOR.diskAt, end.locatorDisk ?? 0, true)
  view.setBigUint64(LOCATOR.recordOffsetAt, BigInt(end.locatorOffset ?? recordOffset), true)
  view.setUint32(LOCATOR.totalDisksAt, end.totalDisks ?? LOCATOR.defaultTotalDisks, true)
  return bytes
}

/** The ZIP64 end record and its locator, which stand directly after the central directory. */
export function zip64EndRecords(end: TestZip64End, facts: DirectoryFacts): Uint8Array {
  const values = { ...trueEndValues(facts), ...end.values }
  const recordOffset = facts.directoryOffset + facts.directoryBytes
  return joinBytes([zip64EndRecord(end, values), zip64Locator(end, recordOffset)])
}

/**
 * The forced archive: 372 bytes from a common command-line archiver with its option that forces
 * ZIP64. `vernacular.json` (stored, `{"x":1}`) and `a.txt` (deflated). End record
 * at 350, locator at 330, ZIP64 end record at 274, central directory at 138 with
 * 136 bytes.
 */
const FORCED_ZIP64_BASE64 = [
  'UEsDBC0AAAAAAO1Ec11cWes7//////////8PABQAdmVybmFjdWxhci5qc29uAQAQAAcAAAAAAAAABwAAAAAAAAB7IngiOjF9',
  'UEsDBC0AAAAIAO1Ec10AiFkL//////////8FABQAYS50eHQBABAAGAAAAAAAAAALAAAAAAAAAMtIzcnJV8hAJ7kAUEsBAh4D',
  'LQAAAAAA7URzXVxZ6zsHAAAA/////w8ADAAAAAAAAQAAAKSBAAAAAHZlcm5hY3VsYXIuanNvbgEACAAHAAAAAAAAAFBLAQIe',
  'Ay0AAAAIAO1Ec10AiFkLCwAAAP////8FAAwAAAAAAAEAAACkgUgAAABhLnR4dAEACAAYAAAAAAAAAFBLBgYsAAAAAAAAAB4D',
  'LQAAAAAAAAAAAAIAAAAAAAAAAgAAAAAAAACIAAAAAAAAAIoAAAAAAAAAUEsGBwAAAAASAQAAAAAAAAEAAABQSwUGAAAAAAIA',
  'AgCIAAAA/////wAA',
].join('')

/**
 * The streamed archive: 207 bytes from the same archiver as a streaming writer. One deflated entry
 * named `-` and no `vernacular.json`. Classic values beside a ZIP64 end record.
 * End record at 185, locator at 165, ZIP64 end record at 109, central directory
 * at 62 with 47 bytes.
 */
const STREAMED_ZIP64_BASE64 = [
  'UEsDBC0AAAAIAO1Ec10AiFkL//////////8BABQALQEAEAAYAAAAAAAAAAsAAAAAAAAAy0jNyclXyEAnuQBQSwECHgMtAAAA',
  'CADtRHNdAIhZCwsAAAAYAAAAAQAAAAAAAAABAAAAsBEAAAAALVBLBgYsAAAAAAAAAB4DLQAAAAAAAAAAAAEAAAAAAAAAAQAA',
  'AAAAAAAvAAAAAAAAAD4AAAAAAAAAUEsGBwAAAABtAAAAAAAAAAEAAABQSwUGAAAAAAEAAQAvAAAAPgAAAAAA',
].join('')

function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0))
}

/** A fresh copy of the forced archive, so a test may patch its bytes. */
export function forcedZip64Archive(): Uint8Array {
  return decodeBase64(FORCED_ZIP64_BASE64)
}

/** A fresh copy of the streamed archive, so a test may patch its bytes. */
export function streamedZip64Archive(): Uint8Array {
  return decodeBase64(STREAMED_ZIP64_BASE64)
}
