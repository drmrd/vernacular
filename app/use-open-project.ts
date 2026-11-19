import { useCallback, useEffect, useRef, useState } from 'react'
import { storageUnavailableOf, type OpenFailureCause } from './open-failure-text'
import type {
  DocumentHandle,
  FlowResult,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
} from '../session'
import {
  deferClose,
  dropHandle,
  isBusy,
  launchDueStart,
  launchRetry,
  newMemory,
  resume,
  show,
} from './owner-memory'
import type { OwnerMemory, OwnerView } from './owner-memory'

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

/**
 * Installs what a flow gave, or closes its handle when the owner's effects are cleaned up. A
 * project that the flow opened replaces the one that the owner closed meanwhile. When the effects
 * are cleaned up, the owner's own handle is no longer its handle: the flow closed it, and the
 * project that the flow opened is the one that the owner records as closed.
 */
function settleFlow<Refusal>(memory: OwnerMemory, result: FlowResult<Refusal>): void {
  if (!memory.live) {
    if (result.ok && result.handle !== memory.handle) {
      memory.handle = null
      dropHandle(memory, result.handle)
    }
    return
  }
  if (result.ok) {
    memory.closed = null
    show(memory, { handle: result.handle, failure: null })
  } else if (memory.handle === null && isSwitchFailure(result.failure)) {
    show(memory, { handle: null, failure: result.failure })
  }
}

/** Calls the flow. A flow that throws or rejects is logged and gives storage-unavailable. */
async function callFlow<Refusal>(
  flow: Flow<Refusal>,
  ports: SessionPorts,
  current: DocumentHandle | undefined,
): Promise<FlowResult<Refusal>> {
  try {
    return await flow(ports, current)
  } catch (error) {
    console.error(error)
    return { ok: false, failure: storageUnavailableOf(error) }
  }
}

async function runOneFlow<Refusal>(
  memory: OwnerMemory,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  const ports = memory.ports
  if (ports === null || isBusy(memory)) {
    return undefined
  }
  memory.flowRunning = true
  const result = await callFlow(flow, ports, memory.handle ?? undefined)
  memory.flowRunning = false
  settleFlow(memory, result)
  resume(memory)
  launchDueStart(memory)
  return result
}

/**
 * The one owner of the open project. It opens the start request once, installs the handle that
 * each flow gives, runs the start and the flows one at a time, and closes the open project when
 * its effects are cleaned up and not set up again in the same step. A later set-up opens that
 * project again.
 */
export function useOpenProject(ports: SessionPorts | null, start: OpenRequest | null): OpenProject {
  const [view, setView] = useState<OwnerView>({ handle: null, failure: null })
  const memoryRef = useRef<OwnerMemory>(newMemory(setView))
  useEffect(() => {
    const memory = memoryRef.current
    memory.live = true
    resume(memory)
    return () => {
      memory.live = false
      deferClose(memory)
    }
  }, [])
  useEffect(() => {
    const memory = memoryRef.current
    memory.ports = ports
    memory.request = start
    launchDueStart(memory)
  }, [ports, start])
  const runFlow = useCallback<RunFlow>((flow) => runOneFlow(memoryRef.current, flow), [])
  const retry = useCallback(() => {
    const memory = memoryRef.current
    if (memory.failure !== null && !isBusy(memory)) {
      launchRetry(memory)
    }
  }, [])
  return { handle: view.handle, failure: view.failure, runFlow, retry }
}
