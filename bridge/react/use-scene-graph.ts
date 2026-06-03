import { useSyncExternalStore } from 'react'
import type { SceneGraph } from '../../core'
import { useEditorSession } from './editor-session-context'

/** Subscribes the calling component to scene-graph changes on the editor session. */
export function useSceneGraph(): SceneGraph {
  const session = useEditorSession()
  return useSyncExternalStore(session.subscribe, session.getSceneGraph)
}
