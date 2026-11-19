import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UNKNOWN_WALL_FIELD_PATH } from '../../tests/fixtures/projects/versions/fixture-documents'
import { faultyProject } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { handleOf } from '../handle/handle-test-kit'
import { PROJECT_ID, openStored, snapshotRecovered } from './restore-snapshot-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const SNAPSHOT_FAILURE = 'The snapshot store failed'

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
    await restoreFaulty()

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

describe('a restore whose new handle cannot be built', () => {
  async function restoreWithFailingBuild() {
    const opened = await openStored()
    await snapshotRecovered(opened.handle)
    vi.spyOn(opened.ports.workspace, 'snapshots').mockImplementation(() => {
      throw new Error(SNAPSHOT_FAILURE)
    })
    return { ...opened, result: await restoreSnapshot(opened.handle) }
  }

  it('gives storage-unavailable with the message', async () => {
    const { result } = await restoreWithFailingBuild()

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: SNAPSHOT_FAILURE },
    })
  })

  it('frees the lock, because no handle holds it', async () => {
    const { ports } = await restoreWithFailingBuild()

    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})
