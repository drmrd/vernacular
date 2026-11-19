import { vi, expect } from 'vitest'
import { act, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  createFloor,
  createWall,
  type Project,
} from '../core'
import { NotificationProvider, type NotificationApi } from '../editor/design-system'
import type { DocumentHandle } from '../session'
import {
  InMemoryActiveProjectIdStore,
  InMemoryAssetCache,
  InMemoryRecentProjectStore,
  type ActiveProjectIdStore,
  type DirectoryPort,
  type DocumentStore,
  type SaveReport,
  type StorageCapabilities,
} from '../storage'
import {
  DOCUMENT_FILE,
  createTestPorts,
  failureOf,
  placeDocument,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  App,
  EditorWorkspace,
  type AppProps,
  type BuiltSessionPorts,
  type EditorWorkspaceProps,
} from './app'
import { openFailureReason } from './open-failure-text'
import type { RunFlow } from './use-open-project'

export { lockCalls } from './use-open-project-test-support'

/** Test support: the shared set-up of the tests that render the whole application. */

/** The id that the start opens when nothing is remembered. */
export const START_ID = 'current'

/** The id of the project that fails to open, in the cases where the start fails. It is the start id. */
export const FAILED_ID = 'current'

/** Autosave waits before it writes, so a wait for a save is generous. */
export const AUTOSAVE_TIMEOUT_MS = 3000

/** Time for whatever follows a late save (such as a write of the remembered id) to run. */
export const SETTLE_MS = 300

/** The name that a new project starts with. */
export const NEW_PROJECT_NAME = 'Untitled project'

/** The sentence of the failure view under its buttons. */
export const KEPT_PROJECT_TEXT =
  'The saved project is kept unchanged. A new project is stored separately.'

/** The text of the loading view. */
export const LOADING_TEXT = 'Loading project...'

/** Makes the browser look as if it offers durable storage, for the storage probe of the shell. */
export function stubCapableStorage(): void {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

/** A project with one ground floor, under `name`. */
export function namedProject(name: string): Project {
  const base = createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
  return { ...base, floors: [createFloor('Ground')] }
}

/** A project named `name` whose ground floor holds `wallCount` walls in a row. */
export function projectWithWalls(name: string, wallCount: number): Project {
  const walls = Array.from({ length: wallCount }, (_unused, index) =>
    createWall({ x: index, y: 0 }, { x: index + 1, y: 0 }),
  )
  return { ...namedProject(name), floors: [createFloor('Ground', { walls })] }
}

/** The storage of a browser that offers everything but folder access. */
export function capableCapabilities(): StorageCapabilities {
  return {
    opfs: true,
    indexedDb: true,
    fileSystemAccess: false,
    persisted: true,
    estimatedQuotaBytes: null,
  }
}

/** A notification API whose every method is a spy. */
export function fakeNotifications(): NotificationApi {
  return {
    notifications: [],
    success: vi.fn(() => 'id'),
    info: vi.fn(() => 'id'),
    warning: vi.fn(() => 'id'),
    error: vi.fn(() => 'id'),
    banner: vi.fn(() => 'id'),
    promise: vi.fn((task) => task),
    dismiss: vi.fn(),
  }
}

/** A project written by a newer build: it lists by id, but this build cannot open it. */
export function projectFromANewerBuild(): Uint8Array {
  const project = namedProject('Broken House')
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  return new TextEncoder().encode(JSON.stringify(newer))
}

/** The bytes of the document of `project`, as the application stores them. */
export async function documentBytes(project: Project): Promise<Uint8Array> {
  const scratch = createTestPorts()
  await scratch.workspace.save(FAILED_ID, project)
  const bytes = await scratch.root.readFile(`${FAILED_ID}/${DOCUMENT_FILE}`)
  if (bytes === undefined) throw new Error('The scratch store wrote no document')
  return bytes
}

/** Stores a sound project named `name` under `id` in the workspace of `ports`. */
export async function plantProject(ports: TestPorts, id: string, name: string): Promise<void> {
  await ports.workspace.save(id, namedProject(name))
}

/** Stores, under the id the start opens, a document that this build cannot open. */
export function plantFailedProject(ports: TestPorts): Promise<void> {
  return placeDocument(ports, FAILED_ID, projectFromANewerBuild())
}

/** The ports of a second tab of the same browser: the same files and the same locks. */
export function secondTab(ports: TestPorts): TestPorts {
  const { root, lockRegistry } = ports
  return createTestPorts({ root, lockRegistry, durable: ports.workspace.durable })
}

/** The ports after a reload of the page: the same files, and no lock of the old page. */
export function reloadOf(ports: TestPorts): TestPorts {
  return createTestPorts({ root: ports.root, durable: ports.workspace.durable })
}

/** What a builder of the ports resolves with, around `ports`. */
export function builtPorts(ports: TestPorts): BuiltSessionPorts {
  return { ports, libraryAssets: new InMemoryAssetCache() }
}

/** Renders the application on injected ports. */
export function renderApp(ports: TestPorts, props: Omit<AppProps, 'ports'> = {}): RenderResult {
  return render(<App ports={ports} {...props} />)
}

/** The `runFlow` of an owner that is busy: it calls nothing and resolves undefined. */
export const runNothing: RunFlow = () => Promise.resolve(undefined)

/** The properties of the workspace around `handle`, with no owner behind it unless one is given. */
export function workspaceProps(
  handle: DocumentHandle,
  overrides: Partial<EditorWorkspaceProps> = {},
): EditorWorkspaceProps {
  return {
    handle,
    runFlow: runNothing,
    libraryAssets: new InMemoryAssetCache(),
    recentProjects: new InMemoryRecentProjectStore(),
    capabilities: capableCapabilities(),
    ...overrides,
  }
}

/** Renders the workspace of the editor around an open handle, inside the notifications. */
export function renderWorkspace(
  handle: DocumentHandle,
  props: Partial<EditorWorkspaceProps> = {},
): RenderResult {
  return render(
    <NotificationProvider>
      <EditorWorkspace {...workspaceProps(handle, props)} />
    </NotificationProvider>,
  )
}

/** The sentence of the failure view when the start cannot open the project under `id`. */
export async function failedOpenSentence(ports: TestPorts, id = FAILED_ID): Promise<string> {
  const failure = await failureOf(reloadOf(ports), workspaceRequest(id))
  return `Could not open the project: ${openFailureReason(failure)}`
}

/** A port of the remembered id that holds `id`. */
export async function rememberedId(id: string): Promise<ActiveProjectIdStore> {
  const port = new InMemoryActiveProjectIdStore()
  await port.write(id)
  return port
}

/** A port of the remembered id that records every write, and whose first `failures` writes reject. */
export class RecordingActiveProjectIdStore implements ActiveProjectIdStore {
  readonly writes: string[] = []
  private remembered: string | undefined
  private failuresLeft: number

  constructor(failures = 0) {
    this.failuresLeft = failures
  }

  read(): Promise<string | undefined> {
    return Promise.resolve(this.remembered)
  }

  write(id: string): Promise<void> {
    this.writes.push(id)
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1
      return Promise.reject(new Error('storage is full'))
    }
    this.remembered = id
    return Promise.resolve()
  }
}

export interface SaveLog {
  /** The ids of the saves that went through, in the order they finished. */
  readonly saved: string[]
  /** Holds every later save until the returned function runs. */
  hold(): () => void
}

/** Records the saves of each store in one log, and lets the test hold them. */
export function logSaves(...stores: DocumentStore[]): SaveLog {
  let gate = Promise.resolve()
  const saved: string[] = []
  for (const store of stores) {
    const realSave = store.save.bind(store)
    vi.spyOn(store, 'save').mockImplementation(async (id, project): Promise<SaveReport> => {
      await gate
      const report = await realSave(id, project)
      saved.push(id)
      return report
    })
  }
  const hold = () => {
    let release = () => {}
    gate = new Promise<void>((resolve) => {
      release = resolve
    })
    return () => release()
  }
  return { saved, hold }
}

/** Every file below `prefix`, keyed by path. A fatal decoder makes equal text mean equal bytes. */
export async function filesUnder(
  root: DirectoryPort,
  prefix: string,
): Promise<Map<string, string>> {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  const files = new Map<string, string>()
  for (const name of await root.list(prefix)) {
    const path = `${prefix}/${name}`
    const bytes = await root.readFile(path)
    const entries = bytes ? [[path, decoder.decode(bytes)] as const] : await filesUnder(root, path)
    for (const [key, text] of entries) {
      files.set(key, text)
    }
  }
  return files
}

/** The ids of the projects that the workspace of `ports` lists. */
export async function storedIds(ports: TestPorts): Promise<string[]> {
  return (await ports.workspace.list()).map((summary) => summary.id)
}

/** The ids whose lock the ports hold now. */
export function lockedIds(ports: TestPorts): string[] {
  return [...ports.lockRegistry]
}

/** Waits until the shell of the editor shows. */
export async function findTheShell(): Promise<HTMLElement> {
  return screen.findByRole('heading', { level: 1, name: /vernacular/i })
}

/** The name of the open project: the breadcrumb landmark names it. */
export async function openProjectName(): Promise<string | null> {
  const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
  return within(breadcrumb).getByText(/.+/).textContent
}

/** Waits until the open project is the one named `name`. */
export async function expectOpenProject(name: string): Promise<void> {
  await waitFor(
    () => {
      const breadcrumb = screen.getByRole('navigation', { name: /breadcrumb/i })
      expect(within(breadcrumb).getByText(/.+/).textContent).toBe(name)
    },
    { timeout: AUTOSAVE_TIMEOUT_MS },
  )
}

/** Clicks "Start a new project" on the failure view, once it shows. */
export async function startNewProjectFromTheFailureView(): Promise<void> {
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: 'Start a new project' }))
}

/** Adds a floor through the shell: one edit of the open project. */
export async function editTheProject(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /add floor/i }))
}

/** Chooses `item` in the project menu. */
export async function chooseFromTheProjectMenu(item: string | RegExp): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /project/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: item }))
}

/** Waits, inside `act`, for a while of real time, so that late work runs and is applied. */
export async function settleForAWhile(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS)))
}
