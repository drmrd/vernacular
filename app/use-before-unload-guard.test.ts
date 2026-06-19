import { describe, it, expect, afterEach, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useBeforeUnloadGuard } from './use-before-unload-guard'

// Dispatch a fresh `beforeunload` event on window and report whether the guard
// vetoed the navigation. jsdom delivers the event to registered listeners, so a
// spy on the event's `preventDefault` and a read of its `returnValue` reveal the
// native "you have unsaved changes" warning the browser would show.
function dispatchBeforeUnload(): { preventDefault: ReturnType<typeof vi.fn>; returnValue: unknown } {
  const event = new Event('beforeunload', { cancelable: true })
  const preventDefault = vi.fn()
  event.preventDefault = preventDefault
  window.dispatchEvent(event)
  return { preventDefault, returnValue: (event as Event & { returnValue: unknown }).returnValue }
}

describe('useBeforeUnloadGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('warns before unload while the project is dirty', () => {
    renderHook(() => {
      useBeforeUnloadGuard(true)
    })

    const { preventDefault, returnValue } = dispatchBeforeUnload()

    expect(preventDefault).toHaveBeenCalled()
    expect(returnValue).toBeTruthy()
  })

  it('stays silent before unload while the project is clean', () => {
    renderHook(() => {
      useBeforeUnloadGuard(false)
    })

    const { preventDefault, returnValue } = dispatchBeforeUnload()

    expect(preventDefault).not.toHaveBeenCalled()
    expect(returnValue).toBeFalsy()
  })

  it('removes the warning listener on unmount so a clean tab does not warn', () => {
    const { unmount } = renderHook(() => {
      useBeforeUnloadGuard(true)
    })

    unmount()

    const { preventDefault, returnValue } = dispatchBeforeUnload()

    expect(preventDefault).not.toHaveBeenCalled()
    expect(returnValue).toBeFalsy()
  })
})
