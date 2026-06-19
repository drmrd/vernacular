import {
  probeStorageCapabilities,
  selectProjectStoreBackend,
  SnapshotStore,
  SubdirectoryPort,
  type DirectoryPort,
  type StorageCapabilities,
} from '../storage'
import type { SnapshotsPort } from './app'
import { opfsRootDirectory, opfsUsable } from './opfs-probe'

/**
 * Injection seam for {@link resolveSnapshotStore}. Each dependency defaults to
 * the production implementation, mirroring how `probeStorageCapabilities`
 * injects its host, so a unit test can drive the resolver against fakes without
 * a real `navigator.storage`.
 */
export interface ResolveSnapshotStoreDeps {
  probe?: () => Promise<StorageCapabilities>
  opfsUsable?: () => Promise<boolean>
  rootDirectory?: () => Promise<DirectoryPort>
}

/**
 * Construct the crash-recovery snapshot store for a project, but only when OPFS
 * is the chosen backend. Snapshots live in a `.house-autosave/` sidecar beside
 * the project's `vernacular.json`, so they need the durable OPFS directory the
 * project itself is rooted in (ADR-0042). On the IndexedDB fallback there is no
 * durable directory for the sidecar, so the resolver returns `undefined` and
 * recovery stays off there. The selection decision uses the same OPFS gate as
 * `resolveProjectStorage`.
 */
export async function resolveSnapshotStore(
  projectId: string,
  deps: ResolveSnapshotStoreDeps = {},
): Promise<SnapshotsPort | undefined> {
  const probe = deps.probe ?? probeStorageCapabilities
  const usable = deps.opfsUsable ?? opfsUsable
  const rootDirectory = deps.rootDirectory ?? opfsRootDirectory

  const capabilities = await probe()
  if (selectProjectStoreBackend(capabilities) === 'opfs' && (await usable())) {
    const root = await rootDirectory()
    return new SnapshotStore(new SubdirectoryPort(root, projectId))
  }
  return undefined
}
