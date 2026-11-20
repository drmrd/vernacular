/**
 * The ZIP64 records of an archive: the read of an 8-byte value, the locator and the ZIP64 end
 * record, and the walk of the extra field of a central directory entry. A ZIP64 value stands in
 * for a classic field only when that field holds its marker. Every offset that comes from the file
 * is checked against the file before a byte is read there.
 */

const LITTLE_ENDIAN = true
/** The marker of a classic field of 2 bytes. */
const SHORT_MARKER = 0xffff
/** The marker of a classic field of 4 bytes. */
const LONG_MARKER = 0xffffffff

const TWO_TO_THE_32 = 4_294_967_296
const HIGH_HALF_OFFSET = 4
const EIGHT_BYTE_VALUE_LENGTH = 8

const LOCATOR_SIGNATURE = 0x07064b50
const LOCATOR_BYTES = 20
const LOCATOR_RECORD_DISK = 4
const LOCATOR_RECORD_OFFSET = 8
const LOCATOR_TOTAL_DISKS = 16

const ZIP64_END_SIGNATURE = 0x06064b50
const ZIP64_END_FIXED_BYTES = 56
const ZIP64_THIS_DISK = 16
const ZIP64_DIRECTORY_DISK = 20
const ZIP64_ENTRIES_ON_DISK = 24
const ZIP64_ENTRIES = 32
const ZIP64_DIRECTORY_BYTES = 40
const ZIP64_DIRECTORY_OFFSET = 48

const ZIP64_BLOCK_ID = 0x0001
const BLOCK_HEADER_BYTES = 4
const BLOCK_LENGTH_OFFSET = 2

/** The six values of the end record, classic or settled. */
export interface EndRecordValues {
  readonly thisDisk: number
  readonly directoryDisk: number
  readonly entriesOnDisk: number
  readonly entries: number
  readonly directoryBytes: number
  readonly directoryOffset: number
}

export interface SettledEndRecord extends EndRecordValues {
  /** Where the first end record starts: the central directory must end at or before it. */
  readonly directoryLimit: number
}

/** The three fields of a central directory entry that a ZIP64 block can stand in for. */
export interface EntryFields {
  readonly declaredBytes: number
  readonly compressedBytes: number
  readonly localOffset: number
}

export interface ExtraField {
  readonly start: number
  readonly length: number
}

/** Two halves of 4 bytes, with no bitwise operator: exact below 2^53, never smaller above. */
function readEightByteValue(view: DataView, offset: number): number {
  const low = view.getUint32(offset, LITTLE_ENDIAN)
  const high = view.getUint32(offset + HIGH_HALF_OFFSET, LITTLE_ENDIAN)
  return high * TWO_TO_THE_32 + low
}

function holdsAnyMarker(values: EndRecordValues): boolean {
  return (
    values.thisDisk === SHORT_MARKER ||
    values.directoryDisk === SHORT_MARKER ||
    values.entriesOnDisk === SHORT_MARKER ||
    values.entries === SHORT_MARKER ||
    values.directoryBytes === LONG_MARKER ||
    values.directoryOffset === LONG_MARKER
  )
}

function settledField(classic: number, marker: number, zip64: number): number {
  return classic === marker ? zip64 : classic
}

function settledValues(
  view: DataView,
  recordOffset: number,
  classic: EndRecordValues,
): EndRecordValues {
  const at = (offset: number): number => readEightByteValue(view, recordOffset + offset)
  const disk = (offset: number): number => view.getUint32(recordOffset + offset, LITTLE_ENDIAN)
  return {
    thisDisk: settledField(classic.thisDisk, SHORT_MARKER, disk(ZIP64_THIS_DISK)),
    directoryDisk: settledField(classic.directoryDisk, SHORT_MARKER, disk(ZIP64_DIRECTORY_DISK)),
    entriesOnDisk: settledField(classic.entriesOnDisk, SHORT_MARKER, at(ZIP64_ENTRIES_ON_DISK)),
    entries: settledField(classic.entries, SHORT_MARKER, at(ZIP64_ENTRIES)),
    directoryBytes: settledField(classic.directoryBytes, LONG_MARKER, at(ZIP64_DIRECTORY_BYTES)),
    directoryOffset: settledField(classic.directoryOffset, LONG_MARKER, at(ZIP64_DIRECTORY_OFFSET)),
  }
}

function hasLocator(view: DataView, locator: number): boolean {
  return locator >= 0 && view.getUint32(locator, LITTLE_ENDIAN) === LOCATOR_SIGNATURE
}

/**
 * Settles the six values of the end record at `position` (rules Z3 to Z7). Gives `undefined` for
 * a malformed locator or ZIP64 end record. Reads no byte before the end record unless a field
 * holds its marker.
 */
export function settleEndRecord(
  view: DataView,
  position: number,
  classic: EndRecordValues,
): SettledEndRecord | undefined {
  const locator = position - LOCATOR_BYTES
  if (!holdsAnyMarker(classic) || !hasLocator(view, locator)) {
    return { ...classic, directoryLimit: position }
  }
  if (view.getUint32(locator + LOCATOR_RECORD_DISK, LITTLE_ENDIAN) !== 0) return undefined
  if (view.getUint32(locator + LOCATOR_TOTAL_DISKS, LITTLE_ENDIAN) > 1) return undefined
  const recordOffset = readEightByteValue(view, locator + LOCATOR_RECORD_OFFSET)
  if (recordOffset + ZIP64_END_FIXED_BYTES > locator) return undefined
  if (view.getUint32(recordOffset, LITTLE_ENDIAN) !== ZIP64_END_SIGNATURE) return undefined
  return { ...settledValues(view, recordOffset, classic), directoryLimit: recordOffset }
}

/** The data of the first ZIP64 block of the extra field, or `undefined` when the walk finds none. */
function findZip64Block(view: DataView, extra: ExtraField): ExtraField | undefined {
  const end = extra.start + extra.length
  let cursor = extra.start
  while (end - cursor >= BLOCK_HEADER_BYTES) {
    const id = view.getUint16(cursor, LITTLE_ENDIAN)
    const dataLength = view.getUint16(cursor + BLOCK_LENGTH_OFFSET, LITTLE_ENDIAN)
    const dataStart = cursor + BLOCK_HEADER_BYTES
    if (dataStart + dataLength > end) return undefined
    if (id === ZIP64_BLOCK_ID) return { start: dataStart, length: dataLength }
    cursor = dataStart + dataLength
  }
  return undefined
}

function markerCount(classic: EntryFields): number {
  return [classic.declaredBytes, classic.compressedBytes, classic.localOffset].filter(
    (value) => value === LONG_MARKER,
  ).length
}

/**
 * Settles the three fields of a central directory entry (rules Z10 to Z13). The extra field must
 * lie inside the central directory. Gives `undefined` for a ZIP64 block too short for its markers.
 */
export function settleEntryFields(
  view: DataView,
  extra: ExtraField,
  classic: EntryFields,
): EntryFields | undefined {
  const markers = markerCount(classic)
  if (markers === 0) return classic
  const block = findZip64Block(view, extra)
  if (block === undefined) return classic
  if (block.length < markers * EIGHT_BYTE_VALUE_LENGTH) return undefined
  let cursor = block.start
  const take = (value: number): number => {
    if (value !== LONG_MARKER) return value
    const read = readEightByteValue(view, cursor)
    cursor += EIGHT_BYTE_VALUE_LENGTH
    return read
  }
  return {
    declaredBytes: take(classic.declaredBytes),
    compressedBytes: take(classic.compressedBytes),
    localOffset: take(classic.localOffset),
  }
}
