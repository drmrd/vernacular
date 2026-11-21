import { act, renderHook } from '@testing-library/react'
import { type ReactNode, type RefObject } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PLAN_HEIGHT, PLAN_WIDTH } from './plan-scene'
import { usePlanStageSize } from './use-plan-stage-size'
import { useViewport, ViewportProvider } from './viewport-context'

type ResizeCallback = (entries: { contentRect: { width: number; height: number } }[]) => void

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  observed: Element[] = []
  disconnected = false

  constructor(private readonly callback: ResizeCallback) {
    FakeResizeObserver.instances.push(this)
  }

  observe(target: Element) {
    this.observed.push(target)
  }

  disconnect() {
    this.disconnected = true
  }

  fire(width: number, height: number) {
    act(() => this.callback([{ contentRect: { width, height } }]))
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <ViewportProvider>{children}</ViewportProvider>
}

function renderStageSize(ref: RefObject<HTMLElement | null>) {
  return renderHook(
    () => {
      usePlanStageSize(ref)
      return useViewport().stageSize
    },
    { wrapper },
  )
}

function elementRef(element: HTMLElement | null): RefObject<HTMLElement | null> {
  return { current: element }
}

describe('usePlanStageSize', () => {
  afterEach(() => {
    FakeResizeObserver.instances = []
    vi.unstubAllGlobals()
  })

  it('reports the observed element content box on the first observer callback', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const element = document.createElement('div')
    const { result } = renderStageSize(elementRef(element))
    expect(FakeResizeObserver.instances).toHaveLength(1)
    expect(FakeResizeObserver.instances[0]?.observed).toEqual([element])
    FakeResizeObserver.instances[0]?.fire(1000, 500)
    expect(result.current).toEqual({ width: 1000, height: 500 })
  })

  it('reports again on each callback with a changed size', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const { result } = renderStageSize(elementRef(document.createElement('div')))
    FakeResizeObserver.instances[0]?.fire(1000, 500)
    FakeResizeObserver.instances[0]?.fire(700, 420)
    expect(result.current).toEqual({ width: 700, height: 420 })
  })

  it('disconnects the observer on unmount', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const { unmount } = renderStageSize(elementRef(document.createElement('div')))
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(false)
    unmount()
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true)
  })

  it('creates no observer while the element is not mounted', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const { result } = renderStageSize(elementRef(null))
    expect(FakeResizeObserver.instances).toHaveLength(0)
    expect(result.current).toEqual({ width: PLAN_WIDTH, height: PLAN_HEIGHT })
  })

  it('reports nothing and does not throw when ResizeObserver is not defined', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    const { result } = renderStageSize(elementRef(document.createElement('div')))
    expect(result.current).toEqual({ width: PLAN_WIDTH, height: PLAN_HEIGHT })
  })

  it('keeps the stage size when a hidden pane reports a zero size', () => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const { result } = renderStageSize(elementRef(document.createElement('div')))
    FakeResizeObserver.instances[0]?.fire(1000, 500)
    const measured = result.current
    FakeResizeObserver.instances[0]?.fire(0, 0)
    expect(result.current).toBe(measured)
  })
})
