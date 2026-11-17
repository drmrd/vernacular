import type { AssetCache } from '../asset-cache'
import { ASSET_DIRECTORY_PREFIX, DirectoryAssetCache } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { SubdirectoryPort } from '../fs/subdirectory-port'
import { PROJECT_FILE } from '../folder/folder-project-store'
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
    return new SubdirectoryPort(this.root, id)
  }

  /** The shared pool, whichever project asks. */
  readonly assetsFor: (id: string) => AssetCache = () => this.sharedAssets

  async remove(id: string): Promise<void> {
    await this.removeTree(id)
  }

  private async removeTree(path: string): Promise<void> {
    const children = await this.root.list(path)
    if (children.length === 0) {
      await this.root.removeFile(path)
      return
    }
    await Promise.all(children.map((child) => this.removeTree(`${path}/${child}`)))
  }
}
