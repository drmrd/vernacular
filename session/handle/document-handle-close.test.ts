import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle, SaveStatus } from './handle-types'
import {
  createControlledLocks,
  createTestPorts,
  follow,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'
import type { ControlledLocks, TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const RESOLVED_OK = { status: 'resolved', outcome: { ok: true } }

/** The ports, and a handle on a stored sound document of the project `a`. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  return { ports, handle }
}

/** As `openStored`, with a lock port whose releases the test controls. */
async function openStoredWithLocks(locks: ControlledLocks) {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow({ ...ports, locks: locks.port }, workspaceRequest(PROJECT_ID))
  return { ports, handle }
}

function rename(handle: DocumentHandle, name: string): void {
  handle.session.dispatch(renameProject(name))
}

async function storedName(ports: TestPorts): Promise<string> {
  return (await storedProject(ports.workspace, PROJECT_ID)).meta.name
}

/** Every status that the handle reports to a listener after `promise` has settled. */
function statusesAfter(handle: DocumentHandle, promise: Promise<unknown>): SaveStatus[] {
  const late: SaveStatus[] = []
  let settled = false
  const markSettled = (): void => {
    settled = true
  }
  promise.then(markSettled, markSettled)
  handle.subscribe(() => {
    if (settled) late.push(handle.saveStatus())
  })
  return late
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

describe('closes of a document handle that overlap', () => {
  it('a close called while another close frees the lock resolves only after the lock is free', async () => {
    const locks = createControlledLocks()
    const { handle } = await openStoredWithLocks(locks)
    const first = follow(handle.close())
    await settle()
    expect(first()).toEqual({ status: 'pending' })

    const second = follow(handle.close())
    await settle()
    expect(second()).toEqual({ status: 'pending' })

    locks.endRelease()
    await settle()
    expect(first()).toEqual(RESOLVED_OK)
    expect(second()).toEqual(RESOLVED_OK)
    expect(locks.releases()).toBe(1)
  })

  it('two closes called together share one attempt, release once, and store the edit once', async () => {
    const locks = createControlledLocks()
    const { ports, handle } = await openStoredWithLocks(locks)
    const save = vi.spyOn(ports.workspace, 'save')
    rename(handle, 'Closed twice')

    const first = follow(handle.close())
    const second = follow(handle.close())
    await settle()
    locks.endRelease()
    await settle()

    expect(first()).toEqual(RESOLVED_OK)
    expect(second()).toEqual(RESOLVED_OK)
    expect(locks.releases()).toBe(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(await storedName(ports)).toBe('Closed twice')
  })

  it('a close after a failed close succeeds and frees the lock, with one release in all', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { ports, handle } = await openStoredWithLocks(locks)
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))
    rename(handle, 'Stored by the second close')

    expect(await handle.close()).toEqual({ ok: false, message: 'disk full' })
    expect(await handle.close()).toEqual({ ok: true })
    expect(locks.releases()).toBe(1)
    expect(await locks.port.heldIds()).not.toContain(PROJECT_ID)
    expect(await storedName(ports)).toBe('Stored by the second close')
  })
})

describe('a close and the writes that run during it', () => {
  it('a save asked while a close writes ends before the close frees the lock', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'Edited before the close')
    const closePromise = handle.close()
    const closing = follow(closePromise)
    const lateStatuses = statusesAfter(handle, closePromise)
    await settle()
    expect(gate.started()).toBe(1)

    const saving = follow(handle.save())
    gate.endOldestSave()
    await settle()
    expect(closing()).toEqual({ status: 'pending' })
    expect(await ports.locks.heldIds()).toContain(PROJECT_ID)

    gate.endOldestSave()
    await settle()
    expect(closing()).toEqual(RESOLVED_OK)
    expect(saving()).toEqual(RESOLVED_OK)
    expect(await ports.locks.heldIds()).not.toContain(PROJECT_ID)
    expect(gate.mostRunningTogether()).toBe(1)
    expect(lateStatuses).toEqual([])
  })

  it('a close whose first write fails while an edit waits resolves with the later write and stores the last edit', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'First edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Last edit')

    const closing = follow(handle.close())
    await settle()
    gate.endOldestSave(new Error('disk full'))
    await settle()
    expect(gate.started()).toBe(2)

    gate.endOldestSave()
    await settle()
    expect(closing()).toEqual(RESOLVED_OK)
    expect(await storedName(ports)).toBe('Last edit')
  })
})

describe('a document handle after an ok close', () => {
  it('a dispatch on the old session calls no status listener and leaves the status as it was', async () => {
    const { handle } = await openStored()
    rename(handle, 'Stored at close')
    expect(await handle.close()).toEqual({ ok: true })
    const statusBefore = handle.saveStatus()
    const listener = vi.fn()
    handle.subscribe(listener)

    rename(handle, 'After the close')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()

    expect(listener).not.toHaveBeenCalled()
    expect(handle.saveStatus()).toBe(statusBefore)
  })

  it('a close of an untouched handle opened with create stores nothing and frees the lock', async () => {
    const ports = createTestPorts()
    const handle = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      create: soundProject,
    })
    const save = vi.spyOn(ports.workspace, 'save')

    expect(await handle.close()).toEqual({ ok: true })
    await settle()

    expect(save).not.toHaveBeenCalled()
    expect((await ports.workspace.storedFiles(PROJECT_ID)).size).toBe(0)
    expect(await ports.locks.heldIds()).not.toContain(PROJECT_ID)
  })
})
