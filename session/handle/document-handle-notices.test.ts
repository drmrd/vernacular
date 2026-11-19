import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import {
  currentBytes,
  documentBreakingFormatRules,
  faultyProject,
} from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import type { DocumentHandle, HandleNotice } from './handle-types'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'

let consoleError: ReturnType<typeof vi.spyOn>

/** Every value that was passed to `console.error`, in one list. */
function loggedValues(): unknown[] {
  return consoleError.mock.calls.flat()
}

/** A handle opened with create on a project that breaks the format rules, so a save reports faults. */
async function openFaulty(): Promise<DocumentHandle> {
  return openOrThrow(createTestPorts(), { ...workspaceRequest(PROJECT_ID), create: faultyProject })
}

/** Every notice that reaches a listener attached now, while it stays attached. */
function noticesOf(handle: DocumentHandle): HandleNotice[] {
  const notices: HandleNotice[] = []
  handle.onNotice((notice) => notices.push(notice))
  return notices
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a document handle after a failed close', () => {
  it('after a failed close, autosave still stores the next edit', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    vi.spyOn(ports.workspace, 'save').mockRejectedValueOnce(new Error('disk full'))
    handle.session.dispatch(renameProject('First edit'))
    expect(await handle.close()).toEqual({ ok: false, message: 'disk full' })

    handle.session.dispatch(renameProject('Next edit'))
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)

    expect((await storedProject(ports.workspace, PROJECT_ID)).meta.name).toBe('Next edit')
    expect(handle.saveStatus()).toBe('saved')
  })
})

describe('the saved-with-faults notice', () => {
  it('saved-with-faults is emitted once per handle', async () => {
    const handle = await openFaulty()
    const listener = vi.fn()
    handle.onNotice(listener)

    expect(await handle.save()).toEqual({ ok: true })
    expect(await handle.save()).toEqual({ ok: true })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('saved-with-faults')
  })

  it('saved-with-faults reaches a listener that attaches after the save, once', async () => {
    const handle = await openFaulty()
    expect(await handle.save()).toEqual({ ok: true })

    const first = noticesOf(handle)
    const later = noticesOf(handle)

    expect(first).toEqual(['saved-with-faults'])
    expect(later).toEqual([])
  })

  it('a document that opened despite format faults raises no saved-with-faults', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentBreakingFormatRules())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const notices = noticesOf(handle)

    expect(await handle.save()).toEqual({ ok: true })

    expect(notices).toEqual([])
  })

  it('a notice listener that throws does not change the outcome of the save, and it was called once', async () => {
    const failure = new Error('notice listener failed')
    const handle = await openFaulty()
    const throwing = vi.fn(() => {
      throw failure
    })
    const second: HandleNotice[] = []
    handle.onNotice(throwing)
    handle.onNotice((notice) => second.push(notice))

    expect(await handle.save()).toEqual({ ok: true })

    expect(throwing).toHaveBeenCalledTimes(1)
    expect(second).toEqual(['saved-with-faults'])
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
  })
})
