import type { AssetCache } from '../asset-cache'
import { isContentHash } from '../zip/archive-layout'

/**
 * Whether the pool holds the asset afterward. A value that is no content hash is never sent to the
 * pool, since a path segment such as `..` or an empty name makes a directory pool throw. The pool
 * gets a copy of the bytes: a supplied asset may be a view into the whole imported file, and a pool
 * that keeps the view would keep that file alive.
 */
async function copyOne(
  pool: AssetCache,
  supplied: ReadonlyMap<string, Uint8Array>,
  hash: string,
): Promise<boolean> {
  if (!isContentHash(hash)) {
    return false
  }
  try {
    if (await pool.has(hash)) {
      return true
    }
    const bytes = supplied.get(hash)
    if (bytes === undefined) {
      return false
    }
    await pool.put(hash, bytes.slice())
    return true
  } catch (error) {
    console.warn('An imported asset could not be stored.', hash, error)
    return false
  }
}

/**
 * Copies into the pool each needed asset that the pool lacks and the file supplied, one after the
 * other, and gives the needed hashes that the pool still lacks, in the order of `needed`. An asset
 * that the document does not need is never written, and an entry of the pool is never replaced.
 * The promise never rejects.
 */
export async function copyImportedAssets(
  pool: AssetCache,
  supplied: ReadonlyMap<string, Uint8Array>,
  needed: readonly unknown[],
): Promise<string[]> {
  const missing: string[] = []
  for (const hash of needed) {
    if (typeof hash !== 'string') {
      continue
    }
    if (!(await copyOne(pool, supplied, hash))) {
      missing.push(hash)
    }
  }
  return missing
}
