import { describe, it, expect } from 'vitest'
import { DirectoryAssetCache } from '../../storage'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { assetsOf } from './handle-assets'
import {
  IN_FOLDER,
  createTestPorts,
  openOrThrow,
  placeDocument,
  rememberFolder,
  workspaceRequest,
} from './handle-test-kit'

const PROJECT_ID = 'a'
const FOLDER_ID = 'in-a-folder'
const SHARED_HASH = 'a'.repeat(64)
const WRITTEN_HASH = 'b'.repeat(64)
const POOL_BYTES = Uint8Array.of(1, 2, 3)
const FOLDER_BYTES = Uint8Array.of(4, 5, 6)

describe('the asset cache of an open project', () => {
  it('assetsOf gives the shared pool for a workspace project', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    await ports.workspace.assets('another-project').put(SHARED_HASH, POOL_BYTES)

    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(await assetsOf(handle).get(SHARED_HASH)).toEqual(POOL_BYTES)
  })

  it("assetsOf gives the folder's cache for a folder project, and it reads the folder first", async () => {
    const ports = createTestPorts()
    const directory = await rememberFolder(ports, FOLDER_ID, currentBytes())
    const folderAssets = new DirectoryAssetCache(directory)
    await folderAssets.put(SHARED_HASH, FOLDER_BYTES)
    await ports.workspace.assets(FOLDER_ID).put(SHARED_HASH, POOL_BYTES)
    const handle = await openOrThrow(ports, { id: FOLDER_ID, location: IN_FOLDER })

    await assetsOf(handle).put(WRITTEN_HASH, FOLDER_BYTES)

    expect(await assetsOf(handle).get(SHARED_HASH)).toEqual(FOLDER_BYTES)
    expect(await folderAssets.has(WRITTEN_HASH)).toBe(true)
    expect(await ports.workspace.assets(FOLDER_ID).has(WRITTEN_HASH)).toBe(false)
  })

  it('assetsOf throws for an object that no open built', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    expect(() => assetsOf({ ...handle })).toThrow()
  })
})
