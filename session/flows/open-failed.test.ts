import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renameProject } from '../../core'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import {
  bytesOf,
  fixtureDocument,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  TEST_BUILD,
  createTestPorts,
  failureOf,
  openOrThrow,
  placeDocument,
  recordOf,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import {
  BACKUP_FOLDER,
  PROJECT_ID,
  TWO_PAINT_ENTRIES_SENTENCE,
  folderRequest,
  missingRequiredFieldBytes,
  mixedPaintBytes,
  placeInFolder,
  placeInWorkspace,
} from './open-failed-test-kit'
import { switchProject } from './switch-project'

const OLDER_VERSION = 8
const OTHER_ID = 'b'
const EDITED_NAME = 'Edited just before the switch'
const REFUSED = { kind: 'did-not-open', decode: { kind: 'format-rules' } }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a project that breaks the format rules', () => {
  it('a project with two mixed paint entries does not open: did-not-open with format-rules', async () => {
    const ports = createTestPorts()
    await placeInWorkspace(ports, mixedPaintBytes())

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toMatchObject(REFUSED)
  })

  it('the failure carries a repair that names 2 paint entries', async () => {
    const ports = createTestPorts()
    await placeInWorkspace(ports, mixedPaintBytes())

    expect(await failureOf(ports, workspaceRequest(PROJECT_ID))).toMatchObject({
      ...REFUSED,
      repair: { sentences: [TWO_PAINT_ENTRIES_SENTENCE] },
    })
  })

  it('the refused open writes no file of the project: its directory is byte-identical', async () => {
    const ports = createTestPorts()
    await placeInWorkspace(ports, mixedPaintBytes())
    const before = await treeOf(ports.root, PROJECT_ID)

    await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(await treeOf(ports.root, PROJECT_ID)).toEqual(before)
  })

  it('the lock is free after the refused open, and the record says that the project did not open', async () => {
    const ports = createTestPorts()
    await placeInWorkspace(ports, mixedPaintBytes())
    await ports.index.put(sampleRecord({ id: PROJECT_ID }))

    await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(await ports.locks.heldIds()).toEqual(new Set())
    expect((await recordOf(ports, PROJECT_ID))?.lastOpen).toEqual({
      opened: false,
      build: TEST_BUILD,
      reason: 'format-rules',
    })
  })

  it('a folder project that breaks the format rules does not open, and its folder is byte-identical', async () => {
    const ports = createTestPorts()
    const folder = await placeInFolder(ports, mixedPaintBytes())
    const before = await treeOf(folder)

    const failure = await failureOf(ports, folderRequest())

    expect(failure).toMatchObject(REFUSED)
    expect(await treeOf(folder)).toEqual(before)
  })

  it('an older document that breaks the format rules writes no migration backup when it is refused', async () => {
    const ports = createTestPorts()
    const older = bytesOf(withUnknownWallField(fixtureDocument(OLDER_VERSION)))
    await placeInWorkspace(ports, older)

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure).toMatchObject(REFUSED)
    expect(await ports.root.list(`${PROJECT_ID}/${BACKUP_FOLDER}`)).toEqual([])
  })

  it('a project that lacks a required field does not open and carries no repair', async () => {
    const ports = createTestPorts()
    await placeInWorkspace(ports, missingRequiredFieldBytes())

    const failure = await failureOf(ports, workspaceRequest(PROJECT_ID))

    expect(failure).toMatchObject(REFUSED)
    expect(failure).toEqual({ kind: 'did-not-open', decode: expect.anything() })
  })

  it('a switch to such a project leaves the current project open, and its edit is stored', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, OTHER_ID, currentBytes())
    await placeInWorkspace(ports, mixedPaintBytes())
    const current = await openOrThrow(ports, workspaceRequest(OTHER_ID))
    current.session.dispatch(renameProject(EDITED_NAME))

    const result = await switchProject(ports, current, workspaceRequest(PROJECT_ID))

    expect(result).toMatchObject({ ok: false, failure: REFUSED })
    expect(await ports.locks.heldIds()).toEqual(new Set([OTHER_ID]))
    expect(await storedName(ports.workspace, OTHER_ID)).toBe(EDITED_NAME)
  })
})
