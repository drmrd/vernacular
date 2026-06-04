import { describe, expect, it } from 'vitest'
import { probeStorageCapabilities, type StorageProbeHost } from './storage-capabilities'

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
})
