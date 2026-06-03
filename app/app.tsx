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
import { createDefaultProjectStore, type ProjectStore } from '../storage'
import { createEmptyProject, createFloor, type Project } from '../core'
import { version as appVersion } from '../package.json'

const DEFAULT_PROJECT_ID = 'current'

function createInitialProject(): Project {
  const project = createEmptyProject({
    name: 'Untitled project',
    units: 'imperial',
    era: 'modern',
    appVersion,
  })
  return { ...project, floors: [createFloor('Ground')] }
}

export interface AppProps {
  store?: ProjectStore
  projectId?: string
}

export function App({ store: providedStore, projectId = DEFAULT_PROJECT_ID }: AppProps = {}) {
  const store = useMemo(() => providedStore ?? createDefaultProjectStore(), [providedStore])
  const [session, setSession] = useState<EditorSession | null>(null)

  useEffect(() => {
    let cancelled = false
    void loadOrCreateProject(store, projectId, createInitialProject).then((project) => {
      if (!cancelled) {
        setSession(createEditorSession(project))
      }
    })
    return () => {
      cancelled = true
    }
  }, [store, projectId])

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
