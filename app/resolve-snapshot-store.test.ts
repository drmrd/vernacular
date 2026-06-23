// @vitest-environment node
// Pure resolver logic; node aligns TextEncoder/Uint8Array realms with the
// snapshot serialization the returned port performs.
import { describe, expect, it } from 'vitest'
import { createEmptyProject, type Project } from '../core'
import type { StorageCapabilities } from '../storage'
import { InMemoryDirectory } from '../storage'
import type { SnapshotsPort } from './app'
import { resolveSnapshotStore } from './resolve-snapshot-store'

const AUTOSAVE_DIRECTORY = '.house-autosave'

function project(): Project {
  return createEmptyProject({
    name: 'Snap',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

function capabilities(overrides: Partial<StorageCapabilities>): StorageCapabilities {
  return {
    opfs: false,
    indexedDb: false,
    fileSystemAccess: false,
    persisted: false,
    estimatedQuotaBytes: null,
    ...overrides,
  }
}

/**
 * Dependency seam mirroring how `probeStorageCapabilities` injects its host: the
 * resolver consults a capability probe and an OPFS-usability check, and roots the
 * snapshot store at an injected OPFS root directory rather than real navigator.storage.
 */
function deps(args: {
  capabilities: StorageCapabilities
  opfsUsable: boolean
  root: InMemoryDirectory
}) {
  return {
    probe: () => Promise.resolve(args.capabilities),
    opfsUsable: () => Promise.resolve(args.opfsUsable),
    rootDirectory: () => Promise.resolve(args.root),
  }
}

describe('resolveSnapshotStore', () => {
  it('returns a snapshot port rooted at the project subdirectory when OPFS is the chosen backend', async () => {
    const root = new InMemoryDirectory()

    const snapshots: SnapshotsPort | undefined = await resolveSnapshotStore(
      'proj-1',
      deps({ capabilities: capabilities({ opfs: true, indexedDb: true }), opfsUsable: true, root }),
    )

    expect(snapshots).toBeDefined()
    await snapshots?.writeSnapshot(project())

    expect(await root.list(`proj-1/${AUTOSAVE_DIRECTORY}`)).toContain('session-start.json')
  })

  it('returns undefined on the IndexedDB fallback because there is no durable directory for snapshots', async () => {
    const root = new InMemoryDirectory()

    const snapshots = await resolveSnapshotStore(
      'proj-1',
      deps({
        capabilities: capabilities({ opfs: false, indexedDb: true }),
        opfsUsable: false,
        root,
      }),
    )

    expect(snapshots).toBeUndefined()
  })
})
