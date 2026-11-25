import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ProjectIndex } from '../../storage'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import {
  createTestPorts,
  failureOf,
  hideTimesOfChange,
  openOrThrow,
  placeDocument,
  recordOf,
  settlementOf,
  workspaceRequest,
} from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const RECORDED_CHANGE = '2026-10-20T08:00:00.000Z'
const WAIT_LIMIT_MS = 2_000
const NOT_JSON = new TextEncoder().encode('{ not json')

let consoleWarn: ReturnType<typeof vi.spyOn>

/** Makes one method of `index` reject from now on, and gives the error it rejects with. */
function rejectCallsOf(index: ProjectIndex, method: 'get' | 'put'): Error {
  const error = new Error(`the index refused a ${method}`)
  vi.spyOn(index, method).mockRejectedValue(error)
  return error
}

/** How many warnings named `error`. */
function warningsAbout(error: Error): number {
  return consoleWarn.mock.calls.filter((call: unknown[]) => call.includes(error)).length
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

describe('the note of a failed open when the index refuses', () => {
  it.each(['get', 'put'] as const)(
    'a failed open whose %s rejects returns did-not-open, frees the lock, and warns once',
    async (method) => {
      const ports = createTestPorts()
      await placeDocument(ports, PROJECT_ID, NOT_JSON)
      await ports.index.put(sampleRecord({ id: PROJECT_ID }))
      rejectCallsOf(ports.index, method)

      const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))
      await settle()

      expect(failure.kind).toBe('did-not-open')
      expect(ports.lockRegistry.has(PROJECT_ID)).toBe(false)
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    },
  )

  it('a failed open that times out warns once, also when its held read later rejects', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, NOT_JSON)
    await ports.index.put(sampleRecord({ id: PROJECT_ID }))
    let rejectTheRead: (error: Error) => void = () => undefined
    vi.spyOn(ports.index, 'get').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectTheRead = reject
        }),
    )

    const opening = settlementOf(openDocumentHandle(ports, workspaceRequest(PROJECT_ID)))
    await settle()
    await vi.advanceTimersByTimeAsync(WAIT_LIMIT_MS)
    await settle()
    expect(opening()).toMatchObject({ status: 'resolved', value: { ok: false } })
    expect(consoleWarn).toHaveBeenCalledTimes(1)

    rejectTheRead(new Error('the index answered too late'))
    await settle()

    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })
})

describe('the time of change of an open whose read gives none', () => {
  it('a sound open from a store that gives no time keeps the time of change of the record', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await ports.index.put(sampleRecord({ id: PROJECT_ID, lastChangedAt: RECORDED_CHANGE }))
    hideTimesOfChange(ports)

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      name: handle.session.getProject().meta.name,
      lastChangedAt: RECORDED_CHANGE,
      assetListComplete: true,
    })
  })

  it('a sound open whose index read rejects opens, writes no record, and warns once', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    hideTimesOfChange(ports)
    const refusal = rejectCallsOf(ports.index, 'get')
    const get = vi.spyOn(ports.index, 'get')
    const put = vi.spyOn(ports.index, 'put')

    const opened = await openDocumentHandle(ports, workspaceRequest(PROJECT_ID))
    await settle()

    expect(get).toHaveBeenCalled()
    expect(opened.ok).toBe(true)
    expect(put).not.toHaveBeenCalled()
    expect(warningsAbout(refusal)).toBe(1)
  })
})
