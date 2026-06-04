/**
 * Subset of the platform `StorageManager` we feature-detect against. Each member
 * is optional so a partial or mocked host can be probed without casting.
 */
interface StorageManagerLike {
  getDirectory?: unknown
  persist?: unknown
  persisted?: () => Promise<boolean>
  estimate?: () => Promise<{ quota?: number }>
}

/**
 * Host object that capability probing reads from. Defaults to `globalThis` but is
 * injectable so tests can supply a fabricated environment.
 */
export interface StorageProbeHost {
  navigator?: { storage?: StorageManagerLike }
  indexedDB?: unknown
  showDirectoryPicker?: unknown
}

/**
 * Flattened record describing which durable-storage features the host supports.
 */
export interface StorageCapabilities {
  opfs: boolean
  indexedDb: boolean
  fileSystemAccess: boolean
  persisted: boolean
  estimatedQuotaBytes: number | null
}

/** Resolve whether storage has been granted persistence, defaulting to false. */
async function readPersisted(storage: StorageManagerLike | undefined): Promise<boolean> {
  if (typeof storage?.persisted !== 'function') {
    return false
  }
  return storage.persisted()
}

/** Resolve the estimated quota in bytes, or null when it is unavailable. */
async function readEstimatedQuotaBytes(
  storage: StorageManagerLike | undefined,
): Promise<number | null> {
  if (typeof storage?.estimate !== 'function') {
    return null
  }
  const estimate = await storage.estimate()
  return estimate.quota ?? null
}

/**
 * Perform dependency-injected feature detection over `host` and resolve to a plain
 * `StorageCapabilities` record. Reads are direct; rejection resilience lands later.
 */
export async function probeStorageCapabilities(
  // `globalThis` is structurally a superset of `StorageProbeHost`; the cast lets
  // the default host stand in without widening the parameter type.
  host: StorageProbeHost = globalThis as StorageProbeHost,
): Promise<StorageCapabilities> {
  const storage = host.navigator?.storage
  return {
    opfs: typeof storage?.getDirectory === 'function',
    indexedDb: host.indexedDB !== undefined,
    fileSystemAccess: typeof host.showDirectoryPicker === 'function',
    persisted: await readPersisted(storage),
    estimatedQuotaBytes: await readEstimatedQuotaBytes(storage),
  }
}
