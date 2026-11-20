import { ARCHIVE_LIMITS, type ArchiveLimitName, type ArchiveLimits } from './archive-limits'
import { assetHashOfEntry, DOCUMENT_ENTRY_NAME } from './archive-layout'
import { contentHashOf } from './content-hash'
import { inflateEntry } from './inflate-entry'
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

/**
 * What the checks before any inflation leave behind: the archive is sound enough to inflate, and
 * holds a document.
 */
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

/**
 * The limits on the declared size of the document and on the declared total, checked before
 * anything is inflated.
 */
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

/** The end record and the central directory, within the limit on the entry count. */
function readDirectory(view: DataView, limits: ArchiveLimits): Directory | Refusal {
  const end = readEndRecord(view)
  if (end === undefined) return notAnArchive()
  if (end.entries > limits.entries) return tooLarge(limits, 'entries')
  const entries = readCentralDirectory(view, end)
  if (entries === undefined) return notAnArchive()
  return { ok: true, entries }
}

/** Every check that comes before anything is inflated. */
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

/**
 * The data of the entries read so far (`spent`) against the length of the archive (`limit`). Many
 * central entries may point at one local entry, so without this sum a small archive could make the
 * reader inflate the same data again and again.
 */
interface DataBudget {
  spent: number
  readonly limit: number
}

/** Adds the data of one entry, unless the sum would then pass the length of the archive. */
function takeData(dataBudget: DataBudget, data: Uint8Array): boolean {
  if (dataBudget.spent + data.length > dataBudget.limit) return false
  dataBudget.spent += data.length
  return true
}

/** The bytes of the document entry inflated within its declared size, or `undefined`. */
function readDocument(
  view: DataView,
  document: DirectoryEntry,
  dataBudget: DataBudget,
): Uint8Array | undefined {
  if (isEncrypted(document)) return undefined
  const data = entryData(view, document)
  // The document is the first entry that counts and its data lies inside the file: never refuses.
  if (data === undefined || !takeData(dataBudget, data)) return undefined
  const inflated = inflateEntry({
    data,
    method: document.method,
    declaredBytes: document.declaredBytes,
  })
  return inflated.ok ? inflated.bytes : undefined
}

/** An asset that cannot be read, and so is rejected, but does not stop the read of the archive. */
const UNREADABLE = 'unreadable'

/** An asset that makes the whole archive `not-an-archive`. */
const REFUSE_ARCHIVE = 'refuse-archive'

type AssetOutcome = Uint8Array | typeof UNREADABLE | typeof REFUSE_ARCHIVE

/**
 * One asset entry read. An encrypted entry, or one whose data lies outside the file, cannot be
 * read: its name is rejected, and it adds nothing to the data spent. Data that would pass the
 * length of the archive refuses the archive before it is inflated, and so does output that passes
 * the declared size, since an archive that lies about a size is hostile or broken.
 */
function readAsset(view: DataView, entry: DirectoryEntry, dataBudget: DataBudget): AssetOutcome {
  if (isEncrypted(entry)) return UNREADABLE
  const data = entryData(view, entry)
  if (data === undefined) return UNREADABLE
  if (!takeData(dataBudget, data)) return REFUSE_ARCHIVE
  const inflated = inflateEntry({ data, method: entry.method, declaredBytes: entry.declaredBytes })
  if (inflated.ok) return inflated.bytes
  return inflated.reason === 'passes-declared-size' ? REFUSE_ARCHIVE : UNREADABLE
}

/**
 * The entry to read for each asset, in the order of the central directory. Only the first entry
 * of a name counts, also when it fails later, and no entry outside the layout does.
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

/** The hash in the name of an asset entry, and its bytes, or `UNREADABLE` when it was not read. */
type AssetRead = readonly [contentHash: string, bytes: Uint8Array | typeof UNREADABLE]

/**
 * Every asset read, in the order of the central directory, before any is hashed. There are two
 * reasons for this order. An archive that a later asset refuses then costs no hashing at all. And
 * the whole archive is read in one synchronous run, before the first `await`. The cost is that the
 * bytes of an asset that will be rejected are held until every asset is hashed. `undefined` when
 * an asset refuses the archive.
 */
function readAssets(
  view: DataView,
  entries: readonly DirectoryEntry[],
  dataBudget: DataBudget,
): AssetRead[] | undefined {
  const inflated: AssetRead[] = []
  for (const [contentHash, entry] of firstAssetEntries(entries)) {
    const outcome = readAsset(view, entry, dataBudget)
    if (outcome === REFUSE_ARCHIVE) return undefined
    inflated.push([contentHash, outcome])
  }
  return inflated
}

/**
 * The hash of the bytes, or `undefined` when they cannot be hashed. A hash that fails rejects that
 * asset only and does not refuse the archive: the document of such an archive is sound, and a page
 * with no secure origin has no digest at all, so every archive with an asset would fail there.
 */
async function hashIfPossible(bytes: Uint8Array): Promise<string | undefined> {
  try {
    return await contentHashOf(bytes)
  } catch {
    return undefined
  }
}

interface CheckedAssets {
  readonly assets: Map<string, Uint8Array>
  readonly rejectedAssets: string[]
}

/**
 * An asset is accepted only when its bytes hash to its name, since a name that lies would let one
 * file stand in for another. Any other asset, also one that could not be read or hashed, is
 * rejected under the hash of its name. One asset is hashed at a time, in the order of the central
 * directory, so both lists keep that order and only one asset is handed to the digest at once.
 */
async function checkAssets(inflated: readonly AssetRead[]): Promise<CheckedAssets> {
  const assets = new Map<string, Uint8Array>()
  const rejectedAssets: string[] = []
  for (const [contentHash, bytes] of inflated) {
    if (bytes !== UNREADABLE && (await hashIfPossible(bytes)) === contentHash) {
      assets.set(contentHash, bytes)
    } else {
      rejectedAssets.push(contentHash)
    }
  }
  return { assets, rejectedAssets }
}

/**
 * Checks the archive, then reads the document, then inflates the assets, then hashes them.
 * Nothing is inflated before every check has passed.
 */
async function readArchiveBytes(bytes: Uint8Array, limits: ArchiveLimits): Promise<ArchiveRead> {
  const checked = checkBeforeInflating(bytes, limits)
  if (!checked.ok) return checked
  const dataBudget: DataBudget = { spent: 0, limit: bytes.length }
  const document = readDocument(checked.view, checked.document, dataBudget)
  if (document === undefined) return notAnArchive()
  const inflated = readAssets(checked.view, checked.entries, dataBudget)
  if (inflated === undefined) return notAnArchive()
  return { ok: true, document, ...(await checkAssets(inflated)) }
}

/**
 * Reads an imported project archive, which is an untrusted file. Refuses an archive above each
 * limit before it inflates anything. The promise never rejects, also when the digest is missing or
 * fails, and `bytes` is never changed; a stored document or asset is a view into `bytes`.
 */
export async function readArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = ARCHIVE_LIMITS,
): Promise<ArchiveRead> {
  try {
    return await readArchiveBytes(bytes, limits)
  } catch {
    return notAnArchive()
  }
}
