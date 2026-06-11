import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePaneResize } from './use-pane-resize'

const options = { initial: 16, min: 8, max: 24 }

describe('usePaneResize', () => {
  it('starts at the initial size', () => {
    const { result } = renderHook(() => usePaneResize(options))
    expect(result.current.size).toBe(16)
  })

  it('steps the size and clamps to the maximum', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeStep(4))
    expect(result.current.size).toBe(20)
    act(() => result.current.onResizeStep(100))
    expect(result.current.size).toBe(24)
  })

  it('steps down and clamps to the minimum', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeStep(-100))
    expect(result.current.size).toBe(8)
  })

  it('sets an absolute size clamped to bounds', () => {
    const { result } = renderHook(() => usePaneResize(options))
    act(() => result.current.onResizeTo(40))
    expect(result.current.size).toBe(24)
  })
})
