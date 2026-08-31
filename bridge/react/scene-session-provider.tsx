import type { ReactNode } from 'react'
import type { SceneSessionStore } from '../scene-session/scene-session-store'
import { SceneSessionContext } from './scene-session-context'

export interface SceneSessionProviderProps {
  store: SceneSessionStore
  children: ReactNode
}

export function SceneSessionProvider({ store, children }: SceneSessionProviderProps) {
  return <SceneSessionContext.Provider value={store}>{children}</SceneSessionContext.Provider>
}
