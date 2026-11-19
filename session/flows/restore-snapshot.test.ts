import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentBytes, renamed } from '../../tests/storage/conformance/conformance-documents'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import {
  createControlledLocks,
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { ControlledLocks, TestPorts } from '../handle/handle-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const PROJECT_ID = 'a'
const RECOVERED_NAME = 'Recovered after a crash'
const SAVES_OF_AN_EDIT_THEN_A_RESTORE = 2

/** The ports, and a handle on a stored sound document of the project `a`. */
async function openStored(locks?: ControlledLocks) {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const opened = locks === undefined ? ports : { ...ports, locks: locks.port }
  const handle = await openOrThrow(opened, workspaceRequest(PROJECT_ID))
  return { ports, handle }
}

/** Writes the open project, under the recovered name, as the newest snapshot of the handle. */
async function snapshotRecovered(handle: DocumentHandle): Promise<void> {
  const project = handle.session.getProject()
  await handle.snapshots.writeSnapshot(renamed(project, RECOVERED_NAME))
}

/** The names of the projects that the store saves, in the order of the saves. */
function savedNames(ports: TestPorts): string[] {
  const names: string[] = []
  const realSave = ports.workspace.save.bind(ports.workspace)
  ports.workspace.save = (id, project) => {
    names.push(project.meta.name)
    return realSave(id, project)
  }
  return names
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a restore of the newest snapshot', () => {
  it('the snapshot becomes the document of a new handle on the same id', async () => {
    const { handle: current } = await openStored()
    await snapshotRecovered(current)

    const restored = handleOf(await restoreSnapshot(current))

    expect(restored).not.toBe(current)
    expect(restored).toMatchObject({
      id: current.id,
      location: current.location,
      durable: current.durable,
    })
    expect(restored.session.getProject().meta.name).toBe(RECOVERED_NAME)
  })

  it('the lock is held through the restore, and no lock is taken or freed', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { handle: current } = await openStored(locks)
    await snapshotRecovered(current)
    const tryAcquire = vi.spyOn(locks.port, 'tryAcquire')

    handleOf(await restoreSnapshot(current))

    expect(tryAcquire).not.toHaveBeenCalled()
    expect(locks.releases()).toBe(0)
    expect(await locks.port.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('the old handle is closed, and its close frees nothing', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { handle: current } = await openStored(locks)
    await snapshotRecovered(current)
    handleOf(await restoreSnapshot(current))

    expect(await current.close()).toEqual({ ok: true })
    expect(await current.save()).toMatchObject({ ok: false })
    expect(locks.releases()).toBe(0)
  })

  it('the restored document is stored before the flow resolves', async () => {
    const { ports, handle: current } = await openStored()
    await snapshotRecovered(current)

    handleOf(await restoreSnapshot(current))

    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(RECOVERED_NAME)
  })

  it('the undo history of the new handle is empty', async () => {
    const { handle: current } = await openStored()
    rename(current, 'Edited before the restore')
    await snapshotRecovered(current)

    const restored = handleOf(await restoreSnapshot(current))

    expect(restored.session.canUndo()).toBe(false)
  })
})

describe('a restore and the writes of the current handle', () => {
  it('an unsaved edit of the current project is written before the restore', async () => {
    const { ports, handle: current } = await openStored()
    await snapshotRecovered(current)
    rename(current, 'Edited before the restore')
    const names = savedNames(ports)

    handleOf(await restoreSnapshot(current))

    expect(names).toEqual(['Edited before the restore', RECOVERED_NAME])
  })

  it('a flush that fails gives flush-failed, and the current handle stays open', async () => {
    const { ports, handle: current } = await openStored()
    await snapshotRecovered(current)
    failSaves(ports.workspace)
    rename(current, 'Edited before the failed restore')

    const result = await restoreSnapshot(current)

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(current.saveStatus()).toBe('error')
    expect(current.session.getProject().meta.name).toBe('Edited before the failed restore')
  })

  it('a save that runs in the old handle ends before the new handle writes', async () => {
    const { ports, handle: current } = await openStored()
    await snapshotRecovered(current)
    const gate = gateSaves(ports.workspace)
    rename(current, 'Saved while the restore starts')
    const saving = current.save()

    const restoring = restoreSnapshot(current)
    await settle()
    gate.endOldestSave()
    await settle()
    gate.endOldestSave()
    await settle()

    expect(gate.started()).toBe(SAVES_OF_AN_EDIT_THEN_A_RESTORE)
    expect(gate.mostRunningTogether()).toBe(1)
    expect(await saving).toEqual({ ok: true })
    expect(handleOf(await restoring).id).toBe(PROJECT_ID)
  })
})

describe('a restore that is refused', () => {
  it('with no snapshot it gives nothing-to-restore, and the current handle stays open', async () => {
    const { ports, handle: current } = await openStored()

    const result = await restoreSnapshot(current)

    expect(result).toEqual({ ok: false, failure: { kind: 'nothing-to-restore' } })
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(await current.save()).toEqual({ ok: true })
  })

  it('a snapshot that does not decode gives did-not-restore, and the current handle keeps its undo history', async () => {
    const { handle: current } = await openStored()
    rename(current, 'Edited before the refused restore')
    const notJson = { kind: 'not-json', message: 'Unexpected end of JSON input' } as const
    vi.spyOn(current.snapshots, 'restore').mockResolvedValue({ ok: false, failure: notJson })

    const result = await restoreSnapshot(current)

    expect(result).toEqual({ ok: false, failure: { kind: 'did-not-restore', decode: notJson } })
    expect(current.session.canUndo()).toBe(true)
  })
})
