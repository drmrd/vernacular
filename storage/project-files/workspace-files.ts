import type { AssetCache } from '../asset-cache'
import { ASSET_DIRECTORY_PREFIX, assetPathFor, DirectoryAssetCache } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { SubdirectoryPort } from '../fs/subdirectory-port'
import { isContentHash } from '../zip/archive-layout'
import { assertProjectId } from './project-id-guard'
import { PROJECT_FILE } from './project-file-name'
import type { RemovableProjectFiles } from './project-files'

/**
 * Many projects in one root: each project lives in a directory named by its id,
 * and one asset pool at `assets/` is shared by all of them.
 */
export class WorkspaceFiles implements RemovableProjectFiles {
  readonly durable: boolean
  private readonly sharedAssets: AssetCache

  constructor(
    private readonly root: DirectoryPort,
    options: { durable: boolean },
  ) {
    this.durable = options.durable
    this.sharedAssets = new DirectoryAssetCache(root)
  }

  async ids(): Promise<string[]> {
    const names = await this.root.list('')
    const candidates = names.filter((name) => name !== ASSET_DIRECTORY_PREFIX)
    const documentFlags = await Promise.all(
      candidates.map(async (name) => (await this.root.list(name)).includes(PROJECT_FILE)),
    )
    return candidates.filter((_name, index) => documentFlags[index]).sort()
  }

  /**
   * True for every id, as a workspace is one root for all projects. An id that cannot name a
   * project directory (empty, with a slash, a dot segment, the name of the asset pool) is still
   * refused with `InvalidProjectIdError` when `projectDirectory` is asked for it.
   */
  holds(_id: string): boolean {
    void _id
    return true
  }

  projectDirectory(id: string): DirectoryPort {
    assertProjectId(id)
    return new SubdirectoryPort(this.root, id)
  }

  /** The shared pool, whichever project asks. */
  assetsFor(_id: string): AssetCache {
    void _id
    return this.sharedAssets
  }

  /** Nothing to copy: the shared pool is the only pool. */
  async prepareAssets(): Promise<void> {
    // Intentionally empty: the interface passes an id and hashes, which a workspace has no use for.
  }

  async remove(id: string): Promise<void> {
    assertProjectId(id)
    await this.root.removeTree(id)
  }

  async removeAssets(contentHashes: readonly string[]): Promise<void> {
    for (const contentHash of contentHashes) {
      if (isContentHash(contentHash)) {
        await this.root.removeFile(assetPathFor(contentHash))
      }
    }
  }
}
