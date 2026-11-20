import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  failingIndex,
  gatePuts,
  holdGets,
  sampleRecord,
} from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { restoreSnapshot } from '../flows/restore-snapshot'
import {
  openStored as openStoredForRestore,
  snapshotRecovered,
} from '../flows/restore-snapshot-test-kit'
import { switchProject } from '../flows/switch-project'
import { RECORD_WAIT_MS } from './handle-record'
import type { DocumentHandle } from './handle-types'
import {
  createControlledLocks,
  createTestPorts,
  handleOf,
  openOrThrow,
  placeDocument,
  rename,
  settlementOf,
  storedName,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'
const WAIT_LIMIT_MS = 2_000
const JUST_BEFORE_THE_LIMIT_MS = WAIT_LIMIT_MS - 1
const LAST_MILLISECOND = 1
const NOT_JSON = new TextEncoder().encode('{ not json')

let consoleWarn: ReturnType<typeof vi.spyOn>

/** The ports, and a handle on the stored project `a` whose open record is written; `b` is stored. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  await placeDocument(ports, OTHER_ID, currentBytes())
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  await settle()
  return { ports, handle }
}

/** Lets the microtasks settle, then moves the clock to one millisecond before the wait limit. */
async function advanceToJustBeforeTheLimit(): Promise<void> {
  await settle()
  await vi.advanceTimersByTimeAsync(JUST_BEFORE_THE_LIMIT_MS)
}

/** Moves the clock past the wait limit and lets the microtasks settle. */
async function advancePastTheLimit(): Promise<void> {
  await vi.advanceTimersByTimeAsync(LAST_MILLISECOND)
  await settle()
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

describe('a close, a restore, and a switch when a record write does not end', () => {
  it('a close goes on when the record write does not end in time', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the close')

    const closing = settlementOf(handle.close())
    await advanceToJustBeforeTheLimit()
    expect(closing()).toEqual({ status: 'pending' })
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(true)

    await advancePastTheLimit()
    expect(closing()).toEqual({ status: 'resolved', value: { ok: true } })
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
    expect(RECORD_WAIT_MS).toBe(WAIT_LIMIT_MS)
    puts.endAllPuts()
    await settle()
  })

  it('a restore goes on when a record write of the old handle does not end in time', async () => {
    const locks = createControlledLocks()
    locks.endRelease()
    const { ports, handle } = await openStoredForRestore(locks)
    await settle()
    const puts = gatePuts(ports.index)
    rename(handle, 'Edited before the restore')
    await handle.save()
    await snapshotRecovered(handle)

    const restoring = restoreSnapshot(handle)
    const restoreState = settlementOf(restoring)
    await advanceToJustBeforeTheLimit()
    expect(restoreState()).toEqual({ status: 'pending' })

    await advancePastTheLimit()
    expect(restoreState()).toMatchObject({ status: 'resolved', value: { ok: true } })
    const restored = handleOf(await restoring)
    rename(restored, 'Saved after the restore')
    expect(await restored.save()).toEqual({ ok: true })
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe('Saved after the restore')
    puts.endAllPuts()
    await settle()
  })

  it('a switch goes on when the record write of the project that was left does not end in time', async () => {
    const { ports, handle } = await openStored()
    const puts = gatePuts(ports.index)
    rename(handle, 'Left behind')

    const switching = switchProject(ports, handle, workspaceRequest(OTHER_ID))
    const switchState = settlementOf(switching)
    await advanceToJustBeforeTheLimit()
    expect(switchState()).toEqual({ status: 'pending' })

    await advancePastTheLimit()
    expect(switchState()).toMatchObject({ status: 'resolved', value: { ok: true } })
    expect(handleOf(await switching).id).toBe(OTHER_ID)
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
    expect(ports.lockRegistry.has(OTHER_ID)).toBe(true)
    puts.endAllPuts()
    await settle()
  })
})

describe('a failed open when the index does not answer', () => {
  it.each([
    ['a get that never settles', (ports: TestPorts) => holdGets(ports.index).release],
    ['a put that never settles', (ports: TestPorts) => gatePuts(ports.index).endAllPuts],
  ])(
    'a failed open returns its failure when the index does not answer in time: %s',
    async (_label, hang) => {
      const ports = createTestPorts()
      await placeDocument(ports, PROJECT_ID, NOT_JSON)
      await ports.index.put(sampleRecord({ id: PROJECT_ID }))
      const answer = hang(ports)

      const opening = settlementOf(openDocumentHandle(ports, workspaceRequest(PROJECT_ID)))
      await advanceToJustBeforeTheLimit()
      expect(opening()).toEqual({ status: 'pending' })

      await advancePastTheLimit()
      expect(opening()).toMatchObject({
        status: 'resolved',
        value: { ok: false, failure: { kind: 'did-not-open' } },
      })
      expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
      answer()
      await settle()
    },
  )
})

describe('the wait when the index answers or the console fails', () => {
  it('a warning that throws makes nothing reject', async () => {
    consoleWarn.mockImplementation(() => {
      throw new Error('the console is not available')
    })
    const ports = createTestPorts({ index: failingIndex() })
    await placeDocument(ports, PROJECT_ID, currentBytes())

    const opening = openDocumentHandle(ports, workspaceRequest(PROJECT_ID))
    await expect(opening).resolves.toMatchObject({ ok: true })
    const handle = handleOf(await opening)
    rename(handle, 'Saved')
    await expect(handle.save()).resolves.toEqual({ ok: true })
    rename(handle, 'Closed')
    await expect(handle.close()).resolves.toEqual({ ok: true })

    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
  })

  it('with a healthy index a close waits for no time limit', async () => {
    const { ports, handle } = await openStored()
    rename(handle, 'Closed at once')

    expect(await handle.close()).toEqual({ ok: true })
    expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)

    await vi.advanceTimersByTimeAsync(WAIT_LIMIT_MS)
    expect(consoleWarn).not.toHaveBeenCalled()
  })
})
