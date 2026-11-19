import { act, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { switchProject } from '../session'
import type { FlowResult } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  createTestPorts,
  holdNextRead,
  openOrThrow,
  recordingPorts,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  countingStart,
  lockCalls,
  MISSING_ID,
  OTHER_ID,
  renderOwner,
  renderOwnerInActivity,
  START_ID,
  startRequest,
  unmountAndSettle,
  waitForFailure,
  waitForHandle,
  waitForHandleOtherThan,
} from './use-open-project-test-kit'
import type { OwnerInActivity } from './use-open-project-test-kit'

/** How many microtasks pass between the end of a flow and a hide of the owner. */
const MICROTASK_COUNTS = [0, 1, 2, 3, 4, 5] as const

const LOCK_START = `lock:${START_ID}`

/** Lets a held read end and settles what waited for it. */
function endHeldRead(letReadEnd: () => void): Promise<void> {
  return act(async () => {
    letReadEnd()
    await settle()
  })
}

interface HeldSwitch {
  /** Lets the read of the target end, waits for the flow to end, and settles. */
  readonly end: () => Promise<void>
}

/** Starts a switch from the open project to `OTHER_ID`, held at the read of the target. */
async function startHeldSwitch(owner: OwnerInActivity, ports: TestPorts): Promise<HeldSwitch> {
  const letTargetRead = holdNextRead(ports.workspace)
  const running: Array<Promise<unknown>> = []
  act(() => {
    running.push(
      owner.result.current.runFlow((given, current) =>
        switchProject(given, current, startRequest(OTHER_ID)),
      ),
    )
  })
  await act(settle)
  return {
    end: () =>
      act(async () => {
        letTargetRead()
        await Promise.all(running)
        await settle()
      }),
  }
}

async function hideAndSettle(owner: OwnerInActivity): Promise<void> {
  owner.hide()
  await act(settle)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useOpenProject when it is hidden while a flow runs', () => {
  it('a show before the flow ends keeps one project, the one that the flow opened, and one lock', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const owner = renderOwnerInActivity(ports, startRequest())
    await waitForHandle(owner.result)
    const held = await startHeldSwitch(owner, ports)

    await hideAndSettle(owner)
    owner.show()
    await act(settle)
    await held.end()
    await act(settle)

    expect(owner.result.current.handle?.id).toBe(OTHER_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    expect(lockCalls(log).filter((call) => call === LOCK_START)).toEqual([LOCK_START])
    await unmountAndSettle(owner.unmount)
  })

  it('a show after the flow ended opens the project that the flow opened', async () => {
    const ports = createTestPorts()
    const owner = renderOwnerInActivity(ports, startRequest())
    const first = await waitForHandle(owner.result)
    const held = await startHeldSwitch(owner, ports)
    await hideAndSettle(owner)
    await held.end()

    owner.show()
    const reopened = await waitForHandleOtherThan(owner.result, first)
    await act(settle)

    expect(reopened.id).toBe(OTHER_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    await unmountAndSettle(owner.unmount)
  })
})

describe('useOpenProject when a flow ends just before a hide', () => {
  it.each(MICROTASK_COUNTS)(
    'a flow that ends %i microtasks before the hide: a later show opens the project that the flow opened',
    async (microtasks) => {
      const ports = createTestPorts()
      const owner = renderOwnerInActivity(ports, startRequest())
      const first = await waitForHandle(owner.result)
      let endFlow: (outcome: FlowResult) => void = () => undefined
      const flowOutcome = new Promise<FlowResult>((resolve) => {
        endFlow = resolve
      })
      act(() => {
        void owner.result.current.runFlow(() => flowOutcome)
      })
      // The flow does its switch by hand: it opens the target and closes the current handle.
      const target = await openOrThrow(ports, startRequest(OTHER_ID))
      await first.close()

      await act(async () => {
        endFlow({ ok: true, handle: target })
        for (let passed = 0; passed < microtasks; passed += 1) await Promise.resolve()
        owner.hide()
      })
      await act(settle)
      owner.show()
      const reopened = await waitFor(() => {
        const shown = owner.result.current.handle
        if (shown === null || shown === first || shown === target) throw new Error('No reopen yet')
        return shown
      })

      expect(reopened.id).toBe(OTHER_ID)
      await unmountAndSettle(owner.unmount)
    },
  )
})

describe('useOpenProject when a start ends while the owner is hidden', () => {
  it('a start that fails while hidden shows its failure at the next show', async () => {
    const ports = createTestPorts()
    const letReadEnd = holdNextRead(ports.workspace)
    const owner = renderOwnerInActivity(ports, workspaceRequest(MISSING_ID))
    await act(settle)
    await hideAndSettle(owner)
    await endHeldRead(letReadEnd)

    owner.show()

    expect(await waitForFailure(owner.result)).toEqual({ kind: 'not-found' })
    await unmountAndSettle(owner.unmount)
  })

  it('a start that succeeds while hidden is closed, then opened again at the next show', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const letReadEnd = holdNextRead(ports.workspace)
    const owner = renderOwnerInActivity(ports, startRequest())
    await act(settle)
    await hideAndSettle(owner)
    await endHeldRead(letReadEnd)

    owner.show()
    const handle = await waitForHandle(owner.result)
    await act(settle)

    expect(handle.id).toBe(START_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([START_ID]))
    expect(lockCalls(log)).toEqual([LOCK_START, `unlock:${START_ID}`, LOCK_START])
    await unmountAndSettle(owner.unmount)
  })
})

describe('useOpenProject when a reopen fails', () => {
  it('retry repeats the reopen, and the reopened handle holds the document of the closed session', async () => {
    const ports = createTestPorts()
    const owner = renderOwnerInActivity(ports, countingStart())
    const closed = await waitForHandle(owner.result)
    const held = closed.session.getProject()
    await hideAndSettle(owner)
    const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    const elsewhere = await openOrThrow(otherTab, startRequest())
    owner.show()
    expect(await waitForFailure(owner.result)).toEqual({ kind: 'open-elsewhere' })
    await elsewhere.close()

    act(() => owner.result.current.retry())
    const reopened = await waitForHandleOtherThan(owner.result, closed)

    expect(reopened.session.getProject()).toEqual(held)
    await unmountAndSettle(owner.unmount)
  })
})

describe('useOpenProject when the start request changes while the start runs', () => {
  it('the changed start waits, and it never launches when the running start opened a project', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const letReadEnd = holdNextRead(ports.workspace)
    const { result, rerender, unmount } = renderOwner(ports, startRequest())
    await act(settle)

    rerender({ ports, start: startRequest(OTHER_ID) })
    await endHeldRead(letReadEnd)
    const handle = await waitForHandle(result)
    await act(settle)

    expect(handle.id).toBe(START_ID)
    expect(lockCalls(log)).toEqual([LOCK_START])
    await unmountAndSettle(unmount)
  })

  it('the changed start waits, and it launches after the running start failed', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const letReadEnd = holdNextRead(ports.workspace)
    const { result, rerender, unmount } = renderOwner(ports, workspaceRequest(MISSING_ID))
    await act(settle)

    rerender({ ports, start: startRequest() })
    await act(settle)
    expect(lockCalls(log)).not.toContain(LOCK_START)
    await endHeldRead(letReadEnd)
    const handle = await waitForHandle(result)

    expect(handle.id).toBe(START_ID)
    expect(lockCalls(log)).toContain(LOCK_START)
    await unmountAndSettle(unmount)
  })
})

describe('useOpenProject when a flow runs after the unmount', () => {
  it('a flow called in the gap after the unmount ends with every lock released', async () => {
    const ports = createTestPorts()
    const { result, unmount } = renderOwner(ports, startRequest())
    await waitForHandle(result)
    const running: Array<Promise<unknown>> = []

    act(() => {
      unmount()
      running.push(
        result.current.runFlow((given, current) =>
          switchProject(given, current, startRequest(OTHER_ID)),
        ),
      )
    })
    await act(async () => {
      await Promise.all(running)
      await settle()
    })

    await waitFor(async () => expect(await ports.locks.heldIds()).toEqual(new Set()))
  })
})
