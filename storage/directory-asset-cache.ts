import type { AssetCache } from './asset-cache'
import type { DirectoryPort } from './fs/directory-port'

export const ASSET_DIRECTORY_PREFIX = 'assets'

export class DirectoryAssetCache implements AssetCache {
  constructor(private readonly directory: DirectoryPort) {}

  async has(contentHash: string): Promise<boolean> {
    return (await this.directory.readFile(this.pathFor(contentHash))) !== undefined
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
