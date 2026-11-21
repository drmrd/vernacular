import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import type { ProjectLockPort } from '../../storage'
import {
  currentBytes,
  documentOfHigherRevision,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import { openDocumentHandle } from './open-document-handle'
import type { OpenRequest, SaveStatus } from './handle-types'
import {
  IN_FOLDER,
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  rememberFolder,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'
const FOLDER_REQUEST: OpenRequest = { id: PROJECT_ID, location: IN_FOLDER }

let consoleError: ReturnType<typeof vi.spyOn>

/** Every value that was passed to `console.error`, in one list. */
function loggedValues(): unknown[] {
  return consoleError.mock.calls.flat()
}

function createRequest(id: string): OpenRequest {
  return { ...workspaceRequest(id), create: soundProject }
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

describe('opening a project in a folder whose permission is granted', () => {
  it('a reopen that answers missing gives folder-unavailable', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.folders, 'reopen').mockResolvedValue('missing')

    expect(await failureOf(ports, FOLDER_REQUEST)).toEqual({ kind: 'folder-unavailable' })
  })

  it('a reopen that answers denied gives folder-permission', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.folders, 'reopen').mockResolvedValue('denied')

    expect(await failureOf(ports, FOLDER_REQUEST)).toEqual({ kind: 'folder-permission' })
  })

  it('a reopen that rejects gives storage-unavailable with the message of the rejection', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.folders, 'reopen').mockRejectedValue(new Error('the folder vanished'))

    expect(await failureOf(ports, FOLDER_REQUEST)).toEqual({
      kind: 'storage-unavailable',
      message: 'the folder vanished',
    })
  })
})

describe('opening a project that fails after the lock was taken', () => {
  it('a create that throws gives storage-unavailable with the message, and frees the lock', async () => {
    const ports = createTestPorts()
    const create = (): never => {
      throw new Error('no starting project')
    }

    await expect(
      openDocumentHandle(ports, { ...workspaceRequest(PROJECT_ID), create }),
    ).resolves.toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: 'no starting project' },
    })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('a hold whose release rejects still lets the open resolve with its failure, and the error is logged once', async () => {
    const failure = new Error('the release was refused')
    const locks: ProjectLockPort = {
      supported: true,
      tryAcquire: async () => ({ release: () => Promise.reject(failure) }),
      heldIds: async () => new Set(),
    }
    const ports = { ...createTestPorts(), locks }

    await expect(openDocumentHandle(ports, workspaceRequest(PROJECT_ID))).resolves.toEqual({
      ok: false,
      failure: { kind: 'not-found' },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
  })

  it('an id that cannot name a project leaves the lock free', async () => {
    const ports = createTestPorts()

    await failureOf(ports, workspaceRequest('a/b'))

    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})

describe('a handle opened with create', () => {
  it('has the status idle', async () => {
    const handle = await openOrThrow(createTestPorts(), createRequest(PROJECT_ID))

    expect(handle.saveStatus()).toBe('idle')
  })
})

describe('a listener of a handle that throws', () => {
  it('a status listener that throws is logged once to console.error', async () => {
    const failure = new Error('status listener failed')
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    handle.subscribe(() => {
      throw failure
    })

    handle.session.dispatch(renameProject('Edited'))

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
  })

  it('a second status listener still gets the status after a listener that throws', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const seen: SaveStatus[] = []
    handle.subscribe(() => {
      throw new Error('status listener failed')
    })
    handle.subscribe(() => seen.push(handle.saveStatus()))

    handle.session.dispatch(renameProject('Edited'))

    expect(seen).toEqual(['pending'])
  })

  it('a notice listener that gets a held notice and throws is logged once to console.error, and onNotice still returns', async () => {
    const failure = new Error('notice listener failed')
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentOfHigherRevision())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const listener = (): void => {
      throw failure
    }

    expect(() => handle.onNotice(listener)).not.toThrow()

    expect(consoleError).toHaveBeenCalledTimes(1)
    expect(loggedValues()).toContain(failure)
  })
})
