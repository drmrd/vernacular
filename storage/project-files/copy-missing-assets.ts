import type { AssetCache } from '../asset-cache'

/**
 * Writes into `assets` each referenced asset that it does not hold yet, reading
 * the bytes through the same cache. A hash that the cache already has is left
 * alone, and a hash that no source can supply is skipped.
 */
export async function copyMissingAssets(
  assets: AssetCache,
  contentHashes: readonly string[],
): Promise<void> {
  for (const contentHash of contentHashes) {
    if (await assets.has(contentHash)) {
      continue
    }
    const bytes = await assets.get(contentHash)
    if (bytes !== undefined) {
      await assets.put(contentHash, bytes)
    }
  }
}
