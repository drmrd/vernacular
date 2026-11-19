// @vitest-environment node
// Pure storage logic; node aligns TextEncoder/Uint8Array realms with serialization.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  type Project,
} from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  bytesOf,
  fixtureDocument,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { SnapshotStore } from './snapshot-store'

const AUTOSAVE_DIRECTORY = '.house-autosave'
const OLDEST_FIXTURE_VERSION = 8

function bytesFailingTheCheck(): Uint8Array {
  return bytesOf(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
}

async function storeHoldingSnapshot(bytes: Uint8Array): Promise<SnapshotStore> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(`${AUTOSAVE_DIRECTORY}/snapshot-1.json`, bytes)
  return new SnapshotStore(directory)
}

afterEach(() => {
  vi.restoreAllMocks()
})

function projectNamed(name: string): Project {
  const project = createEmptyProject({
    name: 'Snap',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
  project.meta.name = name
  return project
}

/** The document a store hands back: the saved project, stamped with the revision of this build. */
function withCurrentRevision(project: Project): Project {
  return { ...project, meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION } }
}

/** A `now` that returns each supplied timestamp in turn across successive calls. */
function clockReturning(...timestamps: number[]): () => number {
  let index = 0
  return () => {
    const timestamp = timestamps[index]
    if (timestamp === undefined) {
      throw new Error(
        `clock called ${index + 1} times but only ${timestamps.length} timestamps given`,
      )
    }
    index += 1
    return timestamp
  }
}

describe('SnapshotStore', () => {
  it('keeps the session-start snapshot and caps rolling snapshots to maxSnapshots', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, {
      maxSnapshots: 5,
      now: clockReturning(1, 2, 3, 4, 5, 6),
    })

    for (let write = 0; write < 6; write += 1) {
      await store.writeSnapshot(projectNamed('Snap'))
    }

    const entries = await directory.list(AUTOSAVE_DIRECTORY)

    expect(new Set(entries)).toEqual(
      new Set([
        'session-start.json',
        'snapshot-2.json',
        'snapshot-3.json',
        'snapshot-4.json',
        'snapshot-5.json',
        'snapshot-6.json',
      ]),
    )
    expect(entries).not.toContain('snapshot-1.json')
  })

  it('spares a file that only looks like a snapshot and does not count it against the cap', async () => {
    const cap = 3
    const foreignPath = `${AUTOSAVE_DIRECTORY}/snapshot-notes.txt`
    const directory = new InMemoryDirectory()
    await directory.writeFile(foreignPath, Uint8Array.of(9, 8, 7))
    const store = new SnapshotStore(directory, {
      maxSnapshots: cap,
      now: clockReturning(1, 2, 3, 4, 5),
    })

    for (let write = 0; write < cap + 2; write += 1) {
      await store.writeSnapshot(projectNamed('Snap'))
    }

    const entries = await directory.list(AUTOSAVE_DIRECTORY)
    expect(await directory.readFile(foreignPath)).toEqual(Uint8Array.of(9, 8, 7))
    expect(entries.filter((name) => /^snapshot-.*\.json$/.test(name))).toHaveLength(cap)
  })

  it('restores the newest rolling snapshot', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1, 2) })

    await store.writeSnapshot(projectNamed('A'))
    await store.writeSnapshot(projectNamed('B'))

    expect(await store.restore()).toEqual(withCurrentRevision(projectNamed('B')))
  })

  it('restores nothing on a fresh store', async () => {
    const store = new SnapshotStore(new InMemoryDirectory())

    expect(await store.restore()).toBeUndefined()
  })

  it('reports recoverability only once a rolling snapshot exists', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1) })

    expect(await store.isRecoverable()).toBe(false)

    await store.writeSnapshot(projectNamed('Snap'))

    expect(await store.isRecoverable()).toBe(true)
  })

  it('clears every snapshot when pruned', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1, 2) })
    await store.writeSnapshot(projectNamed('A'))
    await store.writeSnapshot(projectNamed('B'))

    await store.prune()

    expect(await store.restore()).toBeUndefined()
    expect(await store.isRecoverable()).toBe(false)
    expect(await directory.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })

  it('removes only the files that the snapshot store wrote and leaves any other file in the directory', async () => {
    const directory = new InMemoryDirectory()
    const store = new SnapshotStore(directory, { now: clockReturning(1, 2) })
    await store.writeSnapshot(projectNamed('A'))
    await store.writeSnapshot(projectNamed('B'))
    await directory.writeFile(`${AUTOSAVE_DIRECTORY}/pre-migration-v3.json`, Uint8Array.of(1))
    await directory.writeFile(`${AUTOSAVE_DIRECTORY}/notes.txt`, Uint8Array.of(2))

    await store.prune()

    expect(new Set(await directory.list(AUTOSAVE_DIRECTORY))).toEqual(
      new Set(['pre-migration-v3.json', 'notes.txt']),
    )
    expect(await directory.readFile(`${AUTOSAVE_DIRECTORY}/notes.txt`)).toEqual(Uint8Array.of(2))
  })

  it('restores a version 8 snapshot as a document at the current schema version', async () => {
    const store = await storeHoldingSnapshot(versionFixtureBytes(OLDEST_FIXTURE_VERSION))

    const restored = await store.restore()

    expect(restored?.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
  })

  it('restores the migrated document of a snapshot that fails the check and warns of the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = await storeHoldingSnapshot(bytesFailingTheCheck())

    const restored = await store.restore()

    expect(restored?.floors[0]?.walls[0]).toHaveProperty(UNKNOWN_FIELD, 1)
    expect(
      warn.mock.calls.some((args) => JSON.stringify(args).includes(UNKNOWN_WALL_FIELD_PATH)),
    ).toBe(true)
  })
})

describe('SnapshotStore housekeeping failures', () => {
  it('a rolling cap that cannot remove a file still writes the snapshot and resolves', async () => {
    const cap = 2
    const writes = cap + 2
    const removalError = new Error('the file cannot be removed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const directory = new InMemoryDirectory()
    directory.removeFile = () => Promise.reject(removalError)
    const store = new SnapshotStore(directory, {
      maxSnapshots: cap,
      now: clockReturning(1, 2, 3, 4),
    })

    for (let write = 1; write <= writes; write += 1) {
      await expect(store.writeSnapshot(projectNamed(`Write ${write}`))).resolves.toBeUndefined()
    }

    expect(await store.restore()).toEqual(withCurrentRevision(projectNamed(`Write ${writes}`)))
    expect(consoleError.mock.calls.flat()).toContain(removalError)
  })

  it('a rolling cap whose listing fails after the write still writes the snapshot and resolves', async () => {
    const cap = 2
    const listingError = new Error('the directory cannot be listed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const directory = new InMemoryDirectory()
    const list = directory.list.bind(directory)
    const writeFile = directory.writeFile.bind(directory)
    let listingBroken = false
    directory.writeFile = async (path, bytes) => {
      await writeFile(path, bytes)
      listingBroken = true
    }
    directory.list = (path) => (listingBroken ? Promise.reject(listingError) : list(path))
    const store = new SnapshotStore(directory, { maxSnapshots: cap, now: clockReturning(1) })

    await expect(store.writeSnapshot(projectNamed('Written'))).resolves.toBeUndefined()

    listingBroken = false
    const soundStore = new SnapshotStore(directory, { maxSnapshots: cap })
    expect(await soundStore.restore()).toEqual(withCurrentRevision(projectNamed('Written')))
    expect(consoleError.mock.calls.flat()).toContain(listingError)
  })

  it('a write logs once when several old snapshots cannot be removed', async () => {
    const cap = 1
    const writesBeforeTheLogged = cap + 1
    const removalError = new Error('the file cannot be removed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const directory = new InMemoryDirectory()
    directory.removeFile = () => Promise.reject(removalError)
    const store = new SnapshotStore(directory, {
      maxSnapshots: cap,
      now: clockReturning(1, 2, 3),
    })
    for (let write = 1; write <= writesBeforeTheLogged; write += 1) {
      await store.writeSnapshot(projectNamed(`Write ${write}`))
    }
    consoleError.mockClear()

    await store.writeSnapshot(projectNamed('Logged write'))

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(consoleError.mock.calls[0]).toContain(removalError)
  })
})
