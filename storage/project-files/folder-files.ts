import type { AssetCache } from '../asset-cache'
import { DirectoryAssetCache } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { PROJECT_FILE } from '../folder/folder-project-store'
import type { ProjectFiles } from './project-files'

/** Reads the folder first and falls back to the shared pool; writes only to the folder. */
class FolderAssetCache implements AssetCache {
  constructor(
    private readonly local: AssetCache,
    private readonly shared: AssetCache | undefined,
  ) {}

  has(contentHash: string): Promise<boolean> {
    return this.local.has(contentHash)
  }

  async get(contentHash: string): Promise<Uint8Array | undefined> {
    const local = await this.local.get(contentHash)
    if (local !== undefined || this.shared === undefined) {
      return local
    }
    return this.shared.get(contentHash)
  }

  put(contentHash: string, bytes: Uint8Array): Promise<void> {
    return this.local.put(contentHash, bytes)
  }
}

/**
 * One project at the root of a folder: its document is `vernacular.json` there.
 * The folder carries its own assets; an optional shared pool backs reads.
 */
export class FolderFiles implements ProjectFiles {
  readonly durable: boolean
  private readonly assets: AssetCache

  constructor(
    private readonly id: string,
    private readonly folder: DirectoryPort,
    options: { durable: boolean; shared?: AssetCache },
  ) {
    this.durable = options.durable
    this.assets = new FolderAssetCache(new DirectoryAssetCache(folder), options.shared)
  }

  async ids(): Promise<string[]> {
    const names = await this.folder.list('')
    return names.includes(PROJECT_FILE) ? [this.id] : []
  }

  projectDirectory(id: string): DirectoryPort {
    this.requireOwnId(id)
    return this.folder
  }

  assetsFor(id: string): AssetCache {
    this.requireOwnId(id)
    return this.assets
  }

  private requireOwnId(id: string): void {
    if (id !== this.id) {
      throw new Error(`This folder holds project "${this.id}", not "${id}".`)
    }
  }
}
