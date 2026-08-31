import { describe, it, expect } from 'vitest'
import { createElement, type ReactNode } from 'react'
import { renderHook, act } from '@testing-library/react'

import { createSceneSessionStore, SceneSessionProvider, type SceneSessionStore } from '../index'
import { useBuildingViewState } from './use-building-view-state'

function providerAround(store: SceneSessionStore) {
  return function SceneSessionWrapper({ children }: { children: ReactNode }) {
    return createElement(SceneSessionProvider, { store, children })
  }
}

function renderBuildingViewOn(store: SceneSessionStore) {
  return renderHook(() => useBuildingViewState(), { wrapper: providerAround(store) })
}

describe('useBuildingViewState', () => {
  it('defaults to the active-floor scope with underground levels shown', () => {
    const { result } = renderHook(() => useBuildingViewState())

    expect(result.current.scope).toBe('floor')
    expect(result.current.showUnderground).toBe(true)
  })

  it('switches the view scope to the whole building', () => {
    const { result } = renderHook(() => useBuildingViewState())

    act(() => result.current.setScope('building'))

    expect(result.current.scope).toBe('building')
  })

  it('toggles underground visibility off and back on', () => {
    const { result } = renderHook(() => useBuildingViewState())

    act(() => result.current.toggleUnderground())
    expect(result.current.showUnderground).toBe(false)

    act(() => result.current.toggleUnderground())
    expect(result.current.showUnderground).toBe(true)
  })
})

describe('useBuildingViewState inside a scene session provider', () => {
  it('starts from the scope and underground setting the session already holds', () => {
    const store = createSceneSessionStore({ scope: 'building', showUnderground: false })

    const { result } = renderBuildingViewOn(store)

    expect(result.current.scope).toBe('building')
    expect(result.current.showUnderground).toBe(false)
  })

  it('records a scope switch and an underground toggle in the session', () => {
    const store = createSceneSessionStore()
    const { result } = renderBuildingViewOn(store)

    act(() => result.current.setScope('building'))
    act(() => result.current.toggleUnderground())

    expect(store.getSceneSession()).toMatchObject({
      scope: 'building',
      showUnderground: false,
    })
  })

  it('hands a remounted view the scope and underground setting the earlier mount left behind', () => {
    const store = createSceneSessionStore()
    const firstMount = renderBuildingViewOn(store)

    act(() => firstMount.result.current.setScope('building'))
    act(() => firstMount.result.current.toggleUnderground())
    firstMount.unmount()

    const secondMount = renderBuildingViewOn(store)

    expect(secondMount.result.current.scope).toBe('building')
    expect(secondMount.result.current.showUnderground).toBe(false)
  })
})
