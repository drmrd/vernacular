import type { ProjectStore } from './project-store'
import type { AssetCache } from './asset-cache'
import { OpfsProjectStore } from './opfs/opfs-project-store'
import { FileSystemDirectory } from './fs/file-system-directory'
import { DirectoryAssetCache } from './directory-asset-cache'
import { InMemoryAssetCache } from './in-memory-asset-cache'
import { createDefaultProjectStore } from './indexeddb/indexeddb-project-store'

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
 * The default pair for hosts without OPFS: the IndexedDB project store paired
 * with an in-memory asset cache. Underlay rasters do not survive reload on this
 * backend; a durable IndexedDB-backed AssetCache is the near-term follow-up
 * (ADR-0042).
 */
export function createDefaultProjectStorage(): ProjectStorage {
  return {
    store: createDefaultProjectStore(),
    assets: new InMemoryAssetCache(),
  }
}
