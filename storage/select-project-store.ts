import type { StorageCapabilities } from './storage-capabilities'
import type { ProjectBackend } from './recent/recent-project-store'

/** The durable backend the running app should construct, before instantiation. */
export type ProjectStoreBackend = 'opfs' | 'indexeddb' | ProjectBackend

export interface SelectProjectStoreOptions {
  /** A remembered per-project backend (from a recent entry), when reopening. */
  preferred?: ProjectBackend
}

/** Report whether the host can construct the given remembered backend. */
function isBackendSupported(backend: ProjectBackend, capabilities: StorageCapabilities): boolean {
  switch (backend) {
    case 'opfs':
      return capabilities.opfs
    case 'file-system-folder':
      return capabilities.fileSystemAccess
    case 'zip-bundle':
      return true
  }
}

/** Pick the durable backend with no remembered preference, OPFS first. */
function defaultBackend(capabilities: StorageCapabilities): ProjectStoreBackend {
  if (capabilities.opfs) {
    return 'opfs'
  }
  if (capabilities.indexedDb) {
    return 'indexeddb'
  }
  return 'opfs'
}

/**
 * Pure rule: pick the durable backend to construct from the detected
 * capabilities and an optional remembered preference. With a `preferred`
 * backend whose capability is present, returns it; otherwise prefers OPFS when
 * available, then IndexedDB, with no third durable fallback (the degraded-storage
 * warning already covers a host that offers neither, ADR-0022). Never throws.
 */
export function selectProjectStoreBackend(
  capabilities: StorageCapabilities,
  options?: SelectProjectStoreOptions,
): ProjectStoreBackend {
  const preferred = options?.preferred
  if (preferred !== undefined && isBackendSupported(preferred, capabilities)) {
    return preferred
  }
  return defaultBackend(capabilities)
}
