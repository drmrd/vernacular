import { switchProject } from '../session'
import type {
  DocumentHandle,
  OpenRequest,
  SaveOutcome,
  SessionPorts,
  SwitchFailure,
  SwitchResult,
} from '../session'
import { afterPendingCloses, recordPendingClose } from './pending-closes'

/** What the owner shows: the open project, or why none is open. */
export interface OwnerView {
  readonly handle: DocumentHandle | null
  readonly failure: SwitchFailure | null
}

/** Which project a start opens, and on which ports. */
interface StartTarget {
  readonly ports: SessionPorts
  readonly request: OpenRequest
}

/** A handle that the owner closed while its effects were cleaned up, and that close. */
interface ClosedHandle {
  readonly handle: DocumentHandle
  readonly closing: Promise<SaveOutcome>
}

/** What the owner keeps between renders, read and written by its effects and callbacks. */
export interface OwnerMemory {
  readonly setView: (view: OwnerView) => void
  /** The ports and the start request of the latest committed render. */
  ports: SessionPorts | null
  request: OpenRequest | null
  handle: DocumentHandle | null
  failure: SwitchFailure | null
  /** True while the owner's effects are set up. */
  live: boolean
  /** The start that runs, as a token that its result is checked against. */
  start: object | null
  flowRunning: boolean
  /** The ports and the id of the last start request that launched a start. */
  launched: { readonly ports: SessionPorts; readonly id: string } | null
  /** What retry opens: the target of the last start. */
  retryTarget: StartTarget | null
  closed: ClosedHandle | null
}

export function newMemory(setView: (view: OwnerView) => void): OwnerMemory {
  return {
    setView,
    ports: null,
    request: null,
    handle: null,
    failure: null,
    live: false,
    start: null,
    flowRunning: false,
    launched: null,
    retryTarget: null,
    closed: null,
  }
}

/** Records the view in the owner's memory at once, so callbacks see it before the next render. */
export function show(memory: OwnerMemory, view: OwnerView): void {
  memory.handle = view.handle
  memory.failure = view.failure
  memory.setView(view)
}

/** True while the start or a flow runs. */
export function isBusy(memory: OwnerMemory): boolean {
  return memory.start !== null || memory.flowRunning
}

/**
 * Closes a handle that no set-up owner takes, and gives the close. The close is recorded for the
 * latest ports of the owner, which can differ from the ports that the handle was opened on after a
 * change of ports.
 */
export function dropHandle(memory: OwnerMemory, handle: DocumentHandle): Promise<SaveOutcome> {
  const closing = handle.close()
  memory.closed = { handle, closing }
  if (memory.ports !== null) {
    recordPendingClose(memory.ports, closing)
  }
  return closing
}

/**
 * Closes the open project one microtask after a clean-up, unless the effects were set up again
 * by then or the project changed. The close is recorded for the ports at once, so a new owner on
 * them waits for it. A clean-up, a set-up, and a second clean-up in one step close the project
 * once: the first microtask closes it and clears the handle, so the second finds it gone.
 */
export function deferClose(memory: OwnerMemory): void {
  const { handle, ports } = memory
  if (handle === null) {
    return
  }
  const decided = new Promise<unknown>((resolve) => {
    queueMicrotask(() => {
      if (memory.live || memory.handle !== handle) {
        resolve(undefined)
        return
      }
      memory.handle = null
      resolve(dropHandle(memory, handle))
    })
  })
  if (ports !== null) {
    recordPendingClose(ports, decided)
  }
}

function settleStart(memory: OwnerMemory, token: object, result: SwitchResult): void {
  // A guard: every launch of a start but the reopen waits while one runs, and the reopen never
  // overlaps a start, so no start is replaced today.
  if (memory.start !== token) {
    if (result.ok) {
      dropHandle(memory, result.handle)
    }
    return
  }
  memory.start = null
  if (!memory.live) {
    if (result.ok) {
      dropHandle(memory, result.handle)
    } else {
      memory.failure = result.failure
    }
    return
  }
  show(
    memory,
    result.ok
      ? { handle: result.handle, failure: null }
      : { handle: null, failure: result.failure },
  )
  launchDueStart(memory)
}

/** Shows no handle and no failure, and installs or shows what the opening gives. */
function launchStart(
  memory: OwnerMemory,
  target: StartTarget,
  opening: () => Promise<SwitchResult>,
): void {
  const token = {}
  memory.start = token
  memory.retryTarget = target
  if (memory.failure !== null || memory.handle !== null) {
    show(memory, { handle: null, failure: null })
  }
  void opening().then((result) => {
    settleStart(memory, token, result)
  })
}

/** Opens the target after the closes recorded for its ports. */
function openAfterCloses(target: StartTarget): () => Promise<SwitchResult> {
  return () =>
    afterPendingCloses(target.ports, () => switchProject(target.ports, undefined, target.request))
}

/** Runs the last start again on its ports. */
export function launchRetry(memory: OwnerMemory): void {
  const target = memory.retryTarget
  if (target !== null) {
    launchStart(memory, target, openAfterCloses(target))
  }
}

/**
 * The start that is due: the latest ports and request, when the effects are set up, no project is
 * open, nothing runs, and no start was launched for this ports and request yet. Otherwise null.
 */
function dueTarget(memory: OwnerMemory): StartTarget | null {
  if (!memory.live || memory.handle !== null || isBusy(memory)) {
    return null
  }
  const { ports, request, launched } = memory
  if (ports === null || request === null) {
    return null
  }
  const isNew = launched === null || launched.ports !== ports || launched.id !== request.id
  return isNew ? { ports, request } : null
}

/** Launches the start for the latest ports and request when no project is open and none runs. */
export function launchDueStart(memory: OwnerMemory): void {
  const target = dueTarget(memory)
  if (target === null) {
    return
  }
  memory.launched = { ports: target.ports, id: target.request.id }
  launchStart(memory, target, openAfterCloses(target))
}

/**
 * Opens the project that the owner closed again, from the document of its session when the store
 * does not hold it. When its close failed, the handle is still open and is installed again.
 */
function reopenClosed(memory: OwnerMemory, closed: ClosedHandle): void {
  const ports = memory.ports
  if (ports === null) {
    return
  }
  const { handle } = closed
  const project = handle.session.getProject()
  const request: OpenRequest = { id: handle.id, location: handle.location, create: () => project }
  const target = { ports, request }
  const reopen = openAfterCloses(target)
  // The deferred close cleared the handle in the memory and updated no view, so while the owner is
  // hidden the memory and the view differ. Showing no handle brings the view to the memory.
  show(memory, { handle: null, failure: null })
  launchStart(memory, target, () =>
    closed.closing.then((outcome): Promise<SwitchResult> | SwitchResult =>
      outcome.ok ? reopen() : { ok: true, handle },
    ),
  )
}

/** After a set-up, opens again what the owner closed, or shows a failure that came meanwhile. */
export function resume(memory: OwnerMemory): void {
  const closed = memory.closed
  memory.closed = null
  if (closed !== null) {
    reopenClosed(memory, closed)
  } else if (memory.failure !== null) {
    // A failure is kept only while no handle is open: show clears it with any handle, and the
    // settle of a start sets it only after the launch of that start cleared the handle.
    memory.setView({ handle: null, failure: memory.failure })
  }
}
