import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPlanPreview } from '../../core'
import { gatePuts, sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  RECOVERED_NAME,
  openStored as openStoredForRestore,
  snapshotRecovered,
} from '../flows/restore-snapshot-test-kit'
import { switchProject } from '../flows/switch-project'
import type { DocumentHandle } from './handle-types'
import {
  createControlledLocks,
  createTestPorts,
  follow,
  handleOf,
  openOrThrow,
  placeDocument,
  rename,
  settlementOf,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'
const RESOLVED_OK = { status: 'resolved', outcome: { ok: true } }

/** The ports, a handle on the stored project `a` whose open record is written, and `b` stored. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  await placeDocument(ports, OTHER_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  return { ports, handle }
}

/** The time of last change that a listing of the store gives for `id`. */
async function storeTimeOf(ports: TestPorts, id: string): Promise<string | undefined> {
  const summaries = await ports.workspace.list()
  return summaries.find((summary) => summary.id === id)?.lastChangedAt
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

describe('a close and the record write', () => {
  it('a close waits for the record write before it frees the lock', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the close')

    const closing = follow(handle.close())
    await settle()
    expect(puts.started()).toBe(1)
    expect(closing()).toEqual({ status: 'pending' })
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(true)

    puts.endOldestPut()
    await settle()
    expect(closing()).toEqual(RESOLVED_OK)
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
  })

  it('after a close the record is the one of the last save', async () => {
    const { ports, handle } = await openStored()
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Last')

    expect(await handle.close()).toEqual({ ok: true })

    expect(await ports.index.get(PROJECT_ID)).toMatchObject({
      name: 'Last',
      lastChangedAt: await storeTimeOf(ports, PROJECT_ID),
    })
  })

  it('when a switch resolves, the record of the project that was left is in the index', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'Left behind')

    const switchPromise = switchProject(ports, handle, workspaceRequest(OTHER_ID))
    const switching = settlementOf(switchPromise)
    await settle()
    expect(puts.started()).toBe(1)
    expect(switching()).toEqual({ status: 'pending' })

    puts.endOldestPut()
    expect(handleOf(await switchPromise).id).toBe(OTHER_ID)
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'Left behind' })
    puts.endAllPuts()
    await settle()
  })
})

describe('a restore and the record write', () => {
  it('after a restore the record has the facts of the restored document, and no record write of the old handle comes after it', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { ports, handle } = await openStoredForRestore(locks)
    await snapshotRecovered(handle)
    await settle()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the restore')
    await handle.save()

    const restoring = restoreSnapshot(handle)
    await settle()
    expect(puts.started()).toBe(1)
    puts.endOldestPut()
    const restored = handleOf(await restoring)
    await settle()
    expect(puts.started()).toBe(2)
    puts.endOldestPut()
    await handle.close()
    await settle()

    const names = puts.startedRecords().map((record) => record.name)
    expect(names).toEqual(['Edited before the restore', RECOVERED_NAME])
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({
      name: RECOVERED_NAME,
      preview: createPlanPreview(restored.session.getProject()),
    })
  })
})

describe('two projects in one workspace', () => {
  it('with two projects in the workspace store, opening and saving one leaves the stored files of the other identical', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await placeDocument(ports, OTHER_ID, currentBytes())
    const filesBefore = await ports.workspace.storedFiles(OTHER_ID)

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(handle, 'Edited')
    await handle.save()
    await handle.close()
    await settle()

    expect(await ports.workspace.storedFiles(OTHER_ID)).toEqual(filesBefore)
  })

  it('opening and saving one project leaves the record of the other identical', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await placeDocument(ports, OTHER_ID, currentBytes())
    const other = sampleRecord({ id: OTHER_ID })
    await ports.index.put(other)
    const all = vi.spyOn(ports.index, 'all')
    const remove = vi.spyOn(ports.index, 'remove')
    const get = vi.spyOn(ports.index, 'get')
    const put = vi.spyOn(ports.index, 'put')

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(handle, 'Edited')
    await handle.save()
    await handle.close()
    await settle()

    expect(all).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
    expect(get.mock.calls.filter(([id]) => id !== PROJECT_ID)).toEqual([])
    expect(put.mock.calls.filter(([record]) => record.id !== PROJECT_ID)).toEqual([])
    expect(await ports.index.get(OTHER_ID)).toEqual(other)
  })
})
