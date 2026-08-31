import { useMemo, useSyncExternalStore } from 'react'

import type { EnvironmentState } from '../../core'
import { useEnvironmentSession } from './environment-session-context'
import { sceneSessionSetter, useSceneSessionStoreOrLocal } from './scene-session-context'

/**
 * The grouped result of useSceneEnvironment, so the toolbar and canvas wiring can take the
 * whole environment state as one prop instead of re-listing each field.
 */
export interface SceneEnvironmentState {
  colorTemperatureK: number
  setColorTemperatureK: (kelvin: number) => void
  environment: EnvironmentState
  setEnvironment: (next: EnvironmentState) => void
}

/**
 * The grouped per-view environment inputs the toolbar and canvas share: the view-local color
 * temperature (foundation section 5.3, never in the model or undo) paired with the shared
 * environment session (mode, observation instant, cloud cover, color check) that the tool rail
 * and this view both read and write. Grouped so both consumers take it as one prop, the same
 * way the navigation state travels. The tint lives in the scene session store, so it outlasts
 * the preview subtree's unmount when the view mode changes (ADR-0170, which amends ADR-0146's
 * view-local stance on where the tint is held).
 */
export function useSceneEnvironment(): SceneEnvironmentState {
  const store = useSceneSessionStoreOrLocal()
  const session = useSyncExternalStore(store.subscribe, store.getSceneSession)
  const setColorTemperatureK = useMemo(
    () => sceneSessionSetter(store, 'colorTemperatureK'),
    [store],
  )
  const { environment, setEnvironment } = useEnvironmentSession()
  return {
    colorTemperatureK: session.colorTemperatureK,
    setColorTemperatureK,
    environment,
    setEnvironment,
  }
}
