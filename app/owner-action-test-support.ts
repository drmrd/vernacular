import { act } from '@testing-library/react'
import { vi } from 'vitest'
import type { MockInstance } from 'vitest'
import type { DocumentHandle, SessionPorts } from '../session'
import { openOrThrow } from '../session/handle/handle-test-kit'
import type { ActionOutcome, OwnerAction } from './use-open-project'
import { startRequest } from './use-open-project-test-support'
import type { OwnerResult, Settled } from './use-open-project-test-support'

/** Test support: actions of a card that run through the owner of the open project. */

export const ACTION_RESULT = 'the action ran'

/** An action that touches no port, leaves the open project as it is, and gives `ACTION_RESULT`. */
export function keepsTheProject(): OwnerAction<string> {
  return () => Promise.resolve({ result: ACTION_RESULT, currentClosed: false })
}

/** An action that closes the project it is given, and says so. */
export function closesTheProject(): OwnerAction<string> {
  return async (_ports, current) => {
    await current?.close()
    return { result: ACTION_RESULT, currentClosed: true }
  }
}

/** Runs `action` through the owner inside `act`, and gives how `runAction` settled. */
export async function settleRunAction<Result>(
  result: OwnerResult,
  action: OwnerAction<Result>,
): Promise<Settled<ActionOutcome<Result> | undefined>> {
  const settled: Array<Settled<ActionOutcome<Result> | undefined>> = []
  await act(async () => {
    await result.current.runAction(action).then(
      (value) => settled.push({ status: 'resolved', value }),
      (error: unknown) => settled.push({ status: 'rejected', error }),
    )
  })
  const [outcome] = settled
  if (outcome === undefined) throw new Error('runAction did not settle')
  return outcome
}

/** Starts `action` through the owner inside `act`, and gives the promise of `runAction`. */
export function startAction<Result>(
  result: OwnerResult,
  action: OwnerAction<Result>,
): Promise<ActionOutcome<Result> | undefined> {
  let running!: Promise<ActionOutcome<Result> | undefined>
  act(() => {
    running = result.current.runAction(action)
  })
  return running
}

export interface GatedAction<Result> {
  readonly action: OwnerAction<Result>
  readonly letEnd: () => void
}

/** An action that waits until the test lets it end, then runs `then`. */
export function gatedAction<Result>(then: OwnerAction<Result>): GatedAction<Result> {
  let letEnd: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    letEnd = resolve
  })
  const action: OwnerAction<Result> = async (ports, current) => {
    await gate
    return then(ports, current)
  }
  return { action, letEnd: () => letEnd() }
}

/** The `close` of each handle that a step opened again, as spies that call through. */
export type ReopenedCloses = Array<MockInstance<DocumentHandle['close']>>

/**
 * Closes `current`, as a choice between two plan files does, and opens the same project again. A
 * project that nothing stored yet is made new again.
 */
async function reopenAfterClosing(
  ports: SessionPorts,
  current: DocumentHandle | undefined,
  closes: ReopenedCloses,
): Promise<DocumentHandle> {
  if (current === undefined) throw new Error('No project is open to reopen')
  await current.close()
  const reopened = await openOrThrow(ports, startRequest(current.id))
  closes.push(vi.spyOn(reopened, 'close'))
  return reopened
}

/** An action that ends the project it is given, opens it again, and reports the new handle. */
export function reopensTheProject(closes: ReopenedCloses): OwnerAction<string> {
  return async (ports, current) => {
    const reopened = await reopenAfterClosing(ports, current, closes)
    return { result: ACTION_RESULT, currentClosed: true, reopened }
  }
}

/** A flow that ends the project it is given, opens it again, and refuses with the new handle. */
export function refusesAfterReopeningTheProject(closes: ReopenedCloses) {
  return async (ports: SessionPorts, current: DocumentHandle | undefined) => {
    const handle = await reopenAfterClosing(ports, current, closes)
    return { ok: false, failure: { kind: 'cancelled' }, handle } as const
  }
}
