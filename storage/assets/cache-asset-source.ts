import type { AssetCache } from '../asset-cache'
import type { AssetSource } from './asset-source'

/**
 * Adapts the content-hash-keyed AssetCache (the minimal cache that already
 * shipped) into an AssetSource so the cache participates in resolution as one
 * source among several. The cache's `get` already returns owned copies, so no
 * extra copy is made here.
 */
export class CacheAssetSource implements AssetSource {
  constructor(
    readonly id: string,
    private readonly cache: AssetCache,
  ) {}

  read(contentHash: string): Promise<Uint8Array | undefined> {
    return this.cache.get(contentHash)
  }
}
