import { createContext } from 'react'
import type { ComponentType, Context } from 'react'
import { PlainSceneFailureView } from './plain-scene-failure-view'

export type SceneFailureViewProps = { kind: 'start' } | { kind: 'load'; onReload: () => void }

export type SceneFailureView = ComponentType<SceneFailureViewProps>

/** The view shown in place of the 3D pane when the renderer fails; the default is the plain views. */
export const SceneFailureViewContext: Context<SceneFailureView> =
  createContext<SceneFailureView>(PlainSceneFailureView)
