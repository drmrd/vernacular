import type { AssetCache } from '../asset-cache'
import type { DirectoryPort } from '../fs/directory-port'

/**
 * Where projects live as bytes. A store of this kind moves bytes; it does not
 * parse, migrate, graft, or validate them.
 */
export interface ProjectFiles {
  /** True when the bytes survive a reload of the page. */
  readonly durable: boolean
  /** The ids that hold a document file. Never reads the file. */
  ids(): Promise<string[]>
  /**
   * Whether this store can hold a project under the id. A read of an id it does not hold finds
   * nothing; a write to one is refused by `projectDirectory`, which throws.
   */
  holds(id: string): boolean
  /** One project's directory: vernacular.json, .house-backups/, .house-autosave/. */
  projectDirectory(id: string): DirectoryPort
  /** The asset cache that this project reads and writes. */
  assetsFor(id: string): AssetCache
  /**
   * Makes the project's own asset store hold the given assets, reading from wherever else this
   * kind of store can reach. A kind with nothing to copy from does nothing. Rejects with the
   * error of the first failed read or write; a save calls this before it writes anything.
   */
  prepareAssets(id: string, contentHashes: readonly string[]): Promise<void>
}

/** Project files that can also delete a whole project. */
export interface RemovableProjectFiles extends ProjectFiles {
  /** Removes every file of the project and leaves no empty directory. */
  remove(id: string): Promise<void>
}
