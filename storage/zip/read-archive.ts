import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { assetHashOfEntry, DOCUMENT_ENTRY_NAME } from './archive-layout'
import { inflateEntry, type InflatedEntry } from './inflate-entry'
import {
  entryData,
  isEncrypted,
  readCentralDirectory,
  readEndRecord,
  type DirectoryEntry,
} from './zip-directory'

export type ArchiveFailure =
  | { readonly kind: 'too-large'; readonly limit: ArchiveLimitName; readonly allowed: number }
  | { readonly kind: 'not-an-archive' }
  | { readonly kind: 'no-document' }

export type ArchiveRead =
  | {
      readonly ok: true
      /** The bytes of `vernacular.json`, not decoded. */
      readonly document: Uint8Array
      /** By content hash, in archive order. */
      readonly assets: ReadonlyMap<string, Uint8Array>
      /** Content hashes whose bytes were not accepted. */
      readonly rejectedAssets: readonly string[]
    }
  | { readonly ok: false; readonly failure: ArchiveFailure }

type Refusal = Extract<ArchiveRead, { readonly ok: false }>

type Directory = { readonly ok: true; readonly entries: readonly DirectoryEntry[] }

/** What RD1 to RD7 leave behind: the archive is sound enough to inflate, and holds a document. */
type CheckedArchive = Directory & { readonly view: DataView; readonly document: DirectoryEntry }

/** An asset entry of the layout, with the content hash its name stands for. */
type AssetEntry = readonly [contentHash: string, entry: DirectoryEntry]

function failure(failed: ArchiveFailure): Refusal {
  return { ok: false, failure: failed }
}

function notAnArchive(): Refusal {
  return failure({ kind: 'not-an-archive' })
}

function tooLarge(limits: ArchiveLimits, limit: ArchiveLimitName): Refusal {
  return failure({ kind: 'too-large', limit, allowed: limits[limit] })
}

/** RD5 and RD6: the declared sizes, before anything is inflated. */
function refuseDeclaredSizes(
  entries: readonly DirectoryEntry[],
  document: DirectoryEntry | undefined,
  limits: ArchiveLimits,
): Refusal | undefined {
  if (document !== undefined && document.declaredBytes > limits.documentBytes) {
    return tooLarge(limits, 'documentBytes')
  }
  const inflatedBytes = entries.reduce((sum, entry) => sum + entry.declaredBytes, 0)
  if (inflatedBytes > limits.inflatedBytes) return tooLarge(limits, 'inflatedBytes')
  return undefined
}

/** RD2 to RD4: the end record and the central directory, within the limit on the entry count. */
function readDirectory(view: DataView, limits: ArchiveLimits): Directory | Refusal {
  const end = readEndRecord(view)
  if (end === undefined) return notAnArchive()
  if (end.entries > limits.entries) return tooLarge(limits, 'entries')
  const entries = readCentralDirectory(view, end)
  if (entries === undefined) return notAnArchive()
  return { ok: true, entries }
}

/** RD1 to RD7: every check that comes before anything is inflated. */
function checkBeforeInflating(bytes: Uint8Array, limits: ArchiveLimits): CheckedArchive | Refusal {
  if (bytes.length > limits.archiveBytes) return tooLarge(limits, 'archiveBytes')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const directory = readDirectory(view, limits)
  if (!directory.ok) return directory
  const { entries } = directory
  const document = entries.find((entry) => entry.name === DOCUMENT_ENTRY_NAME)
  const refusal = refuseDeclaredSizes(entries, document, limits)
  if (refusal !== undefined) return refusal
  if (document === undefined) return failure({ kind: 'no-document' })
  return { ok: true, view, entries, document }
}

/** RD8: the bytes of the document entry inflated within its declared size, or `undefined`. */
function readDocument(view: DataView, document: DirectoryEntry): Uint8Array | undefined {
  if (isEncrypted(document)) return undefined
  const data = entryData(view, document)
  if (data === undefined) return undefined
  const inflated = inflateEntry({
    data,
    method: document.method,
    declaredBytes: document.declaredBytes,
  })
  return inflated.ok ? inflated.bytes : undefined
}

/** One asset entry inflated, or `undefined` when it is encrypted or its data lies outside the file. */
function inflateAsset(view: DataView, entry: DirectoryEntry): InflatedEntry | undefined {
  if (isEncrypted(entry)) return undefined
  const data = entryData(view, entry)
  if (data === undefined) return undefined
  return inflateEntry({ data, method: entry.method, declaredBytes: entry.declaredBytes })
}

/**
 * LY2 to LY5: the entry to read for each asset, in the order of the central directory. Only the
 * first entry of a name counts, also when it fails later, and no entry outside the layout does.
 */
function firstAssetEntries(entries: readonly DirectoryEntry[]): AssetEntry[] {
  const seen = new Set<string>()
  const first: AssetEntry[] = []
  for (const entry of entries) {
    const contentHash = assetHashOfEntry(entry.name)
    if (contentHash === undefined || seen.has(contentHash)) continue
    seen.add(contentHash)
    first.push([contentHash, entry])
  }
  return first
}

/**
 * RD9: the assets by content hash, in the order of the central directory. `undefined` when an asset
 * passes its declared size (D3); any other fault leaves that asset out.
 */
function readAssets(
  view: DataView,
  entries: readonly DirectoryEntry[],
): Map<string, Uint8Array> | undefined {
  const assets = new Map<string, Uint8Array>()
  for (const [contentHash, entry] of firstAssetEntries(entries)) {
    const inflated = inflateAsset(view, entry)
    if (inflated?.ok === true) assets.set(contentHash, inflated.bytes)
    else if (inflated?.reason === 'passes-declared-size') return undefined
  }
  return assets
}

/** The order of the checks, RD1 to RD9. Nothing is inflated before RD1 to RD7 have passed. */
function readArchiveBytes(bytes: Uint8Array, limits: ArchiveLimits): ArchiveRead {
  const checked = checkBeforeInflating(bytes, limits)
  if (!checked.ok) return checked
  const document = readDocument(checked.view, checked.document)
  if (document === undefined) return notAnArchive()
  const assets = readAssets(checked.view, checked.entries)
  if (assets === undefined) return notAnArchive()
  return { ok: true, document, assets, rejectedAssets: [] }
}

/**
 * Reads an imported project archive, which is an untrusted file. Refuses an archive above each
 * limit before it inflates anything. The promise never rejects, and `bytes` is never changed; a
 * stored document is a view into `bytes`.
 */
export function readArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<ArchiveRead> {
  try {
    return Promise.resolve(readArchiveBytes(bytes, limits))
  } catch {
    return Promise.resolve(notAnArchive())
  }
}
