import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaneCollapse } from './use-pane-collapse'

describe('usePaneCollapse', () => {
  it('defaults to the initial collapsed state', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    expect(result.current.collapsed).toBe(false)
  })

  it('toggle flips the collapsed state', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(true)
    act(() => result.current.toggle())
    expect(result.current.collapsed).toBe(false)
  })

  it('setCollapsed sets the state explicitly', () => {
    const { result } = renderHook(() => usePaneCollapse(false))
    act(() => result.current.setCollapsed(true))
    expect(result.current.collapsed).toBe(true)
  })
})
