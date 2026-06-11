import type { AssetSource } from './asset-source'

/** Map-backed AssetSource for tests and the not-yet-wired shell. */
export class InMemoryAssetSource implements AssetSource {
  private readonly assets = new Map<string, Uint8Array>()

  constructor(
    readonly id: string,
    initial: Readonly<Record<string, Uint8Array>> = {},
  ) {
    for (const [contentHash, bytes] of Object.entries(initial)) {
      this.assets.set(contentHash, bytes.slice())
    }
  }

  async read(contentHash: string): Promise<Uint8Array | undefined> {
    const stored = this.assets.get(contentHash)
    return stored === undefined ? undefined : stored.slice()
  }
}
