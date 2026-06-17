import {
  AssetRegistry,
  IndexedDbUserLibraryIndex,
  PackSource,
  UserSource,
  createFetchPackReader,
  type AssetCache,
} from '../storage'

// The bundled starter pack, served as static files from the public directory.
const STARTER_PACK_URL = '/packs/vernacular-starter-1.0.0'

export interface AssetLibrary {
  registry: AssetRegistry
  userSource: UserSource
}

/**
 * Assembles the in-app asset library at boot: a user source backed by the project
 * content cache and an IndexedDB metadata index, plus the bundled starter pack
 * read over fetch. The user source takes precedence over the pack, so a user's own
 * import of an asset shadows a pack asset with the same hash. The user source is
 * returned alongside the registry so the import action can store new GLBs into it.
 * Boot wiring over IndexedDB and fetch; exercised end-to-end, not in unit tests.
 */
export function createAssetLibrary(assets: AssetCache): AssetLibrary {
  const userSource = new UserSource(assets, new IndexedDbUserLibraryIndex())
  const packReader = createFetchPackReader(STARTER_PACK_URL, globalThis.fetch.bind(globalThis))
  const registry = new AssetRegistry([
    { kind: 'user', source: userSource },
    { kind: 'pack', source: new PackSource(packReader) },
  ])
  return { registry, userSource }
}
