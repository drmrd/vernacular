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
  createDefaultProjectStore,
  isStorageDegraded,
  probeStorageCapabilities,
  summarizeStorageCapabilities,
  type ProjectStore,
} from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'
import { version as appVersion } from '../package.json'

const DEFAULT_PROJECT_ID = 'current'

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
}

export function App({ store: providedStore, projectId = DEFAULT_PROJECT_ID }: AppProps) {
  const store = useMemo(() => providedStore ?? createDefaultProjectStore(), [providedStore])
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

  return <EditorWorkspace session={session} store={store} projectId={projectId} />
}

interface EditorWorkspaceProps {
  session: EditorSession
  store: ProjectStore
  projectId: string
}

function EditorWorkspace({ session, store, projectId }: EditorWorkspaceProps) {
  const selection = useMemo(() => createSelectionStore(), [])
  const saveStatus = useAutosave(session, store, projectId)
  return (
    <EditorSessionProvider session={session}>
      <SelectionProvider store={selection}>
        <ActiveToolProvider>
          <EditorShell saveStatus={saveStatus} />
        </ActiveToolProvider>
      </SelectionProvider>
    </EditorSessionProvider>
  )
}
