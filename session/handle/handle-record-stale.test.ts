import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  gatePuts,
  holdGets,
  sampleRecord,
} from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  documentBreakingFormatRules,
} from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from './handle-types'
import {
  createTestPorts,
  follow,
  openOrThrow,
  placeDocument,
  recordOf,
  rename,
  storedName,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const RESOLVED_OK = { status: 'resolved', outcome: { ok: true } }

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

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a record is never built from a state that the store does not hold', () => {
  it('an edit after a saved write, while an earlier record write runs, does not reach the record of that write', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Second')
    await handle.save()
    rename(handle, 'Never stored')

    puts.endOldestPut()
    await settle()

    expect(puts.startedRecords().map((record) => record.name)).not.toContain('Never stored')
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'First' })

    expect(await handle.save()).toEqual({ ok: true })
    puts.endAllPuts()
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: 'Never stored',
      lastChangedAt: await storeTimeOf(ports, PROJECT_ID),
    })
  })

  it("an edit while the open's record reads the index does not reach the record of the open", async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentBreakingFormatRules())
    const planted = sampleRecord({ id: PROJECT_ID })
    await ports.index.put(planted)
    const gets = holdGets(ports.index)
    const put = vi.spyOn(ports.index, 'put')

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await settle()
    expect(gets.started()).toBeGreaterThan(0)
    rename(handle, 'Edited during the open')
    gets.release()
    await settle()

    expect(put.mock.calls.map(([record]) => record.name)).not.toContain('Edited during the open')
    expect(await ports.index.get(PROJECT_ID)).toEqual(planted)
  })

  it('an edit after a close stopped autosave does not reach the record that the close waits for', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Last')

    const closing = follow(handle.close())
    await settle()
    expect(closing()).toEqual({ status: 'pending' })
    rename(handle, 'After the close began')
    puts.endOldestPut()
    await settle()
    puts.endAllPuts()
    await settle()

    expect(closing()).toEqual(RESOLVED_OK)
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    const names = puts.startedRecords().map((record) => record.name)
    expect(names).not.toContain('After the close began')
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe('Last')
  })

  it('a record request that waited is written when the session did not change in between', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'First')
    await handle.save()
    rename(handle, 'Second')
    await handle.save()

    puts.endOldestPut()
    await settle()
    puts.endAllPuts()
    await settle()

    expect(puts.startedRecords().map((record) => record.name)).toEqual(['First', 'Second'])
    expect(await ports.index.get(PROJECT_ID)).toMatchObject({ name: 'Second' })
  })
})
