import { version as appVersion } from '../package.json'
import type { SessionPorts } from '../session'
import {
  BrowserFolderAccess,
  InMemoryAssetCache,
  InMemoryProjectIndex,
  InMemoryProjectStore,
  IndexedDbProjectIndex,
  WebLocksProjectLockPort,
  withMemoryFallback,
  type AssetCache,
  type ProjectIndex,
  type WorkspaceDocumentStore,
} from '../storage'
import { resolveProjectStorage } from './resolve-project-store'

/** The ports of the session layer, with the pool of the user's library beside them. */
export interface BuiltSessionPorts {
  readonly ports: SessionPorts
  readonly libraryAssets: AssetCache
}

/** The stores that differ between the durable and the temporary ports. */
interface PortStores {
  readonly workspace: WorkspaceDocumentStore
  readonly assets: AssetCache
  readonly index: ProjectIndex
}

// The lock, folder, clock, and build ports are the same whichever store holds the workspace.
function portsOver(stores: PortStores): BuiltSessionPorts {
  const ports: SessionPorts = {
    workspace: stores.workspace,
    locks: new WebLocksProjectLockPort(),
    folders: new BrowserFolderAccess(undefined, { shared: stores.assets }),
    now: () => new Date(),
    index: stores.index,
    build: appVersion,
  }
  return { ports, libraryAssets: stores.assets }
}

/**
 * The ports over the durable storage of this browser. Rejects when the storage does not resolve.
 */
export async function createSessionPorts(): Promise<BuiltSessionPorts> {
  const { store, assets } = await resolveProjectStorage()
  return portsOver({
    workspace: store,
    assets,
    index: withMemoryFallback(new IndexedDbProjectIndex()),
  })
}

/** Ports that keep everything in memory, for a browser whose storage was not found. */
export function createTemporarySessionPorts(): BuiltSessionPorts {
  return portsOver({
    workspace: new InMemoryProjectStore(),
    assets: new InMemoryAssetCache(),
    index: new InMemoryProjectIndex(),
  })
}

/** Whether the ports keep projects after the tab closes: false for the temporary ports. */
export function portsAreDurable(ports: SessionPorts): boolean {
  return ports.workspace.durable
}
