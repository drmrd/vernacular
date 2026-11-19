import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { gateSaves, settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  openOrThrow,
  rename,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import type { DocumentHandle } from '../session'
import { createInitialProject } from './create-initial-project'
import { useUnsavedChangesGuard } from './use-before-unload-guard'
import { useFlushOnHidden } from './use-flush-on-hidden'

/** Makes the page look hidden or visible, and tells the listeners of the document. */
function changeVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

function hidePage(): void {
  changeVisibility('hidden')
}

function showPage(): void {
  changeVisibility('visible')
}

/** Opens a new project under `id` that nothing has stored yet. */
function openNewProject(ports: TestPorts, id: string): Promise<DocumentHandle> {
  return openOrThrow(ports, { ...workspaceRequest(id), create: createInitialProject })
}

/** Reports whether the prompt before unload vetoes the unload of the page now. */
function unloadIsPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(document, 'visibilityState')
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('useFlushOnHidden', () => {
  it('a visibilitychange to hidden calls flush() once', async () => {
    const handle = await openNewProject(createTestPorts(), 'a')
    const flush = vi.spyOn(handle, 'flush')
    renderHook(() => {
      useFlushOnHidden(handle)
    })

    hidePage()

    expect(flush).toHaveBeenCalledTimes(1)
  })

  it('the prompt before unload still shows while a write is pending', async () => {
    const ports = createTestPorts()
    const gate = gateSaves(ports.workspace)
    const handle = await openNewProject(ports, 'a')
    renderHook(() => {
      useUnsavedChangesGuard(handle)
      useFlushOnHidden(handle)
    })
    act(() => {
      rename(handle, 'Edited before the page hid')
    })

    hidePage()
    await act(settle)

    expect(gate.started()).toBe(1)
    expect(unloadIsPrevented()).toBe(true)
    await act(async () => {
      gate.endOldestSave()
      await settle()
    })
  })

  it('a visibilitychange to visible calls nothing', async () => {
    const handle = await openNewProject(createTestPorts(), 'a')
    const flush = vi.spyOn(handle, 'flush')
    renderHook(() => {
      useFlushOnHidden(handle)
    })

    showPage()

    expect(flush).not.toHaveBeenCalled()
  })

  it('after the unmount a hidden page calls no flush', async () => {
    const handle = await openNewProject(createTestPorts(), 'a')
    const flush = vi.spyOn(handle, 'flush')
    const { unmount } = renderHook(() => {
      useFlushOnHidden(handle)
    })
    unmount()

    hidePage()

    expect(flush).not.toHaveBeenCalled()
  })

  it('a new handle gets the flush, and the old one does not', async () => {
    const ports = createTestPorts()
    const first = await openNewProject(ports, 'first')
    const second = await openNewProject(ports, 'second')
    const flushFirst = vi.spyOn(first, 'flush')
    const flushSecond = vi.spyOn(second, 'flush')
    const { rerender } = renderHook(
      ({ handle }: { handle: DocumentHandle }) => {
        useFlushOnHidden(handle)
      },
      { initialProps: { handle: first } },
    )
    rerender({ handle: second })

    hidePage()

    expect(flushSecond).toHaveBeenCalledTimes(1)
    expect(flushFirst).not.toHaveBeenCalled()
  })
})
