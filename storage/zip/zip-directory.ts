import {
  settleEndRecord,
  settleEntryFields,
  type EndRecordValues,
  type SettledEndRecord,
} from './zip64-records'

/**
 * The end record and the central directory of a ZIP archive, read from untrusted bytes. Every
 * offset and length that comes from the file is checked against the file before a byte is read
 * there. `undefined` means the bytes are not an archive this reader accepts.
 */

const LITTLE_ENDIAN = true

const END_RECORD_SIGNATURE = 0x06054b50
const END_RECORD_BYTES = 22
const MAXIMUM_COMMENT_BYTES = 65_535
const END_THIS_DISK = 4
const END_DIRECTORY_DISK = 6
const END_ENTRIES_ON_DISK = 8
const END_ENTRIES = 10
const END_DIRECTORY_BYTES = 12
const END_DIRECTORY_OFFSET = 16
const END_COMMENT_LENGTH = 20

const ENTRY_SIGNATURE = 0x02014b50
const ENTRY_FIXED_BYTES = 46
const ENTRY_FLAGS = 8
const ENTRY_METHOD = 10
const ENTRY_COMPRESSED_BYTES = 20
const ENTRY_DECLARED_BYTES = 24
const ENTRY_NAME_LENGTH = 28
const ENTRY_EXTRA_LENGTH = 30
const ENTRY_COMMENT_LENGTH = 32
const ENTRY_LOCAL_OFFSET = 42

const LOCAL_HEADER_SIGNATURE = 0x04034b50
const LOCAL_HEADER_FIXED_BYTES = 30
const LOCAL_NAME_LENGTH = 26
const LOCAL_EXTRA_LENGTH = 28

/** Bit 0 of the flags, read without a bitwise operator: the flags are odd when it is set. */
const ENCRYPTED_BIT_MODULUS = 2

export interface DirectoryEntry {
  readonly name: string
  readonly flags: number
  readonly method: number
  readonly compressedBytes: number
  readonly declaredBytes: number
  readonly localOffset: number
}

const nameDecoder = new TextDecoder()

/** CD1: the first position, searching backward, whose signature and comment length fit the file. */
function findEndRecord(view: DataView): number | undefined {
  const last = view.byteLength - END_RECORD_BYTES
  const first = Math.max(0, last - MAXIMUM_COMMENT_BYTES)
  for (let position = last; position >= first; position -= 1) {
    if (view.getUint32(position, LITTLE_ENDIAN) !== END_RECORD_SIGNATURE) continue
    const commentLength = view.getUint16(position + END_COMMENT_LENGTH, LITTLE_ENDIAN)
    if (position + END_RECORD_BYTES + commentLength <= view.byteLength) return position
  }
  return undefined
}

function classicEndValues(view: DataView, position: number): EndRecordValues {
  const short = (offset: number): number => view.getUint16(position + offset, LITTLE_ENDIAN)
  const long = (offset: number): number => view.getUint32(position + offset, LITTLE_ENDIAN)
  return {
    thisDisk: short(END_THIS_DISK),
    directoryDisk: short(END_DIRECTORY_DISK),
    entriesOnDisk: short(END_ENTRIES_ON_DISK),
    entries: short(END_ENTRIES),
    directoryBytes: long(END_DIRECTORY_BYTES),
    directoryOffset: long(END_DIRECTORY_OFFSET),
  }
}

/** RD2: the end record with its six values settled (CD1, Z3 to Z7, then CD2). */
export function readEndRecord(view: DataView): SettledEndRecord | undefined {
  const position = findEndRecord(view)
  if (position === undefined) return undefined
  const settled = settleEndRecord(view, position, classicEndValues(view, position))
  if (settled === undefined) return undefined
  if (settled.thisDisk !== 0 || settled.directoryDisk !== 0) return undefined
  if (settled.entriesOnDisk !== settled.entries) return undefined
  return settled
}

interface EntryRead {
  readonly entry: DirectoryEntry
  readonly next: number
}

/** CD4: one central directory entry at `start`, which must lie whole before `directoryEnd`. */
function readDirectoryEntry(
  view: DataView,
  start: number,
  directoryEnd: number,
): EntryRead | undefined {
  if (start + ENTRY_FIXED_BYTES > directoryEnd) return undefined
  if (view.getUint32(start, LITTLE_ENDIAN) !== ENTRY_SIGNATURE) return undefined
  const short = (offset: number): number => view.getUint16(start + offset, LITTLE_ENDIAN)
  const long = (offset: number): number => view.getUint32(start + offset, LITTLE_ENDIAN)
  const nameStart = start + ENTRY_FIXED_BYTES
  const extraStart = nameStart + short(ENTRY_NAME_LENGTH)
  const extraLength = short(ENTRY_EXTRA_LENGTH)
  const next = extraStart + extraLength + short(ENTRY_COMMENT_LENGTH)
  if (next > directoryEnd) return undefined
  const fields = settleEntryFields(
    view,
    { start: extraStart, length: extraLength },
    {
      declaredBytes: long(ENTRY_DECLARED_BYTES),
      compressedBytes: long(ENTRY_COMPRESSED_BYTES),
      localOffset: long(ENTRY_LOCAL_OFFSET),
    },
  )
  if (fields === undefined) return undefined
  const nameBytes = new Uint8Array(view.buffer, view.byteOffset + nameStart, extraStart - nameStart)
  const name = nameDecoder.decode(nameBytes)
  return {
    entry: { name, flags: short(ENTRY_FLAGS), method: short(ENTRY_METHOD), ...fields },
    next,
  }
}

/** RD4: CD3, then exactly `entries` entries from the offset of the central directory (CD4). */
export function readCentralDirectory(
  view: DataView,
  end: SettledEndRecord,
): DirectoryEntry[] | undefined {
  const directoryEnd = end.directoryOffset + end.directoryBytes
  if (directoryEnd > end.directoryLimit) return undefined
  const entries: DirectoryEntry[] = []
  let cursor = end.directoryOffset
  for (let index = 0; index < end.entries; index += 1) {
    const read = readDirectoryEntry(view, cursor, directoryEnd)
    if (read === undefined) return undefined
    entries.push(read.entry)
    cursor = read.next
  }
  return entries
}

/** CD8: bit 0 of the flags marks an encrypted entry. */
export function isEncrypted(entry: DirectoryEntry): boolean {
  return entry.flags % ENCRYPTED_BIT_MODULUS !== 0
}

/** CD7: the data of an entry as the archive holds it, or `undefined` for data outside the file. */
export function entryData(view: DataView, entry: DirectoryEntry): Uint8Array | undefined {
  const header = entry.localOffset
  if (header + LOCAL_HEADER_FIXED_BYTES > view.byteLength) return undefined
  if (view.getUint32(header, LITTLE_ENDIAN) !== LOCAL_HEADER_SIGNATURE) return undefined
  const nameLength = view.getUint16(header + LOCAL_NAME_LENGTH, LITTLE_ENDIAN)
  const extraLength = view.getUint16(header + LOCAL_EXTRA_LENGTH, LITTLE_ENDIAN)
  const dataStart = header + LOCAL_HEADER_FIXED_BYTES + nameLength + extraLength
  if (dataStart + entry.compressedBytes > view.byteLength) return undefined
  return new Uint8Array(view.buffer, view.byteOffset + dataStart, entry.compressedBytes)
}
