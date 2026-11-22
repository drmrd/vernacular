import { act } from '@testing-library/react'
import type { ActionOutcome, OwnerAction } from './use-open-project'
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
