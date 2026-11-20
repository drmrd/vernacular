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
