import type { AssetCache } from './asset-cache'
import type { DirectoryPort } from './fs/directory-port'

export const ASSET_DIRECTORY_PREFIX = 'assets'

export class DirectoryAssetCache implements AssetCache {
  constructor(private readonly directory: DirectoryPort) {}

  /**
   * Asks whether a file is there. It asks the port for the time of the last change and does not
   * ask for the content; what that costs depends on the port.
   */
  async has(contentHash: string): Promise<boolean> {
    return (await this.directory.modifiedAt(this.pathFor(contentHash))) !== undefined
  }

  async get(contentHash: string): Promise<Uint8Array | undefined> {
    return this.directory.readFile(this.pathFor(contentHash))
  }

  async put(contentHash: string, bytes: Uint8Array): Promise<void> {
    await this.directory.writeFile(this.pathFor(contentHash), bytes)
  }

  private pathFor(contentHash: string): string {
    return `${ASSET_DIRECTORY_PREFIX}/${contentHash}`
  }
}
