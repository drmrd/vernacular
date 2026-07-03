import {
  DEFAULT_OBSERVATION_INSTANT,
  observationInstantToIso,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import type { EnvironmentScene } from '../model/environment-scene'

export type LightingMode = 'schematic' | 'realistic'

/**
 * The panel-level session contract (spec: Architecture): everything the Environment
 * panel owns. Location and timezone stay on Site; the bridge composes the two.
 */
export interface EnvironmentState {
  readonly mode: LightingMode
  readonly observedAt: ObservationInstant
  readonly cloudCover: number // 0 clear .. 1 overcast
  readonly colorCheck: boolean
}

export const DEFAULT_ENVIRONMENT_STATE: EnvironmentState = {
  mode: 'schematic',
  observedAt: DEFAULT_OBSERVATION_INSTANT,
  cloudCover: DEFAULT_CLOUD_COVER,
  colorCheck: false,
}

export interface EnvironmentSceneIdentity {
  id: string
  name: string
}

/** Persists the current "when and weather" as a named scene (observedAt ISO + weather). */
export function captureEnvironmentScene(
  state: EnvironmentState,
  identity: EnvironmentSceneIdentity,
): EnvironmentScene {
  return {
    id: identity.id,
    name: identity.name,
    observedAt: observationInstantToIso(state.observedAt),
    weather: { cloudCover: state.cloudCover },
  }
}

/** Recalls a scene's when-and-weather into the state; mode and colorCheck are untouched. */
export function applyEnvironmentScene(
  state: EnvironmentState,
  scene: EnvironmentScene,
): EnvironmentState {
  return {
    mode: state.mode,
    observedAt: parseObservationInstant(scene.observedAt),
    cloudCover: scene.weather?.cloudCover ?? DEFAULT_CLOUD_COVER,
    colorCheck: state.colorCheck,
  }
}
