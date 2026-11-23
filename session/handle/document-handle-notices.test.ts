import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import {
  currentBytes,
  documentOfNewerVersion,
  faultyProject,
} from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle, HandleNotice } from './handle-types'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  storedProject,
  workspaceRequest,
  type TestPorts,
} from './handle-test-kit'
import {
  documentNamed,
  openBesideSecondFile,
  storeNewerMainBesideSecondFile,
} from './second-file-test-kit'

const PROJECT_ID = 'a'
const NOT_JSON = new TextEncoder().encode('{ not json')

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

/** Lets the autosave delay end, and every write it started settle. */
async function timerWrite(): Promise<void> {
  await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
  await settle()
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
    const ports = createTestPorts({ durable: true })
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

  it('saved-with-faults has reached a listener by the time the save that caused it resolves', async () => {
    const handle = await openFaulty()
    const notices = noticesOf(handle)

    const seenWhenResolved = await handle.save().then(() => [...notices])

    expect(seenWhenResolved).toEqual(['saved-with-faults'])
  })

  it.each([
    ['the end of the autosave delay', timerWrite],
    ['a flush', (handle: DocumentHandle) => handle.flush()],
    ['a close', (handle: DocumentHandle) => handle.close()],
  ])('saved-with-faults is raised by a write of %s after an edit', async (_name, write) => {
    const handle = await openFaulty()
    const notices = noticesOf(handle)
    handle.session.dispatch(renameProject('Edited'))

    const seenWhenResolved = await write(handle).then(() => [...notices])

    expect(seenWhenResolved).toEqual(['saved-with-faults'])
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

describe('the notices of a project with a second file', () => {
  /** A handle on a sound stored project. */
  async function openSound(ports: TestPorts): Promise<DocumentHandle> {
    await placeDocument(ports, PROJECT_ID, currentBytes())
    return openOrThrow(ports, workspaceRequest(PROJECT_ID))
  }

  /** Changes the project and stores it, so the save runs against whatever the store holds. */
  async function editAndSave(handle: DocumentHandle, name: string): Promise<void> {
    handle.session.dispatch(renameProject(name))
    expect(await handle.save()).toEqual({ ok: true })
  }

  it('a save that writes the second file raises saved-in-second-file once', async () => {
    const ports = createTestPorts()
    const handle = await openSound(ports)
    await placeDocument(ports, PROJECT_ID, documentOfNewerVersion())
    const notices = noticesOf(handle)

    await editAndSave(handle, 'First edit')
    await editAndSave(handle, 'Second edit')

    expect(notices).toEqual(['saved-in-second-file'])
  })

  it('an open that reads the second file holds saved-in-second-file for the first listener only', async () => {
    const ports = createTestPorts()
    await storeNewerMainBesideSecondFile(ports, PROJECT_ID, documentNamed('In the second file'))
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    const first = noticesOf(handle)
    const later = noticesOf(handle)
    await editAndSave(handle, 'An edit')

    expect(first).toEqual(['saved-in-second-file'])
    expect(later).toEqual([])
  })

  it('a save that replaces a file it could not read raises unreadable-file-replaced once', async () => {
    const ports = createTestPorts()
    const handle = await openSound(ports)
    await placeDocument(ports, PROJECT_ID, NOT_JSON)
    const notices = noticesOf(handle)

    await editAndSave(handle, 'First edit')
    await editAndSave(handle, 'Second edit')

    expect(notices).toEqual(['unreadable-file-replaced'])
  })

  it('an open of the main file beside a second file raises neither notice, also after a save', async () => {
    const handle = await openBesideSecondFile(createTestPorts())
    const notices = noticesOf(handle)

    await editAndSave(handle, 'An edit')

    expect(notices).toEqual([])
  })

  it('an ordinary save raises neither notice', async () => {
    const handle = await openSound(createTestPorts())
    const notices = noticesOf(handle)

    await editAndSave(handle, 'An edit')

    expect(notices).toEqual([])
  })
})
