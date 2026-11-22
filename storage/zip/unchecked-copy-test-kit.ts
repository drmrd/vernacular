import { CURRENT_SCHEMA_VERSION } from '../../core'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { unzipFolder } from './zip-codec'

const encoder = new TextEncoder()
const CONTENT_HASH_LENGTH = 64

export const DOCUMENT = encoder.encode('{"meta":{"name":"Elm Street"},"floors":[]}')
export const FIRST = 'a'.repeat(CONTENT_HASH_LENGTH)
export const SECOND = 'b'.repeat(CONTENT_HASH_LENGTH)
export const THIRD = 'c'.repeat(CONTENT_HASH_LENGTH)
export const FIRST_BYTES = encoder.encode('the first model')
export const SECOND_BYTES = encoder.encode('the second model')
export const AUTOSAVE_SNAPSHOT = 'session-start.json'
export const NEWEST_BACKUP = 'newest.json'

const SNAPSHOT_BYTES = encoder.encode('a snapshot')
const BACKUP_BYTES = encoder.encode('a backup')

export type Files = Map<string, Uint8Array>

/** The files of a project folder: its document, one snapshot, and one backup. */
export function projectFiles(document: Uint8Array = DOCUMENT): Files {
  return new Map([
    ['vernacular.json', document],
    [`.house-autosave/${AUTOSAVE_SNAPSHOT}`, SNAPSHOT_BYTES],
    [`.house-backups/${NEWEST_BACKUP}`, BACKUP_BYTES],
  ])
}

/** A pool that holds the given bytes under the given hashes. */
export async function poolHolding(held: ReadonlyArray<readonly [string, Uint8Array]>) {
  const pool = new InMemoryAssetCache()
  for (const [hash, bytes] of held) await pool.put(hash, bytes)
  return pool
}

/** The entries of a copy, as the archive holds them. */
export function entriesOf(copy: { readonly bytes: Uint8Array }): Files {
  return unzipFolder(copy.bytes)
}

export function assetNames(entries: Files): string[] {
  return [...entries.keys()].filter((name) => name.startsWith('assets/')).sort()
}

/** The text of a furniture entry that names the asset `contentHash`. */
function furnitureNaming(contentHash: string): string {
  return `{"assetRef":{"scope":"user","contentHash":"${contentHash}"}}`
}

/** The floors of a stored document, each with one piece of furniture for each hash. */
function floorsNaming(contentHashes: readonly string[]): string {
  return `"floors":[{"furniture":[${contentHashes.map(furnitureNaming).join(',')}]}]`
}

/** A stored document of the given schema version that names each hash as the asset of a piece of furniture. */
export function documentNaming(
  contentHashes: readonly string[],
  schemaVersion = CURRENT_SCHEMA_VERSION,
): Uint8Array {
  const meta = `"meta":{"name":"Elm Street","schemaVersion":${schemaVersion}}`
  return encoder.encode(`{${meta},${floorsNaming(contentHashes)}}`)
}

/** JSON that is no project (it has no meta) but names each hash where a document names its assets. */
export function noProjectNaming(contentHashes: readonly string[]): Uint8Array {
  return encoder.encode(`{${floorsNaming(contentHashes)}}`)
}
