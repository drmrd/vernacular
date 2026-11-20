/**
 * Test support that writes ZIP archives byte by byte, so a test can build an
 * archive that lies about a size, hides a signature, or carries ZIP64 records.
 * DEFLATE streams come from fflate's `deflateSync`; every record is written here
 * with a `DataView`. Production code does not import it. Each CRC-32 is 0.
 */
import { deflateSync } from 'fflate'
import {
  endMarkers,
  entryZip64Block,
  joinBytes,
  trueEndValues,
  zip64EndRecords,
  ZIP64_END_FIELDS,
  type DirectoryFacts,
  type TestZip64End,
  type Zip64EndField,
  type Zip64EntryField,
  type Zip64EntryValues,
} from './zip64-test-kit'

/** The levels a test may ask of `deflateSync`: 0, 6, or 9. */
const DEFLATE_LEVELS = { storedBlocks: 0, standard: 6, best: 9 } as const
type DeflateLevel = (typeof DEFLATE_LEVELS)[keyof typeof DEFLATE_LEVELS]
const DEFAULT_LEVEL = DEFLATE_LEVELS.standard

export interface TestZipEntry {
  readonly name: string
  /** The true content. */
  readonly content: Uint8Array
  /** 8 (default) or 0; any other number is written as it is, with deflated data. */
  readonly method?: number
  /** For `deflateSync`, default 6; level 0 writes stored blocks. */
  readonly level?: DeflateLevel
  /** Written as the data of the entry, in place of the compressed content. */
  readonly data?: Uint8Array
  /** The size the central directory declares; default `content.length`. */
  readonly declaredBytes?: number
  /** The size the local header declares; default `declaredBytes`. */
  readonly localDeclaredBytes?: number
  /** The flags of both headers, default 0; bit 0 is "encrypted". */
  readonly flags?: number
  /** True: local header with zero sizes and flag bit 3, and a data descriptor after the data. */
  readonly dataDescriptor?: boolean
  /** The classic fields of the central directory entry that hold 0xFFFFFFFF; the kit writes one block 0x0001 with their values, in the fixed order. */
  readonly zip64?: readonly Zip64EntryField[]
  /** A value that the block gives in place of the true one. */
  readonly zip64Values?: Zip64EntryValues
  /** Written as the whole extra field of the central directory entry, in place of the block that `zip64` asks for. */
  readonly centralExtra?: Uint8Array
  /** Written as the extra field of the local header; default none. */
  readonly localExtra?: Uint8Array
  /** The disk number of the central directory entry (2 bytes at 34); default 0. */
  readonly diskStart?: number
}

export interface TestZipOptions {
  /** The comment of the end record. */
  readonly comment?: Uint8Array
  /** The count in both count fields of the end record, where no marker stands; default the true count. */
  readonly declaredEntries?: number
  /** Given: a ZIP64 end record and its locator stand before the end record. */
  readonly zip64End?: TestZip64End
}

const STORED = 0
const DEFLATED = 8
const VERSION = 20
const DATA_DESCRIPTOR_FLAG = 0b1000
const LONG_MARKER = 0xffffffff
const SHORT_MARKER = 0xffff
const EMPTY = new Uint8Array(0)
const DOCUMENT_NAME = 'vernacular.json'
const ASSET_PREFIX = 'assets/'

const LOCAL = {
  signature: 0x04034b50,
  bytes: 30,
  versionAt: 4,
  flagsAt: 6,
  methodAt: 8,
  compressedAt: 18,
  declaredAt: 22,
  nameLengthAt: 26,
  extraLengthAt: 28,
}
const DESCRIPTOR = { signature: 0x08074b50, bytes: 16, compressedAt: 8, declaredAt: 12 }
const CENTRAL = {
  signature: 0x02014b50,
  bytes: 46,
  versionMadeAt: 4,
  versionNeededAt: 6,
  flagsAt: 8,
  methodAt: 10,
  compressedAt: 20,
  declaredAt: 24,
  nameLengthAt: 28,
  extraLengthAt: 30,
  diskStartAt: 34,
  localOffsetAt: 42,
}
const END = { signature: 0x06054b50, bytes: 22, commentLengthAt: 20 }
/** Where each of the six values stands in the classic end record, and its marker. */
const END_VALUES: Record<Zip64EndField, { readonly at: number; readonly marker: number }> = {
  disk: { at: 4, marker: SHORT_MARKER },
  directoryDisk: { at: 6, marker: SHORT_MARKER },
  entriesOnDisk: { at: 8, marker: SHORT_MARKER },
  entries: { at: 10, marker: SHORT_MARKER },
  directoryBytes: { at: 12, marker: LONG_MARKER },
  directoryOffset: { at: 16, marker: LONG_MARKER },
}

/** An entry as written: its name, its data, and where its local header starts. */
interface PlacedEntry {
  readonly entry: TestZipEntry
  readonly name: Uint8Array
  readonly data: Uint8Array
  readonly localOffset: number
}

const encoder = new TextEncoder()

function declaredOf(entry: TestZipEntry): number {
  return entry.declaredBytes ?? entry.content.length
}

function methodOf(entry: TestZipEntry): number {
  return entry.method ?? DEFLATED
}

function dataOf(entry: TestZipEntry): Uint8Array {
  if (entry.data !== undefined) return entry.data
  if (methodOf(entry) === STORED) return entry.content
  return deflateSync(entry.content, { level: entry.level ?? DEFAULT_LEVEL })
}

function localFlagsOf(entry: TestZipEntry): number {
  const flags = entry.flags ?? 0
  return entry.dataDescriptor === true ? flags | DATA_DESCRIPTOR_FLAG : flags
}

function localHeader(placed: PlacedEntry): Uint8Array {
  const { entry, name, data } = placed
  const extra = entry.localExtra ?? EMPTY
  const bytes = new Uint8Array(LOCAL.bytes + name.length + extra.length)
  const view = new DataView(bytes.buffer)
  const described = entry.dataDescriptor === true
  view.setUint32(0, LOCAL.signature, true)
  view.setUint16(LOCAL.versionAt, VERSION, true)
  view.setUint16(LOCAL.flagsAt, localFlagsOf(entry), true)
  view.setUint16(LOCAL.methodAt, methodOf(entry), true)
  view.setUint32(LOCAL.compressedAt, described ? 0 : data.length, true)
  const declared = entry.localDeclaredBytes ?? declaredOf(entry)
  view.setUint32(LOCAL.declaredAt, described ? 0 : declared, true)
  view.setUint16(LOCAL.nameLengthAt, name.length, true)
  view.setUint16(LOCAL.extraLengthAt, extra.length, true)
  bytes.set(name, LOCAL.bytes)
  bytes.set(extra, LOCAL.bytes + name.length)
  return bytes
}

function dataDescriptor(placed: PlacedEntry): Uint8Array {
  if (placed.entry.dataDescriptor !== true) return EMPTY
  const bytes = new Uint8Array(DESCRIPTOR.bytes)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, DESCRIPTOR.signature, true)
  view.setUint32(DESCRIPTOR.compressedAt, placed.data.length, true)
  view.setUint32(DESCRIPTOR.declaredAt, declaredOf(placed.entry), true)
  return bytes
}

function localPart(placed: PlacedEntry): Uint8Array {
  return joinBytes([localHeader(placed), placed.data, dataDescriptor(placed)])
}

/** The true value of each field that a ZIP64 block of the entry can give. */
function trueEntryValues(placed: PlacedEntry): Record<Zip64EntryField, number> {
  return {
    declaredBytes: declaredOf(placed.entry),
    compressedBytes: placed.data.length,
    localOffset: placed.localOffset,
  }
}

function centralExtraOf(placed: PlacedEntry): Uint8Array {
  const { entry } = placed
  if (entry.centralExtra !== undefined) return entry.centralExtra
  if (entry.zip64 === undefined) return EMPTY
  return entryZip64Block(entry.zip64, trueEntryValues(placed), entry.zip64Values)
}

/** The classic value of each field: its marker when `zip64` names it, else its true value. */
function classicEntryValues(placed: PlacedEntry): Record<Zip64EntryField, number> {
  const values = trueEntryValues(placed)
  for (const field of placed.entry.zip64 ?? []) values[field] = LONG_MARKER
  return values
}

function centralEntry(placed: PlacedEntry): Uint8Array {
  const { entry, name } = placed
  const extra = centralExtraOf(placed)
  const values = classicEntryValues(placed)
  const bytes = new Uint8Array(CENTRAL.bytes + name.length + extra.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, CENTRAL.signature, true)
  view.setUint16(CENTRAL.versionMadeAt, VERSION, true)
  view.setUint16(CENTRAL.versionNeededAt, VERSION, true)
  view.setUint16(CENTRAL.flagsAt, localFlagsOf(entry), true)
  view.setUint16(CENTRAL.methodAt, methodOf(entry), true)
  view.setUint32(CENTRAL.compressedAt, values.compressedBytes, true)
  view.setUint32(CENTRAL.declaredAt, values.declaredBytes, true)
  view.setUint16(CENTRAL.nameLengthAt, name.length, true)
  view.setUint16(CENTRAL.extraLengthAt, extra.length, true)
  view.setUint16(CENTRAL.diskStartAt, entry.diskStart ?? 0, true)
  view.setUint32(CENTRAL.localOffsetAt, values.localOffset, true)
  bytes.set(name, CENTRAL.bytes)
  bytes.set(extra, CENTRAL.bytes + name.length)
  return bytes
}

function writeEndValue(view: DataView, field: Zip64EndField, value: number): void {
  const { at, marker } = END_VALUES[field]
  if (marker === SHORT_MARKER) view.setUint16(at, value, true)
  else view.setUint32(at, value, true)
}

function endRecord(options: TestZipOptions, facts: DirectoryFacts): Uint8Array {
  const comment = options.comment ?? EMPTY
  const markers = endMarkers(options.zip64End)
  const values = trueEndValues(facts, options.declaredEntries ?? facts.entries)
  const bytes = new Uint8Array(END.bytes + comment.length)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, END.signature, true)
  for (const field of ZIP64_END_FIELDS) {
    const marked = markers.includes(field)
    writeEndValue(view, field, marked ? END_VALUES[field].marker : Number(values[field]))
  }
  view.setUint16(END.commentLengthAt, comment.length, true)
  bytes.set(comment, END.bytes)
  return bytes
}

function placeEntries(entries: readonly TestZipEntry[]): PlacedEntry[] {
  const placed: PlacedEntry[] = []
  let localOffset = 0
  for (const entry of entries) {
    const next = { entry, name: encoder.encode(entry.name), data: dataOf(entry), localOffset }
    placed.push(next)
    localOffset += localPart(next).length
  }
  return placed
}

/** Writes the local parts, the central directory, the ZIP64 records when asked for, and the end record. */
export function buildZip(
  entries: readonly TestZipEntry[],
  options: TestZipOptions = {},
): Uint8Array {
  const placed = placeEntries(entries)
  const locals = joinBytes(placed.map(localPart))
  const directory = joinBytes(placed.map(centralEntry))
  const facts = {
    entries: entries.length,
    directoryBytes: directory.length,
    directoryOffset: locals.length,
  }
  const zip64 = options.zip64End === undefined ? EMPTY : zip64EndRecords(options.zip64End, facts)
  return joinBytes([locals, directory, zip64, endRecord(options, facts)])
}

const HEX_RADIX = 16
const HEX_DIGITS_PER_BYTE = 2

/** SHA-256 as lower-case hexadecimal. */
export async function contentHashOf(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, '0'),
  ).join('')
}

/** An entry named `assets/<hash of the bytes>`. */
export async function assetEntry(
  bytes: Uint8Array,
  overrides: Partial<TestZipEntry> = {},
): Promise<TestZipEntry> {
  return { name: `${ASSET_PREFIX}${await contentHashOf(bytes)}`, content: bytes, ...overrides }
}

/** An entry named `vernacular.json`. */
export function documentEntry(
  bytes: Uint8Array,
  overrides: Partial<TestZipEntry> = {},
): TestZipEntry {
  return { name: DOCUMENT_NAME, content: bytes, ...overrides }
}

const SEED = 0x2545f491
const XORSHIFT = { first: 13, second: 17, third: 5 }

/** Bytes from a fixed seed, the same on every run. */
export function seededBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  let state = SEED
  for (let index = 0; index < length; index += 1) {
    state ^= state << XORSHIFT.first
    state ^= state >>> XORSHIFT.second
    state ^= state << XORSHIFT.third
    bytes[index] = state
  }
  return bytes
}
