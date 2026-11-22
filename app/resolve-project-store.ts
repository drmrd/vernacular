import {
  createDefaultProjectStorage,
  createOpfsProjectStorage,
  isStorageDegraded,
  opfsUsable,
  probeStorageCapabilities,
  selectProjectStoreBackend,
  type ProjectStorage,
} from '../storage'

/**
 * Probe storage capabilities once and construct the durable {store, assets} pair
 * the app should boot against: the OPFS store paired with a directory-backed
 * asset cache when available and usable, otherwise the IndexedDB default paired
 * with an in-memory cache. The file-system-folder and zip-bundle backends need a
 * user gesture, so they are not constructed at default boot; an unexpected backend
 * value falls back to the default. The selection decision
 * lives in the pure `selectProjectStoreBackend`; this seam only constructs the
 * chosen pair (ADR-0042). A host with neither OPFS nor IndexedDB has nothing durable to
 * construct, so the lookup rejects.
 */
export async function resolveProjectStorage(): Promise<ProjectStorage> {
  const capabilities = await probeStorageCapabilities()
  if (isStorageDegraded(capabilities)) {
    throw new Error('This browser offers neither the origin private file system nor IndexedDB.')
  }
  if (selectProjectStoreBackend(capabilities) === 'opfs' && (await opfsUsable())) {
    return createOpfsProjectStorage()
  }
  return createDefaultProjectStorage()
}
