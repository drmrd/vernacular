import type { ProjectStore } from './project-store'
import type { AssetCache } from './asset-cache'
import { OpfsProjectStore } from './opfs/opfs-project-store'
import { FileSystemDirectory } from './fs/file-system-directory'
import { DirectoryAssetCache } from './directory-asset-cache'
import { IndexedDbDirectory } from './indexeddb/indexeddb-directory'
import {
  DEFAULT_PROJECT_DATABASE_NAME,
  IndexedDbProjectStore,
} from './indexeddb/indexeddb-project-store'

/**
 * A durable project store paired with the asset cache that backs it. Resolved
 * once at boot so the editor saves the project document and its content-addressed
 * assets (underlay rasters) to the same place. See ADR-0042.
 */
export interface ProjectStorage {
  store: ProjectStore
  assets: AssetCache
}

/**
 * Build the OPFS-backed pair from one origin-private-file-system directory: the
 * OpfsProjectStore writes each project under its id-named subdirectory, and a
 * DirectoryAssetCache over the same root stores asset bytes at `assets/<hash>`,
 * a sibling of the per-project folders so identical rasters deduplicate across
 * projects in the store.
 */
export async function createOpfsProjectStorage(): Promise<ProjectStorage> {
  const directory = new FileSystemDirectory(await navigator.storage.getDirectory())
  return {
    store: new OpfsProjectStore(directory),
    assets: new DirectoryAssetCache(directory),
  }
}

/**
 * The default pair for hosts without OPFS: one IndexedDB directory serves both the IndexedDB
 * project store and a DirectoryAssetCache, so asset bytes sit in the shared pool at `assets/`
 * and survive a reload, as they do on the OPFS backend (ADR-0042).
 */
export function createDefaultProjectStorage(): ProjectStorage {
  const directory = new IndexedDbDirectory(DEFAULT_PROJECT_DATABASE_NAME)
  return {
    store: new IndexedDbProjectStore(directory),
    assets: new DirectoryAssetCache(directory),
  }
}
