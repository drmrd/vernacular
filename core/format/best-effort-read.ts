import { parseDocumentJson } from './codec/document-json'
import { asRecord } from './codec/json-values'

/** The members of an underlay source that can hold an asset reference, whatever its kind says. */
const UNDERLAY_SOURCE_REFERENCES = ['image', 'document', 'scene'] as const

/** The stored document as a plain object, or undefined for bytes that are no JSON object. */
function readStoredRoot(bytes: Uint8Array): Record<string, unknown> | undefined {
  try {
    return asRecord(parseDocumentJson(bytes))
  } catch {
    return undefined
  }
}

function readName(root: Record<string, unknown> | undefined): string | undefined {
  const name = asRecord(root?.meta)?.name
  return typeof name === 'string' ? name : undefined
}

/** The items of a stored list, or none when the value is no array. */
function listItems(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function readContentHash(reference: unknown): string | undefined {
  const hash = asRecord(reference)?.contentHash
  return typeof hash === 'string' ? hash : undefined
}

function collectFloorHashes(floor: unknown): (string | undefined)[] {
  const record = asRecord(floor)
  const furnitureHashes = listItems(record?.furniture).map((item) =>
    readContentHash(asRecord(item)?.assetRef),
  )
  const underlayHashes = listItems(record?.underlays).flatMap((underlay) => {
    const source = asRecord(asRecord(underlay)?.source)
    return UNDERLAY_SOURCE_REFERENCES.map((member) => readContentHash(source?.[member]))
  })
  return [...furnitureHashes, ...underlayHashes]
}

/** Every distinct content hash of the furniture and underlays, ordered by UTF-16 code unit. */
function readAssetHashes(root: Record<string, unknown> | undefined): string[] {
  const hashes = listItems(root?.floors)
    .flatMap(collectFloorHashes)
    .filter((hash): hash is string => hash !== undefined)
  return [...new Set(hashes)].sort()
}

/**
 * The display name of a stored document, read without a migration or a schema check, so a project
 * at a newer version or with an unknown field still has a name. Never throws: bytes that are not a
 * JSON object with an object `meta` holding a string `name` give undefined.
 */
export function bestEffortProjectName(bytes: Uint8Array): string | undefined {
  return readName(readStoredRoot(bytes))
}

/**
 * The name and the asset content hashes of a stored document, read as stored with no migration, no
 * schema check, and no version check. Never throws: a part with another shape is skipped and the
 * rest is kept. `name` is absent unless it is a string; the hashes are distinct and sorted by code
 * unit, and may be incomplete for an old or damaged document.
 */
export function readStoredFacts(bytes: Uint8Array): { name?: string; assetHashes: string[] } {
  const root = readStoredRoot(bytes)
  const name = readName(root)
  const assetHashes = readAssetHashes(root)
  return name === undefined ? { assetHashes } : { name, assetHashes }
}
