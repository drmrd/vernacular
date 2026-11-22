// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { describe, expect, it, vi } from 'vitest'
import { bundleFilename } from '../../storage'
import { contentHashOf, projectReferring } from '../../storage/zip/zip-test-kit'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  rememberFolder,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { UNNAMED_PROJECT } from '../projects/display-name'
import { folderRecord } from '../projects/rebuild-test-kit'
import {
  BACKUP_PATH,
  FIRST_ID,
  NEWER_ID,
  NEWER_NAME,
  SECOND_ID,
  SECOND_NAME,
  SNAPSHOT_PATH,
  addRecoveryFiles,
  filesOfArchive,
  holdInSecondTab,
  projectOfArchive,
  storeProjectThatDoesNotOpen,
  storeTwoProjects,
  storedBytesOf,
} from './card-flows-test-kit'
import { exportProject } from './export-project'
import type { ExportProjectResult } from './export-project'

const EDITED_NAME = 'Edited, not yet stored'
const FOLDER_ID = 'in-a-folder'
const UNCHECKED_SUFFIX = '-unchecked-copy.building'
const encoder = new TextEncoder()
const KEPT_ASSET = encoder.encode('the bytes of an asset that the pool holds')
const LOST_ASSET = encoder.encode('the bytes of an asset that the pool lost')

/** The archive of a result that must hold an ordinary archive. */
function archiveOf(result: ExportProjectResult) {
  if (!result.ok || result.kind !== 'archive') {
    throw new Error(`Expected an archive, got ${result.ok ? result.kind : result.failure.kind}`)
  }
  return result
}

/** The unchecked copy of a result that must hold one. */
function uncheckedCopyOf(result: ExportProjectResult) {
  if (!result.ok || result.kind !== 'unchecked-copy') {
    throw new Error(
      `Expected an unchecked copy, got ${result.ok ? result.kind : result.failure.kind}`,
    )
  }
  return result
}

/** The paths of the files of an archive that lie in the recovery folders. */
function recoveryPathsOf(archive: Uint8Array): string[] {
  return [...filesOfArchive(archive).keys()].filter((path) => path.startsWith('.house-'))
}

describe('an export of the project that is open in this tab', () => {
  it('writes the pending changes first, and the archive holds them', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    rename(handle, EDITED_NAME)

    const result = archiveOf(await exportProject(ports, handle, { id: FIRST_ID }))

    expect((await projectOfArchive(result.bytes)).meta.name).toBe(EDITED_NAME)
    expect(await storedName(ports.workspace, FIRST_ID)).toBe(EDITED_NAME)
    expect(result.fileName).toBe(bundleFilename(EDITED_NAME))
    await handle.close()
  })
})

describe('an export of a project that is not open in this tab', () => {
  it('gives the stored document of a project that another tab holds', async () => {
    const ports = await storeTwoProjects()
    await holdInSecondTab(ports, SECOND_ID)

    const result = archiveOf(await exportProject(ports, undefined, { id: SECOND_ID }))

    expect((await projectOfArchive(result.bytes)).meta.name).toBe(SECOND_NAME)
    expect(result.fileName).toBe(bundleFilename(SECOND_NAME))
  })

  it('an export leaves every stored file byte-identical', async () => {
    const ports = await storeTwoProjects()
    await addRecoveryFiles(ports, SECOND_ID)
    const before = await storedBytesOf(ports, [FIRST_ID, SECOND_ID])

    await exportProject(ports, undefined, { id: SECOND_ID })

    expect(await storedBytesOf(ports, [FIRST_ID, SECOND_ID])).toEqual(before)
  })

  it('an export of a project that another tab holds takes no lock', async () => {
    const ports = await storeTwoProjects()
    await holdInSecondTab(ports, SECOND_ID)
    const tryAcquire = vi.spyOn(ports.locks, 'tryAcquire')

    const result = await exportProject(ports, undefined, { id: SECOND_ID })

    expect(result.ok).toBe(true)
    expect(tryAcquire).not.toHaveBeenCalled()
    expect([...ports.lockRegistry]).toEqual([SECOND_ID])
  })

  it('an ordinary export holds no snapshot and no backup', async () => {
    const ports = await storeTwoProjects()
    await addRecoveryFiles(ports, SECOND_ID)

    const result = archiveOf(await exportProject(ports, undefined, { id: SECOND_ID }))

    expect(recoveryPathsOf(result.bytes)).toEqual([])
  })

  it('a document that fails the strict check exports as an ordinary archive', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, FIRST_ID, documentBreakingFormatRules())

    const result = await exportProject(ports, undefined, { id: FIRST_ID })

    expect(archiveOf(result).bytes.length).toBeGreaterThan(0)
  })

  it('reports the assets of a closed project that the pool lacks', async () => {
    const ports = createTestPorts()
    const lost = await contentHashOf(LOST_ASSET)
    const kept = await contentHashOf(KEPT_ASSET)
    await ports.workspace.save(
      FIRST_ID,
      projectReferring([
        { scope: 'user', contentHash: lost },
        { scope: 'user', contentHash: kept },
      ]),
    )
    await ports.workspace.assets(FIRST_ID).put(kept, KEPT_ASSET)

    const result = archiveOf(await exportProject(ports, undefined, { id: FIRST_ID }))

    expect(result.missingAssets).toEqual([lost])
  })

  it('names an ordinary archive after the project, with no unchecked-copy suffix', async () => {
    const ports = await storeTwoProjects()

    const result = archiveOf(await exportProject(ports, undefined, { id: SECOND_ID }))

    expect(result.fileName).toBe(bundleFilename(SECOND_NAME))
    expect(result.fileName.endsWith(UNCHECKED_SUFFIX)).toBe(false)
  })
})

describe('an export of a project that did not open', () => {
  it('a project that did not open gives an unchecked copy with its stored files byte for byte', async () => {
    const ports = createTestPorts()
    await storeProjectThatDoesNotOpen(ports)
    const [stored] = [...(await storedBytesOf(ports, [NEWER_ID])).values()]

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: NEWER_ID }))

    expect(filesOfArchive(copy.bytes)).toEqual(stored)
    expect([...filesOfArchive(copy.bytes).keys()]).toEqual(
      expect.arrayContaining([SNAPSHOT_PATH, BACKUP_PATH]),
    )
  })

  it('holds the assets that the record lists and the pool has, and counts them', async () => {
    const ports = createTestPorts()
    const kept = await contentHashOf(KEPT_ASSET)
    const lost = await contentHashOf(LOST_ASSET)
    await storeProjectThatDoesNotOpen(ports, [kept, lost])
    await ports.workspace.assets(NEWER_ID).put(kept, KEPT_ASSET)

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: NEWER_ID }))

    const files = filesOfArchive(copy.bytes)
    expect(files.get(`assets/${kept}`)).toEqual(KEPT_ASSET)
    expect(files.has(`assets/${lost}`)).toBe(false)
    expect(copy.includedAssets).toBe(1)
  })

  it('counts no asset when the record lists none', async () => {
    const ports = createTestPorts()
    await storeProjectThatDoesNotOpen(ports)

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: NEWER_ID }))

    expect(copy.includedAssets).toBe(0)
  })

  it('names the copy after the project and ends the name in -unchecked-copy.building', async () => {
    const ports = createTestPorts()
    await storeProjectThatDoesNotOpen(ports)

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: NEWER_ID }))

    expect(copy.fileName).toBe(bundleFilename(`${NEWER_NAME} unchecked copy`))
    expect(copy.fileName.endsWith(UNCHECKED_SUFFIX)).toBe(true)
  })

  it('still gives the copy, with no asset and the unnamed name, when the record cannot be read', async () => {
    const ports = createTestPorts()
    await storeProjectThatDoesNotOpen(ports)
    const [stored] = [...(await storedBytesOf(ports, [NEWER_ID])).values()]
    vi.spyOn(ports.index, 'get').mockRejectedValue(new Error('The index failed'))

    const copy = uncheckedCopyOf(await exportProject(ports, undefined, { id: NEWER_ID }))

    expect(filesOfArchive(copy.bytes)).toEqual(stored)
    expect(copy.includedAssets).toBe(0)
    expect(copy.fileName).toBe(bundleFilename(`${UNNAMED_PROJECT} unchecked copy`))
  })
})

describe('an export that cannot make an archive', () => {
  it('gives not-found for a project that is not stored', async () => {
    const ports = await storeTwoProjects()

    const result = await exportProject(ports, undefined, { id: 'nobody' })

    expect(result).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('gives folder-permission for a folder that the browser may not use', async () => {
    const ports = createTestPorts()
    await rememberFolder(ports, FOLDER_ID)
    await ports.index.put(folderRecord(FOLDER_ID))
    ports.folders.setPermission(FOLDER_ID, 'denied')

    const result = await exportProject(ports, undefined, { id: FOLDER_ID })

    expect(result).toEqual({ ok: false, failure: { kind: 'folder-permission' } })
  })

  it.each([
    ['denied', 'folder-permission'],
    ['missing', 'folder-unavailable'],
  ] as const)(
    'a folder in the prompt state whose request for access answers %s gives %s',
    async (answer, kind) => {
      const ports = createTestPorts()
      await rememberFolder(ports, FOLDER_ID)
      await ports.index.put(folderRecord(FOLDER_ID))
      ports.folders.setPermission(FOLDER_ID, 'prompt')
      vi.spyOn(ports.folders, 'reopen').mockResolvedValue(answer)

      const result = await exportProject(ports, undefined, { id: FOLDER_ID })

      expect(result).toEqual({ ok: false, failure: { kind } })
    },
  )

  it('resolves with export-failed when the open project cannot be packed', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    const getProject = vi.spyOn(handle.session, 'getProject').mockImplementation(() => {
      throw new Error('The project could not be read')
    })

    const result = await exportProject(ports, handle, { id: FIRST_ID })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'export-failed', message: 'The project could not be read' },
    })
    getProject.mockRestore()
    await handle.close()
  })

  it('resolves with export-failed when the ports throw', async () => {
    const ports = await storeTwoProjects()
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('The store failed'))

    const result = await exportProject(ports, undefined, { id: SECOND_ID })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'export-failed', message: 'The store failed' },
    })
  })

  it.each([
    ['an ordinary archive', SECOND_ID, async () => storeTwoProjects()],
    ['an unchecked copy', NEWER_ID, async () => storeThatDoesNotOpen()],
  ])(
    'resolves with export-failed when the pool fails after the read, for %s',
    async (_kind, id, store) => {
      const ports = await store()
      vi.spyOn(ports.workspace, 'assets').mockImplementation(() => {
        throw new Error('The pool failed')
      })

      const result = await exportProject(ports, undefined, { id })

      expect(result).toEqual({
        ok: false,
        failure: { kind: 'export-failed', message: 'The pool failed' },
      })
    },
  )
})

async function storeThatDoesNotOpen() {
  const ports = createTestPorts()
  await storeProjectThatDoesNotOpen(ports)
  return ports
}
