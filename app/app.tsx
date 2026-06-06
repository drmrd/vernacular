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
  createDefaultProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type ProjectStore,
  type RecentProjectStore,
} from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'
import { version as appVersion } from '../package.json'

const DEFAULT_PROJECT_ID = 'current'

/**
 * The subset of SnapshotStore the app depends on for autosave and crash recovery.
 * Method results are awaited rather than chained, so the port stays loose enough to
 * accept both the real SnapshotStore and the structural test doubles that stand in for it.
 */
export interface SnapshotsPort {
  writeSnapshot(project: Project): unknown
  prune(): unknown
  isRecoverable(): unknown
  restore(): unknown
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
  projectId?: string
  recentProjects?: RecentProjectStore
  snapshots?: SnapshotsPort
}

export function App({
  store: providedStore,
  projectId = DEFAULT_PROJECT_ID,
  recentProjects: providedRecentProjects,
  snapshots,
}: AppProps) {
  const store = useMemo(() => providedStore ?? createDefaultProjectStore(), [providedStore])
  const recentProjects = useMemo(
    () => providedRecentProjects ?? new InMemoryRecentProjectStore(),
    [providedRecentProjects],
  )
  const { session, setSession, error } = useProjectBoot(store, projectId)

  // Storage capabilities are a fixed property of the host environment, so probe
  // once at mount rather than on any prop change.
  useEffect(() => {
    void warnIfStorageDegraded()
  }, [])

  if (error !== null) {
    return (
      <main aria-label="Error">
        <p role="alert">Could not open the project. Reload the page to try again.</p>
      </main>
    )
  }

  if (session === null) {
    return (
      <main aria-label="Loading">
        <p role="status">Loading project...</p>
      </main>
    )
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

function useProjectBoot(
  store: ProjectStore,
  projectId: string,
): {
  session: EditorSession | null
  setSession: (session: EditorSession) => void
  error: Error | null
} {
  const [session, setSession] = useState<EditorSession | null>(null)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject)
      .then((project) => {
        if (!cancelled) {
          setSession(createEditorSession(project))
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause : new Error('Failed to load the project'))
        }
      })
    return () => {
      cancelled = true
    }
  }, [store, projectId])

  return { session, setSession, error }
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
  const saveStatus = useAutosaveWithSnapshots(session, store, projectId, snapshots)
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
            {...(recovery ? { recovery } : {})}
          />
        </ActiveToolProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}

// Adapts the loose SnapshotsPort into the SnapshotWriter the autosave loop expects, so
// autosave writes sidecar snapshots when a port is present and falls back to canonical
// saves when it is not.
function useAutosaveWithSnapshots(
  session: EditorSession,
  store: ProjectStore,
  projectId: string,
  snapshots: SnapshotsPort | undefined,
): ReturnType<typeof useAutosave> {
  const snapshotWriter = useMemo(
    () =>
      snapshots
        ? { writeSnapshot: (project: Project) => writeSnapshot(snapshots, project) }
        : undefined,
    [snapshots],
  )
  return useAutosave(session, store, projectId, snapshotWriter)
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
      ...(snapshots ? { snapshots: { prune: () => prune(snapshots) } } : {}),
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

// The SnapshotsPort methods are declared loosely so test doubles satisfy them; these
// adapters await each call and narrow the result back into the typed shape the app uses.
async function writeSnapshot(snapshots: SnapshotsPort, project: Project): Promise<void> {
  await snapshots.writeSnapshot(project)
}

async function prune(snapshots: SnapshotsPort): Promise<void> {
  await snapshots.prune()
}

async function isRecoverable(snapshots: SnapshotsPort): Promise<boolean> {
  return (await snapshots.isRecoverable()) === true
}

async function restore(snapshots: SnapshotsPort): Promise<Project | undefined> {
  return (await snapshots.restore()) as Project | undefined
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

    void recentProjects.list().then((entries) => {
      if (!cancelled) {
        setRecentEntries(entries.map(({ id, name }) => ({ id, name })))
      }
    })

    if (snapshots) {
      void isRecoverable(snapshots).then((recoverable) => {
        if (cancelled || !recoverable) {
          return
        }
        setRecovery({
          onRestore: () => {
            void restore(snapshots).then((project) => {
              if (project) {
                onSession(createEditorSession(project))
              }
              setRecovery(null)
            })
          },
          onDiscard: () => {
            void prune(snapshots).then(() => setRecovery(null))
          },
        })
      })
    }

    return () => {
      cancelled = true
    }
  }, [recentProjects, snapshots, onSession])

  return { recentEntries, recovery }
}
