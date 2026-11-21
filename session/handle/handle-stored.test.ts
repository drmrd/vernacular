import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { openStored, snapshotRecovered } from '../flows/restore-snapshot-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  recordingPorts,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import type { DocumentHandle } from './handle-types'
import { isStored } from './handle-stored'

const NEW_ID = 'fresh'
const STORED_ID = 'a'

/** The ports, and a handle on a new project that the store does not hold yet. */
async function openNew(
  ports: TestPorts = createTestPorts(),
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const handle = await openOrThrow(ports, { ...workspaceRequest(NEW_ID), create: soundProject })
  return { ports, handle }
}

/** From now on the store saves again, as it did before `failSaves`. Returns the way back. */
function failSavesUntilRepaired(ports: TestPorts): () => void {
  const realSave = ports.workspace.save.bind(ports.workspace)
  failSaves(ports.workspace)
  return () => {
    ports.workspace.save = realSave
  }
}

/** From now on the store saves once as before, and every save after that rejects. */
function failSavesAfterTheNext(ports: TestPorts): void {
  const realSave = ports.workspace.save.bind(ports.workspace)
  let saved = false
  ports.workspace.save = (id, project) => {
    if (saved) return Promise.reject(new Error('disk full'))
    saved = true
    return realSave(id, project)
  }
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

describe('whether the project of a handle is stored', () => {
  it('says stored for a project that the store held at the open', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await placeDocument(ports, STORED_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(STORED_ID))
    log.length = 0

    expect(isStored(handle)).toBe(true)
    expect(log).toEqual([])
  })

  it('says not stored for a new project before its first save', async () => {
    const { handle } = await openNew()

    expect(isStored(handle)).toBe(false)
  })

  it('says stored by the time a listener hears that the first save was stored', async () => {
    const { handle } = await openNew()
    const answersWhenSaved: boolean[] = []
    handle.subscribe(() => {
      if (handle.saveStatus() === 'saved') answersWhenSaved.push(isStored(handle))
    })

    rename(handle, 'Edited')
    await handle.save()

    expect(answersWhenSaved).not.toHaveLength(0)
    expect(new Set(answersWhenSaved)).toEqual(new Set([true]))
  })

  it('stays not stored after a save that failed', async () => {
    const { ports, handle } = await openNew()
    failSaves(ports.workspace)
    rename(handle, 'Kept in memory')

    expect(await handle.save()).toMatchObject({ ok: false })

    expect(isStored(handle)).toBe(false)
  })

  it('stays stored after a later save failed', async () => {
    const { ports, handle } = await openNew()
    expect(await handle.save()).toEqual({ ok: true })
    failSaves(ports.workspace)
    rename(handle, 'Kept in memory')

    expect(await handle.save()).toMatchObject({ ok: false })

    expect(isStored(handle)).toBe(true)
  })

  it('stays stored after the handle is closed', async () => {
    const { handle } = await openNew()
    expect(await handle.save()).toEqual({ ok: true })

    expect(await handle.close()).toEqual({ ok: true })

    expect(isStored(handle)).toBe(true)
  })

  it('keeps the answer of a stored handle that a restore replaces', async () => {
    const stored = await openStored()
    await snapshotRecovered(stored.handle)
    failSaves(stored.ports.workspace)

    const restored = handleOf(await restoreSnapshot(stored.handle))

    expect(isStored(restored)).toBe(true)
  })

  it('keeps the answer of a new handle that a restore replaces until its own first save', async () => {
    const { ports, handle } = await openNew()
    await snapshotRecovered(handle)
    const repair = failSavesUntilRepaired(ports)
    const restored = handleOf(await restoreSnapshot(handle))

    expect(isStored(restored)).toBe(false)
    repair()
    expect(await restored.save()).toEqual({ ok: true })
    expect(isStored(restored)).toBe(true)
  })

  it('says stored after a restore whose hand-over stored the replaced project', async () => {
    const { ports, handle } = await openNew()
    await snapshotRecovered(handle)
    rename(handle, 'Unsaved before the restore')
    failSavesAfterTheNext(ports)

    const restored = handleOf(await restoreSnapshot(handle))

    expect(isStored(restored)).toBe(true)
  })

  it('says not stored for a handle that the session layer did not build', async () => {
    const { handle } = await openStored()
    const copy: DocumentHandle = { ...handle }

    expect(isStored(handle)).toBe(true)
    expect(isStored(copy)).toBe(false)
  })
})
