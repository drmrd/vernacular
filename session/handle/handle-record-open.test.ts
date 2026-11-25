import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createPlanPreview, decodeDocument, readStoredFacts } from '../../core'
import { InMemoryDirectory } from '../../storage'
import type { ProjectIndex } from '../../storage'
import {
  failingIndex,
  gatePuts,
  sampleRecord,
} from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  documentBreakingFormatRules,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import {
  IN_WORKSPACE,
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  recordOf,
  rename,
  settlementOf,
  storedName,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const BUILD = 'build-of-the-open-tests'
const STORED_AT = new Date('2026-11-01T09:00:00.000Z')
const OPENED_AT = new Date('2026-11-05T10:00:00.000Z')
const RECORDED_CHANGE = '2026-10-20T08:00:00.000Z'
const NOT_JSON = new TextEncoder().encode('{ not json')

let consoleWarn: ReturnType<typeof vi.spyOn>

/** Ports whose store stamps each write with `STORED_AT`, and whose clock reads `OPENED_AT`. */
function fixedPorts(): TestPorts {
  return createTestPorts({
    root: new InMemoryDirectory({ now: () => STORED_AT }),
    now: () => OPENED_AT,
    build: BUILD,
  })
}

/** The kind of the decode failure that `bytes` give; throws when they decode. */
function decodeKindOf(bytes: Uint8Array): string {
  const decoded = decodeDocument(bytes)
  if (decoded.ok) throw new Error('Expected the codec to fail on these bytes')
  return decoded.failure.kind
}

/** Counts every call of the four methods of `index`. */
function countCalls(index: ProjectIndex): () => number {
  const spies = [
    vi.spyOn(index, 'all'),
    vi.spyOn(index, 'get'),
    vi.spyOn(index, 'put'),
    vi.spyOn(index, 'remove'),
  ]
  return () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0)
}

beforeEach(() => {
  vi.useFakeTimers()
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the record that an open writes', () => {
  it('an open sets lastUsedAt and lastOpen with the build', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const earlierFailure = { opened: false, build: 'an-older-build', reason: 'invalid-json' }
    await ports.index.put(sampleRecord({ id: PROJECT_ID, lastOpen: earlierFailure }))

    await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    const record = await recordOf(ports, PROJECT_ID)
    expect(record?.lastUsedAt).toBe(OPENED_AT.toISOString())
    expect(record?.lastOpen).toStrictEqual({ opened: true, build: BUILD })
  })

  it('an open of a stored project writes its facts again when the record was lost', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const facts = readStoredFacts(currentBytes())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(await recordOf(ports, PROJECT_ID)).toEqual({
      id: PROJECT_ID,
      location: IN_WORKSPACE,
      name: facts.name,
      floorCount: soundProject().floors.length,
      preview: createPlanPreview(handle.session.getProject()),
      assetHashes: facts.assetHashes,
      assetListComplete: true,
      lastChangedAt: STORED_AT.toISOString(),
      lastUsedAt: OPENED_AT.toISOString(),
      lastOpen: { opened: true, build: BUILD },
    })
  })

  it('an open with create writes no record', async () => {
    const ports = fixedPorts()
    const put = vi.spyOn(ports.index, 'put')

    await openOrThrow(ports, { ...workspaceRequest(PROJECT_ID), create: soundProject })

    expect(await recordOf(ports, PROJECT_ID)).toBeUndefined()
    expect(put).not.toHaveBeenCalled()
  })
})

describe('the record after an open that failed', () => {
  it('a failed open records its reason and changes nothing else of the record', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, NOT_JSON)
    const before = sampleRecord({ id: PROJECT_ID })
    await ports.index.put(before)
    const lockHeldAtPut: boolean[] = []
    const realPut = ports.index.put.bind(ports.index)
    ports.index.put = (record) => {
      lockHeldAtPut.push(ports.lockRegistry.has(PROJECT_ID))
      return realPut(record)
    }

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure.kind).toBe('did-not-open')
    expect(await ports.index.get(PROJECT_ID)).toEqual({
      ...before,
      lastOpen: { opened: false, build: BUILD, reason: decodeKindOf(NOT_JSON) },
    })
    expect(lockHeldAtPut).toEqual([true])
  })

  it('a document that breaks the format rules gets a record that says it did not open, with the reason', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, documentBreakingFormatRules())
    const before = sampleRecord({ id: PROJECT_ID, lastChangedAt: RECORDED_CHANGE })
    await ports.index.put(before)

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure.kind).toBe('did-not-open')
    expect(await recordOf(ports, PROJECT_ID)).toEqual({
      ...before,
      lastOpen: { opened: false, build: BUILD, reason: 'format-rules' },
    })
  })

  it('a failed open of a project with no record writes none', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, NOT_JSON)
    const put = vi.spyOn(ports.index, 'put')

    await failureOf(ports, workspaceRequest(PROJECT_ID))
    await settle()

    expect(await ports.index.all()).toEqual([])
    expect(put).not.toHaveBeenCalled()
  })

  it('an open that another tab holds, a missing project, and a storage failure make no index call', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await ports.index.put(sampleRecord({ id: PROJECT_ID }))
    const calls = countCalls(ports.index)
    const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    const hold = await otherTab.locks.tryAcquire(PROJECT_ID)

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toEqual({ kind: 'open-elsewhere' })
    await hold?.release()
    expect(await failureOf(ports, workspaceRequest('missing'))).toEqual({ kind: 'not-found' })
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('the disk cannot be read'))
    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toMatchObject({
      kind: 'storage-unavailable',
    })
    await settle()

    expect(calls()).toBe(0)
  })
})

describe('an open and an index that is slow or refuses', () => {
  it('an open resolves while the write of its record is still pending', async () => {
    const ports = fixedPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const puts = gatePuts(ports.index)

    const opening = settlementOf(openDocumentHandle(ports, workspaceRequest(PROJECT_ID)))
    await settle()

    expect(opening()).toMatchObject({ status: 'resolved', value: { ok: true } })
    puts.endAllPuts()
    await settle()
  })

  it('an index that rejects every call does not fail an open, a save, or a close, and warns once', async () => {
    const index = failingIndex()
    const ports = createTestPorts({ index, build: BUILD })
    await placeDocument(ports, PROJECT_ID, currentBytes())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(handle, 'Saved')
    expect(await handle.save()).toEqual({ ok: true })
    expect(handle.saveStatus()).toBe('saved')
    rename(handle, 'Closed')
    expect(await handle.close()).toEqual({ ok: true })
    await settle()

    expect(await storedName(ports.workspace, PROJECT_ID)).toBe('Closed')
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(index.calls()).toBeGreaterThan(0)
  })
})
