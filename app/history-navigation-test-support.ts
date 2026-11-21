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
import type { Screen } from './resolve-place'
import { useHistoryNavigation } from './use-history-navigation'
import type { HistoryNavigation } from './use-history-navigation'
import type { Flow } from './use-open-project'

/** Test support: renders the history navigation over ports in memory and follows what it shows. */

export const FIRST_ID = 'project-first'
export const SECOND_ID = 'project-second'
export const THIRD_ID = 'project-third'
export const MISSING_ID = 'project-missing'

/** The fragment of the address of the project under `id`. */
export function addressOf(id: string): string {
  return addressFor({ kind: 'project', id })
}

/** The fragment of the address of the Projects page. */
export const PROJECTS_ADDRESS = addressFor({ kind: 'projects' })

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

export interface NavigationProps {
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

/** The screen of the Projects page. */
export type PageScreen = Extract<Screen, { readonly kind: 'projects' }>

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
  const running: Array<Promise<FlowResult<Refusal> | undefined>> = []
  act(() => {
    running.push(result.current.runFlow(flow))
  })
  return Promise.all(running).then(([outcome]) => outcome)
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
