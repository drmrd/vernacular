import { useEffect, useMemo, useState } from 'react'
import {
  AssetCacheProvider,
  EditorSessionProvider,
  SelectionProvider,
  createEditorSession,
  createSelectionStore,
  loadOrCreateProject,
  useAutosave,
  type EditorSession,
} from '../bridge'
import { ActiveToolProvider, EditorShell } from '../editor'
import {
  InMemoryAssetCache,
  InMemoryRecentProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type AssetCache,
  type ProjectStorage,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import type { Project } from '../core'
import { createInitialProject } from './create-initial-project'
import { useProjectActions, useRecentProjectsAndRecovery } from './use-project-actions'
import { resolveProjectStorage } from './resolve-project-store'

const DEFAULT_PROJECT_ID = 'current'

// Resolve the durable {store, assets} pair to boot against. An injected
// store-only resolver (tests) pairs its store with an in-memory asset cache; the
// default resolves the real pair, so the OPFS runtime gets a directory-backed
// asset cache that persists underlay rasters beside project.json (ADR-0042).
async function resolveBootStorage(
  resolveStore?: () => Promise<ProjectStore>,
): Promise<ProjectStorage> {
  if (resolveStore) {
    return { store: await resolveStore(), assets: new InMemoryAssetCache() }
  }
  return resolveProjectStorage()
}

/** The subset of SnapshotStore the app depends on for autosave and crash recovery. */
export interface SnapshotsPort {
  writeSnapshot(project: Project): Promise<void>
  prune(): Promise<void>
  isRecoverable(): Promise<boolean>
  restore(): Promise<Project | undefined>
}

export interface AppProps {
  store?: ProjectStore
  /** Injected asset cache; defaults to the boot-resolved cache, or in-memory under an injected store. */
  assets?: AssetCache
  resolveStore?: () => Promise<ProjectStore>
  projectId?: string
  recentProjects?: RecentProjectStore
  snapshots?: SnapshotsPort
}

export function App({
  store: providedStore,
  assets: providedAssets,
  resolveStore,
  projectId = DEFAULT_PROJECT_ID,
  recentProjects: providedRecentProjects,
  snapshots,
}: AppProps) {
  const { store, assets, session, setSession, error } = useProjectBoot({
    providedStore,
    providedAssets,
    resolveStore,
    projectId,
  })
  const recentProjects = useMemo(
    () => providedRecentProjects ?? new InMemoryRecentProjectStore(),
    [providedRecentProjects],
  )
  const capabilities = useStorageCapabilities()

  if (error !== null) {
    return bootStatusView(error)
  }
  if (store === null || assets === null || session === null || capabilities === null) {
    return bootStatusView(null)
  }

  return (
    <EditorWorkspace
      session={session}
      store={store}
      assets={assets}
      projectId={projectId}
      recentProjects={recentProjects}
      capabilities={capabilities}
      snapshots={snapshots}
      onSession={setSession}
    />
  )
}

// Storage capabilities are a fixed property of the host environment, so probe
// once at mount and reuse the result for both the degraded-storage warning and
// the open-folder capability gate. Resolves to null until the probe completes.
function useStorageCapabilities(): StorageCapabilities | null {
  const [capabilities, setCapabilities] = useState<StorageCapabilities | null>(null)
  useEffect(() => {
    let cancelled = false
    void probeStorageCapabilities().then((probed) => {
      if (cancelled) {
        return
      }
      setCapabilities(probed)
      if (isStorageDegraded(probed)) {
        console.warn(summarizeStorageCapabilities(probed))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])
  return capabilities
}

// The pre-shell placeholder: the error notice when boot failed, otherwise the
// loading notice while the store or project is still resolving.
function bootStatusView(error: Error | null) {
  if (error !== null) {
    return (
      <main aria-label="Error">
        <p role="alert">Could not open the project. Reload the page to try again.</p>
      </main>
    )
  }
  return (
    <main aria-label="Loading">
      <p role="status">Loading project...</p>
    </main>
  )
}

interface ProjectBoot {
  store: ProjectStore | null
  assets: AssetCache | null
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
}

interface ProjectBootInputs {
  providedStore: ProjectStore | undefined
  providedAssets: AssetCache | undefined
  resolveStore: (() => Promise<ProjectStore>) | undefined
  projectId: string
}

// Boots the project: uses an injected store directly, otherwise resolves the
// durable {store, assets} pair asynchronously exactly once, then loads or creates
// the project. An injected store pairs with the injected asset cache or a fresh
// in-memory one. Each async step is guarded against writes after unmount, and the
// store and load errors surface through a single error channel.
function useProjectBoot(inputs: ProjectBootInputs): ProjectBoot {
  const { providedStore, providedAssets, resolveStore, projectId } = inputs
  const [resolved, setResolved] = useState<ProjectStorage | null>(null)
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const fallbackAssets = useMemo(() => new InMemoryAssetCache(), [])
  const store = providedStore ?? resolved?.store ?? null
  const assets = providedAssets ?? resolved?.assets ?? (providedStore ? fallbackAssets : null)

  useEffect(() => {
    if (providedStore) {
      return
    }
    let cancelled = false
    void resolveBootStorage(resolveStore)
      .then((it) => !cancelled && setResolved(it))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [providedStore, resolveStore])

  useEffect(() => {
    if (store === null) {
      return
    }
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject)
      .then((project) => !cancelled && setSession(createEditorSession(project)))
      .catch((cause: unknown) => !cancelled && setError(asError(cause)))
    return () => {
      cancelled = true
    }
  }, [store, projectId])

  return { store, assets, session, setSession, error }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Failed to boot the project')
}

interface EditorWorkspaceProps {
  session: EditorSession
  store: ProjectStore
  assets: AssetCache
  projectId: string
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

function EditorWorkspace(props: EditorWorkspaceProps) {
  const { session, store, assets, projectId, recentProjects, snapshots, onSession } = props
  const selection = useMemo(() => createSelectionStore(), [])
  // Spread snapshots only when present: under exactOptionalPropertyTypes the optional
  // option rejects an explicit undefined.
  const saveStatus = useAutosave({ session, store, projectId, ...(snapshots ? { snapshots } : {}) })
  const { recentEntries, recovery } = useRecentProjectsAndRecovery({
    recentProjects,
    snapshots,
    onSession,
  })
  const actions = useProjectActions({ ...props, recentEntries })

  return (
    <EditorSessionProvider session={session}>
      <AssetCacheProvider assets={assets}>
        <SelectionProvider store={selection}>
          <ActiveToolProvider>
            <EditorShell
              saveStatus={saveStatus}
              recentProjects={recentEntries}
              {...actions}
              // Spread recovery only when present: the optional prop rejects an explicit undefined.
              {...(recovery ? { recovery } : {})}
            />
          </ActiveToolProvider>
        </SelectionProvider>
      </AssetCacheProvider>
    </EditorSessionProvider>
  )
}
