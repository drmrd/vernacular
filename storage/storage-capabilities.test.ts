import { describe, expect, it } from 'vitest'
import {
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
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
    const result = await probeStorageCapabilities(capableHost())

    expect(result).toEqual({
      opfs: true,
      indexedDb: true,
      fileSystemAccess: true,
      persisted: true,
      estimatedQuotaBytes: 5_000_000,
    })
  })

  it('reports every primitive absent on an empty host', async () => {
    const result = await probeStorageCapabilities({})

    expect(result).toEqual({
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

    const result = await probeStorageCapabilities(host)

    expect(result.opfs).toBe(true)
    expect(result.indexedDb).toBe(true)
    expect(result.persisted).toBe(false)
    expect(result.estimatedQuotaBytes).toBeNull()
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

describe('summarizeStorageCapabilities', () => {
  it('renders each capability and the quota on one line', () => {
    const summary = summarizeStorageCapabilities(
      capabilities({ opfs: true, indexedDb: true, estimatedQuotaBytes: 5_000_000 }),
    )

    expect(summary).toBe(
      'Storage capabilities: OPFS yes, IndexedDB yes, File System Access no, ' +
        'persisted no, quota 5000000 bytes',
    )
  })

  it('renders an unknown quota when the estimate is null', () => {
    const summary = summarizeStorageCapabilities(capabilities())

    expect(summary).toBe(
      'Storage capabilities: OPFS no, IndexedDB no, File System Access no, ' +
        'persisted no, quota unknown',
    )
  })
})
