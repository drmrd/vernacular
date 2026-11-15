import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import {
  InMemoryActiveProjectIdStore,
  InMemoryDirectory,
  OpfsProjectStore,
  SnapshotStore,
  SubdirectoryPort,
  type DirectoryPort,
} from '../storage'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../core'

const FAILED_ID = 'current'
const AUTOSAVE_DIRECTORY = '.house-autosave'
// Autosave debounces its writes, so the wait for the first one is generous.
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

async function seedFailedProject(root: InMemoryDirectory): Promise<void> {
  const bytes = projectFromANewerBuild()
  await root.writeFile(`${FAILED_ID}/vernacular.json`, bytes)
  await root.writeFile(`${FAILED_ID}/.house-backups/vernacular.pre-migration.json`, bytes)
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

async function storedIds(store: OpfsProjectStore): Promise<string[]> {
  const summaries = await store.list()
  return summaries.map((summary) => summary.id)
}

describe('A project started after a failed load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('autosaves under its own id and leaves every file of the failed project untouched', async () => {
    stubCapableStorage()
    const root = new InMemoryDirectory()
    await seedFailedProject(root)
    const store = new OpfsProjectStore(root)
    const before = await filesUnder(root, FAILED_ID)
    expect(await storedIds(store)).toEqual([FAILED_ID])
    const save = vi.spyOn(store, 'save')
    const resolveSnapshots = (id: string) =>
      Promise.resolve(new SnapshotStore(new SubdirectoryPort(root, id)))

    render(
      <App
        store={store}
        activeProjectIds={new InMemoryActiveProjectIdStore()}
        resolveSnapshots={resolveSnapshots}
      />,
    )

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /start a new project/i }))
    await userEvent.click(await screen.findByRole('button', { name: /add floor/i }))
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: AUTOSAVE_TIMEOUT_MS })
    await save.mock.results[0]?.value

    expect(await filesUnder(root, FAILED_ID)).toEqual(before)
    const ids = await storedIds(store)
    const newId = ids.find((id) => id !== FAILED_ID)
    expect(ids).toEqual(expect.arrayContaining([FAILED_ID, newId]))
    expect(ids).toHaveLength(2)
    await waitFor(async () =>
      expect(await root.list(`${newId}/${AUTOSAVE_DIRECTORY}`)).not.toHaveLength(0),
    )
  })
})
