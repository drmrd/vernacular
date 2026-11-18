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
  type DirectoryPort,
} from '../storage'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, createFloor, type Project } from '../core'

const FAILED_ID = 'current'
const KEPT_NAME = 'Kept House'
// Autosave debounces its writes, so the wait for each one is generous.
const AUTOSAVE_TIMEOUT_MS = 3000
const FIRST_LOOKUP = 0
const SECOND_LOOKUP = 1

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
}

/** What a store resolves when a save found nothing to report. */
const SAVE_REPORT = { faults: [], backedUp: false }

// The stored project fails every load: this build cannot open it.
async function rigWithAFailedProject(): Promise<Rig> {
  const root = new InMemoryDirectory()
  await root.writeFile(`${FAILED_ID}/vernacular.json`, projectFromANewerBuild())
  const store = new OpfsProjectStore(root)
  const rig: Rig = { root, store, saved: [], snapshotIds: [] }
  const save = store.save.bind(store)
  vi.spyOn(store, 'save').mockImplementation(async (id: string, project: Project) => {
    await save(id, project)
    rig.saved.push(id)
    return SAVE_REPORT
  })
  return rig
}

function boot(rig: Rig, activeProjectIds: ActiveProjectIdStore): void {
  const resolveSnapshots = (id: string) => {
    rig.snapshotIds.push(id)
    return Promise.resolve(new SnapshotStore(new SubdirectoryPort(rig.root, id)))
  }
  render(
    <App
      store={rig.store}
      activeProjectIds={activeProjectIds}
      resolveSnapshots={resolveSnapshots}
    />,
  )
}

// Holds every id lookup (`store.list()`) open on its own until the test releases it.
class HeldLookups {
  private readonly releases: (() => void)[] = []
  private readonly results: Promise<unknown>[] = []

  constructor(store: OpfsProjectStore) {
    const list = store.list.bind(store)
    vi.spyOn(store, 'list').mockImplementation(() => {
      const held = new Promise<void>((resolve) => this.releases.push(resolve))
      const result = held.then(list)
      this.results.push(result)
      return result
    })
  }

  get started(): number {
    return this.results.length
  }

  // Release one lookup and wait, inside `act`, until it has resolved and React has
  // applied whatever the application did with its result.
  async release(index: number): Promise<void> {
    this.releases[index]?.()
    await act(async () => {
      await this.results[index]
    })
  }
}

async function filesUnder(root: DirectoryPort, prefix: string): Promise<Map<string, string>> {
  const files = new Map<string, string>()
  for (const name of await root.list(prefix)) {
    const path = `${prefix}/${name}`
    const bytes = await root.readFile(path)
    const entries = bytes ? [[path, new TextDecoder().decode(bytes)] as const] : []
    const nested = bytes ? new Map<string, string>() : await filesUnder(root, path)
    for (const [key, text] of [...entries, ...nested]) {
      files.set(key, text)
    }
  }
  return files
}

function newIds(ids: readonly string[]): Set<string> {
  return new Set(ids.filter((id) => id !== FAILED_ID))
}

async function clickStartANewProject(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'Start a new project' }))
}

// Retry and wait until the retried load has failed and the failure view is back.
async function retryAndFailAgain(rig: Rig): Promise<void> {
  const loads = vi.mocked(rig.store.load).mock.calls.length
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(rig.store.load).toHaveBeenCalledTimes(loads + 1))
  await screen.findByRole('button', { name: 'Retry' })
  expect(screen.getByRole('alert')).toBeInTheDocument()
}

function breadcrumb(): HTMLElement | null {
  return screen.queryByRole('navigation', { name: /breadcrumb/i })
}

async function editAndAwaitASave(rig: Rig): Promise<void> {
  const before = rig.saved.length
  await userEvent.click(await screen.findByRole('button', { name: /add floor/i }))
  await waitFor(() => expect(rig.saved.length).toBeGreaterThan(before), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
}

// Wait, inside `act`, until every save the application started has finished.
async function flushTheSaves(rig: Rig): Promise<void> {
  const saves = vi.mocked(rig.store.save).mock.results.map((result) => result.value as unknown)
  await act(async () => {
    await Promise.allSettled(saves)
  })
}

async function storedNewIds(store: OpfsProjectStore): Promise<Set<string>> {
  return newIds((await store.list()).map((summary) => summary.id))
}

async function bootAFailedProject(): Promise<{ rig: Rig; port: RecordingActiveProjectIdStore }> {
  stubCapableStorage()
  const rig = await rigWithAFailedProject()
  vi.spyOn(rig.store, 'load')
  const port = new RecordingActiveProjectIdStore()
  boot(rig, port)
  await screen.findByRole('alert')
  return { rig, port }
}

describe('A retry that fails again while the id of a new project is being looked up', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('drops the first lookup and opens one new project from the next click', async () => {
    const { rig, port } = await bootAFailedProject()
    const lookups = new HeldLookups(rig.store)
    await clickStartANewProject()
    await retryAndFailAgain(rig)

    await lookups.release(FIRST_LOOKUP)
    expect(breadcrumb()).toBeNull()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(newIds([...rig.snapshotIds, ...port.writes])).toEqual(new Set())

    await clickStartANewProject()
    expect(lookups.started).toBe(SECOND_LOOKUP + 1)
    await lookups.release(SECOND_LOOKUP)
    await waitFor(() => expect(breadcrumb()).not.toBeNull())
    await editAndAwaitASave(rig)
    await flushTheSaves(rig)
    expect(newIds([...rig.saved, ...rig.snapshotIds, ...port.writes]).size).toBe(1)
  })

  it('opens one new project when both clicks around the failed retry resolve in order', async () => {
    const { rig, port } = await bootAFailedProject()
    const before = await filesUnder(rig.root, FAILED_ID)
    const lookups = new HeldLookups(rig.store)
    await clickStartANewProject()
    await retryAndFailAgain(rig)
    await clickStartANewProject()

    await lookups.release(FIRST_LOOKUP)
    expect(breadcrumb()).toBeNull()
    await lookups.release(SECOND_LOOKUP)
    await waitFor(() => expect(breadcrumb()).not.toBeNull())
    await editAndAwaitASave(rig)
    await flushTheSaves(rig)

    vi.mocked(rig.store.list).mockRestore()
    const opened = newIds([...rig.saved, ...rig.snapshotIds, ...port.writes])
    expect(opened.size).toBe(1)
    expect(await storedNewIds(rig.store)).toEqual(opened)
    expect(rig.store.save).not.toHaveBeenCalledWith(FAILED_ID, expect.anything())
    expect(await filesUnder(rig.root, FAILED_ID)).toEqual(before)
  })
})

describe('A port whose read throws', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under current and reports no error', async () => {
    stubCapableStorage()
    const rig = await rigWithAFailedProject()
    await rig.store.save(FAILED_ID, namedProject(KEPT_NAME))
    const error = vi.spyOn(console, 'error')
    const port: ActiveProjectIdStore = {
      read: () => {
        throw new Error('storage is unavailable')
      },
      write: () => Promise.resolve(),
    }

    boot(rig, port)

    const shown = await screen.findByRole('navigation', { name: /breadcrumb/i })
    expect(within(shown).getByText(/.+/).textContent).toBe(KEPT_NAME)
    expect(error).not.toHaveBeenCalled()
  })
})
