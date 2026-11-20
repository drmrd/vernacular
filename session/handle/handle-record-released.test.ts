import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gatePuts,
  holdFirstGet,
  sampleRecord,
} from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  documentBreakingFormatRules,
} from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  openStored as openStoredForRestore,
  snapshotRecovered,
} from '../flows/restore-snapshot-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  createControlledLocks,
  createTestPorts,
  handleOf,
  openOrThrow,
  placeDocument,
  recordOf,
  rename,
  settlementOf,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const WAIT_LIMIT_MS = 2_000
const OLDER_CHANGE = '2026-10-20T08:00:00.000Z'

/** The ports, and a handle on the stored project `a` whose open record is written. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  return { ports, handle }
}

/** The time of last change that a listing of the store gives for `id`. */
async function storeTimeOf(ports: TestPorts, id: string): Promise<string | undefined> {
  const summaries = await ports.workspace.list()
  return summaries.find((summary) => summary.id === id)?.lastChangedAt
}

/** Closes `handle` and moves the clock past the wait limit; the close must have resolved ok. */
async function closeAfterTheLimit(handle: DocumentHandle): Promise<void> {
  const closing = settlementOf(handle.close())
  await settle()
  await vi.advanceTimersByTimeAsync(WAIT_LIMIT_MS)
  await settle()
  expect(closing()).toEqual({ status: 'resolved', value: { ok: true } })
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

describe('no record is built after a close freed the lock', () => {
  it('an index read that answers after the lock is freed builds no record', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentBreakingFormatRules())
    await ports.index.put(sampleRecord({ id: PROJECT_ID, lastChangedAt: OLDER_CHANGE }))
    const firstGet = holdFirstGet(ports.index)
    const old = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const oldName = old.session.getProject().meta.name
    await closeAfterTheLimit(old)
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)

    const newer = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(newer, 'Newer')
    expect(await newer.save()).toEqual({ ok: true })
    await settle()
    const put = vi.spyOn(ports.index, 'put')
    firstGet.release()
    await settle()

    expect(put.mock.calls.map(([record]) => record.name)).not.toContain(oldName)
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({
      name: 'Newer',
      lastChangedAt: await storeTimeOf(ports, PROJECT_ID),
    })
  })

  it('a record request that waited is not written after the close gave up the wait', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Second')
    await handle.save()

    await closeAfterTheLimit(handle)
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    puts.endOldestPut()
    await settle()
    puts.endAllPuts()
    await settle()

    expect(puts.startedRecords().map((record) => record.name)).toEqual(['First'])
  })

  it('a record write that had started lands after the close gave up the wait', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()

    await closeAfterTheLimit(handle)
    puts.endOldestPut()
    await settle()

    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'First' })
  })
})

describe('the records go on where no close freed the lock', () => {
  it('a hand-over does not stop the records', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { ports, handle } = await openStoredForRestore(locks)
    await snapshotRecovered(handle)
    const restored = handleOf(await restoreSnapshot(handle))
    await settle()

    rename(restored, 'Saved after the restore')
    expect(await restored.save()).toEqual({ ok: true })

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: 'Saved after the restore' })
  })

  it('a close that ends in time lets no record start afterward', async () => {
    const { ports, handle } = await openStored()
    const put = vi.spyOn(ports.index, 'put')
    rename(handle, 'Saved')
    await handle.save()
    rename(handle, 'Closed')
    expect(await handle.close()).toEqual({ ok: true })
    await settle()
    const putsAtTheClose = put.mock.calls.length

    await vi.advanceTimersByTimeAsync(WAIT_LIMIT_MS)
    await settle()

    expect(put.mock.calls.length).toBe(putsAtTheClose)
  })
})
