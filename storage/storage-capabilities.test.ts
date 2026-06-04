import { describe, expect, it } from 'vitest'
import {
  isStorageDegraded,
  probeStorageCapabilities,
  type StorageCapabilities,
  type StorageProbeHost,
} from './storage-capabilities'

function capableHost(): StorageProbeHost {
  return {
    navigator: {
      storage: {
        getDirectory: () => Promise.resolve({}),
        persisted: () => Promise.resolve(true),
        estimate: () => Promise.resolve({ quota: 5_000_000 }),
      },
    },
    indexedDB: {},
    showDirectoryPicker: () => Promise.resolve({}),
  }
}

function capabilities(overrides: Partial<StorageCapabilities> = {}): StorageCapabilities {
  return {
    opfs: false,
    indexedDb: false,
    fileSystemAccess: false,
    persisted: false,
    estimatedQuotaBytes: null,
    ...overrides,
  }
}

describe('probeStorageCapabilities', () => {
  it('reports every primitive present on a fully capable host', async () => {
    const capabilities = await probeStorageCapabilities(capableHost())

    expect(capabilities).toEqual({
      opfs: true,
      indexedDb: true,
      fileSystemAccess: true,
      persisted: true,
      estimatedQuotaBytes: 5_000_000,
    })
  })

  it('reports every primitive absent on an empty host', async () => {
    const capabilities = await probeStorageCapabilities({})

    expect(capabilities).toEqual({
      opfs: false,
      indexedDb: false,
      fileSystemAccess: false,
      persisted: false,
      estimatedQuotaBytes: null,
    })
  })

  it('falls back to safe defaults when persisted() and estimate() reject', async () => {
    const host: StorageProbeHost = {
      navigator: {
        storage: {
          getDirectory: () => Promise.resolve({}),
          persisted: () => Promise.reject(new Error('blocked')),
          estimate: () => Promise.reject(new Error('blocked')),
        },
      },
      indexedDB: {},
    }

    const capabilities = await probeStorageCapabilities(host)

    expect(capabilities.opfs).toBe(true)
    expect(capabilities.indexedDb).toBe(true)
    expect(capabilities.persisted).toBe(false)
    expect(capabilities.estimatedQuotaBytes).toBeNull()
  })
})

describe('isStorageDegraded', () => {
  it('is true when neither OPFS nor IndexedDB is available', () => {
    expect(isStorageDegraded(capabilities())).toBe(true)
  })

  it('is false when OPFS is available', () => {
    expect(isStorageDegraded(capabilities({ opfs: true }))).toBe(false)
  })

  it('is false when IndexedDB is available', () => {
    expect(isStorageDegraded(capabilities({ indexedDb: true }))).toBe(false)
  })
})
