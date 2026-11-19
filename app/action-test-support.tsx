import { useMemo, useRef, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import {
  NotificationProvider,
  useNotifications,
  type Notification,
  type NotificationApi,
} from '../editor/design-system'
import type { DocumentHandle, SessionPorts } from '../session'
import { openOrThrow, workspaceRequest, type TestPorts } from '../session/handle/handle-test-kit'
import {
  InMemoryRecentProjectStore,
  type RecentProjectEntry,
  type RecentProjectStore,
  type StorageCapabilities,
} from '../storage'
import {
  capableCapabilities,
  fakeNotifications,
  namedProject,
  runNothing,
} from './app-test-support'
import type { RunFlow } from './use-open-project'
import type { ProjectActionsContext } from './use-project-actions'

export { recordUnhandledRejections } from '../bridge/react/scene-renderer-canvas-test-support'

/** Test support: an adapter of the project actions on an open handle, with a small owner behind it. */

/** Every handle that a case opened, directly or through a flow. `closeOpenedHandles` closes them. */
const openedHandles: DocumentHandle[] = []

/** Closes every handle that the case opened, so that no lock and no autosave outlives it. */
export async function closeOpenedHandles(): Promise<void> {
  await act(async () => {
    await Promise.all(openedHandles.splice(0).map((handle) => handle.close()))
  })
}

/** Stores a sound project named `name` under `id` and opens it. */
export async function openStoredProject(
  ports: TestPorts,
  id: string,
  name: string,
): Promise<DocumentHandle> {
  await ports.workspace.save(id, namedProject(name))
  const handle = await openOrThrow(ports, workspaceRequest(id))
  openedHandles.push(handle)
  return handle
}

/** The context of the actions around `handle`, with an owner that is busy and spy notifications. */
export function actionsContext(
  handle: DocumentHandle,
  notifications: NotificationApi = fakeNotifications(),
): ProjectActionsContext {
  return {
    handle,
    runFlow: runNothing,
    recentProjects: new InMemoryRecentProjectStore(),
    capabilities: capableCapabilities(),
    notifications,
  }
}

interface TestOwner {
  readonly handle: DocumentHandle
  readonly runFlow: RunFlow
  /** How many flows the owner ran. A call while a flow runs does not count. */
  readonly flowsStarted: () => number
}

/**
 * A small owner of the open project: it runs one flow at a time with the ports and the open handle,
 * resolves `undefined` while a flow runs, and installs the handle of a flow that opened a project.
 */
function useTestOwner(ports: SessionPorts, first: DocumentHandle): TestOwner {
  const [handle, setHandle] = useState(first)
  const current = useRef(first)
  const busy = useRef(false)
  const started = useRef(0)
  const runFlow = useMemo<RunFlow>(
    () => async (flow) => {
      if (busy.current) return undefined
      busy.current = true
      started.current += 1
      const result = await flow(ports, current.current)
      busy.current = false
      if (result.ok) {
        current.current = result.handle
        openedHandles.push(result.handle)
        setHandle(result.handle)
      }
      return result
    },
    [ports],
  )
  return { handle, runFlow, flowsStarted: () => started.current }
}

export interface ActionRig {
  readonly ports: TestPorts
  /** The project that is open when the case starts. */
  readonly handle: DocumentHandle
  readonly recentProjects?: RecentProjectStore
  readonly capabilities?: StorageCapabilities
}

export interface RiggedActions<Actions> {
  readonly actions: Actions
  /** The handle that the owner holds now. */
  readonly handle: DocumentHandle
  /** The notifications that show now. */
  readonly shown: readonly Notification[]
  readonly flowsStarted: () => number
}

/** Renders the adapter hook `useAdapter` on the open project of `rig`, inside the notifications. */
export function renderActions<Actions>(
  rig: ActionRig,
  useAdapter: (context: ProjectActionsContext) => Actions,
) {
  const recentProjects = rig.recentProjects ?? new InMemoryRecentProjectStore()
  const capabilities = rig.capabilities ?? capableCapabilities()
  return renderHook(
    (): RiggedActions<Actions> => {
      const owner = useTestOwner(rig.ports, rig.handle)
      const notifications = useNotifications()
      const { handle, runFlow, flowsStarted } = owner
      const context = { handle, runFlow, recentProjects, capabilities, notifications }
      return {
        actions: useAdapter(context),
        handle,
        shown: notifications.notifications,
        flowsStarted,
      }
    },
    { wrapper: NotificationProvider },
  )
}

/** Waits until the owner holds a project other than `old`, and gives it. */
export function waitForOtherProject(
  result: { readonly current: RiggedActions<unknown> },
  old: DocumentHandle,
): Promise<DocumentHandle> {
  return waitFor(() => {
    const { handle } = result.current
    if (handle === old) throw new Error('The first project is still open')
    return handle
  })
}

/** Waits until the recent list holds an entry for `id`, and gives it. */
export function waitForRecentEntry(
  recentProjects: RecentProjectStore,
  id: string,
): Promise<RecentProjectEntry> {
  return waitFor(async () => {
    const entry = (await recentProjects.list()).find((listed) => listed.id === id)
    if (entry === undefined) throw new Error(`The recent list holds no entry for ${id}`)
    return entry
  })
}

/** The texts of the notifications that show now. */
export function shownMessages(result: { readonly current: RiggedActions<unknown> }): string[] {
  return result.current.shown.map((shown) => shown.message)
}

/** Lets the work that an action started run to its end, inside `act`. */
export async function settleTheAction(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}
