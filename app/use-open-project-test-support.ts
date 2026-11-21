import { Activity, createElement, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { act, renderHook, waitFor } from '@testing-library/react'
import type {
  DocumentHandle,
  FlowResult,
  OpenRequest,
  SessionPorts,
  SwitchFailure,
} from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import { workspaceRequest } from '../session/handle/handle-test-kit'
import { createInitialProject } from './create-initial-project'
import { useOpenProject } from './use-open-project'
import type { Flow, OpenProject } from './use-open-project'

/** Test support: renders the owner of the open project and follows what it gives. */

export const START_ID = 'a'
export const OTHER_ID = 'b'
export const MISSING_ID = 'never-stored'

export interface OwnerResult {
  readonly current: OpenProject
}

export interface OwnerProps {
  readonly ports: SessionPorts | null
  readonly start: OpenRequest | null
}

/** The start of the application: the project `id`, or a new project when none is stored. */
export function startRequest(id: string = START_ID): OpenRequest {
  return { ...workspaceRequest(id), create: createInitialProject }
}

/** A start request whose `create` names each new document by the order of its call. */
export function countingStart(): OpenRequest {
  let created = 0
  return {
    ...startRequest(),
    create: () => {
      created += 1
      const project = createInitialProject()
      return { ...project, meta: { ...project.meta, name: `Created ${created}` } }
    },
  }
}

/** The lock calls of a log of recording ports, in their order. */
export function lockCalls(log: readonly string[]): string[] {
  return log.filter((entry) => entry.startsWith('lock:') || entry.startsWith('unlock:'))
}

export function waitForHandle(result: OwnerResult): Promise<DocumentHandle> {
  return waitFor(() => {
    const handle = result.current.handle
    if (handle === null) throw new Error('No project is open yet')
    return handle
  })
}

/** Waits for a handle that is not `old`. */
export function waitForHandleOtherThan(
  result: OwnerResult,
  old: DocumentHandle,
): Promise<DocumentHandle> {
  return waitFor(() => {
    const handle = result.current.handle
    if (handle === null || handle === old) throw new Error('No other project is open yet')
    return handle
  })
}

export function waitForFailure(result: OwnerResult): Promise<SwitchFailure> {
  return waitFor(() => {
    const failure = result.current.failure
    if (failure === null) throw new Error('The start has not failed yet')
    return failure
  })
}

/** Waits until the owner gives a handle or a failure, and gives what it shows then. */
export function waitForStartEnd(result: OwnerResult): Promise<OpenProject> {
  return waitFor(() => {
    const shown = result.current
    if (shown.handle === null && shown.failure === null) throw new Error('The start runs')
    return shown
  })
}

export type Settled<Value> =
  | { readonly status: 'resolved'; readonly value: Value }
  | { readonly status: 'rejected'; readonly error: unknown }

/** Runs `flow` through the owner inside `act`, and gives how `runFlow` settled. */
export async function settleRunFlow<Refusal>(
  result: OwnerResult,
  flow: Flow<Refusal>,
): Promise<Settled<FlowResult<Refusal> | undefined>> {
  const settled: Array<Settled<FlowResult<Refusal> | undefined>> = []
  await act(async () => {
    await result.current.runFlow(flow).then(
      (value) => settled.push({ status: 'resolved', value }),
      (error: unknown) => settled.push({ status: 'rejected', error }),
    )
  })
  const [outcome] = settled
  if (outcome === undefined) throw new Error('runFlow did not settle')
  return outcome
}

/** Runs `flow` through the owner inside `act`, and gives what `runFlow` resolved with. */
export async function runFlowIn<Refusal>(
  result: OwnerResult,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  const settled = await settleRunFlow(result, flow)
  if (settled.status === 'rejected') throw new Error('runFlow rejected', { cause: settled.error })
  return settled.value
}

/** A flow that calls no port and resolves with `outcome`. */
export function resolvesWith<Refusal>(outcome: FlowResult<Refusal>): Flow<Refusal> {
  return () => Promise.resolve(outcome)
}

export interface GatedFlow<Refusal> {
  readonly flow: Flow<Refusal>
  /** Lets the flow go on: it then runs `then` and resolves with its result. */
  readonly letEnd: () => void
}

/** A flow that waits until the test lets it end, then runs `then`. */
export function gatedFlow<Refusal>(then: Flow<Refusal>): GatedFlow<Refusal> {
  let letEnd: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    letEnd = resolve
  })
  const flow: Flow<Refusal> = async (ports, current) => {
    await gate
    return then(ports, current)
  }
  return { flow, letEnd: () => letEnd() }
}

/** What an action gives back: its result, and whether it ended the project it was given. */
export interface TestActionOutcome<Result> {
  readonly result: Result
  readonly currentClosed: boolean
}

/** A step of a card that may end the open project: it gets the ports and the project open now. */
export type TestAction<Result> = (
  ports: SessionPorts,
  current: DocumentHandle | undefined,
) => Promise<TestActionOutcome<Result>>

export const ACTION_RESULT = 'the action ran'

/** An action that touches no port, leaves the open project as it is, and gives `ACTION_RESULT`. */
export function keepsTheProject(): TestAction<string> {
  return () => Promise.resolve({ result: ACTION_RESULT, currentClosed: false })
}

/** An action that closes the project it is given, and says so. */
export function closesTheProject(): TestAction<string> {
  return async (_ports, current) => {
    await current?.close()
    return { result: ACTION_RESULT, currentClosed: true }
  }
}

/** Runs `action` through the owner inside `act`, and gives how `runAction` settled. */
export async function settleRunAction<Result>(
  result: OwnerResult,
  action: TestAction<Result>,
): Promise<Settled<TestActionOutcome<Result> | undefined>> {
  const settled: Array<Settled<TestActionOutcome<Result> | undefined>> = []
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
  action: TestAction<Result>,
): Promise<TestActionOutcome<Result> | undefined> {
  let running!: Promise<TestActionOutcome<Result> | undefined>
  act(() => {
    running = result.current.runAction(action)
  })
  return running
}

export interface GatedAction<Result> {
  readonly action: TestAction<Result>
  readonly letEnd: () => void
}

/** An action that waits until the test lets it end, then runs `then`. */
export function gatedAction<Result>(then: TestAction<Result>): GatedAction<Result> {
  let letEnd: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    letEnd = resolve
  })
  const action: TestAction<Result> = async (ports, current) => {
    await gate
    return then(ports, current)
  }
  return { action, letEnd: () => letEnd() }
}

export async function unmountAndSettle(unmount: () => void): Promise<void> {
  await act(async () => {
    unmount()
    await settle()
  })
}

/** Renders the owner; `rerender` takes new ports and a new start request. */
export function renderOwner(ports: SessionPorts | null, start: OpenRequest | null) {
  return renderHook((props: OwnerProps) => useOpenProject(props.ports, props.start), {
    initialProps: { ports, start },
  })
}

type ActivityMode = 'visible' | 'hidden'

interface ModeStore {
  readonly get: () => ActivityMode
  readonly set: (mode: ActivityMode) => void
  readonly subscribe: (listener: () => void) => () => void
}

function createModeStore(): ModeStore {
  let mode: ActivityMode = 'visible'
  const listeners = new Set<() => void>()
  return {
    get: () => mode,
    set: (next) => {
      mode = next
      for (const listener of listeners) listener()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

/** A wrapper that puts the component of the hook inside an `Activity` whose mode the store holds. */
function activityWrapper(modes: ModeStore) {
  return function ActivityWrapper({ children }: { readonly children: ReactNode }) {
    const mode = useSyncExternalStore(modes.subscribe, modes.get)
    return createElement(Activity, { mode, children })
  }
}

export interface OwnerInActivity {
  readonly result: OwnerResult
  readonly unmount: () => void
  /** Hides the owner: its effects are cleaned up and its state is kept. */
  readonly hide: () => void
  /** Shows the owner again: its effects are set up again. */
  readonly show: () => void
  /** A hide and a show, each committed at once, in one synchronous step with no microtask between. */
  readonly hideAndShowInOneStep: () => void
}

/** Renders the owner inside a React `Activity` that the test can hide and show. */
export function renderOwnerInActivity(
  ports: SessionPorts | null,
  start: OpenRequest | null,
): OwnerInActivity {
  const modes = createModeStore()
  const { result, unmount } = renderHook(() => useOpenProject(ports, start), {
    wrapper: activityWrapper(modes),
  })
  const commit = (mode: ActivityMode) => flushSync(() => modes.set(mode))
  return {
    result,
    unmount,
    hide: () => act(() => commit('hidden')),
    show: () => act(() => commit('visible')),
    hideAndShowInOneStep: () =>
      act(() => {
        commit('hidden')
        commit('visible')
      }),
  }
}
