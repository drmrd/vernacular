import type { AssetCache } from './asset-cache'
import type { DirectoryPort } from './fs/directory-port'

export const ASSET_DIRECTORY_PREFIX = 'assets'

/** The path of an asset in the shared pool, relative to the pool's root directory. */
export function assetPathFor(contentHash: string): string {
  return `${ASSET_DIRECTORY_PREFIX}/${contentHash}`
}

export class DirectoryAssetCache implements AssetCache {
  constructor(private readonly directory: DirectoryPort) {}

  /**
   * Asks whether a file is there. It asks the port for the time of the last change and does not
   * ask for the content; what that costs depends on the port.
   */
  async has(contentHash: string): Promise<boolean> {
    return (await this.directory.modifiedAt(assetPathFor(contentHash))) !== undefined
  }

  async get(contentHash: string): Promise<Uint8Array | undefined> {
    return this.directory.readFile(assetPathFor(contentHash))
  }

  async put(contentHash: string, bytes: Uint8Array): Promise<void> {
    await this.directory.writeFile(assetPathFor(contentHash), bytes)
  }
}
