import { DocumentStore } from '../documents/document-store'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import type { DirectoryPort } from '../fs/directory-port'
import { FolderFiles } from '../project-files/folder-files'
import { zipFolder, unzipFolder, type FolderEntries } from './zip-codec'
import type { AssetCache } from '../asset-cache'
import { DirectoryAssetCache } from '../directory-asset-cache'
import { isSidecarPath } from './sidecar-paths'

/**
 * Single-project store bound to one id, backed by an in-memory expansion of a .building bundle.
 * It is the document store over the bundle's directory, which holds one project at its root;
 * exportBundle repacks the document and its assets into bundle bytes.
 */
export class ZipBundleProjectStore extends DocumentStore {
  constructor(
    private readonly bundleId: string,
    private readonly directory: DirectoryPort = new InMemoryDirectory(),
  ) {
    super(new FolderFiles(bundleId, directory, { durable: false }))
  }

  static async fromBundle(id: string, bytes: Uint8Array): Promise<ZipBundleProjectStore> {
    const entries = unzipFolder(bytes)
    const directory = new InMemoryDirectory()
    for (const [path, content] of entries) {
      await directory.writeFile(path, content)
    }
    return new ZipBundleProjectStore(id, directory)
  }

  assetCache(): AssetCache {
    return new DirectoryAssetCache(this.directory)
  }

  /**
   * Packs the document and its assets. The backups and the recovery snapshots are sidecars that
   * an export leaves out; nothing is removed from the store's directory.
   */
  async exportBundle(): Promise<Uint8Array> {
    const entries: FolderEntries = new Map()
    for (const [path, content] of await this.storedFiles(this.bundleId)) {
      if (!isSidecarPath(path)) {
        entries.set(path, content)
      }
    }
    return zipFolder(entries)
  }
}
