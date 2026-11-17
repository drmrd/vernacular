import { DocumentStore } from '../documents/document-store'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import type { DirectoryPort } from '../fs/directory-port'
import { FolderFiles } from '../project-files/folder-files'
import { zipFolder, unzipFolder, type FolderEntries } from './zip-codec'
import type { AssetCache } from '../asset-cache'
import { DirectoryAssetCache } from '../directory-asset-cache'

/** Collect every file path stored under a directory, descending into subdirectories. */
async function collectFilePaths(directory: DirectoryPort, prefix: string): Promise<string[]> {
  const paths: string[] = []
  for (const segment of await directory.list(prefix)) {
    const childPath = prefix === '' ? segment : `${prefix}/${segment}`
    const children = await directory.list(childPath)
    if (children.length === 0) {
      paths.push(childPath)
    } else {
      paths.push(...(await collectFilePaths(directory, childPath)))
    }
  }
  return paths
}

/**
 * Single-project store bound to one id, backed by an in-memory expansion of a .building bundle.
 * It is the document store over the bundle's directory, which holds one project at its root;
 * exportBundle repacks the current directory contents into bundle bytes.
 */
export class ZipBundleProjectStore extends DocumentStore {
  constructor(
    bundleId: string,
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

  async exportBundle(): Promise<Uint8Array> {
    const entries: FolderEntries = new Map()
    for (const path of await collectFilePaths(this.directory, '')) {
      const content = await this.directory.readFile(path)
      if (content !== undefined) {
        entries.set(path, content)
      }
    }
    return zipFolder(entries)
  }
}
