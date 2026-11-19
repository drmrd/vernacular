import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import type { ProjectLockPort } from '../../storage'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import { openDocumentHandle } from './open-document-handle'
import type { DocumentHandle } from './handle-types'
import {
  createTestPorts,
  follow,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'

let consoleError: ReturnType<typeof vi.spyOn>

/** Every value that was passed to `console.error`, in one list. */
function loggedValues(): unknown[] {
  return consoleError.mock.calls.flat()
}

/** The ports, and a handle on a stored sound document of the project `a`. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  return { ports, handle }
}

function rename(handle: DocumentHandle, name: string): void {
  handle.session.dispatch(renameProject(name))
}

async function storedName(ports: TestPorts): Promise<string> {
  return (await storedProject(ports.workspace, PROJECT_ID)).meta.name
}

/** Ports of a second tab: the same stored files and the same lock registry. */
function secondTab(ports: TestPorts): TestPorts {
  return createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
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

describe('flushing a document handle', () => {
  it('a flush with nothing unsaved writes nothing and returns ok: true', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const stored = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const created = await openOrThrow(ports, {
      ...workspaceRequest(OTHER_ID),
      create: soundProject,
    })
    const save = vi.spyOn(ports.workspace, 'save')

    expect(await stored.flush()).toEqual({ ok: true })
    expect(await created.flush()).toEqual({ ok: true })
    await settle()

    expect(save).not.toHaveBeenCalled()
    expect((await ports.workspace.storedFiles(OTHER_ID)).size).toBe(0)
  })

  it('a flush stores an edit without waiting for the autosave delay', async () => {
    const { ports, handle } = await openStored()
    const save = vi.spyOn(ports.workspace, 'save')
    rename(handle, 'Flushed')

    expect(await handle.flush()).toEqual({ ok: true })
    expect(await storedName(ports)).toBe('Flushed')
    expect(handle.saveStatus()).toBe('saved')

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a flush during a write that started after the last edit starts no second write and waits for that write', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'Being written')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)

    const flushing = follow(handle.flush())
    await settle()
    expect(flushing()).toEqual({ status: 'pending' })

    gate.endOldestSave()
    await settle()
    expect(flushing()).toEqual({ status: 'resolved', outcome: { ok: true } })
    expect(gate.started()).toBe(1)
  })

  it('a flush whose write rejects returns ok: false with the message, and the status is error', async () => {
    const { ports, handle } = await openStored()
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))
    rename(handle, 'Not stored')

    expect(await handle.flush()).toEqual({ ok: false, message: 'disk full' })
    expect(handle.saveStatus()).toBe('error')
  })
})

describe('closing a document handle with changes to write', () => {
  it('an edit followed at once by close() is stored', async () => {
    const { ports, handle } = await openStored()
    rename(handle, 'Closed with this name')

    expect(await handle.close()).toEqual({ ok: true })
    expect(await storedName(ports)).toBe('Closed with this name')
  })

  it('a close during a running write stores the last edit', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'First edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Last edit')

    const closing = follow(handle.close())
    await settle()
    gate.endOldestSave()
    await settle()
    expect(gate.started()).toBe(2)
    expect(closing()).toEqual({ status: 'pending' })

    gate.endOldestSave()
    await settle()
    expect(closing()).toEqual({ status: 'resolved', outcome: { ok: true } })
    expect(gate.mostRunningTogether()).toBe(1)
    expect(await storedName(ports)).toBe('Last edit')
  })

  it('an edit made while a close writes is stored before the close completes', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'First edit')

    const closing = follow(handle.close())
    await settle()
    expect(gate.started()).toBe(1)
    rename(handle, 'Made during the close')
    gate.endOldestSave()
    await settle()
    expect(gate.started()).toBe(2)
    expect(closing()).toEqual({ status: 'pending' })

    gate.endOldestSave()
    await settle()
    expect(closing()).toEqual({ status: 'resolved', outcome: { ok: true } })
    expect(await storedName(ports)).toBe('Made during the close')
  })

  it('a close waits for a running explicit save before it frees the lock', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'Saved explicitly')
    const saving = handle.save()
    await settle()

    const closing = follow(handle.close())
    await settle()
    expect(closing()).toEqual({ status: 'pending' })
    expect(await ports.locks.heldIds()).toContain(PROJECT_ID)

    gate.endOldestSave()
    expect(await saving).toEqual({ ok: true })
    await settle()
    expect(closing()).toEqual({ status: 'resolved', outcome: { ok: true } })
    expect(await ports.locks.heldIds()).not.toContain(PROJECT_ID)
    expect(gate.started()).toBe(1)
  })
})

describe('a document handle after a close', () => {
  it('a close() whose write rejects returns ok: false, and the handle still saves and holds the lock', async () => {
    const { ports, handle } = await openStored()
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))
    rename(handle, 'Kept in memory')

    expect(await handle.close()).toEqual({ ok: false, message: 'disk full' })
    expect(handle.saveStatus()).toBe('error')
    expect(await openDocumentHandle(secondTab(ports), workspaceRequest(PROJECT_ID))).toEqual({
      ok: false,
      failure: { kind: 'open-elsewhere' },
    })
    expect(await handle.save()).toEqual({ ok: true })
    expect(await storedName(ports)).toBe('Kept in memory')
  })

  it('after a successful close the lock is free and a dispatch on the old session changes nothing stored', async () => {
    const { ports, handle } = await openStored()
    rename(handle, 'Stored at close')
    expect(await handle.close()).toEqual({ ok: true })

    const reopened = await openDocumentHandle(secondTab(ports), workspaceRequest(PROJECT_ID))
    expect(reopened.ok).toBe(true)

    const save = vi.spyOn(ports.workspace, 'save')
    rename(handle, 'After the close')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    await settle()
    expect(handle.session.getProject().meta.name).toBe('After the close')
    expect(save).not.toHaveBeenCalled()
    expect(await storedName(ports)).toBe('Stored at close')
  })

  it('after a successful close, save and flush return ok: false and call no store method, and a second close returns ok: true', async () => {
    const { ports, handle } = await openStored()
    expect(await handle.close()).toEqual({ ok: true })
    const save = vi.spyOn(ports.workspace, 'save')
    const read = vi.spyOn(ports.workspace, 'read')

    expect((await handle.save()).ok).toBe(false)
    expect((await handle.flush()).ok).toBe(false)
    expect(await handle.close()).toEqual({ ok: true })
    expect(save).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('a close whose lock release rejects still returns ok: true, and the error is logged once', async () => {
    const failure = new Error('the release was refused')
    const locks: ProjectLockPort = {
      supported: true,
      tryAcquire: async () => ({ release: () => Promise.reject(failure) }),
      heldIds: async () => new Set(),
    }
    const base = createTestPorts()
    await placeDocument(base, PROJECT_ID, currentBytes())
    const handle = await openOrThrow({ ...base, locks }, workspaceRequest(PROJECT_ID))

    expect(await handle.close()).toEqual({ ok: true })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
  })
})
