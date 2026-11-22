import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import {
  createTestPorts,
  hideTimesOfChange,
  openOrThrow,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { FIRST_ID, SECOND_ID } from './card-flows-test-kit'
import { deleteProject } from './delete-project'
import {
  EMPTY_LIBRARY,
  FOLDER_ID,
  changeRecord,
  inOrder,
  placeFurnitureUsing,
  poolHashes,
  putInPool,
  sharedScenario,
  storeFolderProject,
  storeUsing,
} from './delete-project-test-kit'

const OPEN_ID = 'open'
const AN_OLDER_TIME = '2000-01-01T00:00:00.000Z'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const request = (id: string, libraryHashes: ReadonlySet<string> = EMPTY_LIBRARY) => ({
  id,
  libraryHashes,
})
const requestWithoutLibrary = (id: string) => ({ id, libraryHashes: undefined })

describe('which assets a delete removes', () => {
  it('an asset that another project uses stays', async () => {
    const { ports, only, shared } = await sharedScenario()

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toMatchObject({ ok: true, removedAssets: [only] })
    expect(await poolHashes(ports)).toEqual([shared])
  })

  it('an asset that the library holds stays', async () => {
    const { ports, only, shared } = await sharedScenario()

    const result = await deleteProject(ports, undefined, request(FIRST_ID, new Set([only])))

    expect(result).toMatchObject({ ok: true, removedAssets: [] })
    expect(await poolHashes(ports)).toEqual(inOrder([only, shared]))
  })

  it('library hashes that are not known remove no asset', async () => {
    const { ports, only, shared } = await sharedScenario()

    const result = await deleteProject(ports, undefined, requestWithoutLibrary(FIRST_ID))

    expect(result).toMatchObject({ ok: true, removedAssets: [] })
    expect(await poolHashes(ports)).toEqual(inOrder([only, shared]))
    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
  })
})

describe('a delete when another project has an asset list that cannot be trusted', () => {
  async function expectNoAssetRemoved(ports: TestPorts) {
    const before = await poolHashes(ports)

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual({ ok: true, currentClosed: false, removedAssets: [] })
    expect(before).toHaveLength(2)
    expect(await poolHashes(ports)).toEqual(before)
    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
  }

  it('a workspace id with no record blocks every asset removal', async () => {
    const { ports } = await sharedScenario()
    await ports.index.remove(SECOND_ID)

    await expectNoAssetRemoved(ports)
  })

  it('a record older than its stored document blocks every asset removal', async () => {
    const { ports } = await sharedScenario()
    await changeRecord(ports, SECOND_ID, { lastChangedAt: AN_OLDER_TIME })

    await expectNoAssetRemoved(ports)
  })

  it('a record with an incomplete asset list blocks every asset removal', async () => {
    const { ports } = await sharedScenario()
    await changeRecord(ports, SECOND_ID, { assetListComplete: false })

    await expectNoAssetRemoved(ports)
  })

  it('a project whose time of change cannot be read blocks every asset removal', async () => {
    const { ports } = await sharedScenario()
    hideTimesOfChange(ports)

    await expectNoAssetRemoved(ports)
  })
})

describe('a delete while a project is open in this tab', () => {
  it('an asset that the open project added and had not saved stays', async () => {
    const ports = createTestPorts()
    const only = await putInPool(ports, 'only the deleted project uses')
    const unsaved = await putInPool(ports, 'that the open project added')
    await storeUsing(ports, OPEN_ID, [])
    await storeUsing(ports, FIRST_ID, [only, unsaved])
    const handle = await openOrThrow(ports, workspaceRequest(OPEN_ID))
    placeFurnitureUsing(handle, unsaved)

    const result = await deleteProject(ports, handle, request(FIRST_ID))

    expect(result).toMatchObject({ ok: true, currentClosed: false, removedAssets: [only] })
    expect(await poolHashes(ports)).toEqual([unsaved])
    await handle.close()
  })
})

describe('a delete next to a folder project', () => {
  it('a delete of a workspace project leaves every file of a listed folder project byte-identical', async () => {
    const { ports } = await sharedScenario()
    const directory = await storeFolderProject(ports)
    const before = await treeOf(directory)

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result.ok).toBe(true)
    expect(Object.keys(before).length).toBeGreaterThan(0)
    expect(await treeOf(directory)).toEqual(before)
    expect(await ports.index.get(FOLDER_ID)).toBeDefined()
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })
})
