import { useMemo } from 'react'
import { createEditorSession, EditorSessionProvider } from '../bridge'
import { EditorShell } from '../editor'
import { createEmptyProject } from '../core'

const APP_VERSION = '0.1.0'

export function App() {
  const session = useMemo(
    () =>
      createEditorSession(
        createEmptyProject({
          name: 'Untitled project',
          units: 'imperial',
          era: 'modern',
          appVersion: APP_VERSION,
        }),
      ),
    [],
  )

  return (
    <EditorSessionProvider session={session}>
      <EditorShell />
    </EditorSessionProvider>
  )
}
