import {
  observationInstantToIso,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'
import { openingConditions, openingInstant, type OpeningConditions } from './opening-instant'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import type { EnvironmentScene } from '../model/environment-scene'
import type { Site } from '../model/site'
import { frontDirection, type FrontDirectionInput } from '../scene/front-direction'

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
  observedAt: openingInstant({ site: undefined }),
  cloudCover: DEFAULT_CLOUD_COVER,
  colorCheck: false,
}

/** The state a project's environment session starts from: the opening conditions, with the default mode and color check. */
export function environmentStateOpenedWith(conditions: OpeningConditions): EnvironmentState {
  return {
    ...DEFAULT_ENVIRONMENT_STATE,
    observedAt: conditions.observedAt,
    cloudCover: conditions.cloudCover,
  }
}

/** The environment a project opens with: the light chosen from its site and its front, in the default mode. */
export function openingEnvironmentFor(
  site: Site | undefined,
  graph: FrontDirectionInput,
): EnvironmentState {
  return environmentStateOpenedWith(openingConditions({ site, front: frontDirection(graph) }))
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
