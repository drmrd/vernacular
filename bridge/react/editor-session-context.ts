import { createContext, useContext } from 'react'
import type { EditorSession } from '../session/editor-session'

export const EditorSessionContext = createContext<EditorSession | null>(null)

export function useEditorSession(): EditorSession {
  const session = useContext(EditorSessionContext)
  if (session === null) {
    throw new Error('useEditorSession must be used within an EditorSessionProvider')
  }
  return session
}
