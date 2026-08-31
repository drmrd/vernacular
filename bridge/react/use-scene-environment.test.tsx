import { describe, it, expect, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { renderHook, act, cleanup } from '@testing-library/react'

import {
  DEFAULT_COLOR_TEMPERATURE_K,
  DEFAULT_ENVIRONMENT_STATE,
  type EnvironmentState,
} from '../../core'
import {
  createEnvironmentSessionStore,
  createSceneSessionStore,
  EnvironmentSessionProvider,
  SceneSessionProvider,
  type EnvironmentSessionStore,
  type SceneSessionStore,
} from '../index'
import { useSceneEnvironment } from './use-scene-environment'

afterEach(cleanup)

const CANDLELIT_WARM_K = 3200
const OVERCAST_COOL_K = 4000

const realisticEnvironment: EnvironmentState = { ...DEFAULT_ENVIRONMENT_STATE, mode: 'realistic' }

function environmentSessionAround(environmentStore: EnvironmentSessionStore) {
  return function EnvironmentSessionWrapper({ children }: { children: ReactNode }) {
    return (
      <EnvironmentSessionProvider store={environmentStore}>{children}</EnvironmentSessionProvider>
    )
  }
}

function bothSessionsAround(
  environmentStore: EnvironmentSessionStore,
  sceneStore: SceneSessionStore,
) {
  return function SessionsWrapper({ children }: { children: ReactNode }) {
    return (
      <EnvironmentSessionProvider store={environmentStore}>
        <SceneSessionProvider store={sceneStore}>{children}</SceneSessionProvider>
      </EnvironmentSessionProvider>
    )
  }
}

function renderWithoutSceneSession() {
  return renderHook(() => useSceneEnvironment(), {
    wrapper: environmentSessionAround(createEnvironmentSessionStore()),
  })
}

function renderSceneEnvironmentOn(
  sceneStore: SceneSessionStore,
  environmentStore: EnvironmentSessionStore = createEnvironmentSessionStore(),
) {
  return renderHook(() => useSceneEnvironment(), {
    wrapper: bothSessionsAround(environmentStore, sceneStore),
  })
}

describe('useSceneEnvironment', () => {
  it('starts at the default color temperature and follows a change', () => {
    const { result } = renderWithoutSceneSession()

    expect(result.current.colorTemperatureK).toBe(DEFAULT_COLOR_TEMPERATURE_K)

    act(() => result.current.setColorTemperatureK(CANDLELIT_WARM_K))

    expect(result.current.colorTemperatureK).toBe(CANDLELIT_WARM_K)
  })
})

describe('useSceneEnvironment inside a scene session provider', () => {
  it('starts from the color temperature the session already holds', () => {
    const sceneStore = createSceneSessionStore({ colorTemperatureK: CANDLELIT_WARM_K })

    const { result } = renderSceneEnvironmentOn(sceneStore)

    expect(result.current.colorTemperatureK).toBe(CANDLELIT_WARM_K)
  })

  it('records a color temperature change in the session', () => {
    const sceneStore = createSceneSessionStore()
    const { result } = renderSceneEnvironmentOn(sceneStore)

    act(() => result.current.setColorTemperatureK(OVERCAST_COOL_K))

    expect(sceneStore.getSceneSession().colorTemperatureK).toBe(OVERCAST_COOL_K)
  })

  it('hands a remounted view the color temperature the earlier mount left behind', () => {
    const sceneStore = createSceneSessionStore()
    const firstMount = renderSceneEnvironmentOn(sceneStore)

    act(() => firstMount.result.current.setColorTemperatureK(OVERCAST_COOL_K))
    firstMount.unmount()

    const secondMount = renderSceneEnvironmentOn(sceneStore)

    expect(secondMount.result.current.colorTemperatureK).toBe(OVERCAST_COOL_K)
  })

  it('still reads the environment from the environment session', () => {
    const environmentStore = createEnvironmentSessionStore()
    environmentStore.setEnvironment(realisticEnvironment)

    const { result } = renderSceneEnvironmentOn(createSceneSessionStore(), environmentStore)

    expect(result.current.environment).toEqual(realisticEnvironment)
  })
})
