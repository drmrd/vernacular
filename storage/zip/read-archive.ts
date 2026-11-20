import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { assetHashOfEntry } from './archive-layout'
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

const DOCUMENT_ENTRY_NAME = 'vernacular.json'

function failure(failed: ArchiveFailure): ArchiveRead {
  return { ok: false, failure: failed }
}

function notAnArchive(): ArchiveRead {
  return failure({ kind: 'not-an-archive' })
}

function tooLarge(limits: ArchiveLimits, limit: ArchiveLimitName): ArchiveRead {
  return failure({ kind: 'too-large', limit, allowed: limits[limit] })
}

/** RD5 and RD6: the declared sizes, before anything is inflated. */
function refuseDeclaredSizes(
  entries: readonly DirectoryEntry[],
  document: DirectoryEntry | undefined,
  limits: ArchiveLimits,
): ArchiveRead | undefined {
  if (document !== undefined && document.declaredBytes > limits.documentBytes) {
    return tooLarge(limits, 'documentBytes')
  }
  const inflatedBytes = entries.reduce((sum, entry) => sum + entry.declaredBytes, 0)
  if (inflatedBytes > limits.inflatedBytes) return tooLarge(limits, 'inflatedBytes')
  return undefined
}

/** RD8: the document entry inflated within its declared size. */
function readDocument(view: DataView, document: DirectoryEntry): ArchiveRead {
  if (isEncrypted(document)) return notAnArchive()
  const data = entryData(view, document)
  if (data === undefined) return notAnArchive()
  const inflated = inflateEntry({
    data,
    method: document.method,
    declaredBytes: document.declaredBytes,
  })
  if (!inflated.ok) return notAnArchive()
  return { ok: true, document: inflated.bytes, assets: new Map(), rejectedAssets: [] }
}

/** One asset entry inflated, or `undefined` when it is encrypted or its data lies outside the file. */
function inflateAsset(view: DataView, entry: DirectoryEntry): InflatedEntry | undefined {
  if (isEncrypted(entry)) return undefined
  const data = entryData(view, entry)
  if (data === undefined) return undefined
  return inflateEntry({ data, method: entry.method, declaredBytes: entry.declaredBytes })
}

/**
 * RD9 and LY2 to LY5: the asset entries of the layout, in the order of the central directory, by
 * content hash. Only the first entry of a name is inflated, and no entry outside the layout is.
 * `undefined` when an asset passes its declared size (D3); any other fault leaves that asset out.
 */
function readAssets(
  view: DataView,
  entries: readonly DirectoryEntry[],
): Map<string, Uint8Array> | undefined {
  const assets = new Map<string, Uint8Array>()
  const seen = new Set<string>()
  for (const entry of entries) {
    const contentHash = assetHashOfEntry(entry.name)
    if (contentHash === undefined || seen.has(contentHash)) continue
    seen.add(contentHash)
    const inflated = inflateAsset(view, entry)
    if (inflated?.ok === true) assets.set(contentHash, inflated.bytes)
    else if (inflated?.reason === 'passes-declared-size') return undefined
  }
  return assets
}

/** The order of the checks, RD1 to RD9. Nothing is inflated before RD1 to RD7 have passed. */
function readArchiveBytes(bytes: Uint8Array, limits: ArchiveLimits): ArchiveRead {
  if (bytes.length > limits.archiveBytes) return tooLarge(limits, 'archiveBytes')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = readEndRecord(view)
  if (end === undefined) return notAnArchive()
  if (end.entries > limits.entries) return tooLarge(limits, 'entries')
  const entries = readCentralDirectory(view, end)
  if (entries === undefined) return notAnArchive()
  const document = entries.find((entry) => entry.name === DOCUMENT_ENTRY_NAME)
  const refusal = refuseDeclaredSizes(entries, document, limits)
  if (refusal !== undefined) return refusal
  if (document === undefined) return failure({ kind: 'no-document' })
  const read = readDocument(view, document)
  if (!read.ok) return read
  const assets = readAssets(view, entries)
  if (assets === undefined) return notAnArchive()
  return { ...read, assets }
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
