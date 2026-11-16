import { describe, it, expect } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import { useInteractiveObjects } from './use-interactive-objects'

const SAMPLE_OPEN_DOORS: ReadonlySet<string> = new Set(['opening:front-door'])

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return <SceneSessionProvider store={store}>{children}</SceneSessionProvider>
  }
}

function renderInteractiveObjectsOn(store: SceneSessionStore) {
  return renderHook(() => useInteractiveObjects(), { wrapper: providerAround(store) })
}

describe('useInteractiveObjects', () => {
  it('reports the objects as out of their default state while a door is open', () => {
    const store = createSceneSessionStore({ openDoorIds: SAMPLE_OPEN_DOORS })

    const { result } = renderInteractiveObjectsOn(store)

    expect(result.current.atDefault).toBe(false)
  })

  it('closes the open door on reset and reports the objects at their default', () => {
    const store = createSceneSessionStore({ openDoorIds: SAMPLE_OPEN_DOORS })
    const { result } = renderInteractiveObjectsOn(store)

    act(() => result.current.reset())

    expect(result.current.atDefault).toBe(true)
    expect(store.getSceneSession().openDoorIds.size).toBe(0)
  })

  it('reports the objects at their default when rendered outside a provider', () => {
    const { result } = renderHook(() => useInteractiveObjects())

    expect(result.current.atDefault).toBe(true)
  })
})
