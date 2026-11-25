import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, Dispatcher } from '../../core'
import {
  fixtureDocument,
  bytesOf,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  DOCUMENT_FILE,
  IN_FOLDER,
  createTestPorts,
  failSaves,
  handleOf,
  movableClock,
  openOrThrow,
  recordOf,
  recordingPorts,
  rememberFolder,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { AUTOSAVE_DIRECTORY } from '../../storage/snapshots/snapshot-store'
import { renamed } from '../../tests/storage/conformance/conformance-documents'
import { SECOND_FILE_NAME, storeTwoReadableFiles } from '../handle/second-file-test-kit'
import { folderRecord } from '../projects/rebuild-test-kit'
import { reconcileIndex } from '../projects/reconcile-index'
import {
  DISK_FULL,
  FIRST_ID,
  FIRST_NAME,
  SECOND_ID,
  SECOND_NAME,
  failTheNextSave,
  storeTwoProjects,
  storeTwoProjectsIn,
  storedBytesOf,
} from './card-flows-test-kit'
import { openRecent } from './open-recent'
import { renameProject } from './rename-project'

const NEW_NAME = 'Renamed House'
const FOLDER_ID = 'in-a-folder'
const FOLDER_NAME = 'Kept in a folder'
const EDITED_NAME = 'Edited, not yet stored'
const SNAPSHOT_FOLDER = `${AUTOSAVE_DIRECTORY}/`

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** The project that the workspace stores under `id`. */
async function readProject(ports: TestPorts, id: string) {
  const read = await ports.workspace.read(id)
  if (!read.ok) throw new Error(`Expected a stored project: ${id}`)
  return read.value.project
}

/** The sorted paths of the recovery snapshot files among the stored files of one project. */
function snapshotPaths(files: ReadonlyMap<string, Uint8Array> | undefined): string[] {
  return [...(files?.keys() ?? [])].filter((path) => path.startsWith(SNAPSHOT_FOLDER)).sort()
}

describe('a rename of a closed project', () => {
  it('stores the new name in the document and in the record', async () => {
    const ports = await storeTwoProjects()

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: true, renamed: true })
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(NEW_NAME)
    expect((await recordOf(ports, SECOND_ID))?.name).toBe(NEW_NAME)
  })

  it('stores the new name in the main file of a project with two readable plan files, and leaves the second file as it was', async () => {
    const ports = createTestPorts()
    const secondPath = `${SECOND_ID}/${SECOND_FILE_NAME}`
    await storeTwoReadableFiles(ports, SECOND_ID, { main: 'Main file', second: 'Second file' })
    await reconcileIndex(ports)
    const secondBefore = await ports.root.readFile(secondPath)

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: true, renamed: true })
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(NEW_NAME)
    expect(secondBefore).toBeDefined()
    expect(await ports.root.readFile(secondPath)).toEqual(secondBefore)
  })

  it('saves once, between taking the lock and freeing it', async () => {
    const log: string[] = []
    const ports = await storeTwoProjectsIn(recordingPorts(log))
    log.length = 0

    await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(log.filter((entry) => entry !== `read:${SECOND_ID}`)).toEqual([
      `lock:${SECOND_ID}`,
      `save:${SECOND_ID}`,
      `unlock:${SECOND_ID}`,
    ])
  })

  it('trims the name', async () => {
    const ports = await storeTwoProjects()

    await renameProject(ports, undefined, { id: SECOND_ID, name: `  ${NEW_NAME}  ` })

    expect(await storedName(ports.workspace, SECOND_ID)).toBe(NEW_NAME)
  })

  it('counts as a use: the time of use of the record moves', async () => {
    const clock = movableClock(new Date('2026-03-01T09:00:00.000Z'))
    const ports = await storeTwoProjects({ now: clock.now })
    const later = new Date('2026-03-02T09:00:00.000Z')
    clock.moveTo(later)

    await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect((await recordOf(ports, SECOND_ID))?.lastUsedAt).toBe(later.toISOString())
  })

  it('keeps the recovery snapshots of the project and the files of every other project', async () => {
    const ports = await storeTwoProjects()
    const unsaved = renamed(await readProject(ports, SECOND_ID), EDITED_NAME)
    await ports.workspace.snapshots(SECOND_ID).writeSnapshot(unsaved)
    const before = await storedBytesOf(ports, [FIRST_ID, SECOND_ID])

    await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    const after = await storedBytesOf(ports, [FIRST_ID, SECOND_ID])
    expect(snapshotPaths(after.get(SECOND_ID))).toEqual(snapshotPaths(before.get(SECOND_ID)))
    expect(snapshotPaths(before.get(SECOND_ID)).length).toBeGreaterThan(0)
    const restored = await ports.workspace.snapshots(SECOND_ID).restore()
    expect(restored).toMatchObject({
      ok: true,
      value: { project: { meta: { name: EDITED_NAME } } },
    })
    expect(after.get(FIRST_ID)).toEqual(before.get(FIRST_ID))
    const kept = [...(before.get(SECOND_ID) ?? [])].filter(([path]) => path !== DOCUMENT_FILE)
    expect(kept.length).toBeGreaterThan(0)
    for (const [path, bytes] of kept) {
      expect(after.get(SECOND_ID)?.get(path)).toEqual(bytes)
    }
  })

  it('frees the lock afterward', async () => {
    const ports = await storeTwoProjects()

    await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('frees the lock afterward when its save failed, and gives save-failed', async () => {
    const ports = await storeTwoProjects()
    failTheNextSave(ports.workspace)

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: false, failure: { kind: 'save-failed', message: DISK_FULL } })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })

  it('frees the lock afterward when the rename itself throws, and gives storage-unavailable', async () => {
    const ports = await storeTwoProjects()
    vi.spyOn(Dispatcher.prototype, 'dispatch').mockImplementationOnce(() => {
      throw new Error('The rename cannot be dispatched')
    })

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result).toMatchObject({ ok: false, failure: { kind: 'storage-unavailable' } })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})

describe('a blank name', () => {
  it('counts no write, takes no lock, and changes nothing', async () => {
    const log: string[] = []
    const ports = await storeTwoProjectsIn(recordingPorts(log))
    log.length = 0

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: '   ' })

    expect(result).toEqual({ ok: true, renamed: false })
    expect(log).toEqual([])
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(SECOND_NAME)
  })
})

describe('a rename of the open project', () => {
  it('dispatches on its session, so that one undo gives the old name back, and stores the new name', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))

    const result = await renameProject(ports, handle, { id: FIRST_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: true, renamed: true })
    expect(await storedName(ports.workspace, FIRST_ID)).toBe(NEW_NAME)
    handle.session.undo()
    expect(handle.session.getProject().meta.name).toBe(FIRST_NAME)
    await handle.close()
  })

  it('changes the name in its session before anything is awaited', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))

    const running = renameProject(ports, handle, { id: FIRST_ID, name: NEW_NAME })

    expect(handle.session.getProject().meta.name).toBe(NEW_NAME)
    await running
    await handle.close()
  })

  it('gives save-failed when the save fails, keeps the new name in the session, and shows the failed save', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    failSaves(ports.workspace)

    const result = await renameProject(ports, handle, { id: FIRST_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: false, failure: { kind: 'save-failed', message: DISK_FULL } })
    expect(handle.session.getProject().meta.name).toBe(NEW_NAME)
    expect(handle.saveStatus()).toBe('error')
  })
})

describe('a rename of a project in a folder', () => {
  async function portsWithAFolderProject() {
    const ports = createTestPorts()
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).name = FOLDER_NAME
    await rememberFolder(ports, FOLDER_ID, bytesOf(document))
    await ports.index.put(folderRecord(FOLDER_ID, { location: IN_FOLDER, name: FOLDER_NAME }))
    return ports
  }

  it('stores the new name in its folder, and the workspace gains no file', async () => {
    const ports = await portsWithAFolderProject()

    const result = await renameProject(ports, undefined, { id: FOLDER_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: true, renamed: true })
    expect(await ports.root.list('')).toEqual([])
    const reopened = handleOf(await openRecent(ports, undefined, FOLDER_ID))
    expect(reopened.session.getProject().meta.name).toBe(NEW_NAME)
    await reopened.close()
  })

  it('asks for the permission of a folder that needs it, inside the rename', async () => {
    const ports = await portsWithAFolderProject()
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const reopen = vi.spyOn(ports.folders, 'reopen')

    const result = await renameProject(ports, undefined, { id: FOLDER_ID, name: NEW_NAME })

    expect(reopen).toHaveBeenCalledWith(FOLDER_ID)
    expect(result).toEqual({ ok: true, renamed: true })
  })
})
