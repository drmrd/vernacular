import {
  createDefaultProjectStorage,
  createOpfsProjectStorage,
  probeStorageCapabilities,
  selectProjectStoreBackend,
  type ProjectStorage,
} from '../storage'

/**
 * Probe storage capabilities once and construct the durable {store, assets} pair
 * the app should boot against: the OPFS store paired with a directory-backed
 * asset cache when available, otherwise the IndexedDB default paired with an
 * in-memory cache. The file-system-folder and zip-bundle backends need a user
 * gesture, so they are not constructed at default boot; an unexpected value also
 * falls back to the default so boot never fails. The selection decision lives in
 * the pure `selectProjectStoreBackend`; this seam only constructs the chosen pair
 * (ADR-0042).
 */
export async function resolveProjectStorage(): Promise<ProjectStorage> {
  const capabilities = await probeStorageCapabilities()
  if (selectProjectStoreBackend(capabilities) === 'opfs') {
    return createOpfsProjectStorage()
  }
  return createDefaultProjectStorage()
}
