import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'
const DISK_FULL = 'disk full'

/** Ports, and a handle opened with create, so nothing of the project is stored yet. */
async function openCreated() {
  const ports = createTestPorts()
  const handle = await openOrThrow(ports, { ...workspaceRequest(PROJECT_ID), create: soundProject })
  return { ports, handle }
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

describe('a flush after a save that failed', () => {
  it('a flush after a failed save with no change writes again', async () => {
    const ports = createTestPorts({ durable: true })
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const save = vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error(DISK_FULL))
    expect(await handle.save()).toEqual({ ok: false, message: DISK_FULL })
    expect(handle.saveStatus()).toBe('error')

    const outcome = await handle.flush()
    await settle()

    expect(save).toHaveBeenCalledTimes(2)
    expect(outcome).toEqual({ ok: true })
    expect(handle.saveStatus()).toBe('saved')
  })
})

describe('a close after a failed save of a created project', () => {
  it('a close after a failed save of a created project stores it once the store works again', async () => {
    const { ports, handle } = await openCreated()
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error(DISK_FULL))
    expect(await handle.save()).toEqual({ ok: false, message: DISK_FULL })

    expect(await handle.close()).toEqual({ ok: true })

    expect((await ports.workspace.read(PROJECT_ID)).ok).toBe(true)
    expect(await ports.locks.heldIds()).not.toContain(PROJECT_ID)
  })

  it('a close after a failed save of a created project fails and stays open while the store still fails', async () => {
    const { ports, handle } = await openCreated()
    vi.spyOn(ports.workspace, 'save')
      .mockRejectedValueOnce(new Error(DISK_FULL))
      .mockRejectedValueOnce(new Error(DISK_FULL))
    expect(await handle.save()).toEqual({ ok: false, message: DISK_FULL })

    expect(await handle.close()).toEqual({ ok: false, message: DISK_FULL })

    expect(await ports.locks.heldIds()).toContain(PROJECT_ID)
    expect(await handle.save()).toEqual({ ok: true })
    expect((await storedProject(ports.workspace, PROJECT_ID)).meta.name).toBe(
      soundProject().meta.name,
    )
  })
})
