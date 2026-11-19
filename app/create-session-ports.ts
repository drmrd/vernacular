import type { SessionPorts } from '../session'
import {
  BrowserFolderAccess,
  InMemoryAssetCache,
  InMemoryProjectStore,
  WebLocksProjectLockPort,
  type AssetCache,
  type WorkspaceDocumentStore,
} from '../storage'
import { resolveProjectStorage } from './resolve-project-store'

/** The ports of the session layer, with the pool of the user's library beside them. */
export interface BuiltSessionPorts {
  readonly ports: SessionPorts
  readonly libraryAssets: AssetCache
}

// The lock, folder, and clock ports are the same whichever store holds the workspace.
function portsOver(workspace: WorkspaceDocumentStore, assets: AssetCache): BuiltSessionPorts {
  const ports: SessionPorts = {
    workspace,
    locks: new WebLocksProjectLockPort(),
    folders: new BrowserFolderAccess(undefined, { shared: assets }),
    now: () => new Date(),
  }
  return { ports, libraryAssets: assets }
}

/** The ports over the durable storage of this browser. Rejects when the storage does not resolve. */
export async function createSessionPorts(): Promise<BuiltSessionPorts> {
  const { store, assets } = await resolveProjectStorage()
  return portsOver(store, assets)
}

/** Ports that keep everything in memory, for a project started after the storage did not resolve. */
export function createTemporarySessionPorts(): BuiltSessionPorts {
  return portsOver(new InMemoryProjectStore(), new InMemoryAssetCache())
}
