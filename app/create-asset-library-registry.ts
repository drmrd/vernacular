import {
  AssetRegistry,
  IndexedDbUserLibraryIndex,
  PackSource,
  UserSource,
  createFetchPackReader,
  type AssetCache,
  type AssetSource,
  type ScopedAssetSource,
} from '../storage'

// The bundled starter pack versions, served as static files from the public directory.
const CURRENT_STARTER_PACK_URL = '/packs/vernacular-starter-1.1.0'
const PREVIOUS_STARTER_PACK_URL = '/packs/vernacular-starter-1.0.0'

/**
 * The starter pack sources: the newest version first, listed by the library, then the
 * previous version, which serves bytes for old references but is hidden from listing.
 */
export function createStarterPackSources(fetchFn: typeof fetch): ScopedAssetSource[] {
  const current = new PackSource(createFetchPackReader(CURRENT_STARTER_PACK_URL, fetchFn))
  const previous = new PackSource(createFetchPackReader(PREVIOUS_STARTER_PACK_URL, fetchFn))
  const previousWithoutListing: AssetSource = {
    get id() {
      return previous.id
    },
    read: (contentHash) => previous.read(contentHash),
  }
  return [
    { kind: 'pack', source: current },
    { kind: 'pack', source: previousWithoutListing },
  ]
}

export interface AssetLibrary {
  registry: AssetRegistry
  userSource: UserSource
}

/**
 * Assembles the in-app asset library at boot: a user source backed by the project
 * content cache and an IndexedDB metadata index, plus the bundled starter pack
 * read over fetch. The library lists only the newest starter version; the older
 * version stays readable so references that name it still resolve. The user source
 * takes precedence over the pack, so a user's own
 * import of an asset shadows a pack asset with the same hash. The user source is
 * returned alongside the registry so the import action can store new GLBs into it.
 * Boot wiring over IndexedDB and fetch; exercised end-to-end, not in unit tests.
 */
export function createAssetLibrary(assets: AssetCache): AssetLibrary {
  const userSource = new UserSource(assets, new IndexedDbUserLibraryIndex())
  const registry = new AssetRegistry([
    { kind: 'user', source: userSource },
    ...createStarterPackSources(globalThis.fetch.bind(globalThis)),
  ])
  return { registry, userSource }
}
