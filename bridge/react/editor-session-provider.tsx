import type { ReactNode } from 'react'
import type { EditorSession } from '../session/editor-session'
import { EditorSessionContext } from './editor-session-context'

export interface EditorSessionProviderProps {
  session: EditorSession
  children: ReactNode
}

export function EditorSessionProvider({ session, children }: EditorSessionProviderProps) {
  return <EditorSessionContext.Provider value={session}>{children}</EditorSessionContext.Provider>
}
