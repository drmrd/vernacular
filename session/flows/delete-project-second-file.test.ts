import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renameProject } from '../../core'
import { settle } from '../autosave/save-gate-test-kit'
import {
  IN_FOLDER,
  createTestPorts,
  openOrThrow,
  placeDocument,
  recordOf,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import {
  SECOND_FILE_NAME,
  documentNamed,
  documentOfNewerVersionReferring,
  documentReferring,
  placeSecondFile,
} from '../handle/second-file-test-kit'
import { FIRST_ID } from './card-flows-test-kit'
import { deleteProject } from './delete-project'
import {
  EMPTY_LIBRARY,
  FOLDER_ID,
  changeRecord,
  inOrder,
  poolHashes,
  putInPool,
  storeFolderProject,
  storeUsing,
} from './delete-project-test-kit'

const DELETED_ID = FIRST_ID
const TWO_FILES_ID = 'with-two-files'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** The workspace pool holds an asset, and the project that is deleted in each test is the only one that uses it. */
async function workspaceWhereOnlyTheDeletedProjectUsesAnAsset() {
  const ports = createTestPorts()
  const asset = await putInPool(ports, 'the asset that the deleted project uses')
  await storeUsing(ports, DELETED_ID, [asset])
  return { ports, asset }
}

/** Stores two readable document files under `TWO_FILES_ID`: the main file uses `inMain`, the second file uses `inSecond`. */
async function storeTwoFilesUsing(
  ports: TestPorts,
  uses: { readonly inMain: readonly string[]; readonly inSecond: readonly string[] },
): Promise<void> {
  await placeDocument(ports, TWO_FILES_ID, documentReferring(uses.inMain))
  await placeSecondFile(ports, TWO_FILES_ID, documentReferring(uses.inSecond))
}

/** Stores a newer main file that uses `inMain`, beside a second file that this build reads and that uses nothing. */
async function storeNewerMainUsing(ports: TestPorts, inMain: string): Promise<void> {
  await placeDocument(ports, TWO_FILES_ID, documentOfNewerVersionReferring(inMain))
  await placeSecondFile(ports, TWO_FILES_ID, documentNamed('A second file with no asset'))
}

/** Opens the project with two files, then closes it, so that its record says what the open read. */
async function openAndClose(ports: TestPorts): Promise<void> {
  const handle = await openOrThrow(ports, {
    ...workspaceRequest(TWO_FILES_ID),
    keepBothFiles: true,
  })
  await handle.close()
  await settle()
}

async function deleteDeletedProject(ports: TestPorts, current?: DocumentHandle) {
  return deleteProject(ports, current, { id: DELETED_ID, libraryHashes: EMPTY_LIBRARY })
}

async function expectAssetStays(ports: TestPorts, asset: string, current?: DocumentHandle) {
  const result = await deleteDeletedProject(ports, current)

  expect(result).toMatchObject({ ok: true, removedAssets: [] })
  expect(await poolHashes(ports)).toEqual([asset])
}

describe('a delete while a project of the workspace has a second document file', () => {
  it('keeps an asset that only the second file uses, when the project was opened from its main file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await storeTwoFilesUsing(ports, { inMain: [], inSecond: [asset] })
    await openAndClose(ports)

    await expectAssetStays(ports, asset)
  })

  it('keeps an asset that only the newer main file uses, when the project was opened from its second file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await storeNewerMainUsing(ports, asset)
    await openAndClose(ports)

    await expectAssetStays(ports, asset)
  })

  it('keeps an asset that only the newer main file uses, while the project is open from its second file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await storeNewerMainUsing(ports, asset)
    const handle = await openOrThrow(ports, workspaceRequest(TWO_FILES_ID))

    await expectAssetStays(ports, asset, handle)
    await handle.close()
  })

  it('keeps an asset that only the second file uses, while the project is open from its main file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await storeTwoFilesUsing(ports, { inMain: [], inSecond: [asset] })
    const handle = await openOrThrow(ports, {
      ...workspaceRequest(TWO_FILES_ID),
      keepBothFiles: true,
    })

    await expectAssetStays(ports, asset, handle)
    await handle.close()
  })

  it('keeps an asset of a newer main file when the open project writes its pending change to a second file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await placeDocument(ports, TWO_FILES_ID, documentNamed('Readable main file'))
    const handle = await openOrThrow(ports, workspaceRequest(TWO_FILES_ID))
    await placeDocument(ports, TWO_FILES_ID, documentOfNewerVersionReferring(asset))
    handle.session.dispatch(renameProject('A change that was not saved'))

    await expectAssetStays(ports, asset, handle)

    expect(await ports.root.list(TWO_FILES_ID)).toContain(SECOND_FILE_NAME)
    await handle.close()
  })

  it('removes the files and the record of the project with two files, and removes no asset, when that project is deleted', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    const ownAsset = await putInPool(ports, 'the asset that only the main file uses')
    await storeTwoFilesUsing(ports, { inMain: [ownAsset], inSecond: [asset] })
    await openAndClose(ports)

    const result = await deleteProject(ports, undefined, {
      id: TWO_FILES_ID,
      libraryHashes: EMPTY_LIBRARY,
    })

    expect(result).toMatchObject({ ok: true, removedAssets: [] })
    expect((await ports.workspace.storedFiles(TWO_FILES_ID)).size).toBe(0)
    expect(await ports.index.get(TWO_FILES_ID)).toBeUndefined()
    expect(await poolHashes(ports)).toEqual(inOrder([asset, ownAsset]))
  })
})

describe('a delete when no project of the workspace has a second document file any more', () => {
  it('removes an asset that no project uses once the second file of the other project was taken away', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    await storeTwoFilesUsing(ports, { inMain: [], inSecond: [asset] })
    await openAndClose(ports)
    await ports.root.removeFile(`${TWO_FILES_ID}/${SECOND_FILE_NAME}`)
    await openAndClose(ports)
    expect((await recordOf(ports, TWO_FILES_ID))?.secondFile).toBeUndefined()

    const result = await deleteDeletedProject(ports)

    expect(result).toMatchObject({ ok: true, removedAssets: [asset] })
    expect(await poolHashes(ports)).toEqual([])
  })

  it('removes an asset that no project uses when the record of a folder project names a second file', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    const folder = await storeFolderProject(ports)
    await folder.writeFile(SECOND_FILE_NAME, documentNamed('A second file in the folder'))
    await changeRecord(ports, FOLDER_ID, { secondFile: { name: SECOND_FILE_NAME, read: 'main' } })

    const result = await deleteDeletedProject(ports)

    expect(result).toMatchObject({ ok: true, removedAssets: [asset] })
    expect(await poolHashes(ports)).toEqual([])
  })

  it('removes an asset that no project uses when a folder project with a second file is open in this tab', async () => {
    const { ports, asset } = await workspaceWhereOnlyTheDeletedProjectUsesAnAsset()
    const folder = await storeFolderProject(ports)
    await folder.writeFile(SECOND_FILE_NAME, documentNamed('A second file in the folder'))
    const handle = await openOrThrow(ports, {
      id: FOLDER_ID,
      location: IN_FOLDER,
      keepBothFiles: true,
    })
    expect((await recordOf(ports, FOLDER_ID))?.secondFile).toEqual({
      name: SECOND_FILE_NAME,
      read: 'main',
    })

    const result = await deleteDeletedProject(ports, handle)

    expect(result).toMatchObject({ ok: true, removedAssets: [asset] })
    expect(await poolHashes(ports)).toEqual([])
    await handle.close()
  })
})
