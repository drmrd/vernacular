import { act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDocumentHandle } from '../session'
import type { FlowResult, FolderRefusal } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  holdNextRead,
  openOrThrow,
  recordingPorts,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import type { Flow } from './use-open-project'
import {
  gatedFlow,
  lockCalls,
  MISSING_ID,
  OTHER_ID,
  renderOwner,
  resolvesWith,
  runFlowIn,
  settleRunFlow,
  START_ID,
  startRequest,
  unmountAndSettle,
  waitForFailure,
  waitForHandle,
} from './use-open-project-test-support'
import type { OwnerResult } from './use-open-project-test-support'

const FLOW_END = 'flow-end'
const DISK_GONE = 'The disk is gone.'
const CANCELLED: FlowResult<FolderRefusal> = { ok: false, failure: { kind: 'cancelled' } }

/** The owner after a start that failed because the project is not stored. */
async function renderFailedStart(ports: TestPorts) {
  const owner = renderOwner(ports, workspaceRequest(MISSING_ID))
  await waitForFailure(owner.result)
  return owner
}

/** The owner after a start that failed because another tab held the project, now free again. */
async function renderStartThatWasOpenElsewhere(ports: TestPorts) {
  const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
  const elsewhere = await openOrThrow(otherTab, startRequest())
  const owner = renderOwner(ports, startRequest())
  await waitForFailure(owner.result)
  await elsewhere.close()
  return owner
}

/** Starts `flow` through the owner inside `act` and gives the promise of `runFlow`. */
function startFlow<Refusal>(result: OwnerResult, flow: Flow<Refusal>) {
  const running: Array<Promise<FlowResult<Refusal> | undefined>> = []
  act(() => {
    running.push(result.current.runFlow(flow))
  })
  return Promise.all(running)
}

/** The lock calls and the flow ends in `log`, in their order. */
function lockCallsAndFlowEnds(log: readonly string[]): string[] {
  return log.filter((entry) => entry === FLOW_END || lockCalls([entry]).length > 0)
}

function rejecting(): Flow {
  return () => Promise.reject(new Error(DISK_GONE))
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOpenProject when a retry and a flow meet', () => {
  it('retry() and then runFlow in one handler: the flow is not called, runFlow resolves undefined, and one open runs', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, unmount } = await renderStartThatWasOpenElsewhere(ports)
    const flow = vi.fn<Flow>((given) => openDocumentHandle(given, startRequest(OTHER_ID)))
    const outcomes: Array<Promise<FlowResult | undefined>> = []

    act(() => {
      result.current.retry()
      outcomes.push(result.current.runFlow(flow))
    })
    const [outcome] = await act(() => Promise.all(outcomes))
    await waitForHandle(result)

    expect(outcome).toBeUndefined()
    expect(flow).not.toHaveBeenCalled()
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `lock:${START_ID}`])
    await unmountAndSettle(unmount)
  })

  it('retry does nothing while a project is open and while the start runs, and a double retry gives one new open', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, unmount } = await renderStartThatWasOpenElsewhere(ports)
    const letReadEnd = holdNextRead(ports.workspace)

    act(() => {
      result.current.retry()
      result.current.retry()
    })
    await act(settle)
    act(() => result.current.retry())
    await act(async () => {
      letReadEnd()
      await settle()
    })
    const handle = await waitForHandle(result)
    act(() => result.current.retry())
    await act(settle)

    expect(result.current.handle).toBe(handle)
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `lock:${START_ID}`])
    await unmountAndSettle(unmount)
  })
})

describe('useOpenProject when the start request changes while a flow runs', () => {
  it('a start request that changes while a flow runs takes no lock until the flow ends', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, rerender, unmount } = await renderFailedStart(ports)
    const held = gatedFlow(resolvesWith(CANCELLED))
    const running = startFlow(result, held.flow)
    const mark = log.length

    rerender({ ports, start: startRequest() })
    await act(settle)

    expect(lockCalls(log.slice(mark))).toEqual([])
    await act(async () => {
      held.letEnd()
      await running
    })
    await unmountAndSettle(unmount)
  })

  it('when that flow opened a project, the changed start never opens, and one lock is held', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, rerender, unmount } = await renderFailedStart(ports)
    const held = gatedFlow((given) => openDocumentHandle(given, startRequest(OTHER_ID)))
    const running = startFlow(result, held.flow)
    rerender({ ports, start: startRequest() })
    await act(settle)

    await act(async () => {
      held.letEnd()
      await running
      await settle()
    })

    expect(result.current.handle?.id).toBe(OTHER_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    await unmountAndSettle(unmount)
  })

  it('when that flow opened a project, no lock call after the change takes the lock of the start', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, rerender, unmount } = await renderFailedStart(ports)
    const held = gatedFlow((given) => openDocumentHandle(given, startRequest(OTHER_ID)))
    const running = startFlow(result, held.flow)
    rerender({ ports, start: startRequest() })
    const mark = log.length
    await act(settle)

    await act(async () => {
      held.letEnd()
      await running
      await settle()
    })

    expect(lockCalls(log.slice(mark))).not.toContain(`lock:${START_ID}`)
    await unmountAndSettle(unmount)
  })

  it('when that flow opened nothing, the changed start opens after it', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, rerender, unmount } = await renderFailedStart(ports)
    const held = gatedFlow<FolderRefusal>(() => {
      log.push(FLOW_END)
      return Promise.resolve(CANCELLED)
    })
    const running = startFlow(result, held.flow)
    const mark = log.length
    rerender({ ports, start: startRequest() })
    await act(settle)

    await act(async () => {
      held.letEnd()
      await running
    })
    const handle = await waitForHandle(result)

    expect(lockCallsAndFlowEnds(log.slice(mark))).toEqual([FLOW_END, `lock:${START_ID}`])
    expect(handle.id).toBe(START_ID)
    await unmountAndSettle(unmount)
  })
})

describe('useOpenProject when a new start comes with no project open', () => {
  it('a changed start after a failed start shows no failure while it opens, then the handle', async () => {
    const ports = createTestPorts()
    const { result, rerender, unmount } = await renderFailedStart(ports)
    const letReadEnd = holdNextRead(ports.workspace)

    rerender({ ports, start: startRequest() })
    await act(settle)

    expect(result.current.failure).toBeNull()
    expect(result.current.handle).toBeNull()
    await act(async () => {
      letReadEnd()
      await settle()
    })
    expect((await waitForHandle(result)).id).toBe(START_ID)
    await unmountAndSettle(unmount)
  })

  it('null ports that become ports together with a start open that start on those ports', async () => {
    const ports = createTestPorts()
    const { result, rerender, unmount } = renderOwner(null, startRequest())

    rerender({ ports, start: startRequest(OTHER_ID) })
    const handle = await waitForHandle(result)

    expect(handle.id).toBe(OTHER_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    await unmountAndSettle(unmount)
  })

  it('the same start request given again after a failed start opens nothing', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const start = workspaceRequest(MISSING_ID)
    const { result, rerender } = renderOwner(ports, start)
    await waitForFailure(result)
    const mark = log.length

    rerender({ ports, start })
    await act(settle)

    expect(log.slice(mark)).toEqual([])
    expect(result.current.failure).toEqual({ kind: 'not-found' })
  })
})

describe('useOpenProject when a flow rejects', () => {
  it('a flow that rejects is logged once, frees the owner, and runFlow resolves storage-unavailable with its message', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    const handle = await waitForHandle(result)

    const settled = await settleRunFlow(result, rejecting())

    expect(settled).toEqual({
      status: 'resolved',
      value: { ok: false, failure: { kind: 'storage-unavailable', message: DISK_GONE } },
    })
    expect(errors).toHaveBeenCalledTimes(1)
    const next = vi.fn(resolvesWith(CANCELLED))
    await runFlowIn(result, next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(result.current.handle).toBe(handle)
    await unmountAndSettle(unmount)
  })

  it('after a failed start, a flow that rejects makes storage-unavailable the failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result } = await renderFailedStart(createTestPorts())

    await settleRunFlow(result, rejecting())

    expect(result.current.failure).toEqual({ kind: 'storage-unavailable', message: DISK_GONE })
  })
})

describe('useOpenProject after a project opened or with nothing to open', () => {
  it('a change of the start request after a project opened opens nothing', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const { result, rerender, unmount } = renderOwner(ports, startRequest())
    const handle = await waitForHandle(result)

    rerender({ ports, start: startRequest(OTHER_ID) })
    await act(settle)

    expect(result.current.handle).toBe(handle)
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`])
    await unmountAndSettle(unmount)
  })

  it('a change of the ports after a project opened opens and closes nothing, and the next flow gets the new ports', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const newPorts = createTestPorts()
    const start = startRequest()
    const { result, rerender, unmount } = renderOwner(ports, start)
    const handle = await waitForHandle(result)

    rerender({ ports: newPorts, start })
    await act(settle)

    expect(result.current.handle).toBe(handle)
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`])
    expect(await newPorts.locks.heldIds()).toEqual(new Set())
    const flow = vi.fn(resolvesWith(CANCELLED))
    await runFlowIn(result, flow)
    expect(flow.mock.calls[0]?.[0]).toBe(newPorts)
    await unmountAndSettle(unmount)
  })

  it('runFlow with null ports resolves undefined and calls nothing', async () => {
    const { result } = renderOwner(null, startRequest())
    const flow = vi.fn(resolvesWith(CANCELLED))

    expect(await runFlowIn(result, flow)).toBeUndefined()
    expect(flow).not.toHaveBeenCalled()
  })

  it('after a failed start, folder-empty leaves the failure in place', async () => {
    const { result } = await renderFailedStart(createTestPorts())

    await runFlowIn(
      result,
      resolvesWith<FolderRefusal>({ ok: false, failure: { kind: 'folder-empty' } }),
    )

    expect(result.current.failure).toEqual({ kind: 'not-found' })
  })
})
