import { useEffect } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { expect, vi } from 'vitest'
import { openRecent, reconcileIndex, switchProject } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import type { DocumentHandle, FlowResult, SessionPorts } from '../session'
import {
  createTestPorts,
  rename,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import { addressFor } from './address'
import { createMemoryAddressBar } from './address-bar'
import type { AddressBar, MemoryAddressBar } from './address-bar'
import { plantProject, usedLast } from './app-test-support'
import type { PageScreen } from './resolve-place'
import { useHistoryNavigation } from './use-history-navigation'
import type { HistoryNavigation } from './use-history-navigation'
import type { ActionOutcome, Flow, OwnerAction } from './use-open-project'

/** Test support: renders the history navigation over ports in memory and follows what it shows. */

/** The id of the project that the ports hold and that was used last. */
export const FIRST_ID = 'project-first'
/** The id of a second project that the ports hold. */
export const SECOND_ID = 'project-second'
/** The id of a third project that the ports hold. */
export const THIRD_ID = 'project-third'
/** An id that no project of the ports has. */
export const MISSING_ID = 'project-missing'
/** The id of a project that a folder holds. */
export const FOLDER_ID = 'project-folder'
/** The name of the project that a folder holds. */
export const FOLDER_NAME = 'Kept in a folder'

/** The fragment of the address of the project under `id`. */
export function addressOf(id: string): string {
  return addressFor({ kind: 'project', id })
}

/** The fragment of the address of the Projects page. */
export const PROJECTS_ADDRESS = addressFor({ kind: 'projects' })

/** The fragment of the address of the first project. */
export const FIRST_ADDRESS = addressOf(FIRST_ID)
/** The fragment of the address of the second project. */
export const SECOND_ADDRESS = addressOf(SECOND_ID)
/** The fragment of the address of the project that does not exist. */
export const MISSING_ADDRESS = addressOf(MISSING_ID)
/** What a switch reports for an id that no project has. */
export const NOT_FOUND = { kind: 'not-found' }

/** The name that `durablePortsWith` gives the project under `id`. */
export function nameOf(id: string): string {
  return `House ${id}`
}

/** Durable ports whose store holds a project under each id. The first id was used last. */
export async function durablePortsWith(...ids: string[]): Promise<TestPorts> {
  const ports = createTestPorts({ durable: true })
  await Promise.all(ids.map((id) => plantProject(ports, id, nameOf(id))))
  await reconcileIndex(ports)
  const [usedLastId] = ids
  if (usedLastId !== undefined) await usedLast(ports, usedLastId)
  return ports
}

/** Spies on every call that reads, writes, locks, or asks the index or the folder access. */
export function spiesOnEveryCall(ports: TestPorts) {
  return [
    vi.spyOn(ports.workspace, 'read'),
    vi.spyOn(ports.workspace, 'list'),
    vi.spyOn(ports.workspace, 'save'),
    vi.spyOn(ports.index, 'get'),
    vi.spyOn(ports.index, 'all'),
    vi.spyOn(ports.index, 'put'),
    vi.spyOn(ports.locks, 'tryAcquire'),
    vi.spyOn(ports.folders, 'reopen'),
  ]
}

interface NavigationProps {
  readonly ports: SessionPorts | null
}

export interface NavigationResult {
  readonly current: HistoryNavigation
}

export interface RenderedNavigation {
  readonly result: NavigationResult
  /** Every handle that the navigation gave, in the order it gave them. */
  readonly handles: readonly DocumentHandle[]
  /** Gives the navigation other ports, as a rebuild of the ports does. */
  readonly changePorts: (ports: SessionPorts | null) => void
  readonly unmount: () => void
}

/** Renders the navigation on `ports` and `bar`. `changePorts` gives it other ports. */
export function renderNavigation(ports: SessionPorts | null, bar: AddressBar): RenderedNavigation {
  const handles: DocumentHandle[] = []
  const rendered = renderHook(
    (props: NavigationProps) => {
      const navigation = useHistoryNavigation(props.ports, bar)
      const { handle } = navigation
      useEffect(() => {
        if (handle !== null) handles.push(handle)
      }, [handle])
      return navigation
    },
    { initialProps: { ports } },
  )
  return {
    result: rendered.result,
    handles,
    changePorts: (next) => rendered.rerender({ ports: next }),
    unmount: rendered.unmount,
  }
}

/** Waits for a screen of the editor, and gives its handle. */
export function editorOf(result: NavigationResult): Promise<DocumentHandle> {
  return waitFor(() => {
    const { screen } = result.current
    if (screen?.kind !== 'editor') throw new Error('The editor does not show yet')
    return screen.handle
  })
}

/** Waits for the Projects page, and gives its screen. */
export function pageOf(result: NavigationResult): Promise<PageScreen> {
  return waitFor(() => {
    const { screen } = result.current
    if (screen?.kind !== 'projects') throw new Error('The page does not show yet')
    return screen
  })
}

/** One edit of the project and one save of it, which the project reports as stored. */
export async function editAndSave(handle: DocumentHandle): Promise<void> {
  await act(async () => {
    rename(handle, `${handle.session.getProject().meta.name} edited`)
    await handle.save()
  })
}

/** What a user does who types the address `fragment`. */
export async function visit(bar: MemoryAddressBar, fragment: string): Promise<void> {
  await act(async () => {
    bar.visit(fragment)
  })
}

/** What a user does who presses the Back button of the browser. */
export async function goBack(bar: MemoryAddressBar): Promise<void> {
  await act(async () => {
    bar.back()
  })
}

/** Tells the listeners of the bar once more, as a window does that reports one move twice. */
export async function reportAgain(bar: MemoryAddressBar): Promise<void> {
  await act(async () => {
    bar.reportAgain()
  })
}

/** A flow that switches to the project under `id`. */
export function switchTo(id: string): Flow {
  return (ports, current) => switchProject(ports, current, workspaceRequest(id))
}

/** A flow that keeps the open project: it asks to open the project that is open already. */
export function keepProject(id: string): Flow {
  return (ports, current) => openRecent(ports, current, id)
}

/** Starts a flow through the navigation inside `act`, and gives the promise of `runFlow`. */
export function startFlow<Refusal>(
  result: NavigationResult,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  let running!: Promise<FlowResult<Refusal> | undefined>
  act(() => {
    running = result.current.runFlow(flow)
  })
  return running
}

/** Runs a flow through the navigation inside `act`, and gives what `runFlow` resolved with. */
export async function runFlowIn<Refusal>(
  result: NavigationResult,
  flow: Flow<Refusal>,
): Promise<FlowResult<Refusal> | undefined> {
  const outcomes: Array<FlowResult<Refusal> | undefined> = []
  await act(async () => {
    outcomes.push(await result.current.runFlow(flow))
  })
  return outcomes[0]
}

/** The navigation on durable ports with three projects, open on the first one at the bare address. */
export async function atTheFirstProject() {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID, THIRD_ID)
  const bar = createMemoryAddressBar()
  const rendered = renderNavigation(ports, bar)
  const handle = await editorOf(rendered.result)
  await waitFor(() => expect(bar.hash()).toBe(addressOf(FIRST_ID)))
  await act(settle)
  return { ports, bar, handle, ...rendered }
}

/** The same, after a switch to the second project: the entries are the first and the second. */
export async function atTheSecondProject() {
  const start = await atTheFirstProject()
  await runFlowIn(start.result, switchTo(SECOND_ID))
  await waitFor(() =>
    expect(start.bar.entries()).toEqual([addressOf(FIRST_ID), addressOf(SECOND_ID)]),
  )
  const handle = await editorOf(start.result)
  await act(settle)
  return { ...start, handle }
}

/** The id of the project that is open now. */
export function openId(result: NavigationResult): string | undefined {
  return result.current.handle?.id
}

/** Starts a page action through the navigation inside `act`, and gives the promise of `runPageAction`. */
export function startPageAction<Result>(
  result: NavigationResult,
  action: OwnerAction<Result>,
): Promise<ActionOutcome<Result> | undefined> {
  let running!: Promise<ActionOutcome<Result> | undefined>
  act(() => {
    running = result.current.runPageAction(action)
  })
  return running
}

/** Runs a page action through the navigation inside `act`, and gives what it resolved with. */
export async function runPageActionIn<Result>(
  result: NavigationResult,
  action: OwnerAction<Result>,
): Promise<ActionOutcome<Result> | undefined> {
  const outcomes: Array<ActionOutcome<Result> | undefined> = []
  await act(async () => {
    outcomes.push(await result.current.runPageAction(action))
  })
  return outcomes[0]
}

/** An action that ends the open project as a delete does: it closes it, then removes its files. */
export function deletesTheOpenProject(): OwnerAction<string> {
  return async (ports, current) => {
    if (current === undefined) throw new Error('No project is open to delete')
    await current.close()
    await ports.workspace.delete(current.id)
    await ports.index.remove(current.id)
    return { result: current.id, currentClosed: true }
  }
}
