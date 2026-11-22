import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  createTestPorts,
  openOrThrow,
  rename,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import type { DocumentHandle } from '../session'
import { createInitialProject } from './create-initial-project'
import { useBeforeUnloadGuard, useLeaveWarningGuard } from './use-before-unload-guard'

// Dispatch a fresh `beforeunload` event on window and report what the guard did
// to it. jsdom delivers the event to registered listeners, so a spy on the
// event's `preventDefault` is the reliable signal that the guard vetoed the
// navigation (the native "you have unsaved changes" warning). We also seed
// `returnValue` as a writable, falsy own property up front so that, after the
// dispatch, reading it reflects what the guard actively wrote rather than
// jsdom's live `Event.returnValue` getter (which derives from `defaultPrevented`
// and defaults truthy for a fresh event). preventDefault is the primary signal;
// the seeded returnValue lets the dirty case confirm the legacy-API write too.
function dispatchBeforeUnload(): {
  preventDefault: ReturnType<typeof vi.fn>
  returnValue: unknown
} {
  const event = new Event('beforeunload', { cancelable: true })
  const preventDefault = vi.fn()
  event.preventDefault = preventDefault
  Object.defineProperty(event, 'returnValue', {
    writable: true,
    configurable: true,
    value: '',
  })
  window.dispatchEvent(event)
  return {
    preventDefault,
    returnValue: (event as Event & { returnValue: unknown }).returnValue,
  }
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderHook(() => {
      useBeforeUnloadGuard(false)
    })

    const { preventDefault } = dispatchBeforeUnload()

    expect(preventDefault).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })

  it('removes the warning listener on unmount so a clean tab does not warn', () => {
    const { unmount } = renderHook(() => {
      useBeforeUnloadGuard(true)
    })

    unmount()

    const { preventDefault } = dispatchBeforeUnload()

    expect(preventDefault).not.toHaveBeenCalled()
  })
})

/** Opens the initial project over new in-memory ports that keep their files, or do not. */
async function openHandle(durable: boolean): Promise<DocumentHandle> {
  const request = { ...workspaceRequest('current'), create: createInitialProject }
  return openOrThrow(createTestPorts({ durable }), request)
}

describe('useLeaveWarningGuard', () => {
  it('warns before unload while the handle has an unsaved change, and not after it is saved', async () => {
    const handle = await openHandle(true)
    const { unmount } = renderHook(() => {
      useLeaveWarningGuard(handle)
    })

    act(() => {
      rename(handle, 'Edited before the unload')
    })
    expect(dispatchBeforeUnload().preventDefault).toHaveBeenCalled()

    await act(async () => {
      await handle.save()
    })
    expect(handle.saveStatus()).toBe('saved')
    expect(dispatchBeforeUnload().preventDefault).not.toHaveBeenCalled()

    unmount()
    await handle.close()
  })

  it('warns before unload while the handle is not durable, before its first save', async () => {
    const handle = await openHandle(false)
    const { unmount } = renderHook(() => {
      useLeaveWarningGuard(handle)
    })

    expect(dispatchBeforeUnload().preventDefault).toHaveBeenCalled()

    unmount()
    await handle.close()
  })

  it('keeps warning before unload after a save that only the tab holds', async () => {
    const handle = await openHandle(false)
    const { unmount } = renderHook(() => {
      useLeaveWarningGuard(handle)
    })
    act(() => {
      rename(handle, 'Edited in the tab')
    })

    await act(async () => {
      await handle.save()
    })

    expect(handle.saveStatus()).toBe('tab-only')
    expect(dispatchBeforeUnload().preventDefault).toHaveBeenCalled()

    unmount()
    await handle.close()
  })

  it('stays silent before unload while the handle is durable and nothing is unsaved', async () => {
    const handle = await openHandle(true)
    const { unmount } = renderHook(() => {
      useLeaveWarningGuard(handle)
    })

    expect(dispatchBeforeUnload().preventDefault).not.toHaveBeenCalled()

    unmount()
    await handle.close()
  })
})
