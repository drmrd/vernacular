import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import {
  currentBytes,
  documentOfNewerVersion,
} from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle, SaveStatus } from './handle-types'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts, TestPortsOptions } from './handle-test-kit'
import { documentNamed, storeNewerMainBesideSecondFile } from './second-file-test-kit'

const PROJECT_ID = 'a'

/** The ports, and a handle on a stored sound document of the project `a`. */
async function openStored(
  options: TestPortsOptions = {},
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts(options)
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

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the save status of a document handle', () => {
  it('a new handle is idle, an edit makes it pending, and the autosave delay stores the edit and makes it saved', async () => {
    const { ports, handle } = await openStored({ durable: true })
    expect(handle.saveStatus()).toBe('idle')

    rename(handle, 'Edited')
    expect(handle.saveStatus()).toBe('pending')

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(handle.saveStatus()).toBe('saved')
    expect(await storedName(ports)).toBe('Edited')
  })

  it('subscribe calls its listener once for each new status and not after it unsubscribes', async () => {
    const { handle } = await openStored({ durable: true })
    const seen: SaveStatus[] = []
    const stop = handle.subscribe(() => seen.push(handle.saveStatus()))

    rename(handle, 'First edit')
    rename(handle, 'Second edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(seen).toEqual(['pending', 'saved'])

    stop()
    rename(handle, 'Third edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(seen).toEqual(['pending', 'saved'])
  })

  it('saveStatus and subscribe work when taken off the handle', async () => {
    const { handle } = await openStored()
    const { saveStatus, subscribe } = handle
    let calls = 0
    subscribe(() => {
      calls += 1
    })

    rename(handle, 'Edited')

    expect(saveStatus()).toBe('pending')
    expect(calls).toBe(1)
  })

  it('the status stays pending when an edit arrives during a write, and becomes saved after the next write', async () => {
    const { ports, handle } = await openStored({ durable: true })
    const gate = gateSaves(ports.workspace)
    rename(handle, 'First edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Second edit')

    gate.endOldestSave()
    await settle()
    expect(handle.saveStatus()).toBe('pending')

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    gate.endOldestSave()
    await settle()
    expect(handle.saveStatus()).toBe('saved')
  })
})

describe('an explicit save of a document handle', () => {
  it('save() stores the present project at once and returns ok: true, and the end of the delay gives no second write', async () => {
    const { ports, handle } = await openStored()
    const save = vi.spyOn(ports.workspace, 'save')

    rename(handle, 'Saved now')
    expect(await handle.save()).toEqual({ ok: true })
    expect(await storedName(ports)).toBe('Saved now')

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('a save whose write rejects returns ok: false with the store message, sets the status to error, and the next save stores', async () => {
    const { ports, handle } = await openStored()
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))
    rename(handle, 'Kept in memory')

    expect(await handle.save()).toEqual({ ok: false, message: 'disk full' })
    expect(handle.saveStatus()).toBe('error')

    expect(await handle.save()).toEqual({ ok: true })
    expect(await storedName(ports)).toBe('Kept in memory')
  })

  it('an explicit save during an autosave write waits for it, so no two store saves run together, and the last state is stored', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'First edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Last edit')

    const saving = handle.save()
    await settle()
    expect(gate.started()).toBe(1)
    gate.endOldestSave()
    await settle()
    gate.endOldestSave()

    expect(await saving).toEqual({ ok: true })
    expect(gate.mostRunningTogether()).toBe(1)
    expect(await storedName(ports)).toBe('Last edit')
  })
})

describe('the save status of a handle whose project is saved in a second file', () => {
  /** Stores a main file that a newer build wrote over the project that `openStored` opened. */
  function storeNewerMain(ports: TestPorts): Promise<void> {
    return placeDocument(ports, PROJECT_ID, documentOfNewerVersion())
  }

  it('after a save that wrote the second file, the status is second-file and not saved', async () => {
    const { ports, handle } = await openStored({ durable: true })
    await storeNewerMain(ports)

    rename(handle, 'Edited')
    expect(await handle.save()).toEqual({ ok: true })

    expect(handle.saveStatus()).toBe('second-file')
  })

  it('a handle opened from the second file reports second-file after its first save', async () => {
    const ports = createTestPorts({ durable: true })
    await storeNewerMainBesideSecondFile(ports, PROJECT_ID, documentNamed('In the second file'))
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    rename(handle, 'Edited')
    expect(await handle.save()).toEqual({ ok: true })

    expect(handle.saveStatus()).toBe('second-file')
  })

  it('in temporary storage the status is tab-only after a save that wrote the second file', async () => {
    const { ports, handle } = await openStored({ durable: false })
    await storeNewerMain(ports)
    const notices: string[] = []
    handle.onNotice((notice) => notices.push(notice))

    rename(handle, 'Edited')
    expect(await handle.save()).toEqual({ ok: true })

    expect(notices).toEqual(['saved-in-second-file'])
    expect(handle.saveStatus()).toBe('tab-only')
  })

  it('when the main file can be read again, the next save brings saved back', async () => {
    const { ports, handle } = await openStored({ durable: true })
    await storeNewerMain(ports)
    rename(handle, 'First edit')
    expect(await handle.save()).toEqual({ ok: true })
    expect(handle.saveStatus()).toBe('second-file')
    await placeDocument(ports, PROJECT_ID, currentBytes())

    rename(handle, 'Second edit')
    expect(await handle.save()).toEqual({ ok: true })

    expect(handle.saveStatus()).toBe('saved')
    expect(await storedName(ports)).toBe('Second edit')
  })

  it('a change beside a newer main file is pending, and a failed save reports error', async () => {
    const { ports, handle } = await openStored({ durable: true })
    await storeNewerMain(ports)
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))

    rename(handle, 'Edited')
    expect(handle.saveStatus()).toBe('pending')

    expect(await handle.save()).toEqual({ ok: false, message: 'disk full' })
    expect(handle.saveStatus()).toBe('error')
  })
})
