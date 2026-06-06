import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EditorSessionProvider,
  SelectionProvider,
  commitProject,
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
} from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'
import { resolveProjectStore } from './resolve-project-store'
import { version as appVersion } from '../package.json'

const DEFAULT_PROJECT_ID = 'current'

/** The subset of SnapshotStore the app depends on for autosave and crash recovery. */
export interface SnapshotsPort {
  writeSnapshot(project: Project): Promise<void>
  prune(): Promise<void>
  isRecoverable(): Promise<boolean>
  restore(): Promise<Project | undefined>
}

interface RecentEntry {
  id: string
  name: string
}

interface Recovery {
  onRestore: () => void
  onDiscard: () => void
}

// createEmptyProject starts with no floors; the app seeds a ground floor so the wall tool has a target.
function createInitialProject(): Project {
  const project = createEmptyProject({
    name: 'Untitled project',
    units: 'imperial',
    era: 'modern',
    appVersion,
  })
  return { ...project, floors: [createFloor('Ground')] }
}

async function warnIfStorageDegraded(): Promise<void> {
  const capabilities = await probeStorageCapabilities()
  if (isStorageDegraded(capabilities)) {
    console.warn(summarizeStorageCapabilities(capabilities))
  }
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
  resolveStore = resolveProjectStore,
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

  // Storage capabilities are a fixed property of the host environment, so probe
  // once at mount rather than on any prop change.
  useEffect(() => {
    void warnIfStorageDegraded()
  }, [])

  if (error !== null || store === null || session === null) {
    return bootStatusView(error)
  }

  return (
    <EditorWorkspace
      session={session}
      store={store}
      projectId={projectId}
      recentProjects={recentProjects}
      snapshots={snapshots}
      onSession={setSession}
    />
  )
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
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

function EditorWorkspace({
  session,
  store,
  projectId,
  recentProjects,
  snapshots,
  onSession,
}: EditorWorkspaceProps) {
  const selection = useMemo(() => createSelectionStore(), [])
  // Spread snapshots only when present: under exactOptionalPropertyTypes the optional
  // option rejects an explicit undefined.
  const saveStatus = useAutosave({ session, store, projectId, ...(snapshots ? { snapshots } : {}) })
  const { recentEntries, recovery } = useRecentProjectsAndRecovery(
    recentProjects,
    snapshots,
    onSession,
  )
  const { onSave, onOpenRecent, onNewProject } = useProjectActions({
    session,
    store,
    projectId,
    snapshots,
    onSession,
  })

  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell
            saveStatus={saveStatus}
            recentProjects={recentEntries}
            onSave={onSave}
            onOpenRecent={onOpenRecent}
            onNewProject={onNewProject}
            // Spread recovery only when present: the optional prop rejects an explicit undefined.
            {...(recovery ? { recovery } : {})}
          />
        </ActiveToolProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}

interface ProjectActionsContext {
  session: EditorSession
  store: ProjectStore
  projectId: string
  snapshots: SnapshotsPort | undefined
  onSession: (session: EditorSession) => void
}

function useProjectActions({
  session,
  store,
  projectId,
  snapshots,
  onSession,
}: ProjectActionsContext): {
  onSave: () => void
  onOpenRecent: (id: string) => void
  onNewProject: () => void
} {
  const onSave = useCallback(() => {
    void commitProject({
      store,
      projectId,
      project: session.getProject(),
      ...(snapshots ? { snapshots } : {}),
    })
  }, [store, projectId, session, snapshots])

  const onOpenRecent = useCallback(
    (id: string) => {
      void store.load(id).then((project) => onSession(createEditorSession(project)))
    },
    [store, onSession],
  )

  const onNewProject = useCallback(() => {
    onSession(createEditorSession(createInitialProject()))
  }, [onSession])

  return { onSave, onOpenRecent, onNewProject }
}

function useRecentProjectsAndRecovery(
  recentProjects: RecentProjectStore,
  snapshots: SnapshotsPort | undefined,
  onSession: (session: EditorSession) => void,
): { recentEntries: RecentEntry[]; recovery: Recovery | null } {
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([])
  const [recovery, setRecovery] = useState<Recovery | null>(null)

  useEffect(() => {
    let cancelled = false
    const isLive = () => !cancelled

    void recentProjects.list().then((entries) => {
      if (isLive()) {
        setRecentEntries(entries.map(({ id, name }) => ({ id, name })))
      }
    })

    if (snapshots) {
      void snapshots.isRecoverable().then((recoverable) => {
        if (isLive() && recoverable) {
          setRecovery(buildRecovery({ snapshots, onSession, setRecovery, isLive }))
        }
      })
    }

    return () => {
      cancelled = true
    }
  }, [recentProjects, snapshots, onSession])

  return { recentEntries, recovery }
}

interface RecoveryHandlersContext {
  snapshots: SnapshotsPort
  onSession: (session: EditorSession) => void
  setRecovery: (recovery: Recovery | null) => void
  isLive: () => boolean
}

// Builds the restore/discard handlers, each guarded so they never touch React state
// after the owning effect has been torn down.
function buildRecovery({
  snapshots,
  onSession,
  setRecovery,
  isLive,
}: RecoveryHandlersContext): Recovery {
  return {
    onRestore: () => {
      void snapshots.restore().then((project) => {
        if (!isLive()) {
          return
        }
        if (project) {
          onSession(createEditorSession(project))
        }
        setRecovery(null)
      })
    },
    onDiscard: () => {
      void snapshots.prune().then(() => {
        if (isLive()) {
          setRecovery(null)
        }
      })
    },
  }
}
