import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEmptyProject, decodeDocument } from '../../core'
import { DocumentStore } from '../documents/document-store'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { freshDatabaseName, registerDatabaseCleanup } from '../indexeddb/legacy-records-test-kit'
import { FolderFiles } from '../project-files/folder-files'
import { DirectoryHandleStore } from './directory-handle-store'
import { BrowserFolderAccess } from './folder-access'

registerDatabaseCleanup()

const PROJECT_FILE = 'vernacular.json'
const ASSET_HASH = 'ab'.repeat(32)
const ASSET_BYTES = Uint8Array.of(7, 8, 9)
const FOLDER_ID = 'a'
const OTHER_ID = 'b'

let scratchName = ''
let scratch: FileSystemDirectoryHandle

beforeEach(async () => {
  const root = await navigator.storage.getDirectory()
  scratchName = `vernacular-folder-access-test-${crypto.randomUUID()}`
  scratch = await root.getDirectoryHandle(scratchName, { create: true })
})

afterEach(async () => {
  const root = await navigator.storage.getDirectory()
  await root.removeEntry(scratchName, { recursive: true })
})

/** A handle of a folder in this test's own scratch folder; each call makes a new handle object. */
function folderNamed(name: string): Promise<FileSystemDirectoryHandle> {
  return scratch.getDirectoryHandle(name, { create: true })
}

/** What a reopened folder gives, with a failure if it gave a refusal instead of files. */
async function filesOf(access: BrowserFolderAccess, id: string): Promise<FolderFiles> {
  const result = await access.reopen(id)
  if (typeof result === 'string') throw new Error(`Expected files but got "${result}".`)
  return result
}

/** An access over a fresh handle store that already remembers a folder under `FOLDER_ID`. */
async function accessRemembering(
  folderName: string,
  options?: { shared: InMemoryAssetCache },
): Promise<BrowserFolderAccess> {
  const access = new BrowserFolderAccess(new DirectoryHandleStore(freshDatabaseName()), options)
  await access.remember(FOLDER_ID, await folderNamed(folderName))
  return access
}

function describeHandleStore(): void {
  it('gives back a stored directory handle as the same entry', async () => {
    const store = new DirectoryHandleStore(freshDatabaseName())
    const handle = await folderNamed('house')

    await store.put(FOLDER_ID, handle)

    const stored = await store.get(FOLDER_ID)
    expect(await stored?.isSameEntry(handle)).toBe(true)
  })

  it('lists every stored id with its handle', async () => {
    const store = new DirectoryHandleStore(freshDatabaseName())
    const first = await folderNamed('first')
    const second = await folderNamed('second')
    await store.put(FOLDER_ID, first)
    await store.put(OTHER_ID, second)

    const entries = (await store.entries()).sort((a, b) => a.id.localeCompare(b.id))

    expect(entries.map((entry) => entry.id)).toEqual([FOLDER_ID, OTHER_ID])
    expect(await entries[0]?.handle.isSameEntry(first)).toBe(true)
    expect(await entries[1]?.handle.isSameEntry(second)).toBe(true)
  })

  it('shows its handles to a second store over the same database', async () => {
    const name = freshDatabaseName()
    const handle = await folderNamed('house')
    await new DirectoryHandleStore(name).put(FOLDER_ID, handle)

    const stored = await new DirectoryHandleStore(name).get(FOLDER_ID)

    expect(await stored?.isSameEntry(handle)).toBe(true)
  })

  it('takes one handle away on remove and keeps the others', async () => {
    const store = new DirectoryHandleStore(freshDatabaseName())
    await store.put(FOLDER_ID, await folderNamed('first'))
    await store.put(OTHER_ID, await folderNamed('second'))

    await store.remove(FOLDER_ID)

    expect(await store.get(FOLDER_ID)).toBeUndefined()
    expect((await store.entries()).map((entry) => entry.id)).toEqual([OTHER_ID])
  })

  it('gives nothing for an id that was never stored', async () => {
    expect(await new DirectoryHandleStore(freshDatabaseName()).get('none')).toBeUndefined()
  })
}

function describeKnownFolders(): void {
  it('finds the id of a second handle of the same folder', async () => {
    const access = await accessRemembering('house')

    expect(await access.findKnown(await folderNamed('house'))).toBe(FOLDER_ID)
  })

  it('finds nothing for the handle of another folder', async () => {
    const access = await accessRemembering('house')

    expect(await access.findKnown(await folderNamed('barn'))).toBeUndefined()
  })

  it('grants access to a remembered folder of the origin private file system', async () => {
    const access = await accessRemembering('house')

    expect(await access.permission(FOLDER_ID)).toBe('granted')
  })

  it('reports an id that was never remembered as missing', async () => {
    const access = await accessRemembering('house')

    expect(await access.permission('none')).toBe('missing')
  })
}

function describeReopening(): void {
  it('gives the files of a remembered folder', async () => {
    const access = await accessRemembering('house')

    expect(await access.reopen(FOLDER_ID)).toBeInstanceOf(FolderFiles)
  })

  it('writes the saved document into the real folder', async () => {
    const folder = await folderNamed('house')
    const access = new BrowserFolderAccess(new DirectoryHandleStore(freshDatabaseName()))
    await access.remember(FOLDER_ID, folder)
    const project = createEmptyProject({
      name: 'House',
      units: 'metric',
      period: 'craftsman',
      appVersion: '0.1.0',
    })

    await new DocumentStore(await filesOf(access, FOLDER_ID)).save(FOLDER_ID, project)

    const file = await (await folder.getFileHandle(PROJECT_FILE)).getFile()
    expect(decodeDocument(new Uint8Array(await file.arrayBuffer())).ok).toBe(true)
  })

  it('reports an id that was never remembered as missing on reopen', async () => {
    const access = await accessRemembering('house')

    expect(await access.reopen('none')).toBe('missing')
  })

  it('reads an asset from the shared pool when the folder holds none', async () => {
    const shared = new InMemoryAssetCache()
    await shared.put(ASSET_HASH, ASSET_BYTES)
    const access = await accessRemembering('house', { shared })

    const assets = (await filesOf(access, FOLDER_ID)).assetsFor(FOLDER_ID)

    expect(await assets.get(ASSET_HASH)).toEqual(ASSET_BYTES)
    expect(await assets.has(ASSET_HASH)).toBe(false)
  })
}

function describeForgetting(): void {
  it('reports a forgotten folder as missing for permission and reopen', async () => {
    const access = await accessRemembering('house')

    await access.forget(FOLDER_ID)

    expect(await access.permission(FOLDER_ID)).toBe('missing')
    expect(await access.reopen(FOLDER_ID)).toBe('missing')
  })

  it('finds nothing for a folder that was forgotten', async () => {
    const access = await accessRemembering('house')

    await access.forget(FOLDER_ID)

    expect(await access.findKnown(await folderNamed('house'))).toBeUndefined()
  })
}

describe('DirectoryHandleStore on real directory handles', describeHandleStore)
describe('BrowserFolderAccess finding known folders', describeKnownFolders)
describe('BrowserFolderAccess reopening a real folder', describeReopening)
describe('BrowserFolderAccess forgetting a real folder', describeForgetting)
