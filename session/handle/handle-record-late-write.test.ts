import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gatePuts,
  holdFirstPut,
  rejectEveryCall,
} from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  PROJECT_ID,
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
  rename,
  settlementOf,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const WAIT_LIMIT_MS = 2_000
const JUST_BEFORE_THE_LIMIT_MS = WAIT_LIMIT_MS - 1

let consoleWarn: ReturnType<typeof vi.spyOn>

/** The ports, and a handle on the stored project `a` whose open record is written. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  return { ports, handle }
}

/** Closes `handle` and moves the clock past the wait limit; the close must have resolved ok. */
async function closeAfterTheLimit(handle: DocumentHandle): Promise<void> {
  const closing = settlementOf(handle.close())
  await settle()
  await vi.advanceTimersByTimeAsync(WAIT_LIMIT_MS)
  await settle()
  expect(closing()).toEqual({ status: 'resolved', value: { ok: true } })
}

/** The time of last change that a listing of the store gives for `id`. */
async function storeTimeOf(ports: TestPorts, id: string): Promise<string> {
  const summaries = await ports.workspace.list()
  const time = summaries.find((summary) => summary.id === id)?.lastChangedAt
  if (time === undefined) throw new Error(`Expected the store to list a time for ${id}`)
  return time
}

/** A handle of the restore kit on the stored project `a`, with locks whose releases end at once. */
async function openForRestore() {
  const locks = createControlledLocks()
  locks.endRelease()
  const opened = await openStoredForRestore(locks)
  await settle()
  return { ...opened, locks }
}

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a restore and the record writes of the old handle', () => {
  it('a restore stays pending while a record write of the old handle is held, before the time limit', async () => {
    const { ports, handle } = await openForRestore()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the restore')
    await handle.save()
    await snapshotRecovered(handle)

    const restoring = restoreSnapshot(handle)
    const restoreState = settlementOf(restoring)
    await settle()
    await vi.advanceTimersByTimeAsync(JUST_BEFORE_THE_LIMIT_MS)
    expect(restoreState()).toEqual({ status: 'pending' })

    puts.endOldestPut()
    expect(handleOf(await restoring).id).toBe(PROJECT_ID)
    puts.endAllPuts()
    await settle()
  })

  it('a restore with an index that refuses every call resolves ok and frees no lock early', async () => {
    const { ports, handle, locks } = await openForRestore()
    rejectEveryCall(ports.index)
    rename(handle, 'Edited before the restore')
    await handle.save()
    await snapshotRecovered(handle)

    const restored = handleOf(await restoreSnapshot(handle))
    await settle()

    expect(locks.releases()).toBe(0)
    expect(await locks.port.heldIds()).toEqual(new Set([PROJECT_ID]))
    rename(restored, 'Saved after the restore')
    expect(await restored.save()).toEqual({ ok: true })
  })
})

describe('a record write that ends after the time limit', () => {
  it('a record write that started before a close gave up the wait can land over a newer record, which then shows an older time than the store (a known limit)', async () => {
    const { ports, handle } = await openStored()
    const firstPut = holdFirstPut(ports.index)
    rename(handle, 'Older')
    await handle.save()
    await closeAfterTheLimit(handle)

    const newer = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(newer, 'Newer')
    expect(await newer.save()).toEqual({ ok: true })
    await settle()
    firstPut.release()
    await settle()

    const record = await ports.index.get(PROJECT_ID)
    const storeTime = await storeTimeOf(ports, PROJECT_ID)
    expect(record?.name).toBe('Older')
    expect(Date.parse(record?.lastChangedAt ?? '')).toBeLessThan(Date.parse(storeTime))
  })

  it('a record write that timed out and later rejects gives no second warning and no unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the close')
    await closeAfterTheLimit(handle)
    expect(consoleWarn).toHaveBeenCalledTimes(1)

    puts.endOldestPut(new Error('the index answered too late'))
    await settle()
    vi.useRealTimers()
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)

    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(unhandled).not.toHaveBeenCalled()
  })
})
