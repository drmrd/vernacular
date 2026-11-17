import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import {
  InMemoryActiveProjectIdStore,
  InMemoryDirectory,
  OpfsProjectStore,
  SnapshotStore,
  SubdirectoryPort,
  type ActiveProjectIdStore,
  type DirectoryPort,
} from '../storage'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, type Project } from '../core'

const FAILED_ID = 'current'
// Autosave debounces its writes, so the wait for each one is generous.
const AUTOSAVE_TIMEOUT_MS = 3000
// The discard prompt opens at once when the app asks for it; a short wait tells "not asked".
const DISCARD_PROMPT_TIMEOUT_MS = 1000
// Time for whatever follows a late save (such as a write of the remembered id) to run.
const SETTLE_MS = 300
const KEPT_PROJECT_TEXT = 'The saved project is kept unchanged. A new project is stored separately.'

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

interface SharedStorage {
  root: InMemoryDirectory
  store: OpfsProjectStore
  /** Ids of the saves that went through, in the order they finished. */
  saved: string[]
  /** Every save waits for this gate before it writes. */
  gate: Promise<void>
}

/** What a store resolves when a save found nothing to report. */
const SAVE_REPORT = { faults: [], backedUp: false }

async function storageWithAFailedProject(): Promise<SharedStorage> {
  const root = new InMemoryDirectory()
  await root.writeFile(`${FAILED_ID}/vernacular.json`, projectFromANewerBuild())
  const store = new OpfsProjectStore(root)
  const storage: SharedStorage = { root, store, saved: [], gate: Promise.resolve() }
  const save = store.save.bind(store)
  vi.spyOn(store, 'save').mockImplementation(async (id: string, project: Project) => {
    await storage.gate
    await save(id, project)
    storage.saved.push(id)
    return SAVE_REPORT
  })
  return storage
}

// Every file below `prefix`, keyed by path. A fatal decoder that keeps the byte
// order mark makes equal text mean equal bytes.
async function filesUnder(root: DirectoryPort, prefix: string): Promise<Map<string, string>> {
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

// One boot of the application, as one browser tab would start it. Two calls are two tabs.
function boot(storage: SharedStorage, activeProjectIds: ActiveProjectIdStore): HTMLElement {
  const resolveSnapshots = (id: string) =>
    Promise.resolve(new SnapshotStore(new SubdirectoryPort(storage.root, id)))
  const { container } = render(
    <App
      store={storage.store}
      activeProjectIds={activeProjectIds}
      resolveSnapshots={resolveSnapshots}
    />,
  )
  return container
}

async function startNewProject(tab: HTMLElement): Promise<void> {
  await within(tab).findByRole('alert')
  await userEvent.click(within(tab).getByRole('button', { name: /start a new project/i }))
}

async function editTheProject(tab: HTMLElement): Promise<void> {
  await userEvent.click(await within(tab).findByRole('button', { name: /add floor/i }))
}

// The id of the first finished save whose id is not one of `known`.
function nextSavedIdOutside(storage: SharedStorage, known: readonly string[]): Promise<string> {
  return waitFor(
    () => {
      const id = storage.saved.find((saved) => !known.includes(saved))
      if (id === undefined) throw new Error('no save under a new id yet')
      return id
    },
    { timeout: AUTOSAVE_TIMEOUT_MS },
  )
}

function savesOf(storage: SharedStorage, id: string): number {
  return storage.saved.filter((saved) => saved === id).length
}

async function editAndAwaitAnotherSave(tab: HTMLElement, storage: SharedStorage, id: string) {
  const before = savesOf(storage, id)
  await editTheProject(tab)
  await waitFor(() => expect(savesOf(storage, id)).toBeGreaterThan(before), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
}

// A port that records every id written to it.
class RecordingActiveProjectIdStore implements ActiveProjectIdStore {
  readonly writes: string[] = []

  read(): Promise<string | undefined> {
    return Promise.resolve(this.writes.at(-1))
  }

  write(id: string): Promise<void> {
    this.writes.push(id)
    return Promise.resolve()
  }
}

// Hold every later save until the returned function runs.
function holdSaves(storage: SharedStorage): () => void {
  let release = () => {}
  storage.gate = new Promise<void>((resolve) => {
    release = resolve
  })
  return release
}

async function startAnotherNewProjectFromTheMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /project/i }))
  await userEvent.click(await screen.findByRole('menuitem', { name: /new project/i }))
  const prompt = await screen
    .findByRole('alertdialog', {}, { timeout: DISCARD_PROMPT_TIMEOUT_MS })
    .catch(() => null)
  if (prompt) {
    await userEvent.click(within(prompt).getByRole('button', { name: /discard/i }))
  }
}

async function settle(): Promise<void> {
  await act(() => new Promise<void>((resolve) => setTimeout(resolve, SETTLE_MS)))
}

describe('Two tabs that start a new project after a failed load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('gives each tab its own id and neither writes under the failed id or the other tab', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const port = new InMemoryActiveProjectIdStore()
    const failedBefore = await filesUnder(storage.root, FAILED_ID)
    const first = boot(storage, port)
    const second = boot(storage, port)
    await within(first).findByRole('alert')
    await within(second).findByRole('alert')

    await startNewProject(first)
    await editTheProject(first)
    const firstId = await nextSavedIdOutside(storage, [FAILED_ID])
    await startNewProject(second)
    const firstFiles = await filesUnder(storage.root, firstId)
    await editTheProject(second)
    const secondId = await nextSavedIdOutside(storage, [FAILED_ID, firstId])
    expect(await filesUnder(storage.root, firstId)).toEqual(firstFiles)

    const secondFiles = await filesUnder(storage.root, secondId)
    await editAndAwaitAnotherSave(first, storage, firstId)
    expect(await filesUnder(storage.root, secondId)).toEqual(secondFiles)
    expect(secondId).not.toBe(firstId)
    expect(await filesUnder(storage.root, FAILED_ID)).toEqual(failedBefore)
    const ids = (await storage.store.list()).map((summary) => summary.id)
    expect(ids).toHaveLength(3)
  })
})

describe('The failure dialog after a failed load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('says that the saved project is kept and the new one is stored separately', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const tab = boot(storage, new InMemoryActiveProjectIdStore())

    await within(tab).findByRole('alert')

    expect(within(tab).getByText(KEPT_PROJECT_TEXT)).toBeInTheDocument()
  })
})

describe('A second fresh start while the first new project is still saving', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('never remembers the id of a project that was not saved', async () => {
    stubCapableStorage()
    const storage = await storageWithAFailedProject()
    const port = new RecordingActiveProjectIdStore()
    const tab = boot(storage, port)
    await startNewProject(tab)
    const release = holdSaves(storage)
    await editTheProject(tab)
    await waitFor(() => expect(storage.store.save).toHaveBeenCalled(), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })

    await startAnotherNewProjectFromTheMenu()
    release()
    await nextSavedIdOutside(storage, [FAILED_ID])
    await settle()

    for (const id of port.writes) {
      expect(storage.saved).toContain(id)
    }
  })
})
