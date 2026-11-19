import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import {
  createTestPorts,
  openOrThrow,
  rename,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import { createInitialProject } from './create-initial-project'
import { useBeforeUnloadGuard, useUnsavedChangesGuard } from './use-before-unload-guard'

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

describe('useUnsavedChangesGuard', () => {
  it('warns before unload while the handle has an unsaved change, and not after it is saved', async () => {
    const request = { ...workspaceRequest('current'), create: createInitialProject }
    const handle = await openOrThrow(createTestPorts(), request)
    const { unmount } = renderHook(() => {
      useUnsavedChangesGuard(handle)
    })

    act(() => {
      rename(handle, 'Edited before the unload')
    })
    expect(dispatchBeforeUnload().preventDefault).toHaveBeenCalled()

    await act(async () => {
      await handle.save()
    })
    expect(dispatchBeforeUnload().preventDefault).not.toHaveBeenCalled()

    unmount()
    await handle.close()
  })
})
