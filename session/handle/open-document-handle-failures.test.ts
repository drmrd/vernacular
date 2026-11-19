import { describe, it, expect, vi, afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION, decodeDocument } from '../../core'
import type { ProjectLockPort } from '../../storage'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  IN_FOLDER,
  createTestPorts,
  failureOf,
  placeDocument,
  rememberFolder,
  workspaceRequest,
} from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const NOT_JSON = new TextEncoder().encode('{ not json')

function newerVersionBytes(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
  return bytesOf(document)
}

const folderRequest = { id: PROJECT_ID, location: IN_FOLDER }

afterEach(() => {
  vi.restoreAllMocks()
})

describe('opening a project of the workspace that does not open', () => {
  it('the lock held on the same registry gives open-elsewhere, and the store was not read', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    await otherTab.locks.tryAcquire(PROJECT_ID)
    const read = vi.spyOn(ports.workspace, 'read')

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toEqual({
      kind: 'open-elsewhere',
    })
    expect(read).not.toHaveBeenCalled()
  })

  it('a missing id gives not-found and leaves the lock free', async () => {
    const ports = createTestPorts()

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toEqual({ kind: 'not-found' })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('a rejecting read gives storage-unavailable with the message and releases the lock', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('the disk cannot be read'))

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toEqual({
      kind: 'storage-unavailable',
      message: 'the disk cannot be read',
    })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('bytes that are not JSON give did-not-open with the decode failure and release the lock', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, NOT_JSON)
    const decoded = decodeDocument(NOT_JSON)
    if (decoded.ok) throw new Error('Expected the codec to fail on these bytes')

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toEqual({
      kind: 'did-not-open',
      decode: decoded.failure,
    })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('a document of a newer version gives did-not-open with newer-version', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, newerVersionBytes())

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toMatchObject({
      kind: 'did-not-open',
      decode: { kind: 'newer-version' },
    })
  })

  it('an id that cannot name a project gives not-found, also with create', async () => {
    const id = 'a/b'

    expect(await failureOf(createTestPorts(), workspaceRequest(id))).toEqual({ kind: 'not-found' })
    expect(
      await failureOf(createTestPorts(), { ...workspaceRequest(id), create: soundProject }),
    ).toEqual({ kind: 'not-found' })
  })

  it('a lock port that rejects gives storage-unavailable, and the open does not reject', async () => {
    const locks: ProjectLockPort = {
      supported: true,
      tryAcquire: () => Promise.reject(new Error('locks are not available')),
      heldIds: async () => new Set(),
    }
    const ports = { ...createTestPorts(), locks }

    await expect(openDocumentHandle(ports, workspaceRequest(PROJECT_ID))).resolves.toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: 'locks are not available' },
    })
  })

  it('after a failed open the same id opens on the same registry', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('the disk cannot be read'))
    await failureOf(ports, workspaceRequest(PROJECT_ID))

    const again = await openDocumentHandle(ports, workspaceRequest(PROJECT_ID))

    expect(again.ok).toBe(true)
  })
})

describe('opening a project in a folder that does not open', () => {
  it('a folder whose permission is prompt gives folder-permission', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    ports.folders.setPermission(PROJECT_ID, 'prompt')

    expect(await failureOf(ports, folderRequest)).toEqual({ kind: 'folder-permission' })
    expect(await ports.folders.permission(PROJECT_ID)).toBe('prompt')
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('a folder whose permission is denied gives folder-permission', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    ports.folders.setPermission(PROJECT_ID, 'denied')

    expect(await failureOf(ports, folderRequest)).toEqual({ kind: 'folder-permission' })
  })

  it('a folder that is not remembered gives folder-unavailable', async () => {
    const ports = createTestPorts()

    expect(await failureOf(ports, folderRequest)).toEqual({ kind: 'folder-unavailable' })
  })

  it('a folder access that rejects gives storage-unavailable', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    vi.spyOn(ports.folders, 'permission').mockRejectedValue(new Error('the browser refused'))

    expect(await failureOf(ports, folderRequest)).toEqual({
      kind: 'storage-unavailable',
      message: 'the browser refused',
    })
  })
})
