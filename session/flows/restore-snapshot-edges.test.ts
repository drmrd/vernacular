import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  bytesOf,
  fixtureDocument,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { faultyProject } from '../../tests/storage/conformance/conformance-documents'
import { handleOf } from '../handle/handle-test-kit'
import { PROJECT_ID, openStored, snapshotRecovered } from './restore-snapshot-test-kit'
import type { StoredAndOpen } from './restore-snapshot-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const SNAPSHOT_FAILURE = 'The snapshot store failed'
const SNAPSHOT_DIRECTORY = `${PROJECT_ID}/.house-autosave`
const BACKUP_DIRECTORY = `${PROJECT_ID}/.house-backups`
const START_FILE = 'session-start.json'
/** Bytes unlike any snapshot, so that a backup of the wrong file would not match the copy. */
const START_BYTES = new TextEncoder().encode('{}')
const SNAPSHOT_PREFIX = 'snapshot-'
const OLDER_VERSION = 8

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a restore of a snapshot that breaks the format rules', () => {
  const FORMAT_RULES_BACKUP = /^refused-snapshot-v\d+-[0-9a-f]{64}\.json$/

  async function restoreFaulty() {
    const opened = await openStored()
    await opened.handle.snapshots.writeSnapshot(faultyProject())
    const names = await opened.ports.root.list(SNAPSHOT_DIRECTORY)
    const name = names.find((candidate) => candidate.startsWith(SNAPSHOT_PREFIX))
    if (name === undefined) throw new Error(`Expected a snapshot file under ${SNAPSHOT_DIRECTORY}`)
    await opened.ports.root.writeFile(`${SNAPSHOT_DIRECTORY}/${START_FILE}`, START_BYTES)
    const copy = await opened.ports.root.readFile(`${SNAPSHOT_DIRECTORY}/${name}`)
    return { ...opened, copy, result: await restoreSnapshot(opened.handle) }
  }

  it('gives did-not-restore with format-rules', async () => {
    const { result } = await restoreFaulty()

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-restore', decode: { kind: 'format-rules' } },
    })
  })

  it('leaves the open project as it was', async () => {
    const { ports, handle } = await restoreFaulty()

    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(handle.saveStatus()).toBe('idle')
    expect(await handle.save()).toEqual({ ok: true })
  })

  it('moves the copy to the backups, byte for byte', async () => {
    const { ports, copy } = await restoreFaulty()

    const backups = await ports.root.list(BACKUP_DIRECTORY)
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(FORMAT_RULES_BACKUP)
    expect(await ports.root.readFile(`${BACKUP_DIRECTORY}/${backups[0]}`)).toEqual(copy)
    expect(await ports.root.list(SNAPSHOT_DIRECTORY)).toEqual([START_FILE])
  })
})

describe('a restore of a faulty snapshot that was migrated', () => {
  /** Writes a snapshot through the handle, then puts an older document with a fault in its place. */
  async function plantMigratedFaultySnapshot({ ports, handle }: StoredAndOpen): Promise<void> {
    await handle.snapshots.writeSnapshot(faultyProject())
    const names = await ports.root.list(SNAPSHOT_DIRECTORY)
    if (names.length === 0) throw new Error(`Expected a snapshot under ${SNAPSHOT_DIRECTORY}`)
    const bytes = bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION)))
    await Promise.all(
      names.map((name) => ports.root.writeFile(`${SNAPSHOT_DIRECTORY}/${name}`, bytes)),
    )
  }

  it('keeps a migrated copy under the version that it was migrated from', async () => {
    const opened = await openStored()
    await plantMigratedFaultySnapshot(opened)

    await restoreSnapshot(opened.handle)

    const backups = await opened.ports.root.list(BACKUP_DIRECTORY)
    expect(backups).toHaveLength(1)
    expect(backups[0]).toMatch(
      new RegExp(`^refused-snapshot-v${OLDER_VERSION}-[0-9a-f]{64}\\.json$`),
    )
  })
})

describe('a restore whose snapshot store rejects', () => {
  async function restoreWithRejectingStore() {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    vi.spyOn(opened.handle.snapshots, 'restore').mockRejectedValue(new Error(SNAPSHOT_FAILURE))
    return { ...opened, result: await restoreSnapshot(opened.handle) }
  }

  it('gives storage-unavailable with the message', async () => {
    const { result } = await restoreWithRejectingStore()

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: SNAPSHOT_FAILURE },
    })
  })

  it('leaves the current handle open and unchanged', async () => {
    const { ports, handle } = await restoreWithRejectingStore()

    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(handle.saveStatus()).toBe('idle')
    expect(await handle.save()).toEqual({ ok: true })
  })
})

describe('a restore of a handle that no open built', () => {
  async function restoreHandBuilt() {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    const save = vi.spyOn(opened.ports.workspace, 'save')
    return { ...opened, save, result: await restoreSnapshot({ ...opened.handle }) }
  }

  it('gives storage-unavailable', async () => {
    const { result } = await restoreHandBuilt()

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: expect.any(String) },
    })
  })

  it('touches nothing: the real handle keeps its lock and nothing is stored', async () => {
    const { ports, handle, save } = await restoreHandBuilt()

    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(save).not.toHaveBeenCalled()
    expect(handle.saveStatus()).toBe('idle')
  })
})

describe('a restore on a store whose snapshots method throws', () => {
  async function restoreWithThrowingSnapshots() {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    const snapshots = vi.spyOn(opened.ports.workspace, 'snapshots')
    snapshots.mockClear()
    snapshots.mockImplementation(() => {
      throw new Error(SNAPSHOT_FAILURE)
    })
    return { ...opened, result: await restoreSnapshot(opened.handle) }
  }

  it('does not stop a restore: the result is ok, and the new handle holds the lock', async () => {
    const { ports, result } = await restoreWithThrowingSnapshots()

    expect(result).toEqual({ ok: true, handle: expect.anything() })
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })
})

describe('the snapshots of a restored handle', () => {
  it('are the snapshots object of the old handle, and the store is not asked for them', async () => {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    const snapshots = vi.spyOn(opened.ports.workspace, 'snapshots')
    snapshots.mockClear()

    const restored = handleOf(await restoreSnapshot(opened.handle))

    expect(snapshots).not.toHaveBeenCalled()
    expect(restored.snapshots).toBe(opened.handle.snapshots)
  })

  it('still belong to the id: a snapshot written through the new handle is recoverable from the store', async () => {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    const restored = handleOf(await restoreSnapshot(opened.handle))

    await snapshotRecovered(restored)

    expect(await opened.ports.workspace.snapshots(PROJECT_ID).isRecoverable()).toBe(true)
  })
})
