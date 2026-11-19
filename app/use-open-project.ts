import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { switchProject } from '../session'
import type { OpenFailureCause } from './open-failure-text'
import type {
  DocumentHandle,
  FlowResult,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
  SwitchResult,
} from '../session'

/** A step that may replace the open project: it gets the ports and the project open now. */
export type Flow<Refusal = never> = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
) => Promise<FlowResult<Refusal>>

/** Runs a flow. Resolves `undefined` when another flow or the start runs. */
export type RunFlow = <Refusal = never>(
  flow: Flow<Refusal>,
) => Promise<FlowResult<Refusal> | undefined>

/** The open project of the application, and the one way to replace it. */
export interface OpenProject {
  /** The open project. Null while the start runs and after a start that failed. */
  readonly handle: DocumentHandle | null
  /** Why no project is open. Null while the start runs and while a project is open. */
  readonly failure: SwitchFailure | null
  readonly runFlow: RunFlow
  /** Runs the start again after it failed. */
  readonly retry: () => void
}

/** What the owner shows: the open project, or why none is open. */
interface OwnerView {
  readonly handle: DocumentHandle | null
  readonly failure: SwitchFailure | null
}

type SetView = (view: OwnerView) => void

/** Which start an open belongs to: one ports object, one request, and one attempt. */
interface StartKey {
  readonly ports: SessionPorts
  readonly request: OpenRequest
  readonly attempt: number
}

/** An open of the start that runs or ran, and who waits for its result. */
interface RunningStart {
  readonly ports: SessionPorts
  readonly id: string
  readonly attempt: number
  /** Takes the result; null when no mounted owner waits, so the handle is closed instead. */
  deliver: ((result: SwitchResult) => void) | null
}

/** What the owner keeps between renders, read by the effects and by the callbacks. */
interface OwnerMemory {
  ports: SessionPorts | null
  handle: DocumentHandle | null
  failure: SwitchFailure | null
  /** True while the start or a flow runs. */
  busy: boolean
  mounted: boolean
  start: RunningStart | null
}

function newMemory(): OwnerMemory {
  return { ports: null, handle: null, failure: null, busy: false, mounted: false, start: null }
}

/** The kinds that the first switch of isSwitchFailure leaves to the second one. */
type OtherKind = Exclude<
  OpenFailureCause['kind'],
  SwitchFailure['kind'] | 'cancelled' | 'folder-empty'
>

/** The last kinds of isSwitchFailure. None of them is a kind of a failed switch. */
function isSwitchKindOfOther(kind: OtherKind): false {
  switch (kind) {
    case 'nothing-to-restore':
    case 'did-not-import':
    case 'did-not-restore':
    case 'unsupported-file':
      return false
  }
}

/**
 * True for a kind of a failed switch, as opposed to a flow's refusal. The switch names every kind of
 * SwitchFailure and some refusals, and hands the other kinds to a second switch. Neither has a
 * default for a kind it names, so a new kind is a type error until it is placed.
 */
function isSwitchKind(kind: OpenFailureCause['kind']): boolean {
  switch (kind) {
    case 'flush-failed':
    case 'open-elsewhere':
    case 'not-found':
    case 'folder-permission':
    case 'folder-unavailable':
    case 'did-not-open':
    case 'storage-unavailable':
      return true
    case 'cancelled':
    case 'folder-empty':
      return false
    default:
      return isSwitchKindOfOther(kind)
  }
}

/**
 * True for a failure that says why a project could not open, as opposed to a flow's refusal. Every
 * refusal that a flow gives is one of the kinds of OpenFailureCause.
 */
function isSwitchFailure(failure: unknown): failure is SwitchFailure {
  return (
    typeof failure === 'object' &&
    failure !== null &&
    'kind' in failure &&
    typeof failure.kind === 'string' &&
    isSwitchKind(failure.kind as OpenFailureCause['kind'])
  )
}

/** Records the view in the owner's memory at once, so callbacks see it before the next render. */
function show(memory: OwnerMemory, setView: SetView, view: OwnerView): void {
  memory.handle = view.handle
  memory.failure = view.failure
  setView(view)
}

function viewOf(result: SwitchResult): OwnerView {
  return result.ok
    ? { handle: result.handle, failure: null }
    : { handle: null, failure: result.failure }
}

function sameStart(running: RunningStart | null, key: StartKey): running is RunningStart {
  return (
    running !== null &&
    running.ports === key.ports &&
    running.id === key.request.id &&
    running.attempt === key.attempt
  )
}

/** Opens the start request. A result that nobody waits for has its handle closed. */
function launchStart(memory: OwnerMemory, key: StartKey): RunningStart {
  const running: RunningStart = {
    ports: key.ports,
    id: key.request.id,
    attempt: key.attempt,
    deliver: null,
  }
  memory.busy = true
  void switchProject(key.ports, undefined, key.request).then((result) => {
    if (memory.start === running) {
      memory.busy = false
    }
    if (running.deliver !== null) {
      running.deliver(result)
    } else if (result.ok) {
      void result.handle.close()
    }
  })
  return running
}

/**
 * Waits for the open of the start, and starts it when no open for the same key runs. A second
 * effect run for the same key attaches to the running open. Returns the function that detaches.
 */
function attachStart(memory: OwnerMemory, key: StartKey, deliver: (result: SwitchResult) => void) {
  const running = sameStart(memory.start, key) ? memory.start : launchStart(memory, key)
  memory.start = running
  running.deliver = deliver
  return () => {
    running.deliver = null
  }
}

/** Installs what a flow gave, or closes its handle when the owner is gone. */
function settleFlow<Refusal>(
  memory: OwnerMemory,
  setView: SetView,
  result: FlowResult<Refusal>,
): void {
  if (!memory.mounted) {
    if (result.ok && result.handle !== memory.handle) {
      void result.handle.close()
    }
    return
  }
  if (result.ok) {
    show(memory, setView, { handle: result.handle, failure: null })
  } else if (memory.handle === null && isSwitchFailure(result.failure)) {
    show(memory, setView, { handle: null, failure: result.failure })
  }
}

async function runOneFlow<Refusal>(
  memory: OwnerMemory,
  setView: SetView,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  const ports = memory.ports
  if (ports === null || memory.busy) {
    return undefined
  }
  memory.busy = true
  try {
    const result = await flow(ports, memory.handle ?? undefined)
    settleFlow(memory, setView, result)
    return result
  } finally {
    memory.busy = false
  }
}

/** Keeps the owner's ports current, marks it mounted, and closes the open project on unmount. */
function useOwnerLifetime(memoryRef: RefObject<OwnerMemory>, ports: SessionPorts | null): void {
  useEffect(() => {
    memoryRef.current.ports = ports
  }, [memoryRef, ports])
  useEffect(() => {
    const memory = memoryRef.current
    memory.mounted = true
    return () => {
      memory.mounted = false
      if (memory.handle !== null) {
        void memory.handle.close()
      }
    }
  }, [memoryRef])
}

/**
 * The one owner of the open project. It opens the start request once, installs the handle that
 * each flow gives, runs one flow at a time, and closes the open project when it unmounts.
 */
export function useOpenProject(ports: SessionPorts | null, start: OpenRequest | null): OpenProject {
  const memoryRef = useRef<OwnerMemory>(newMemory())
  const [view, setView] = useState<OwnerView>({ handle: null, failure: null })
  const [attempt, setAttempt] = useState(0)
  useOwnerLifetime(memoryRef, ports)
  useEffect(() => {
    const memory = memoryRef.current
    if (ports === null || start === null || memory.handle !== null) {
      return undefined
    }
    return attachStart(memory, { ports, request: start, attempt }, (result) => {
      show(memory, setView, viewOf(result))
    })
  }, [ports, start, attempt])
  const runFlow = useCallback<RunFlow>((flow) => runOneFlow(memoryRef.current, setView, flow), [])
  const retry = useCallback(() => {
    const memory = memoryRef.current
    if (memory.failure === null || memory.busy) {
      return
    }
    show(memory, setView, { handle: null, failure: null })
    setAttempt((count) => count + 1)
  }, [])
  return { handle: view.handle, failure: view.failure, runFlow, retry }
}
