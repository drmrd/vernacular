import { useMemo, useRef, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { encodeDocument, type AssetReference, type Project } from '../core'
import {
  NotificationProvider,
  useNotifications,
  type Notification,
  type NotificationApi,
} from '../editor/design-system'
import {
  reconcileIndex,
  recentRecords,
  type DocumentHandle,
  type ProjectRecord,
  type SessionPorts,
} from '../session'
import {
  createTestPorts,
  openOrThrow,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import type { LibraryItem, StorageCapabilities } from '../storage'
import { projectReferring } from '../storage/zip/zip-test-kit'
import {
  capableCapabilities,
  fakeNotifications,
  namedProject,
  runNothing,
} from './app-test-support'
import type { PackCatalog } from './pack-supplies'
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
  readonly capabilities?: StorageCapabilities
  /** The library whose catalog tells which pack assets an installed pack brings by itself. */
  readonly packs?: PackCatalog
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
  const capabilities = rig.capabilities ?? capableCapabilities()
  const { packs } = rig
  return renderHook(
    (): RiggedActions<Actions> => {
      const owner = useTestOwner(rig.ports, rig.handle)
      const notifications = useNotifications()
      const { handle, runFlow, flowsStarted } = owner
      const context = {
        handle,
        runFlow,
        capabilities,
        notifications,
        ...(packs === undefined ? {} : { packs }),
      }
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

/** Waits until the index of `ports` holds a record of `id`, and gives it. */
export function waitForRecord(ports: SessionPorts, id: string): Promise<ProjectRecord> {
  return waitFor(async () => {
    const record = await ports.index.get(id)
    if (record === undefined) throw new Error(`The index holds no record of ${id}`)
    return record
  })
}

/** The ids that the recent list of the Project menu would show while the project `openId` is open. */
export async function recentIds(ports: SessionPorts, openId: string): Promise<string[]> {
  return recentRecords(await reconcileIndex(ports), openId).map((record) => record.id)
}

/** A rendered hook that holds the notifications that show now. */
interface ShowsNotifications {
  readonly current: { readonly shown: readonly Notification[] }
}

/** The texts of the notifications that show now. */
export function shownMessages(result: ShowsNotifications): string[] {
  return result.current.shown.map((shown) => shown.message)
}

/** The texts of the warnings that show now. */
export function shownWarnings(result: ShowsNotifications): string[] {
  return result.current.shown
    .filter((shown) => shown.severity === 'warning')
    .map((shown) => shown.message)
}

/** Lets the work that an action started run to its end, inside `act`. */
export async function settleTheAction(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
}

/** A library item of furniture that lists `reference`. */
export function furnitureItem(reference: AssetReference): LibraryItem {
  return {
    reference,
    name: 'Chair',
    kind: 'furniture',
    categories: [],
    eras: [],
    footprint: { width: 500, depth: 500 },
    height: 750,
  }
}

/** A library whose catalog holds one item for each of `references`. */
export function packCatalogOf(...references: AssetReference[]): PackCatalog {
  const items = references.map(furnitureItem)
  return { catalog: () => Promise.resolve(items) }
}

/** A `.json` project file of `project`, as the application writes one. */
export function projectFileOf(project: Project): File {
  const { bytes } = encodeDocument(project, undefined)
  return new File([bytes.buffer as ArrayBuffer], 'house.json')
}

/** A `.json` project file whose document places one piece of furniture for each of `references`. */
export function projectFileReferring(...references: AssetReference[]): File {
  return projectFileOf(projectReferring(references))
}

/** The message that a read of `unreadableFile` fails with. */
export const READ_FAILURE = 'The file could not be read.'

interface UnreadableFileShape {
  /** The size that the file claims. It holds its real size when this is not given. */
  readonly size?: number
  readonly name?: string
}

/** A file whose every way to read its bytes fails with `READ_FAILURE`, and how often a read was tried. */
export function unreadableFile(shape: UnreadableFileShape = {}): {
  file: File
  reads: () => number
} {
  let reads = 0
  const file = new File(['{}'], shape.name ?? 'house.json')
  const failRead = () => {
    reads += 1
    return Promise.reject(new Error(READ_FAILURE))
  }
  const failStream = () => {
    reads += 1
    throw new Error(READ_FAILURE)
  }
  Object.defineProperties(file, {
    ...(shape.size === undefined ? {} : { size: { value: shape.size } }),
    arrayBuffer: { value: failRead },
    bytes: { value: failRead },
    text: { value: failRead },
    stream: { value: failStream },
  })
  return { file, reads: () => reads }
}

/** The id and the name of the project that `renderOnAStoredProject` opens first. */
export const STORED_PROJECT_ID = 'current'
export const STORED_PROJECT_NAME = 'Drafthouse'

/** In-memory ports with a stored project open, and the adapter hook `useAdapter` on it. */
export async function renderOnAStoredProject<Actions>(
  useAdapter: (context: ProjectActionsContext) => Actions,
  packs?: PackCatalog,
) {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, STORED_PROJECT_ID, STORED_PROJECT_NAME)
  const rig = { ports, handle, ...(packs === undefined ? {} : { packs }) }
  const { result } = renderActions(rig, useAdapter)
  return { ports, handle, result }
}
