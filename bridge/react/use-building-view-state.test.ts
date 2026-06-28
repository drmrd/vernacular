import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useBuildingViewState } from './use-building-view-state'

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
