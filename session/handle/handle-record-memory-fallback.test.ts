import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryProjectIndex, withMemoryFallback } from '../../storage'
import type { ProjectIndex } from '../../storage'
import {
  holdFirstPut,
  holdReads,
  rejectEveryCall,
  sampleRecord,
  watch,
} from '../../storage/project-index/project-record-test-kit'
import { INDEX_READ_WAIT_MS } from '../../storage/project-index/with-memory-fallback'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { RECORD_WAIT_MS } from './handle-record'
import {
  createTestPorts,
  hideTimesOfChange,
  openOrThrow,
  placeDocument,
  recordOf,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'
const RECORDED_CHANGE = '2026-10-20T08:00:00.000Z'
const LAST_MILLISECOND = 1

let consoleWarn: ReturnType<typeof vi.spyOn>

interface OverFallback {
  readonly ports: TestPorts
  /** The index that the wrapper answers from until it switches. */
  readonly durable: InMemoryProjectIndex
  /** The wrapper that the ports hold. */
  readonly index: ProjectIndex
}

/** Ports whose index is the memory fall-back over `durable`, with the project `a` stored. */
async function portsOverFallback(durable = new InMemoryProjectIndex()): Promise<OverFallback> {
  const index = withMemoryFallback(durable)
  const ports = createTestPorts({ index })
  await placeDocument(ports, PROJECT_ID, currentBytes())
  return { ports, durable, index }
}

/** Makes the next `all` of `durable` reject, and reads through the wrapper, so that it switches. */
async function switchToMemory(durable: ProjectIndex, index: ProjectIndex): Promise<void> {
  vi.spyOn(durable, 'all').mockRejectedValueOnce(new Error('the browser index failed'))
  expect(await index.all()).toEqual([])
}

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a record of the keeper when the index switches to memory', () => {
  it('a keeper read that is pending when the index switches gets the answer of memory', async () => {
    const { ports, durable, index } = await portsOverFallback()
    const stored = sampleRecord({ id: PROJECT_ID, lastChangedAt: RECORDED_CHANGE })
    await durable.put(stored)
    hideTimesOfChange(ports)
    const gets = holdReads(durable, 'get')
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await settle()
    expect(gets.started()).toBe(1)

    await switchToMemory(durable, index)
    gets.answerOldest()

    const record = await recordOf(ports, PROJECT_ID)
    expect(record?.name).toBe(handle.session.getProject().meta.name)
    expect(record?.lastChangedAt).toBeUndefined()
    expect(await durable.all()).toEqual([stored])
    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })

  it('an edit while that read is pending leaves no record in memory or in the browser index', async () => {
    const { ports, durable, index } = await portsOverFallback()
    const stored = sampleRecord({ id: PROJECT_ID, lastChangedAt: RECORDED_CHANGE })
    await durable.put(stored)
    hideTimesOfChange(ports)
    const gets = holdReads(durable, 'get')
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await settle()
    const durablePut = vi.spyOn(durable, 'put')

    rename(handle, 'Edited while the index was read')
    await switchToMemory(durable, index)
    gets.answerOldest()
    await settle()

    expect(await index.all()).toEqual([])
    expect(await durable.all()).toEqual([stored])
    expect(durablePut).not.toHaveBeenCalled()
  })

  it('a record write that runs when the index switches lands in the browser index, and the next one in memory', async () => {
    const { ports, durable, index } = await portsOverFallback()
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await settle()
    const firstPut = holdFirstPut(durable)
    rename(handle, 'First')
    await handle.save()
    await settle()
    expect(firstPut.started()).toBe(1)

    await switchToMemory(durable, index)
    firstPut.release()
    await settle()
    rename(handle, 'Second')
    await handle.save()

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ name: 'Second' })
    expect(await durable.get(PROJECT_ID)).toMatchObject({ name: 'First' })
    expect(firstPut.started()).toBe(1)
  })
})

describe('the warnings of the keeper and of the memory fall-back', () => {
  it('writes that the browser index refuses switch nothing and warn once for each opened project', async () => {
    const durable = new InMemoryProjectIndex()
    rejectEveryCall(durable)
    const { ports, index } = await portsOverFallback(durable)
    await placeDocument(ports, OTHER_ID, currentBytes())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await openOrThrow(ports, workspaceRequest(OTHER_ID))
    rename(handle, 'Saved')
    expect(await handle.save()).toEqual({ ok: true })
    await settle()
    expect(consoleWarn).toHaveBeenCalledTimes(2)

    expect(await index.all()).toEqual([])
    expect(consoleWarn).toHaveBeenCalledTimes(3)
  })

  it('a close over a read that never answers ends at the wait of the keeper, before the index switches', async () => {
    vi.useFakeTimers()
    const { ports, durable, index } = await portsOverFallback()
    hideTimesOfChange(ports)
    holdReads(durable, 'get')
    const durablePut = vi.spyOn(durable, 'put')
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    await settle()

    const closing = watch(handle.close())
    await settle()
    await vi.advanceTimersByTimeAsync(RECORD_WAIT_MS - LAST_MILLISECOND)
    expect(closing()).toEqual({ status: 'pending' })
    await vi.advanceTimersByTimeAsync(LAST_MILLISECOND)
    expect(closing()).toEqual({ status: 'answered', value: { ok: true } })
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    expect(consoleWarn).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - RECORD_WAIT_MS - LAST_MILLISECOND)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(LAST_MILLISECOND)
    await settle()
    expect(consoleWarn).toHaveBeenCalledTimes(2)
    const wrapperWarning: unknown[] = consoleWarn.mock.calls[1] ?? []
    expect(wrapperWarning.some((argument) => argument instanceof Error)).toBe(true)
    expect(await index.all()).toEqual([])
    expect(durablePut).not.toHaveBeenCalled()
  })
})
