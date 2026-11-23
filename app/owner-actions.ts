import type { DocumentHandle, SessionPorts } from '../session'
import { dropHandle, isBusy, launchDueStart, resume, show } from './owner-memory'
import type { OwnerMemory } from './owner-memory'

/** What a card action gave, and whether it ended the project that it was given. */
export interface ActionOutcome<Result> {
  readonly result: Result
  /** True when the action ended the handle that it was given. */
  readonly currentClosed: boolean
  /** The handle that the action opened in place of the one it ended. Read when it ended one. */
  readonly reopened?: DocumentHandle | undefined
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
 * Forgets the handle that an action or a choice ended. The owner shows no handle and no failure,
 * and a close that the owner deferred for it is dropped, so the project is not opened again from
 * memory. The request that is current now never launches again, and a later request launches even
 * for the same id.
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
 * Takes the handle that a choice reported in place of the one it ended: the owner installs it, and
 * closes it instead when its effects are cleaned up. With no handle, the owner shows none, as after
 * a delete.
 */
export function installReopened(
  memory: OwnerMemory,
  ended: DocumentHandle | undefined,
  reopened: DocumentHandle | undefined,
): void {
  forgetEndedHandle(memory, ended)
  if (reopened === undefined) {
    return
  }
  if (memory.live) {
    show(memory, { handle: reopened, failure: null })
  } else {
    void dropHandle(memory, reopened)
  }
}

/**
 * Runs one action at a time, and never next to a flow. An action installs no handle: the open
 * project stays as it was, unless the action ended it, and then the handle that it reopened is
 * installed.
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
      installReopened(memory, current, outcome.reopened)
    }
    return outcome
  } finally {
    memory.flowRunning = false
    resume(memory)
    launchDueStart(memory)
  }
}
