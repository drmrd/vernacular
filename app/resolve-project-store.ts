import {
  createDefaultProjectStore,
  createOpfsProjectStore,
  probeStorageCapabilities,
  selectProjectStoreBackend,
  type ProjectStore,
} from '../storage'

/**
 * Probe storage capabilities once and construct the durable ProjectStore the app
 * should boot against: OPFS when available and usable, otherwise the IndexedDB
 * default. The file-system-folder and zip-bundle backends need a user gesture, so
 * they are not constructed at default boot; an unexpected value also falls back to
 * the default so boot never fails. The selection decision lives in the pure
 * `selectProjectStoreBackend`; this seam only constructs the chosen store.
 */
export async function resolveProjectStore(): Promise<ProjectStore> {
  const capabilities = await probeStorageCapabilities()
  if (selectProjectStoreBackend(capabilities) === 'opfs' && (await opfsUsable())) {
    return createOpfsProjectStore()
  }
  return createDefaultProjectStore()
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
