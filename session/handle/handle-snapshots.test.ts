import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import {
  UNKNOWN_WALL_FIELD_PATH,
  bytesOf,
  fixtureDocument,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { currentBytes, faultyProject } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import { snapshotRecovered } from '../flows/restore-snapshot-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  recordSaves,
  recordSnapshots,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'
const SNAPSHOT_DIRECTORY = `${PROJECT_ID}/.house-autosave`
const OLDER_VERSION = 8
const WRITE_OF_THE_ID = [`writeSnapshot:${PROJECT_ID}`, `save:${PROJECT_ID}`, `prune:${PROJECT_ID}`]

let consoleError: ReturnType<typeof vi.spyOn>

/** Ports with a stored sound document of the project `a`, and a handle on it. */
async function openStored(ports: TestPorts = createTestPorts()) {
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  return { ports, handle }
}

/** Ports whose snapshots and saves report to `log`, and a handle on the project `a`. */
async function openRecorded(log: string[], failure?: Parameters<typeof recordSnapshots>[2]) {
  const ports = createTestPorts()
  recordSnapshots(ports.workspace, log, failure)
  const opened = await openStored(ports)
  recordSaves(ports.workspace, log)
  return opened
}

/** New ports on the same directory with a new lock registry: what a reload of the page gives. */
function reloadOf(ports: TestPorts): TestPorts {
  return createTestPorts({ root: ports.root })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the snapshots of a handle belong to its id', () => {
  it("autosave writes snapshots under the handle's id", async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'Written ahead of the save')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()

    const recoverable = await reloadOf(ports).workspace.snapshots(PROJECT_ID).isRecoverable()
    gate.endOldestSave()
    await settle()

    expect(recoverable).toBe(true)
  })

  it('a handle on another id sees no recovery', async () => {
    const { ports, handle } = await openStored()
    await placeDocument(ports, OTHER_ID, currentBytes())
    const other = await openOrThrow(ports, workspaceRequest(OTHER_ID))

    await handle.snapshots.writeSnapshot(handle.session.getProject())

    expect(await handle.snapshots.isRecoverable()).toBe(true)
    expect(await other.snapshots.isRecoverable()).toBe(false)
  })
})

describe('the steps of a write of a handle', () => {
  it('a write goes snapshot, save, report, prune', async () => {
    const log: string[] = []
    const ports = createTestPorts()
    recordSnapshots(ports.workspace, log)
    const handle = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      create: faultyProject,
    })
    recordSaves(ports.workspace, log)
    handle.onNotice((notice) => log.push(notice))
    rename(handle, 'Written by the autosave delay')

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()

    expect(log).toEqual([
      `writeSnapshot:${PROJECT_ID}`,
      `save:${PROJECT_ID}`,
      'saved-with-faults',
      `prune:${PROJECT_ID}`,
    ])
  })

  it.each([
    ['an explicit save', (handle: DocumentHandle) => handle.save()],
    ['a close', (handle: DocumentHandle) => handle.close()],
  ])('%s writes the snapshot first and prunes after', async (_name, write) => {
    const log: string[] = []
    const { handle } = await openRecorded(log)
    rename(handle, 'Edited before the write')

    expect(await write(handle)).toEqual({ ok: true })

    expect(log).toEqual(WRITE_OF_THE_ID)
  })
})

describe('a write of a handle whose step fails', () => {
  it('a save that fails keeps the snapshot, so a new start can recover it', async () => {
    const { ports, handle } = await openStored()
    failSaves(ports.workspace)
    rename(handle, 'Kept only in the snapshot')
    expect(await handle.save()).toMatchObject({ ok: false })

    const restarted = await openOrThrow(reloadOf(ports), workspaceRequest(PROJECT_ID))

    expect(await restarted.snapshots.isRecoverable()).toBe(true)
  })

  it('a prune that fails leaves the save ok, the status saved, and a close ok', async () => {
    const error = new Error('the prune failed')
    const { handle } = await openRecorded([], { step: 'prune', error })
    rename(handle, 'Stored before the failed prune')
    const saved = await handle.save()
    const status = handle.saveStatus()
    rename(handle, 'Stored by the close')

    const closed = await handle.close()

    expect({ saved, status, closed }).toEqual({
      saved: { ok: true },
      status: 'saved',
      closed: { ok: true },
    })
    expect(consoleError.mock.calls.flat()).toContain(error)
  })

  it('a snapshot write that fails stops the write before the store save', async () => {
    const log: string[] = []
    const error = new Error('the snapshot write failed')
    const { handle } = await openRecorded(log, { step: 'writeSnapshot', error })
    rename(handle, 'Never stored')

    await handle.save()

    expect(log).toEqual([`writeSnapshot:${PROJECT_ID}`])
    expect(handle.saveStatus()).toBe('error')
  })
})

describe('the snapshots and a restore', () => {
  /** Writes a snapshot through the handle, then puts an older document with a fault in its place. */
  async function plantMigratedFaultySnapshot(ports: TestPorts, handle: DocumentHandle) {
    await handle.snapshots.writeSnapshot(handle.session.getProject())
    const names = await ports.root.list(SNAPSHOT_DIRECTORY)
    if (names.length === 0) throw new Error(`Expected a snapshot under ${SNAPSHOT_DIRECTORY}`)
    const bytes = bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION)))
    await Promise.all(
      names.map((name) => ports.root.writeFile(`${SNAPSHOT_DIRECTORY}/${name}`, bytes)),
    )
  }

  it('the restore of a snapshot that fails the check gives its migrated document with a warning', async () => {
    const { ports, handle } = await openStored()
    await plantMigratedFaultySnapshot(ports, handle)
    vi.mocked(console.warn).mockClear()

    const restored = handleOf(await restoreSnapshot(handle))

    expect(restored.session.getProject().meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).toContain(UNKNOWN_WALL_FIELD_PATH)
  })

  it('after a restore, the save of the restored document prunes the snapshots', async () => {
    const { ports, handle } = await openStored()
    await snapshotRecovered(handle)

    handleOf(await restoreSnapshot(handle))

    expect(await ports.workspace.snapshots(PROJECT_ID).isRecoverable()).toBe(false)
  })
})
