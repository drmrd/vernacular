import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  IN_WORKSPACE,
  createTestPorts,
  handleOf,
  openOrThrow,
  placeDocument,
  recordingPorts,
  rememberFolder,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { openRecent } from './open-recent'
import { switchProject } from './switch-project'

const CURRENT_ID = 'a'
const OTHER_ID = 'b'
const FOLDER_ID = 'in-a-folder'
const FOLDER_PROJECT_NAME = 'Kept in a folder'

/** A handle on the stored project `a` of the workspace. */
async function openCurrent(ports: TestPorts) {
  await placeDocument(ports, CURRENT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(CURRENT_ID))
}

/** Remembers a folder under `FOLDER_ID` whose document is named `FOLDER_PROJECT_NAME`. */
async function rememberProjectFolder(ports: TestPorts): Promise<void> {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).name = FOLDER_PROJECT_NAME
  await rememberFolder(ports, FOLDER_ID, bytesOf(document))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a recent project of the workspace', () => {
  it('after switching away from a project, opening it again from the recent list works, because its lock is free', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    await placeDocument(ports, OTHER_ID, currentBytes())
    const other = handleOf(await switchProject(ports, current, workspaceRequest(OTHER_ID)))

    const handle = handleOf(await openRecent(ports, other, CURRENT_ID))

    expect(handle.id).toBe(CURRENT_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
  })

  it('an id that the workspace does not hold gives not-found, and the current project stays open', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)

    const result = await openRecent(ports, current, 'missing')

    expect(result).toEqual({ ok: false, failure: { kind: 'not-found' } })
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(await current.save()).toEqual({ ok: true })
  })

  it('the current id returns the current handle and writes nothing', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const current = await openCurrent(ports)
    const storedBefore = await storedName(ports.workspace, CURRENT_ID)
    rename(current, 'Edited, not yet stored')
    log.length = 0

    const result = await openRecent(ports, current, CURRENT_ID)

    expect(handleOf(result)).toBe(current)
    expect(log).toEqual([])
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(storedBefore)
  })

  it('a folder access that rejects its permission counts as no folder', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, CURRENT_ID, currentBytes())
    vi.spyOn(ports.folders, 'permission').mockRejectedValue(new Error('The handle store failed'))

    const handle = handleOf(await openRecent(ports, undefined, CURRENT_ID))

    expect(handle.location).toEqual(IN_WORKSPACE)
  })

  it('a project that another tab holds gives open-elsewhere', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, CURRENT_ID, currentBytes())
    const otherTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    await openOrThrow(otherTab, workspaceRequest(CURRENT_ID))

    const result = await openRecent(ports, undefined, CURRENT_ID)

    expect(result).toEqual({ ok: false, failure: { kind: 'open-elsewhere' } })
  })
})

describe('a recent project in a folder', () => {
  it('an id with a remembered folder opens from the folder', async () => {
    const ports = createTestPorts()
    await rememberProjectFolder(ports)

    const handle = handleOf(await openRecent(ports, undefined, FOLDER_ID))

    expect(handle.location).toEqual({ kind: 'folder', folderName: '' })
    expect(handle.session.getProject().meta.name).toBe(FOLDER_PROJECT_NAME)
  })

  it('a folder whose permission is prompt is asked for access, then opens', async () => {
    const ports = createTestPorts()
    await rememberProjectFolder(ports)
    ports.folders.setPermission(FOLDER_ID, 'prompt')
    const reopen = vi.spyOn(ports.folders, 'reopen')

    const handle = handleOf(await openRecent(ports, undefined, FOLDER_ID))

    expect(handle.session.getProject().meta.name).toBe(FOLDER_PROJECT_NAME)
    expect(reopen).toHaveBeenCalledWith(FOLDER_ID)
  })

  it('a folder whose access is denied gives folder-permission', async () => {
    const ports = createTestPorts()
    await rememberProjectFolder(ports)
    ports.folders.setPermission(FOLDER_ID, 'denied')

    const result = await openRecent(ports, undefined, FOLDER_ID)

    expect(result).toEqual({ ok: false, failure: { kind: 'folder-permission' } })
  })
})
