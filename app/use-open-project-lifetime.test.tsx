import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDocumentHandle, switchProject } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createControlledLocks,
  createTestPorts,
  failSaves,
  holdNextRead,
  openOrThrow,
  recordingPorts,
  rename,
} from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { useOpenProject } from './use-open-project'
import {
  countingStart,
  gatedFlow,
  lockCalls,
  OTHER_ID,
  renderOwner,
  renderOwnerInActivity,
  START_ID,
  startRequest,
  unmountAndSettle,
  waitForHandle,
  waitForHandleOtherThan,
  waitForStartEnd,
} from './use-open-project-test-support'

const RENAMED = 'Renamed in this tab'

/** Stores the start project under its id, through ports of another page on the same root. */
async function storeStartProject(ports: TestPorts): Promise<void> {
  const handle = await openOrThrow(createTestPorts({ root: ports.root }), startRequest())
  await handle.save()
  await handle.close()
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOpenProject when its effects run again in one commit', () => {
  it('a hide and a show in one step keep the same open handle, and no lock is taken or freed', async () => {
    const log: string[] = []
    const owner = renderOwnerInActivity(recordingPorts(log), startRequest())
    const handle = await waitForHandle(owner.result)
    await act(settle)

    owner.hideAndShowInOneStep()
    await act(settle)

    expect(owner.result.current.handle).toBe(handle)
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`])
    await unmountAndSettle(owner.unmount)
  })

  it('after that step the handle still saves, and its session can still undo', async () => {
    const owner = renderOwnerInActivity(createTestPorts(), startRequest())
    const handle = await waitForHandle(owner.result)
    rename(handle, RENAMED)

    owner.hideAndShowInOneStep()
    await act(settle)

    expect(await handle.save()).toEqual({ ok: true })
    expect(handle.session.canUndo()).toBe(true)
    await unmountAndSettle(owner.unmount)
  })
})

describe('useOpenProject when it is shown again after a hide', () => {
  it('a hide and a later show open the project again, and the lock calls are lock, unlock, lock', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await storeStartProject(ports)
    const owner = renderOwnerInActivity(ports, startRequest())
    const closed = await waitForHandle(owner.result)
    owner.hide()
    await act(settle)

    owner.show()
    const reopened = await waitForHandleOtherThan(owner.result, closed)

    expect(reopened.id).toBe(START_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([START_ID]))
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `unlock:${START_ID}`, `lock:${START_ID}`])
    await unmountAndSettle(owner.unmount)
  })

  it('between that show and the new handle the owner shows no handle and no failure', async () => {
    const ports = createTestPorts()
    await storeStartProject(ports)
    const owner = renderOwnerInActivity(ports, startRequest())
    const closed = await waitForHandle(owner.result)
    owner.hide()
    await act(settle)
    const letReadEnd = holdNextRead(ports.workspace)

    owner.show()
    await act(settle)

    expect(owner.result.current.handle).toBeNull()
    expect(owner.result.current.failure).toBeNull()
    await act(async () => {
      letReadEnd()
      await settle()
    })
    await waitForHandleOtherThan(owner.result, closed)
    await unmountAndSettle(owner.unmount)
  })

  it('after a flow opened another project, a hide and a later show open that project, not the start request', async () => {
    const ports = createTestPorts()
    const owner = renderOwnerInActivity(ports, startRequest())
    await waitForHandle(owner.result)
    await act(() =>
      owner.result.current.runFlow((given, current) =>
        switchProject(given, current, startRequest(OTHER_ID)),
      ),
    )
    const closed = await waitForHandle(owner.result)
    owner.hide()
    await act(settle)

    owner.show()
    const reopened = await waitForHandleOtherThan(owner.result, closed)

    expect(reopened.id).toBe(OTHER_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    await unmountAndSettle(owner.unmount)
  })

  it('a new project that was never stored comes back with the document that its session held', async () => {
    const ports = createTestPorts()
    const owner = renderOwnerInActivity(ports, countingStart())
    const closed = await waitForHandle(owner.result)
    const held = closed.session.getProject()
    owner.hide()
    await act(settle)
    // The close stored nothing, so the store cannot give the project back.
    expect((await ports.workspace.read(START_ID)).ok).toBe(false)

    owner.show()
    const reopened = await waitForHandleOtherThan(owner.result, closed)

    expect(reopened.session.getProject().meta.name).toBe(held.meta.name)
    expect(reopened.session.getProject()).toEqual(held)
    await unmountAndSettle(owner.unmount)
  })

  it('a hide whose close fails keeps the project open, and the show installs the same handle', async () => {
    const ports = createTestPorts()
    const realSave = ports.workspace.save.bind(ports.workspace)
    const owner = renderOwnerInActivity(ports, startRequest())
    const handle = await waitForHandle(owner.result)
    rename(handle, RENAMED)
    failSaves(ports.workspace)
    owner.hide()
    await act(settle)

    owner.show()
    await act(settle)

    expect(owner.result.current.handle).toBe(handle)
    expect(await ports.locks.heldIds()).toEqual(new Set([START_ID]))
    ports.workspace.save = realSave
    await unmountAndSettle(owner.unmount)
  })
})

describe('useOpenProject on a remount', () => {
  it('an unmount followed at once by a new owner on the same ports opens the project, with the lock calls lock, unlock, lock', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const first = renderOwner(ports, startRequest())
    await waitForHandle(first.result)

    first.unmount()
    const second = renderOwner(ports, startRequest())
    const shown = await waitForStartEnd(second.result)

    expect(shown.failure).toBeNull()
    expect(shown.handle?.id).toBe(START_ID)
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `unlock:${START_ID}`, `lock:${START_ID}`])
    await unmountAndSettle(second.unmount)
  })

  it('a new owner on other ports of the same lock registry does not wait and gets open-elsewhere', async () => {
    const locks = createControlledLocks()
    const ports = { ...createTestPorts(), locks: locks.port }
    const otherTab = { ...createTestPorts({ root: ports.root }), locks: locks.port }
    const first = renderOwner(ports, startRequest())
    await waitForHandle(first.result)

    first.unmount()
    const second = renderOwner(otherTab, startRequest())
    const shown = await waitForStartEnd(second.result)

    expect(shown.failure).toEqual({ kind: 'open-elsewhere' })
    locks.endRelease()
    await act(settle)
  })
})

describe('useOpenProject on unmount while work runs', () => {
  it('a flow that ends after the unmount gets its handle closed, sets no state, and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error')
    const warnings = vi.spyOn(console, 'warn')
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    const first = await waitForHandle(result)
    const late = gatedFlow((given) => openDocumentHandle(given, startRequest(OTHER_ID)))
    act(() => {
      void result.current.runFlow(late.flow)
    })

    await unmountAndSettle(unmount)
    await act(async () => {
      late.letEnd()
      await settle()
    })

    await waitFor(async () => expect(await ports.locks.heldIds()).toEqual(new Set()))
    expect(result.current.handle).toBe(first)
    expect(errors).not.toHaveBeenCalled()
    expect(warnings).not.toHaveBeenCalled()
  })

  it('under StrictMode, an unmount while the start runs closes the late handle', async () => {
    const errors = vi.spyOn(console, 'error')
    const log: string[] = []
    const ports = recordingPorts(log)
    const letReadEnd = holdNextRead(ports.workspace)
    const start = startRequest()
    const { unmount } = renderHook(() => useOpenProject(ports, start), { wrapper: StrictMode })
    await act(settle)

    unmount()
    await act(async () => {
      letReadEnd()
      await settle()
    })

    await waitFor(() => expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `unlock:${START_ID}`]))
    expect(errors).not.toHaveBeenCalled()
  })
})
