import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FlowResult, FolderRefusal } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  recordingPorts,
  rename,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import {
  ACTION_RESULT,
  closesTheProject,
  gatedAction,
  keepsTheProject,
  settleRunAction,
  startAction,
} from './owner-action-test-support'
import type { Flow, OwnerAction } from './use-open-project'
import {
  gatedFlow,
  lockCalls,
  MISSING_ID,
  renderOwner,
  renderOwnerInActivity,
  resolvesWith,
  runFlowIn,
  START_ID,
  startRequest,
  unmountAndSettle,
  waitForFailure,
  waitForHandle,
} from './use-open-project-test-support'

const CANCELLED: FlowResult<FolderRefusal> = { ok: false, failure: { kind: 'cancelled' } }
const DISK_GONE = 'The disk is gone.'
const EDITED_NAME = 'Edited before the action'

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('an action of a card that runs through the owner of the open project', () => {
  it('gives the action the ports and the open project, and gives the caller its outcome', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    const handle = await waitForHandle(result)
    const action = vi.fn<OwnerAction<string>>(keepsTheProject())

    const settled = await settleRunAction(result, action)

    expect(action).toHaveBeenCalledExactlyOnceWith(ports, handle)
    expect(settled).toEqual({
      status: 'resolved',
      value: { result: ACTION_RESULT, currentClosed: false },
    })
    await unmountAndSettle(unmount)
  })

  it('gives the action no project when none is open', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, workspaceRequest(MISSING_ID))
    await waitForFailure(result)
    const action = vi.fn<OwnerAction<string>>(keepsTheProject())

    await settleRunAction(result, action)

    expect(action).toHaveBeenCalledExactlyOnceWith(ports, undefined)
    await unmountAndSettle(unmount)
  })

  it('gives undefined and calls nothing while a flow runs', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    await waitForHandle(result)
    const running = gatedFlow<FolderRefusal>(resolvesWith(CANCELLED))
    let flowEnd!: Promise<unknown>
    act(() => {
      flowEnd = result.current.runFlow(running.flow)
    })
    const action = vi.fn<OwnerAction<string>>(keepsTheProject())

    const settled = await settleRunAction(result, action)
    running.letEnd()
    await act(() => flowEnd)

    expect(settled).toEqual({ status: 'resolved', value: undefined })
    expect(action).not.toHaveBeenCalled()
    await unmountAndSettle(unmount)
  })

  it('gives undefined to a flow and calls nothing while an action runs', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    await waitForHandle(result)
    const running = gatedAction(keepsTheProject())
    const actionEnd = startAction(result, running.action)
    const flow = vi.fn<Flow<FolderRefusal>>(resolvesWith(CANCELLED))

    const outcome = await runFlowIn(result, flow)
    running.letEnd()
    await act(() => actionEnd)

    expect(outcome).toBeUndefined()
    expect(flow).not.toHaveBeenCalled()
    await unmountAndSettle(unmount)
  })
})

describe('the open project after an action of a card', () => {
  it('keeps the same project and its unsaved edit when the action did not end it', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    const handle = await waitForHandle(result)
    act(() => rename(handle, EDITED_NAME))

    await settleRunAction(result, keepsTheProject())

    expect(result.current.handle).toBe(handle)
    expect(handle.session.getProject().meta.name).toBe(EDITED_NAME)
    await unmountAndSettle(unmount)
  })

  it('shows no project and no failure after the action ended the open project', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    await waitForHandle(result)

    await settleRunAction(result, closesTheProject())

    expect(result.current.handle).toBeNull()
    expect(result.current.failure).toBeNull()
    await unmountAndSettle(unmount)
  })

  it('a project that an action ended is not opened again when the page becomes visible', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const owner = renderOwnerInActivity(ports, startRequest())
    await waitForHandle(owner.result)
    await settleRunAction(owner.result, closesTheProject())

    owner.hide()
    await act(settle)
    owner.show()
    await act(settle)

    expect(owner.result.current.handle).toBeNull()
    expect(owner.result.current.failure).toBeNull()
    expect(lockCalls(log).filter((call) => call === `lock:${START_ID}`)).toHaveLength(1)
    expect(await ports.locks.heldIds()).toEqual(new Set())
    await unmountAndSettle(owner.unmount)
  })

  it('shows no project and no failure, and opens nothing again, when the owner is hidden while an action ends the project', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const owner = renderOwnerInActivity(ports, startRequest())
    await waitForHandle(owner.result)
    const running = gatedAction(closesTheProject())
    const actionEnd = startAction(owner.result, running.action)
    owner.hide()

    running.letEnd()
    await act(() => actionEnd)
    owner.show()
    await act(settle)

    expect(owner.result.current.handle).toBeNull()
    expect(owner.result.current.failure).toBeNull()
    expect(lockCalls(log).filter((call) => call === `lock:${START_ID}`)).toHaveLength(1)
    expect(await ports.locks.heldIds()).toEqual(new Set())
    await unmountAndSettle(owner.unmount)
  })

  it('frees the owner for the next flow when an action rejects, and the caller sees the rejection', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    await waitForHandle(result)
    const rejecting: OwnerAction<string> = () => Promise.reject(new Error(DISK_GONE))
    const flow = vi.fn<Flow<FolderRefusal>>(resolvesWith(CANCELLED))

    const settled = await settleRunAction(result, rejecting)
    const outcome = await runFlowIn(result, flow)

    expect(settled).toEqual({ status: 'rejected', error: new Error(DISK_GONE) })
    expect(flow).toHaveBeenCalledOnce()
    expect(outcome).toEqual(CANCELLED)
    await unmountAndSettle(unmount)
  })

  it('installs nothing and throws nothing when an action ends after the owner unmounted', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    await waitForHandle(result)
    const running = gatedAction<string>(() =>
      Promise.resolve({ result: ACTION_RESULT, currentClosed: true }),
    )
    const actionEnd = startAction(result, running.action)
    await unmountAndSettle(unmount)

    running.letEnd()
    const outcome = await act(() => actionEnd)

    expect(outcome).toEqual({ result: ACTION_RESULT, currentClosed: true })
    expect(console.error).not.toHaveBeenCalled()
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})
