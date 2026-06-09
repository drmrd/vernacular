import { useEffect, useMemo, useState } from 'react'
import {
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
  InMemoryRecentProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type ProjectStore,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import type { Project } from '../core'
import { createInitialProject } from './create-initial-project'
import { useProjectActions, useRecentProjectsAndRecovery } from './use-project-actions'
import { resolveProjectStorage } from './resolve-project-store'

const DEFAULT_PROJECT_ID = 'current'

// The default boot resolver still yields just the ProjectStore; the app-boot
// wiring threads the paired AssetCache through to the editor via the
// AssetCacheProvider.
async function resolveDefaultStore(): Promise<ProjectStore> {
  return (await resolveProjectStorage()).store
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
  resolveStore?: () => Promise<ProjectStore>
  projectId?: string
  recentProjects?: RecentProjectStore
  snapshots?: SnapshotsPort
}

export function App({
  store: providedStore,
  resolveStore = resolveDefaultStore,
  projectId = DEFAULT_PROJECT_ID,
  recentProjects: providedRecentProjects,
  snapshots,
}: AppProps) {
  const { store, session, setSession, error } = useProjectBoot(
    providedStore,
    resolveStore,
    projectId,
  )
  const recentProjects = useMemo(
    () => providedRecentProjects ?? new InMemoryRecentProjectStore(),
    [providedRecentProjects],
  )
  const capabilities = useStorageCapabilities()

  if (error !== null || store === null || session === null || capabilities === null) {
    return bootStatusView(error)
  }

  return (
    <EditorWorkspace
      session={session}
      store={store}
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
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
}

// Boots the project: uses an injected store directly, otherwise resolves one
// asynchronously through resolveStore() exactly once, then loads or creates the
// project. Each async step is guarded against writes after unmount, and the store
// and load errors surface through a single error channel.
function useProjectBoot(
  providedStore: ProjectStore | undefined,
  resolveStore: () => Promise<ProjectStore>,
  projectId: string,
): ProjectBoot {
  const [resolved, setResolved] = useState<ProjectStore | null>(null)
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const store = providedStore ?? resolved

  useEffect(() => {
    if (providedStore) {
      return
    }
    let cancelled = false
    void resolveStore()
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

  return { store, session, setSession, error }
}

function asError(cause: unknown): Error {
  return cause instanceof Error ? cause : new Error('Failed to boot the project')
}

interface EditorWorkspaceProps {
  session: EditorSession
  store: ProjectStore
  projectId: string
  recentProjects: RecentProjectStore
  capabilities: StorageCapabilities
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

function EditorWorkspace(props: EditorWorkspaceProps) {
  const { session, store, projectId, recentProjects, snapshots, onSession } = props
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
    </EditorSessionProvider>
  )
}
