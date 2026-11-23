// @vitest-environment node
// Hashes files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectoryAssetCache } from '../../storage'
import { digestOf, treeOf } from '../../storage/documents/document-store-test-kit'
import { contentHashOf } from '../../storage/zip/zip-test-kit'
import { NOT_JSON } from '../../tests/storage/conformance/conformance-documents'
import {
  DOCUMENT_FILE,
  IN_WORKSPACE,
  createTestPorts,
  failSaves,
  handleOf,
  recordingPorts,
  storedName,
} from '../handle/handle-test-kit'
import { SECOND_FILE_NAME, documentReferring } from '../handle/second-file-test-kit'
import { openSecondFileAsNew, readTwoFiles } from './choose-kept-file'
import { IMAGE } from './import-file-test-kit'
import {
  COPY_NAME,
  SECOND_PATH,
  SET_ASIDE_PREFIX,
  bytesOfCopies,
  choiceOf,
  mainBytesOf,
  recordedSecondFile,
  secondBytes,
  storeFolderProject,
  storeProject,
} from './choose-kept-file-test-kit'
import type { ProjectState } from './choose-kept-file-test-kit'
import { PROJECT_ID, folderBackups, storedBytes, workspaceBackups } from './open-failed-test-kit'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the two files of a project, as a choice reads them', () => {
  it.each(['newer-main', 'both-readable'] as const)(
    'gives the state, the names, and the digests of the files of a workspace project in the state %s',
    async (state: ProjectState) => {
      const ports = createTestPorts()
      await storeProject(ports, state)

      const read = await readTwoFiles(ports, PROJECT_ID)

      expect(read).toMatchObject({
        ok: true,
        files: {
          state,
          main: { name: DOCUMENT_FILE, digest: await digestOf(mainBytesOf(state)) },
          second: { name: SECOND_FILE_NAME, digest: await digestOf(secondBytes()) },
        },
      })
    },
  )

  it('gives the facts of a project in a folder', async () => {
    const ports = createTestPorts()
    await storeFolderProject(ports, 'newer-main')

    const read = await readTwoFiles(ports, PROJECT_ID)

    expect(read).toMatchObject({
      ok: true,
      files: { state: 'newer-main', second: { name: SECOND_FILE_NAME } },
    })
  })

  it('gives no files for a project that has no second file', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'both-readable')
    await ports.root.removeFile(SECOND_PATH)

    const read = await readTwoFiles(ports, PROJECT_ID)

    expect(read).toEqual({ ok: true, files: undefined })
  })

  it('gives not-found for a project that nothing stores', async () => {
    const read = await readTwoFiles(createTestPorts(), 'unknown')

    expect(read).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('takes no lock and writes nothing', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await storeProject(ports, 'newer-main')
    log.length = 0
    const before = await treeOf(ports.root)

    await readTwoFiles(ports, PROJECT_ID)

    expect(log.filter((entry) => !entry.startsWith('read:'))).toEqual([])
    expect(await treeOf(ports.root)).toEqual(before)
  })
})

describe('opening the second file as a new project', () => {
  it('opens a new workspace project named after the second file, and moves the second file to the backups', async () => {
    const ports = createTestPorts({ durable: true })
    await storeProject(ports, 'newer-main')
    expect(await recordedSecondFile(ports)).toBeDefined()

    const result = await openSecondFileAsNew(ports, undefined, await choiceOf(ports))

    const handle = handleOf(result)
    expect(result).toMatchObject({ ok: true, secondFileMoved: true })
    expect(handle.id).not.toBe(PROJECT_ID)
    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(handle.session.getProject().meta.name).toBe(COPY_NAME)
    expect(await storedName(ports.workspace, handle.id)).toBe(COPY_NAME)
    expect(await storedBytes(ports)).toEqual(mainBytesOf('newer-main'))
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    expect(bytesOfCopies(await workspaceBackups(ports), SET_ASIDE_PREFIX)).toEqual([secondBytes()])
    expect(await recordedSecondFile(ports)).toBeUndefined()
  })

  it('opens the new project in temporary storage and leaves the second file where it is', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')

    const result = await openSecondFileAsNew(ports, undefined, await choiceOf(ports))

    expect(handleOf(result).session.getProject().meta.name).toBe(COPY_NAME)
    expect(result).toMatchObject({ ok: true, secondFileMoved: false })
    expect(await ports.root.readFile(SECOND_PATH)).toEqual(secondBytes())
    expect(await workspaceBackups(ports)).toEqual([])
  })

  it('leaves the second file where it is when the first save of the new project fails', async () => {
    const ports = createTestPorts({ durable: true })
    await storeProject(ports, 'newer-main')
    const choice = await choiceOf(ports)
    failSaves(ports.workspace)

    const result = await openSecondFileAsNew(ports, undefined, choice)

    expect(result).toMatchObject({ ok: true, secondFileMoved: false })
    expect(await ports.root.readFile(SECOND_PATH)).toEqual(secondBytes())
    expect(await workspaceBackups(ports)).toEqual([])
  })

  it('makes the new project in the workspace for a project in a folder, and leaves the main file of the folder as it was', async () => {
    const ports = createTestPorts({ durable: true })
    const folder = await storeFolderProject(ports, 'newer-main')

    const result = await openSecondFileAsNew(ports, undefined, await choiceOf(ports))

    const handle = handleOf(result)
    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(await storedName(ports.workspace, handle.id)).toBe(COPY_NAME)
    expect(await folder.readFile(DOCUMENT_FILE)).toEqual(mainBytesOf('newer-main'))
    expect(await folder.readFile(SECOND_FILE_NAME)).toBeUndefined()
    expect(bytesOfCopies(await folderBackups(folder), SET_ASIDE_PREFIX)).toEqual([secondBytes()])
    expect(await ports.root.list(PROJECT_ID)).toEqual([])
  })

  it('gives the new project the assets of a folder project, so that none is missing', async () => {
    const ports = createTestPorts({ durable: true })
    const folder = await storeFolderProject(ports, 'newer-main')
    const imageHash = await contentHashOf(IMAGE)
    await new DirectoryAssetCache(folder).put(imageHash, IMAGE)
    await folder.writeFile(SECOND_FILE_NAME, documentReferring([imageHash]))

    const result = await openSecondFileAsNew(ports, undefined, await choiceOf(ports))

    expect(result).toMatchObject({ ok: true, missingAssets: [] })
    expect(await ports.workspace.assets(handleOf(result).id).get(imageHash)).toEqual(IMAGE)
  })

  it('gives the new project, leaves the second file and its record, and does not reject when the move of the second file fails', async () => {
    const ports = createTestPorts({ durable: true })
    await storeProject(ports, 'newer-main')
    const choice = await choiceOf(ports)
    vi.spyOn(ports.workspace, 'setAsideSecondFile').mockRejectedValueOnce(
      new Error('The disk is gone'),
    )

    const result = await openSecondFileAsNew(ports, undefined, choice)

    expect(result).toMatchObject({ ok: true, secondFileMoved: false })
    expect(await storedName(ports.workspace, handleOf(result).id)).toBe(COPY_NAME)
    expect(await ports.root.readFile(SECOND_PATH)).toEqual(secondBytes())
    expect(await recordedSecondFile(ports)).toBeDefined()
    expect(vi.mocked(console.error)).toHaveBeenCalledOnce()
  })

  it('refuses a second file that does not decode, and makes no new project', async () => {
    const ports = createTestPorts({ durable: true })
    await storeProject(ports, 'newer-main', NOT_JSON)
    const before = await treeOf(ports.root)

    const result = await openSecondFileAsNew(ports, undefined, await choiceOf(ports))

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'second-file-unreadable', decode: { kind: 'not-json' } },
      handle: undefined,
    })
    expect(await treeOf(ports.root)).toEqual(before)
  })
})
