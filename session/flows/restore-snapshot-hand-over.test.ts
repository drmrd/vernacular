import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import {
  createControlledLocks,
  failSaves,
  handleOf,
  placeDocument,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { switchProject } from './switch-project'
import {
  PROJECT_ID,
  RECOVERED_NAME,
  openStored,
  snapshotRecovered,
} from './restore-snapshot-test-kit'
import { restoreSnapshot } from './restore-snapshot'

const OTHER_ID = 'b'

/** Locks whose releases end at once, and a stored project with a handle that holds the lock. */
async function openWithFreeingLocks() {
  const locks = createControlledLocks()
  locks.endRelease()
  const opened = await openStored(locks)
  await snapshotRecovered(opened.handle)
  return { ...opened, locks }
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

describe('the lock after a restore that handed it over', () => {
  async function restoreThenSwitchAway() {
    const opened = await openWithFreeingLocks()
    await placeDocument(opened.ports, OTHER_ID, currentBytes())
    const restored = handleOf(await restoreSnapshot(opened.handle))
    await switchProject(opened.sessionPorts, restored, workspaceRequest(OTHER_ID))
    return opened
  }

  it('a switch away from the new handle frees the lock once', async () => {
    const { locks } = await restoreThenSwitchAway()

    expect(locks.releases()).toBe(1)
    expect(await locks.port.heldIds()).toEqual(new Set([OTHER_ID]))
  })

  it('a later close of the old handle frees nothing more', async () => {
    const { handle, locks } = await restoreThenSwitchAway()

    await handle.close()

    expect(locks.releases()).toBe(1)
  })
})

describe('a restore whose save of the restored document fails', () => {
  async function restoreWithFailingSave() {
    const opened = await openWithFreeingLocks()
    const realSave = opened.ports.workspace.save.bind(opened.ports.workspace)
    failSaves(opened.ports.workspace)
    const restored = handleOf(await restoreSnapshot(opened.handle))
    const storeWorksAgain = () => {
      opened.ports.workspace.save = realSave
    }
    return { ...opened, restored, storeWorksAgain }
  }

  it('still gives the new handle, with the status error and the lock held by it alone', async () => {
    const { restored, locks } = await restoreWithFailingSave()

    expect(restored.saveStatus()).toBe('error')
    expect(await locks.port.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(locks.releases()).toBe(0)
  })

  it('a close of the new handle fails and keeps the project open', async () => {
    const { restored, locks } = await restoreWithFailingSave()

    expect(await restored.close()).toMatchObject({ ok: false })
    expect(await locks.port.heldIds()).toEqual(new Set([PROJECT_ID]))
    expect(locks.releases()).toBe(0)
  })

  it('once the store works again, a close stores the restored document and frees the lock', async () => {
    const { ports, restored, locks, storeWorksAgain } = await restoreWithFailingSave()
    storeWorksAgain()

    expect(await restored.close()).toEqual({ ok: true })

    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(RECOVERED_NAME)
    expect(await locks.port.heldIds()).toEqual(new Set())
    expect(locks.releases()).toBe(1)
  })
})

describe('the old handle after a restore handed the lock over', () => {
  async function restoredWithQuietOldHandle() {
    const opened = await openWithFreeingLocks()
    handleOf(await restoreSnapshot(opened.handle))
    const listener = vi.fn()
    opened.handle.subscribe(listener)
    const store = {
      save: vi.spyOn(opened.ports.workspace, 'save'),
      read: vi.spyOn(opened.ports.workspace, 'read'),
    }
    return { ...opened, listener, store }
  }

  it('refuses a save and a flush, and a close is ok', async () => {
    const { handle } = await restoredWithQuietOldHandle()

    expect(await handle.save()).toMatchObject({ ok: false })
    expect(await handle.flush()).toMatchObject({ ok: false })
    expect(await handle.close()).toEqual({ ok: true })
  })

  it('calls no status listener', async () => {
    const { handle, listener } = await restoredWithQuietOldHandle()

    await handle.save()
    await handle.flush()
    await handle.close()
    await settle()

    expect(listener).not.toHaveBeenCalled()
  })

  it('calls no store method', async () => {
    const { handle, store } = await restoredWithQuietOldHandle()

    await handle.save()
    await handle.flush()
    await handle.close()
    await settle()

    expect(store.save).not.toHaveBeenCalled()
    expect(store.read).not.toHaveBeenCalled()
  })
})

describe('a close of the old handle during a running restore', () => {
  async function closeDuringRestore() {
    const opened = await openWithFreeingLocks()
    const gate = gateSaves(opened.ports.workspace)
    rename(opened.handle, 'Edited before the restore')
    const restoring = restoreSnapshot(opened.handle)
    await settle()
    const closing = opened.handle.close()
    await settle()
    gate.endOldestSave()
    await settle()
    gate.endOldestSave()
    await settle()
    return { ...opened, gate, closing, restoring }
  }

  it('shares the hand-over and resolves ok', async () => {
    const { closing, restoring } = await closeDuringRestore()

    expect(await closing).toEqual({ ok: true })
    expect(handleOf(await restoring).id).toBe(PROJECT_ID)
  })

  it('frees nothing, so the restored handle keeps the lock', async () => {
    const { closing, restoring, locks } = await closeDuringRestore()
    await closing
    await restoring

    expect(locks.releases()).toBe(0)
    expect(await locks.port.heldIds()).toEqual(new Set([PROJECT_ID]))
  })
})
