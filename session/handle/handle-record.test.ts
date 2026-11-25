import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPlanPreview, readStoredFacts } from '../../core'
import { InMemoryDirectory } from '../../storage'
import { gatePuts } from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  faultyProject,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  IN_FOLDER,
  IN_WORKSPACE,
  createTestPorts,
  failSaves,
  follow,
  movableClock,
  openOrThrow,
  placeDocument,
  recordOf,
  rememberFolder,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts, TestPortsOptions } from './handle-test-kit'

const PROJECT_ID = 'a'
const BUILD = 'build-of-the-record-tests'
const STORED_AT = new Date('2026-11-01T09:00:00.000Z')
const OPENED_AT = new Date('2026-11-02T10:00:00.000Z')
const SAVED_AT = new Date('2026-11-03T11:00:00.000Z')
const USED_AT = new Date('2026-11-04T12:00:00.000Z')
const STORED_FACTS = readStoredFacts(currentBytes())
const SAVED_NAME = 'Saved under a new name'
const A_LONG_WAIT_MS = 60_000

/**
 * Ports whose store stamps each write with its own clock, and a handle on a stored sound document
 * of the project `a`. The record of the open has been written; both clocks have moved since.
 */
async function openStored(
  options: TestPortsOptions = {},
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const storeClock = movableClock(STORED_AT)
  const useClock = movableClock(OPENED_AT)
  const ports = createTestPorts({
    root: new InMemoryDirectory({ now: storeClock.now }),
    now: useClock.now,
    build: BUILD,
    ...options,
  })
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  storeClock.moveTo(SAVED_AT)
  useClock.moveTo(USED_AT)
  return { ports, handle }
}

/** The ports and a handle on the project `a`, which the store does not hold yet. */
async function openNew(
  create = soundProject,
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts({ build: BUILD })
  const handle = await openOrThrow(ports, { ...workspaceRequest(PROJECT_ID), create })
  return { ports, handle }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the record that a save writes', () => {
  it("after a save the record has the document's name, floor count, asset hashes, a preview, and the store's lastChangedAt", async () => {
    const { ports, handle } = await openStored()
    rename(handle, SAVED_NAME)

    expect(await handle.save()).toEqual({ ok: true })

    const saved = handle.session.getProject()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: SAVED_NAME,
      floorCount: saved.floors.length,
      preview: createPlanPreview(saved),
      assetHashes: STORED_FACTS.assetHashes,
      assetListComplete: true,
      lastChangedAt: SAVED_AT.toISOString(),
    })
  })

  it('the record names the location of the handle, and a folder record carries the folder name', async () => {
    const { ports, handle } = await openStored()
    await handle.save()
    const folderPorts = createTestPorts({ build: BUILD })
    await rememberFolder(folderPorts, PROJECT_ID, currentBytes())
    const inFolder = await openOrThrow(folderPorts, { id: PROJECT_ID, location: IN_FOLDER })
    rename(inFolder, SAVED_NAME)
    await inFolder.save()

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      id: PROJECT_ID,
      location: IN_WORKSPACE,
    })
    const folderRecord = await recordOf(folderPorts, PROJECT_ID)
    expect(folderRecord?.id).toBe(PROJECT_ID)
    expect(folderRecord?.location).toEqual({ kind: 'folder', folderName: 'Old house' })
  })

  it('the record says that the project opened, with the build of the ports, and the time of use is the time of the save', async () => {
    const { ports, handle } = await openStored()

    await handle.save()

    const record = await recordOf(ports, PROJECT_ID)
    expect(record?.lastOpen).toStrictEqual({ opened: true, build: BUILD })
    expect(record?.lastUsedAt).toBe(USED_AT.toISOString())
  })
})

describe('a record only for a project that the store holds', () => {
  it('a new project has no record before its first save, and one after it', async () => {
    const { ports, handle } = await openNew()
    expect(await recordOf(ports, PROJECT_ID)).toBeUndefined()

    rename(handle, SAVED_NAME)
    expect(await handle.save()).toEqual({ ok: true })

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ id: PROJECT_ID, name: SAVED_NAME })
  })

  it('a new project whose first save fails has no record', async () => {
    const { ports, handle } = await openNew()
    const put = vi.spyOn(ports.index, 'put')
    failSaves(ports.workspace)
    rename(handle, SAVED_NAME)

    expect(await handle.save()).toMatchObject({ ok: false })

    expect(await recordOf(ports, PROJECT_ID)).toBeUndefined()
    expect(await ports.index.all()).toEqual([])
    expect(put).not.toHaveBeenCalled()
  })

  it('a write that an edit overlapped writes no record, and the write that follows writes the record of the later state', async () => {
    const { ports, handle } = await openStored()
    const saves = gateSaves(ports.workspace)
    const put = vi.spyOn(ports.index, 'put')
    rename(handle, 'Overlapped by an edit')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Written after')

    saves.endOldestSave()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: STORED_FACTS.name })
    expect(put).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    saves.endOldestSave()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: 'Written after' })
    expect(put.mock.calls.map(([record]) => record.name)).toEqual(['Written after'])
  })

  it('a save that found faults writes a record whose asset list is not complete', async () => {
    const { ports, handle } = await openNew(faultyProject)
    rename(handle, SAVED_NAME)

    expect(await handle.save()).toEqual({ ok: true })

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: SAVED_NAME,
      assetListComplete: false,
      lastOpen: { opened: true, build: BUILD },
    })
  })
})

describe('a record write that fails or waits', () => {
  it('a rejecting put does not fail the save', async () => {
    const { ports, handle } = await openStored({ durable: true })
    vi.spyOn(ports.index, 'put').mockRejectedValue(new Error('the index is full'))
    rename(handle, SAVED_NAME)

    expect(await handle.save()).toEqual({ ok: true })
    await settle()

    expect(handle.saveStatus()).toBe('saved')
  })

  it('after a put that rejected, the next save writes the record', async () => {
    const { ports, handle } = await openStored()
    const put = vi.spyOn(ports.index, 'put').mockRejectedValueOnce(new Error('the index is full'))
    rename(handle, 'Not in the index')
    await handle.save()
    await settle()
    await vi.advanceTimersByTimeAsync(A_LONG_WAIT_MS)

    expect(put).toHaveBeenCalledTimes(1)
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: STORED_FACTS.name })

    rename(handle, SAVED_NAME)
    await handle.save()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: SAVED_NAME,
      lastChangedAt: SAVED_AT.toISOString(),
      lastUsedAt: USED_AT.toISOString(),
    })
    expect(put).toHaveBeenCalledTimes(2)
  })

  it('a save resolves while the put of its record is still pending', async () => {
    const { ports, handle } = await openStored({ durable: true })
    const puts = gatePuts(ports.index)
    rename(handle, SAVED_NAME)

    const saving = follow(handle.save())
    await settle()

    expect(saving()).toEqual({ status: 'resolved', outcome: { ok: true } })
    expect(handle.saveStatus()).toBe('saved')
    puts.endAllPuts()
    await settle()
  })

  it('two saves while a put is pending write the record of the later save, and no record in between', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    await settle()
    expect(puts.started()).toBe(1)

    rename(handle, 'Second')
    await handle.save()
    rename(handle, 'Third')
    await handle.save()
    await settle()
    expect(puts.started()).toBe(1)

    puts.endOldestPut()
    await settle()
    expect(puts.started()).toBe(2)
    puts.endOldestPut()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: 'Third' })
    expect(puts.startedRecords().map((record) => record.name)).toEqual(['First', 'Third'])
  })
})
