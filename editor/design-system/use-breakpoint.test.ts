import { describe, it, expect, vi, afterEach } from 'vitest'
import { breakpointForWidth, WIDE_MIN_WIDTH, MEDIUM_MIN_WIDTH } from './use-breakpoint'

describe('breakpointForWidth', () => {
  it('reports wide at and above the wide threshold', () => {
    expect(breakpointForWidth(WIDE_MIN_WIDTH)).toBe('wide')
    expect(breakpointForWidth(WIDE_MIN_WIDTH + 1)).toBe('wide')
  })

  it('reports medium between the medium and wide thresholds', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH)).toBe('medium')
    expect(breakpointForWidth(WIDE_MIN_WIDTH - 1)).toBe('medium')
  })

  it('reports narrow below the medium threshold', () => {
    expect(breakpointForWidth(MEDIUM_MIN_WIDTH - 1)).toBe('narrow')
    expect(breakpointForWidth(0)).toBe('narrow')
  })
})

import { renderHook, act } from '@testing-library/react'
import { type RefObject } from 'react'
import { useBreakpoint } from './use-breakpoint'

type ResizeCallback = (entries: { contentRect: { width: number } }[]) => void

function installResizeObserverMock(): { fire: (width: number) => void } {
  let captured: ResizeCallback | null = null
  class FakeResizeObserver {
    constructor(callback: ResizeCallback) {
      captured = callback
    }
    observe() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  return {
    fire: (width: number) => act(() => captured?.([{ contentRect: { width } }])),
  }
}

describe('useBreakpoint', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports the breakpoint for the observed element width', () => {
    const observer = installResizeObserverMock()
    const ref: RefObject<HTMLElement | null> = { current: document.createElement('div') }
    const { result } = renderHook(() => useBreakpoint(ref))
    observer.fire(1280)
    expect(result.current).toBe('wide')
    observer.fire(700)
    expect(result.current).toBe('medium')
    observer.fire(400)
    expect(result.current).toBe('narrow')
  })
})
