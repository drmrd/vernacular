import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  UNKNOWN_WALL_FIELD_PATH,
  bytesOf,
  fixtureDocument,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  documentBreakingFormatRules,
  faultyProject,
} from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import {
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { PROJECT_ID, openStored, snapshotRecovered } from './restore-snapshot-test-kit'
import type { StoredAndOpen } from './restore-snapshot-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const SNAPSHOT_FAILURE = 'The snapshot store failed'
const SNAPSHOT_DIRECTORY = `${PROJECT_ID}/.house-autosave`
const BACKUP_DIRECTORY = `${PROJECT_ID}/.house-backups`
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
  async function restoreFaulty() {
    const opened = await openStored()
    await opened.handle.snapshots.writeSnapshot(faultyProject())
    const result = await restoreSnapshot(opened.handle)
    return { ...opened, restored: handleOf(result) }
  }

  it('restores it, and the status of the new handle is saved', async () => {
    const { restored } = await restoreFaulty()

    expect(restored.saveStatus()).toBe('saved')
  })

  it('writes a warning that names the fault', async () => {
    const opened = await openStored()
    await opened.handle.snapshots.writeSnapshot(faultyProject())
    vi.mocked(console.warn).mockClear()
    // A save that rejects writes nothing, so it cannot be the one that warns of the fault.
    failSaves(opened.ports.workspace)

    await restoreSnapshot(opened.handle)

    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain(UNKNOWN_WALL_FIELD_PATH)
  })

  it('raises no saved-with-faults notice on the restored handle', async () => {
    const { restored } = await restoreFaulty()
    const listener = vi.fn()

    restored.onNotice(listener)
    await settle()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('a restore of a faulty snapshot that was migrated', () => {
  /**
   * A handle on a stored document that already breaks the format rules, so that the save of the
   * restored document has no last sound document to keep in a backup.
   */
  async function openStoredFaulty(): Promise<StoredAndOpen> {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentBreakingFormatRules())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    return { ports, sessionPorts: ports, handle }
  }

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

  it('writes no backup file', async () => {
    const opened = await openStoredFaulty()
    await plantMigratedFaultySnapshot(opened)

    handleOf(await restoreSnapshot(opened.handle))

    expect(await opened.ports.root.list(BACKUP_DIRECTORY)).toEqual([])
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
