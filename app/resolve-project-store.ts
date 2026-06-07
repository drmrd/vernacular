import {
  createDefaultProjectStore,
  createOpfsProjectStore,
  probeStorageCapabilities,
  selectProjectStoreBackend,
  type ProjectStore,
} from '../storage'

/**
 * Probe storage capabilities once and construct the durable ProjectStore the app
 * should boot against: OPFS when available, otherwise the IndexedDB default. The
 * file-system-folder and zip-bundle backends need a user gesture, so they are not
 * constructed at default boot; an unexpected value also falls back to the default
 * so boot never fails. The selection decision lives in the pure
 * `selectProjectStoreBackend`; this seam only constructs the chosen store.
 */
export async function resolveProjectStore(): Promise<ProjectStore> {
  const capabilities = await probeStorageCapabilities()
  if (selectProjectStoreBackend(capabilities) === 'opfs') {
    return createOpfsProjectStore()
  }
  return createDefaultProjectStore()
}
