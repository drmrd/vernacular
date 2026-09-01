import { useSyncExternalStore, type ReactNode } from 'react'
import type { SceneSessionStore } from '../scene-session/scene-session-store'
import { SceneSessionContext } from './scene-session-context'

export interface SceneSessionProviderProps {
  store: SceneSessionStore
  children: ReactNode
}

/**
 * Keeps the host out of layout so the editor shell's frame lands on the children exactly as
 * it did before the provider grew an element of its own.
 */
const HOST_STYLE = { display: 'contents' } as const

/**
 * The live view is ready to capture once the stored session has been applied and a frame has
 * drawn since the latest pipeline build settled. A screenshot spec waits on the attribute
 * rather than on a timeout, the way the harness canvas already advertises data-harness-ready.
 */
export function SceneSessionProvider({ store, children }: SceneSessionProviderProps) {
  const liveViewReady = useSyncExternalStore(store.subscribe, () => {
    const { sessionRestored, frameDrawnSincePipelineSettled } = store.getSceneSession()
    return sessionRestored && frameDrawnSincePipelineSettled
  })
  return (
    <SceneSessionContext.Provider value={store}>
      <div style={HOST_STYLE} data-live-view-ready={liveViewReady ? 'true' : 'false'}>
        {children}
      </div>
    </SceneSessionContext.Provider>
  )
}
