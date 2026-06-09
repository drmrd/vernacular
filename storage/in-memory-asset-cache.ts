import type { AssetCache } from './asset-cache'

/**
 * Map-backed AssetCache for tests and the not-yet-wired app shell. Durable
 * implementations (filesystem, OPFS) land with the asset-persistence work.
 * Bytes are copied on put so callers cannot mutate stored state.
 */
export class InMemoryAssetCache implements AssetCache {
  private readonly assets = new Map<string, Uint8Array>()

  async has(contentHash: string): Promise<boolean> {
    return this.assets.has(contentHash)
  }

  async get(contentHash: string): Promise<Uint8Array | undefined> {
    return this.assets.get(contentHash)
  }

  async put(contentHash: string, bytes: Uint8Array): Promise<void> {
    this.assets.set(contentHash, bytes.slice())
  }
}
