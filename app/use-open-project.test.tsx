import { StrictMode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNewProject, openDocumentHandle, switchProject } from '../session'
import type {
  DocumentHandle,
  FlowResult,
  FolderRefusal,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
} from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  holdNextRead,
  openOrThrow,
  recordingPorts,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import { createInitialProject } from './create-initial-project'
import { useOpenProject } from './use-open-project'
import type { Flow, OpenProject } from './use-open-project'

const START_ID = 'a'
const OTHER_ID = 'b'
const MISSING_ID = 'never-stored'
const STORAGE_GONE = { kind: 'storage-unavailable', message: 'The storage is gone.' } as const

interface OwnerResult {
  readonly current: OpenProject
}

/** The start of the application: the project `id`, or a new project when none is stored. */
function startRequest(id: string = START_ID): OpenRequest {
  return { ...workspaceRequest(id), create: createInitialProject }
}

function renderOwner(ports: SessionPorts | null, start: OpenRequest | null) {
  return renderHook(() => useOpenProject(ports, start))
}

function waitForHandle(result: OwnerResult): Promise<DocumentHandle> {
  return waitFor(() => {
    const handle = result.current.handle
    if (handle === null) throw new Error('No project is open yet')
    return handle
  })
}

function waitForFailure(result: OwnerResult): Promise<SwitchFailure> {
  return waitFor(() => {
    const failure = result.current.failure
    if (failure === null) throw new Error('The start has not failed yet')
    return failure
  })
}

async function runFlowIn<Refusal>(
  result: OwnerResult,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  const outcomes: Array<FlowResult<Refusal> | undefined> = []
  await act(async () => {
    outcomes.push(await result.current.runFlow(flow))
  })
  return outcomes[0]
}

/** A flow that calls no port and resolves with `outcome`. */
function resolvesWith<Refusal>(outcome: FlowResult<Refusal>): Flow<Refusal> {
  return () => Promise.resolve(outcome)
}

/** The lock calls of a log of recording ports, in their order. */
function lockCalls(log: readonly string[]): string[] {
  return log.filter((entry) => entry.startsWith('lock:') || entry.startsWith('unlock:'))
}

async function unmountAndSettle(unmount: () => void): Promise<void> {
  await act(async () => {
    unmount()
    await settle()
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOpenProject at the start', () => {
  it('with no ports or no start request it opens nothing', async () => {
    const log: string[] = []
    const withoutPorts = renderOwner(null, startRequest())
    const withoutStart = renderOwner(recordingPorts(log), null)
    await act(settle)

    for (const { result } of [withoutPorts, withoutStart]) {
      expect(result.current.handle).toBeNull()
      expect(result.current.failure).toBeNull()
    }
    expect(log).toEqual([])
  })

  it('it opens the start request and gives the handle', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())

    const handle = await waitForHandle(result)

    expect(handle.id).toBe(START_ID)
    expect(result.current.failure).toBeNull()
    expect(await ports.locks.heldIds()).toEqual(new Set([START_ID]))
    await unmountAndSettle(unmount)
  })

  it('under StrictMode the start takes the lock once, and the project opens', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const start = startRequest()
    const { result, unmount } = renderHook(() => useOpenProject(ports, start), {
      wrapper: StrictMode,
    })

    const handle = await waitForHandle(result)
    await act(settle)

    expect(handle.id).toBe(START_ID)
    expect(result.current.failure).toBeNull()
    expect(lockCalls(log)).toEqual([`lock:${START_ID}`])
    await unmountAndSettle(unmount)
  })

  it('a start that fails gives the failure and no handle', async () => {
    const { result } = renderOwner(createTestPorts(), workspaceRequest(MISSING_ID))

    expect(await waitForFailure(result)).toEqual({ kind: 'not-found' })
    expect(result.current.handle).toBeNull()
  })

  it('retry runs the start again and opens once the cause is gone', async () => {
    const ports = createTestPorts()
    const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    const elsewhere = await openOrThrow(otherTab, startRequest())
    const { result, unmount } = renderOwner(ports, startRequest())
    expect(await waitForFailure(result)).toEqual({ kind: 'open-elsewhere' })
    await elsewhere.close()

    act(() => result.current.retry())
    const handle = await waitForHandle(result)

    expect(handle.id).toBe(START_ID)
    expect(result.current.failure).toBeNull()
    await unmountAndSettle(unmount)
  })
})

describe('useOpenProject running a flow', () => {
  it('runFlow gives the flow the ports and the open handle, and installs the handle it returns', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    const first = await waitForHandle(result)
    // This flow opens a second project and leaves the first one open, as no real flow does.
    const flow = vi.fn<Flow>((given) => openDocumentHandle(given, startRequest(OTHER_ID)))

    const outcome = await runFlowIn(result, flow)

    expect(flow).toHaveBeenCalledTimes(1)
    expect(flow.mock.calls[0]?.[0]).toBe(ports)
    expect(flow.mock.calls[0]?.[1]).toBe(first)
    expect(result.current.handle?.id).toBe(OTHER_ID)
    expect(outcome).toEqual({ ok: true, handle: result.current.handle })
    // A flow closes the handle it replaces, so the owner closes nothing after it.
    expect(await ports.locks.heldIds()).toEqual(new Set([START_ID, OTHER_ID]))
    await first.close()
    await unmountAndSettle(unmount)
  })

  it('a flow that fails leaves the handle and returns the failure', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    const first = await waitForHandle(result)

    const outcome = await runFlowIn(result, (ports, current) =>
      switchProject(ports, current, workspaceRequest(MISSING_ID)),
    )

    expect(outcome).toEqual({ ok: false, failure: { kind: 'not-found' } })
    expect(result.current.handle).toBe(first)
    expect(result.current.failure).toBeNull()
    await unmountAndSettle(unmount)
  })

  it('a second runFlow while one runs calls nothing and resolves undefined', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), startRequest())
    await waitForHandle(result)
    let endFirst: (outcome: FlowResult<FolderRefusal>) => void = () => undefined
    const first: Flow<FolderRefusal> = () =>
      new Promise((resolve) => {
        endFirst = resolve
      })
    const running: Array<Promise<FlowResult<FolderRefusal> | undefined>> = []
    act(() => {
      running.push(result.current.runFlow(first))
    })
    const second = vi.fn(resolvesWith<FolderRefusal>({ ok: false, failure: { kind: 'cancelled' } }))

    expect(await runFlowIn(result, second)).toBeUndefined()
    expect(second).not.toHaveBeenCalled()

    await act(async () => {
      endFirst({ ok: false, failure: { kind: 'cancelled' } })
      await Promise.all(running)
    })
    await runFlowIn(result, second)
    expect(second).toHaveBeenCalledTimes(1)
    await unmountAndSettle(unmount)
  })

  it('runFlow keeps its identity between renders', async () => {
    const { result, rerender, unmount } = renderOwner(createTestPorts(), startRequest())
    const kept = result.current.runFlow
    const handle = await waitForHandle(result)
    rerender()

    expect(result.current.runFlow).toBe(kept)
    // The kept function still reaches the handle that is open now.
    const flow = vi.fn<Flow>((ports, current) => switchProject(ports, current, startRequest()))
    await act(async () => {
      await kept(flow)
    })
    expect(flow.mock.calls[0]?.[1]).toBe(handle)
    await unmountAndSettle(unmount)
  })
})

describe('useOpenProject after a failed start', () => {
  it('after a failed start, a flow that opens installs its handle and clears the failure', async () => {
    const { result, unmount } = renderOwner(createTestPorts(), workspaceRequest(MISSING_ID))
    await waitForFailure(result)

    const outcome = await runFlowIn(result, (ports, current) =>
      createNewProject(ports, current, createInitialProject),
    )

    expect(result.current.handle).not.toBeNull()
    expect(outcome).toEqual({ ok: true, handle: result.current.handle })
    expect(result.current.failure).toBeNull()
    await unmountAndSettle(unmount)
  })

  it('after a failed start, a flow that fails replaces the failure, and a cancelled one does not', async () => {
    const { result } = renderOwner(createTestPorts(), workspaceRequest(MISSING_ID))
    await waitForFailure(result)

    await runFlowIn(result, resolvesWith({ ok: false, failure: STORAGE_GONE }))
    expect(result.current.failure).toEqual(STORAGE_GONE)

    await runFlowIn(
      result,
      resolvesWith<FolderRefusal>({ ok: false, failure: { kind: 'cancelled' } }),
    )
    expect(result.current.failure).toEqual(STORAGE_GONE)
  })
})

describe('useOpenProject on unmount', () => {
  it('an unmount closes the open handle, so its lock is free', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    await waitForHandle(result)

    await unmountAndSettle(unmount)

    await waitFor(async () => expect(await ports.locks.heldIds()).toEqual(new Set()))
  })

  it('a start that ends after the unmount closes its handle and logs nothing', async () => {
    const errors = vi.spyOn(console, 'error')
    const warnings = vi.spyOn(console, 'warn')
    const log: string[] = []
    const ports = recordingPorts(log)
    const letReadEnd = holdNextRead(ports.workspace)
    const { unmount } = renderOwner(ports, startRequest())
    await act(settle)

    unmount()
    await act(async () => {
      letReadEnd()
      await settle()
    })

    await waitFor(() => expect(lockCalls(log)).toEqual([`lock:${START_ID}`, `unlock:${START_ID}`]))
    expect(errors).not.toHaveBeenCalled()
    expect(warnings).not.toHaveBeenCalled()
  })
})
