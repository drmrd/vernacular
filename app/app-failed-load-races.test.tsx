import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import {
  InMemoryDirectory,
  OpfsProjectStore,
  SnapshotStore,
  SubdirectoryPort,
  type ActiveProjectIdStore,
} from '../storage'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, createFloor, type Project } from '../core'

const FAILED_ID = 'current'
const KEPT_NAME = 'Kept House'
// Autosave debounces its writes, so the wait for each one is generous.
const AUTOSAVE_TIMEOUT_MS = 3000
// The discard prompt opens at once when the app asks for it; a short wait tells "not asked".
const DISCARD_PROMPT_TIMEOUT_MS = 1000

function stubCapableStorage() {
  vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } })
  vi.stubGlobal('indexedDB', {})
}

function namedProject(name: string): Project {
  const base = createEmptyProject({ name, units: 'imperial', period: 'modern', appVersion: '0' })
  return { ...base, floors: [createFloor('Ground')] }
}

// A project written by a newer build: it lists by name but this build cannot open it.
function projectFromANewerBuild(): Uint8Array {
  const project = namedProject('Broken House')
  const newer = { ...project, meta: { ...project.meta, schemaVersion: CURRENT_SCHEMA_VERSION + 1 } }
  return new TextEncoder().encode(JSON.stringify(newer))
}

interface Gate {
  promise: Promise<void>
  release: () => void
}

function gate(): Gate {
  let release = () => {}
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

// A port that records every id written to it and reads back the latest one.
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

interface Rig {
  root: InMemoryDirectory
  store: OpfsProjectStore
  /** Ids of the saves that went through, in the order they finished. */
  saved: string[]
  /** Every id the application resolved a snapshot store for. */
  snapshotIds: string[]
  /** Every save waits for this gate before it writes. */
  saveGate: Promise<void>
}

/** What a store resolves when a save found nothing to report. */
const SAVE_REPORT = { faults: [], backedUp: false }

async function rigWithAFailedProject(): Promise<Rig> {
  const root = new InMemoryDirectory()
  await root.writeFile(`${FAILED_ID}/vernacular.json`, projectFromANewerBuild())
  const store = new OpfsProjectStore(root)
  const rig: Rig = { root, store, saved: [], snapshotIds: [], saveGate: Promise.resolve() }
  const save = store.save.bind(store)
  vi.spyOn(store, 'save').mockImplementation(async (id: string, project: Project) => {
    await rig.saveGate
    await save(id, project)
    rig.saved.push(id)
    return SAVE_REPORT
  })
  return rig
}

// The stored project fails its first load and opens on the next one.
async function rigThatFailsOnce(): Promise<Rig> {
  const rig = await rigWithAFailedProject()
  await rig.store.save(FAILED_ID, namedProject(KEPT_NAME))
  rig.saved.length = 0
  vi.spyOn(rig.store, 'load').mockRejectedValueOnce(new Error('disk fault'))
  return rig
}

function boot(rig: Rig, port: ActiveProjectIdStore): void {
  const resolveSnapshots = (id: string) => {
    rig.snapshotIds.push(id)
    return Promise.resolve(new SnapshotStore(new SubdirectoryPort(rig.root, id)))
  }
  render(<App store={rig.store} activeProjectIds={port} resolveSnapshots={resolveSnapshots} />)
}

// The held gate plus the promise of every lookup the application started, in order.
type HeldLookups = Gate & { results: Promise<unknown>[] }

// Hold the next id lookups (`store.list()`) open until the gate is released.
function holdTheIdLookup(store: OpfsProjectStore): HeldLookups {
  const held = gate()
  const results: Promise<unknown>[] = []
  const list = store.list.bind(store)
  vi.spyOn(store, 'list').mockImplementation(() => {
    const result = held.promise.then(list)
    results.push(result)
    return result
  })
  return { ...held, results }
}

function startANewProjectButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Start a new project' })
}

async function editTheProject(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /add floor/i }))
}

async function editAndAwaitASave(rig: Rig): Promise<void> {
  const before = rig.saved.length
  await editTheProject()
  await waitFor(() => expect(rig.saved.length).toBeGreaterThan(before), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
}

// The breadcrumb landmark names the open project, so it identifies which one is open.
async function openProjectName(): Promise<string | null> {
  const breadcrumb = await screen.findByRole('navigation', { name: /breadcrumb/i })
  return within(breadcrumb).getByText(/.+/).textContent
}

// Wait, inside `act`, until every promise has settled and React applied what followed.
async function settleInAct(promises: readonly unknown[]): Promise<void> {
  await act(async () => {
    await Promise.allSettled(promises)
  })
}

async function releaseTheLookups(held: HeldLookups): Promise<void> {
  held.release()
  await settleInAct(held.results)
}

async function flushTheSaves(rig: Rig): Promise<void> {
  await settleInAct(vi.mocked(rig.store.save).mock.results.map((result) => result.value))
}

function newIds(ids: readonly string[]): Set<string> {
  return new Set(ids.filter((id) => id !== FAILED_ID))
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

describe('A retry while the id of a new project is still being looked up', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the project that the retry opened and never remembers a new id', async () => {
    stubCapableStorage()
    const rig = await rigThatFailsOnce()
    const port = new RecordingActiveProjectIdStore()
    boot(rig, port)
    await screen.findByRole('alert')
    const lookup = holdTheIdLookup(rig.store)

    await userEvent.click(startANewProjectButton())
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await openProjectName()).toBe(KEPT_NAME)
    await releaseTheLookups(lookup)

    expect(await openProjectName()).toBe(KEPT_NAME)
    await editAndAwaitASave(rig)
    await flushTheSaves(rig)
    expect(await openProjectName()).toBe(KEPT_NAME)
    expect(newIds(rig.saved)).toEqual(new Set())
    expect(newIds(port.writes)).toEqual(new Set())
  })
})

describe('A save that finishes after another new project started', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('remembers exactly the id of the project that was saved', async () => {
    stubCapableStorage()
    const rig = await rigWithAFailedProject()
    const port = new RecordingActiveProjectIdStore()
    boot(rig, port)
    await screen.findByRole('alert')
    await userEvent.click(startANewProjectButton())
    const heldSave = gate()
    rig.saveGate = heldSave.promise
    await editTheProject()
    await waitFor(() => expect(rig.store.save).toHaveBeenCalled(), { timeout: AUTOSAVE_TIMEOUT_MS })
    const firstId = vi.mocked(rig.store.save).mock.calls[0]?.[0]

    await startAnotherNewProjectFromTheMenu()
    heldSave.release()
    await waitFor(() => expect(rig.saved).toContain(firstId), { timeout: AUTOSAVE_TIMEOUT_MS })
    await waitFor(() => expect(port.writes).toContain(firstId))
    await flushTheSaves(rig)

    expect(firstId).not.toBe(FAILED_ID)
    expect(port.writes).toEqual([firstId])
    expect(await port.read()).toBe(firstId)
  })
})

describe('A port that rejects its read', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under current instead of staying on the loading view', async () => {
    stubCapableStorage()
    const rig = await rigWithAFailedProject()
    await rig.store.save(FAILED_ID, namedProject(KEPT_NAME))
    const port: ActiveProjectIdStore = {
      read: () => Promise.reject(new Error('storage is unavailable')),
      write: () => Promise.resolve(),
    }

    boot(rig, port)

    expect(await openProjectName()).toBe(KEPT_NAME)
  })
})

describe('Guards on starting a new project from the failure dialog', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('starts one lookup and one new project on a double click', async () => {
    stubCapableStorage()
    const rig = await rigWithAFailedProject()
    boot(rig, new RecordingActiveProjectIdStore())
    await screen.findByRole('alert')
    const lookup = holdTheIdLookup(rig.store)

    await userEvent.dblClick(startANewProjectButton())
    await releaseTheLookups(lookup)
    await editAndAwaitASave(rig)
    await flushTheSaves(rig)

    expect(rig.store.list).toHaveBeenCalledTimes(1)
    expect(newIds([...rig.saved, ...rig.snapshotIds]).size).toBe(1)
  })

  it('sets no state and logs no warning when unmounted while the lookup is pending', async () => {
    stubCapableStorage()
    const rig = await rigWithAFailedProject()
    boot(rig, new RecordingActiveProjectIdStore())
    await screen.findByRole('alert')
    const lookup = holdTheIdLookup(rig.store)
    await userEvent.click(startANewProjectButton())
    const error = vi.spyOn(console, 'error')

    cleanup()
    await releaseTheLookups(lookup)

    expect(error).not.toHaveBeenCalled()
    expect(rig.saved).toEqual([])
  })
})
