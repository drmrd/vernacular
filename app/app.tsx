import { useMemo } from 'react'
import { createEditorSession, EditorSessionProvider } from '../bridge'
import { EditorShell } from '../editor'
import { createEmptyProject } from '../core'
import { version as appVersion } from '../package.json'

export function App() {
  const session = useMemo(
    () =>
      createEditorSession(
        createEmptyProject({
          name: 'Untitled project',
          units: 'imperial',
          era: 'modern',
          appVersion,
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
