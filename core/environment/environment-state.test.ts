import { describe, expect, it } from 'vitest'
import {
  captureEnvironmentScene,
  applyEnvironmentScene,
  DEFAULT_ENVIRONMENT_STATE,
  type EnvironmentSceneIdentity,
  type EnvironmentState,
  type LightingMode,
} from './environment-state'
import {
  DEFAULT_OBSERVATION_INSTANT,
  observationInstantToIso,
  parseObservationInstant,
  type ObservationInstant,
} from './observation-time'
import { DEFAULT_CLOUD_COVER } from './sky-model'
import type { EnvironmentScene } from '../model/environment-scene'

// A "when" that is deliberately far from the default noon-solstice instant, so a
// test failing to serialize or parse it cannot pass by coincidence.
const CUSTOM_MINUTES_SINCE_MIDNIGHT = 960
const CUSTOM_OBSERVATION_INSTANT: ObservationInstant = {
  date: '2026-12-04',
  minutesSinceMidnight: CUSTOM_MINUTES_SINCE_MIDNIGHT,
}
const CUSTOM_CLOUD_COVER = 0.6

const SCENE_ID = 'scene-winter-dusk'
const SCENE_NAME = 'Winter dusk'
const SCENE_IDENTITY: EnvironmentSceneIdentity = { id: SCENE_ID, name: SCENE_NAME }

// A mode and color-check value distinct from the defaults, so "preserved" is
// observable rather than trivially true of the default state.
const NON_DEFAULT_MODE: LightingMode = 'realistic'
const NON_DEFAULT_COLOR_CHECK = true

describe('DEFAULT_ENVIRONMENT_STATE', () => {
  it('starts in schematic mode at the default observation instant with no cloud cover or color check', () => {
    expect(DEFAULT_ENVIRONMENT_STATE).toEqual({
      mode: 'schematic',
      observedAt: DEFAULT_OBSERVATION_INSTANT,
      cloudCover: DEFAULT_CLOUD_COVER,
      colorCheck: false,
    })
  })
})

describe('captureEnvironmentScene', () => {
  it('serializes the observed instant and cloud cover under the given identity', () => {
    const state: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: CUSTOM_OBSERVATION_INSTANT,
      cloudCover: CUSTOM_CLOUD_COVER,
    }

    const scene = captureEnvironmentScene(state, SCENE_IDENTITY)

    expect(scene.id).toBe(SCENE_ID)
    expect(scene.name).toBe(SCENE_NAME)
    expect(scene.observedAt).toBe(observationInstantToIso(CUSTOM_OBSERVATION_INSTANT))
    expect(scene.weather?.cloudCover).toBe(CUSTOM_CLOUD_COVER)
  })
})

describe('applyEnvironmentScene', () => {
  it('recalls the instant and cloud cover while preserving the incoming mode and color check', () => {
    const scene: EnvironmentScene = {
      id: SCENE_ID,
      name: SCENE_NAME,
      observedAt: observationInstantToIso(CUSTOM_OBSERVATION_INSTANT),
      weather: { cloudCover: CUSTOM_CLOUD_COVER },
    }
    const state: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      mode: NON_DEFAULT_MODE,
      colorCheck: NON_DEFAULT_COLOR_CHECK,
    }

    const next = applyEnvironmentScene(state, scene)

    expect(next.observedAt).toEqual(parseObservationInstant(scene.observedAt))
    expect(next.cloudCover).toBe(CUSTOM_CLOUD_COVER)
    expect(next.mode).toBe(NON_DEFAULT_MODE)
    expect(next.colorCheck).toBe(NON_DEFAULT_COLOR_CHECK)
  })

  it('falls back to the default cloud cover when the scene has no weather', () => {
    const scene: EnvironmentScene = {
      id: SCENE_ID,
      name: SCENE_NAME,
      observedAt: observationInstantToIso(CUSTOM_OBSERVATION_INSTANT),
    }

    const next = applyEnvironmentScene(DEFAULT_ENVIRONMENT_STATE, scene)

    expect(next.cloudCover).toBe(DEFAULT_CLOUD_COVER)
  })
})

describe('capture-then-apply round trip', () => {
  it('reproduces the original observed instant and cloud cover', () => {
    const state: EnvironmentState = {
      ...DEFAULT_ENVIRONMENT_STATE,
      observedAt: CUSTOM_OBSERVATION_INSTANT,
      cloudCover: CUSTOM_CLOUD_COVER,
    }

    const scene = captureEnvironmentScene(state, SCENE_IDENTITY)
    const restored = applyEnvironmentScene(DEFAULT_ENVIRONMENT_STATE, scene)

    expect(restored.observedAt).toEqual(state.observedAt)
    expect(restored.cloudCover).toBe(state.cloudCover)
  })
})
