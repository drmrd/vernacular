import type { DocumentHandle, SessionPorts } from '../session'
import { isBusy, launchDueStart, resume, show } from './owner-memory'
import type { OwnerMemory } from './owner-memory'

/** What a card action gave, and whether it ended the project that it was given. */
export interface ActionOutcome<Result> {
  readonly result: Result
  /** True when the action ended the handle that it was given. */
  readonly currentClosed: boolean
}

/** A step that changes the stored projects: it gets the ports and the project open now. */
export type OwnerAction<Result> = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
) => Promise<ActionOutcome<Result>>

/** Runs an action. Resolves `undefined` when the owner has no ports or another step runs. */
export type RunAction = <Result>(
  action: OwnerAction<Result>,
) => Promise<ActionOutcome<Result> | undefined>

/**
 * Forgets the handle that an action ended. The owner shows no handle and no failure, and a close
 * that the owner deferred for it is dropped, so the project is not opened again from memory. The
 * request that is current now never launches again, and a later request launches even for the same id.
 */
function forgetEndedHandle(memory: OwnerMemory, ended: DocumentHandle | undefined): void {
  if (ended !== undefined && memory.closed?.handle === ended) {
    memory.closed = null
  }
  show(memory, { handle: null, failure: null })
  memory.launched = null
  memory.retired = memory.request
}

/**
 * Runs one action at a time, and never next to a flow. An action installs no handle: the open
 * project stays as it was, unless the action ended it.
 */
export async function runOneAction<Result>(
  memory: OwnerMemory,
  action: OwnerAction<Result>,
): Promise<ActionOutcome<Result> | undefined> {
  const ports = memory.ports
  if (ports === null || isBusy(memory)) {
    return undefined
  }
  const current = memory.handle ?? undefined
  memory.flowRunning = true
  try {
    const outcome = await action(ports, current)
    if (outcome.currentClosed) {
      forgetEndedHandle(memory, current)
    }
    return outcome
  } finally {
    memory.flowRunning = false
    resume(memory)
    launchDueStart(memory)
  }
}
