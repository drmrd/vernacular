import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import {
  InMemoryActiveProjectIdStore,
  InMemoryDirectory,
  OpfsProjectStore,
  SnapshotStore,
  SubdirectoryPort,
  type ActiveProjectIdStore,
} from '../storage'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../core'

const FAILED_ID = 'current'
// Autosave debounces its writes, so the wait for each one is generous.
const AUTOSAVE_TIMEOUT_MS = 3000

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

// A project written by a newer build: it lists by name but this build cannot open it.
function projectFromANewerBuild(): Uint8Array {
  const project = createEmptyProject({
    name: 'Broken House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0-test',
  })
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  return new TextEncoder().encode(JSON.stringify(newer))
}

interface FailedStorage {
  root: InMemoryDirectory
  store: OpfsProjectStore
}

async function storageWithAFailedProject(): Promise<FailedStorage> {
  const root = new InMemoryDirectory()
  await root.writeFile(`${FAILED_ID}/vernacular.json`, projectFromANewerBuild())
  return { root, store: new OpfsProjectStore(root) }
}

// One boot of the application, as a reload would start it: the same store and the same port.
function boot(storage: FailedStorage, activeProjectIds: ActiveProjectIdStore): void {
  const resolveSnapshots = (id: string) =>
    Promise.resolve(new SnapshotStore(new SubdirectoryPort(storage.root, id)))
  render(
    <App
      store={storage.store}
      activeProjectIds={activeProjectIds}
      resolveSnapshots={resolveSnapshots}
    />,
  )
}

async function startNewProjectFromTheFailureDialog(): Promise<void> {
  await screen.findByRole('alert')
  await userEvent.click(screen.getByRole('button', { name: /start a new project/i }))
}

async function editTheProject(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /add floor/i }))
}

// The save-status label of the shell is how the user learns that a save went through.
async function expectTheSaveReportedSaved(): Promise<void> {
  expect(
    await screen.findByText(/all changes saved/i, {}, { timeout: AUTOSAVE_TIMEOUT_MS }),
  ).toBeInTheDocument()
}

// The breadcrumb landmark names the open project, so it identifies which one opened.
async function openProjectName(): Promise<string | null> {
  const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
  return within(breadcrumb).getByText(/.+/).textContent
}

// A port that records every write, and whose first `failures` writes reject.
class RecordingActiveProjectIdStore implements ActiveProjectIdStore {
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

describe('The remembered id after a project started from a failed load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('still shows the failure dialog on the next boot when the new project was never saved', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const port = new InMemoryActiveProjectIdStore()
    boot(storage, port)
    await startNewProjectFromTheFailureDialog()
    await screen.findByRole('button', { name: /add floor/i })
    cleanup()

    boot(storage, port)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(await port.read()).toBeUndefined()
  })

  it('opens the new project on the next boot once its first save went through', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const port = new InMemoryActiveProjectIdStore()
    boot(storage, port)
    await startNewProjectFromTheFailureDialog()
    await editTheProject()
    await expectTheSaveReportedSaved()
    await waitFor(async () => expect(await port.read()).toBeDefined(), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    cleanup()

    boot(storage, port)

    expect(await openProjectName()).toBe('Untitled project')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await port.read()).not.toBe(FAILED_ID)
  })

  it('never writes the port when the session runs on the in-memory fallback', async () => {
    stubCapableStorage()
    const port = new RecordingActiveProjectIdStore()
    const resolveStore = () => Promise.reject(new Error('no storage backend'))
    render(<App resolveStore={resolveStore} activeProjectIds={port} />)
    await startNewProjectFromTheFailureDialog()
    await editTheProject()

    await expectTheSaveReportedSaved()

    expect(port.writes).toEqual([])
  })

  it('reports the save as saved when the id write rejects and writes the id at the next save', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const port = new RecordingActiveProjectIdStore(1)
    boot(storage, port)
    await startNewProjectFromTheFailureDialog()
    await editTheProject()
    await waitFor(() => expect(port.writes).toHaveLength(1), { timeout: AUTOSAVE_TIMEOUT_MS })
    await expectTheSaveReportedSaved()

    await editTheProject()

    await waitFor(() => expect(port.writes).toHaveLength(2), { timeout: AUTOSAVE_TIMEOUT_MS })
    const [failedWrite, retriedWrite] = port.writes
    expect(retriedWrite).toBe(failedWrite)
    expect(retriedWrite).not.toBe(FAILED_ID)
    expect(await port.read()).toBe(retriedWrite)
  })
})
