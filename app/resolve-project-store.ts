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
 * asset cache when available and usable, otherwise the IndexedDB default paired
 * with an in-memory cache. The file-system-folder and zip-bundle backends need a
 * user gesture, so they are not constructed at default boot; an unexpected value
 * also falls back to the default so boot never fails. The selection decision
 * lives in the pure `selectProjectStoreBackend`; this seam only constructs the
 * chosen pair (ADR-0042).
 */
export async function resolveProjectStorage(): Promise<ProjectStorage> {
  const capabilities = await probeStorageCapabilities()
  if (selectProjectStoreBackend(capabilities) === 'opfs' && (await opfsUsable())) {
    return createOpfsProjectStorage()
  }
  return createDefaultProjectStorage()
}

/**
 * Capability probing only feature-detects the OPFS API surface, but some hosts
 * expose `getDirectory` as a function while rejecting at call time (notably some
 * WebKit builds, which throw an UnknownError). Verify the root directory actually
 * resolves before booting against OPFS so such hosts fall back to IndexedDB rather
 * than failing to open the project.
 */
async function opfsUsable(): Promise<boolean> {
  try {
    await navigator.storage.getDirectory()
    return true
  } catch {
    return false
  }
}
