import type { AssetCache } from '../asset-cache'
import { ASSET_DIRECTORY_PREFIX, DirectoryAssetCache } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { SubdirectoryPort } from '../fs/subdirectory-port'
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
  async prepareAssets(_id: string, _contentHashes: readonly string[]): Promise<void> {
    void _id
    void _contentHashes
  }

  async remove(id: string): Promise<void> {
    assertProjectId(id)
    await this.root.removeTree(id)
  }
}
