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
  /** Counts the set-ups of the owner's effects. */
  setUps: number
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
    setUps: 0,
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

/** Closes a handle that no set-up owner takes, and records the close for its ports. */
export function dropHandle(memory: OwnerMemory, handle: DocumentHandle): void {
  const closing = handle.close()
  memory.closed = { handle, closing }
  if (memory.ports !== null) {
    recordPendingClose(memory.ports, closing)
  }
}

function settleStart(memory: OwnerMemory, token: object, result: SwitchResult): void {
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

function startIsDue(memory: OwnerMemory): boolean {
  if (!memory.live || memory.handle !== null || isBusy(memory)) {
    return false
  }
  const { ports, request, launched } = memory
  if (ports === null || request === null) {
    return false
  }
  return launched === null || launched.ports !== ports || launched.id !== request.id
}

/** Launches the start for the latest ports and request when no project is open and none runs. */
export function launchDueStart(memory: OwnerMemory): void {
  const { ports, request } = memory
  if (!startIsDue(memory) || ports === null || request === null) {
    return
  }
  memory.launched = { ports, id: request.id }
  const target = { ports, request }
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
  const reopen = openAfterCloses({ ports, request })
  show(memory, { handle: null, failure: null })
  launchStart(memory, { ports, request }, () =>
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
  } else if (memory.failure !== null && memory.handle === null) {
    memory.setView({ handle: null, failure: memory.failure })
  }
}
