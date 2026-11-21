import { describe, it, expect, expectTypeOf, vi, afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION, renameProject } from '../../core'
import type { Project } from '../../core'
import { InMemoryDirectory, WorkspaceDocumentStore, WorkspaceFiles } from '../../storage'
import {
  currentBytes,
  documentOfHigherRevision,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  projectOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import type { DocumentHandle, HandleNotice, OpenRequest } from './handle-types'
import {
  DOCUMENT_FILE,
  IN_FOLDER,
  IN_WORKSPACE,
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  rememberFolder,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'
const OTHER_ID = 'b'
const OLDER_VERSION = 8

const HANDLE_MEMBERS = [
  'close',
  'durable',
  'flush',
  'id',
  'location',
  'onNotice',
  'save',
  'saveStatus',
  'session',
  'snapshots',
  'subscribe',
] as const

const CREATED_NAME = 'Started here'

/** The project that a request with create starts from. */
function createdProject(): Project {
  return renamed(soundProject(), CREATED_NAME)
}

function createRequest(id: string): OpenRequest {
  return { ...workspaceRequest(id), create: createdProject }
}

/** The bytes of a current document whose project has the given name. */
function documentNamed(name: string): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).name = name
  return bytesOf(document)
}

/** Every notice that reaches a listener attached now, while it stays attached. */
function noticesOf(handle: DocumentHandle): HandleNotice[] {
  const notices: HandleNotice[] = []
  handle.onNotice((notice) => notices.push(notice))
  return notices
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('opening a project of the workspace', () => {
  it('a stored document opens with its id, its location, and a session on the stored project', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(handle.id).toBe(PROJECT_ID)
    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(handle.session.getProject()).toEqual(soundProject())
  })

  it('with create, a missing id gives a handle and nothing stored before a save', async () => {
    const ports = createTestPorts()

    const handle = await openOrThrow(ports, createRequest(PROJECT_ID))

    expect((await ports.workspace.storedFiles(PROJECT_ID)).size).toBe(0)
    expect((await ports.workspace.list()).map((summary) => summary.id)).not.toContain(PROJECT_ID)
    expect(await handle.save()).toEqual({ ok: true })
    expect((await storedProject(ports.workspace, PROJECT_ID)).meta.name).toBe(CREATED_NAME)
  })

  it('create is not called when the project is stored', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const create = vi.fn(soundProject)

    await openOrThrow(ports, { ...workspaceRequest(PROJECT_ID), create })

    expect(create).not.toHaveBeenCalled()
  })

  it('a document that fails the check does not open, and no file of it is written', async () => {
    const ports = createTestPorts()
    const original = bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION)))
    await placeDocument(ports, PROJECT_ID, original)
    const before = await treeOf(ports.root)

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure).toMatchObject({ kind: 'did-not-open', decode: { kind: 'format-rules' } })
    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('durable is the durable flag of the store that holds the project', async () => {
    const inMemory = createTestPorts()
    const durableWorkspace = new WorkspaceDocumentStore(
      new WorkspaceFiles(new InMemoryDirectory(), { durable: true }),
    )
    const durablePorts = { ...createTestPorts(), workspace: durableWorkspace }
    const inFolder = createTestPorts()
    await rememberFolder(inFolder, PROJECT_ID, currentBytes())

    expect((await openOrThrow(inMemory, createRequest(PROJECT_ID))).durable).toBe(false)
    expect((await openOrThrow(durablePorts, createRequest(PROJECT_ID))).durable).toBe(true)
    expect((await openOrThrow(inFolder, { id: PROJECT_ID, location: IN_FOLDER })).durable).toBe(
      true,
    )
  })

  it('snapshots are those of the handle id, and the member gives one object', async () => {
    const ports = createTestPorts()
    const handle = await openOrThrow(ports, createRequest(PROJECT_ID))
    const other = await openOrThrow(ports, createRequest(OTHER_ID))

    await ports.workspace.snapshots(PROJECT_ID).writeSnapshot(soundProject())

    expect(handle.snapshots).toBe(handle.snapshots)
    expect(await handle.snapshots.isRecoverable()).toBe(true)
    expect(await other.snapshots.isRecoverable()).toBe(false)
  })

  it('DocumentHandle has no member for selection, camera, active floor, or tool', async () => {
    expectTypeOf<keyof DocumentHandle>().toEqualTypeOf<(typeof HANDLE_MEMBERS)[number]>()
    const handle = await openOrThrow(createTestPorts(), createRequest(PROJECT_ID))

    expect(Object.keys(handle).sort()).toEqual([...HANDLE_MEMBERS])
  })
})

describe('the notices of an opened handle', () => {
  it('savedByNewerBuild emits saved-by-newer-build', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentOfHigherRevision())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(noticesOf(handle)).toEqual(['saved-by-newer-build'])
  })

  it('a held notice goes to the first listener only, also after an unsubscribe and a new subscribe', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, documentOfHigherRevision())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    const first: HandleNotice[] = []
    const stopFirst = handle.onNotice((notice) => first.push(notice))
    stopFirst()

    const later = noticesOf(handle)

    expect(first).toEqual(['saved-by-newer-build'])
    expect(later).toEqual([])
  })

  it('a sound document raises no notice', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(noticesOf(handle)).toEqual([])
  })
})

describe('opening a project in a folder', () => {
  it('a folder whose permission is granted opens the folder document, and a save writes to the folder and not to the workspace', async () => {
    vi.useFakeTimers()
    const ports = createTestPorts()
    const folder = await rememberFolder(ports, PROJECT_ID, documentNamed('In the folder'))
    const handle = await openOrThrow(ports, { id: PROJECT_ID, location: IN_FOLDER })
    expect(handle.session.getProject().meta.name).toBe('In the folder')

    handle.session.dispatch(renameProject('Renamed in the folder'))
    expect(await handle.save()).toEqual({ ok: true })

    const stored = await folder.readFile(DOCUMENT_FILE)
    if (stored === undefined) throw new Error('Expected a document in the folder')
    expect(projectOf(stored).meta.name).toBe('Renamed in the folder')
    expect(await ports.root.list('')).toEqual([])
  })
})
