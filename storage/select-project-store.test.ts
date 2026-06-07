import { describe, expect, it } from 'vitest'
import { selectProjectStoreBackend, type ProjectStoreBackend } from './select-project-store'
import type { StorageCapabilities } from './storage-capabilities'

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

describe('selectProjectStoreBackend', () => {
  it('selects OPFS on an OPFS-capable host when no preference is given', () => {
    const backend: ProjectStoreBackend = selectProjectStoreBackend(
      capabilities({ opfs: true, indexedDb: true }),
    )

    expect(backend).toBe('opfs')
  })

  it('selects IndexedDB on an OPFS-absent IndexedDB-only host when no preference is given', () => {
    const backend = selectProjectStoreBackend(capabilities({ opfs: false, indexedDb: true }))

    expect(backend).toBe('indexeddb')
  })

  it('honors a file-system-folder preference on a File-System-Access-capable host', () => {
    const backend = selectProjectStoreBackend(
      capabilities({ opfs: true, fileSystemAccess: true }),
      { preferred: 'file-system-folder' },
    )

    expect(backend).toBe('file-system-folder')
  })

  it('falls back to the capability order when a file-system-folder preference is unsupported', () => {
    const backend = selectProjectStoreBackend(
      capabilities({ opfs: true, fileSystemAccess: false }),
      { preferred: 'file-system-folder' },
    )

    expect(backend).toBe('opfs')
  })

  it('honors a zip-bundle preference regardless of capabilities', () => {
    const backend = selectProjectStoreBackend(capabilities(), { preferred: 'zip-bundle' })

    expect(backend).toBe('zip-bundle')
  })

  it('selects OPFS as the universal target on a degraded host with no durable backend', () => {
    const backend = selectProjectStoreBackend(
      capabilities({ opfs: false, indexedDb: false, fileSystemAccess: false }),
    )

    expect(backend).toBe('opfs')
  })
})
