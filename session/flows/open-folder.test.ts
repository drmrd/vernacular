import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { InMemoryDirectory } from '../../storage'
import { projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  DOCUMENT_FILE,
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  pickFolder,
  placeDocument,
  recordingPorts,
  rememberFolder,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { openFolder } from './open-folder'

const CURRENT_ID = 'a'
const KNOWN_ID = 'known-folder'
const FOLDER_EMPTY = { ok: false, failure: { kind: 'folder-empty' } }

/** A directory that holds a sound document of the current version, or nothing. */
async function folderWithDocument(bytes = currentBytes()): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(DOCUMENT_FILE, bytes)
  return directory
}

/** The name of the project that the document at the root of the folder holds. */
async function folderDocumentName(directory: InMemoryDirectory): Promise<string> {
  const bytes = await directory.readFile(DOCUMENT_FILE)
  if (bytes === undefined) throw new Error('The folder holds no document')
  return projectOf(bytes).meta.name
}

/** A handle on the stored project `a` of the workspace. */
async function openCurrent(ports: TestPorts) {
  await placeDocument(ports, CURRENT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(CURRENT_ID))
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

describe('a folder that holds a project', () => {
  it('a project opened from a folder saves back to the folder', async () => {
    const ports = createTestPorts()
    const directory = await folderWithDocument()
    pickFolder(ports, directory)
    const listedBefore = await ports.workspace.list()

    const handle = handleOf(await openFolder(ports, undefined))
    rename(handle, 'Edited in the folder')
    await handle.save()

    expect(await folderDocumentName(directory)).toBe('Edited in the folder')
    expect(await ports.workspace.list()).toEqual(listedBefore)
  })

  it('a known folder opens its existing id', async () => {
    const ports = createTestPorts()
    const directory = await rememberFolder(ports, KNOWN_ID, currentBytes())
    pickFolder(ports, directory)
    const remember = vi.spyOn(ports.folders, 'remember')

    const handle = handleOf(await openFolder(ports, undefined))

    expect(handle.id).toBe(KNOWN_ID)
    expect(remember).not.toHaveBeenCalled()
  })

  it('a new folder is remembered, so a second pick of it opens the same id', async () => {
    const ports = createTestPorts()
    const directory = await folderWithDocument()
    pickFolder(ports, directory)
    const first = handleOf(await openFolder(ports, undefined))
    await first.close()
    pickFolder(ports, directory)

    const second = handleOf(await openFolder(ports, undefined))

    expect(second.id).toBe(first.id)
  })

  it('the location is the folder, with the name of the picked handle', async () => {
    const ports = createTestPorts()
    pickFolder(ports, await folderWithDocument(), 'Old house')

    const handle = handleOf(await openFolder(ports, undefined))

    expect(handle.location).toEqual({ kind: 'folder', folderName: 'Old house' })
  })

  it('an edit made just before Open folder is stored in the workspace', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    rename(current, 'Edited just before Open folder')
    pickFolder(ports, await folderWithDocument())

    await openFolder(ports, current)

    expect(await storedName(ports.workspace, CURRENT_ID)).toBe('Edited just before Open folder')
  })
})

describe('a folder that does not open', () => {
  it('a folder with no document gives folder-empty and nothing is remembered', async () => {
    const ports = createTestPorts()
    const picked = pickFolder(ports, new InMemoryDirectory())

    const result = await openFolder(ports, undefined)

    expect(result).toEqual(FOLDER_EMPTY)
    expect(await ports.folders.findKnown(picked)).toBeUndefined()
  })

  it('a cancelled pick gives cancelled and calls nothing else', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const current = await openCurrent(ports)
    rename(current, 'Edited before the cancelled pick')
    log.length = 0
    ports.folders.pickNext(undefined)
    const findKnown = vi.spyOn(ports.folders, 'findKnown')

    const result = await openFolder(ports, current)

    expect(result).toEqual({ ok: false, failure: { kind: 'cancelled' } })
    expect(findKnown).not.toHaveBeenCalled()
    expect(log).toEqual([])
  })

  it('a known folder with no document gives folder-empty and stays remembered', async () => {
    const ports = createTestPorts()
    const directory = await rememberFolder(ports, KNOWN_ID)
    const picked = pickFolder(ports, directory)

    const result = await openFolder(ports, undefined)

    expect(result).toEqual(FOLDER_EMPTY)
    expect(await ports.folders.findKnown(picked)).toBe(KNOWN_ID)
  })

  it('a folder whose document does not decode gives did-not-open, and the folder stays remembered', async () => {
    const ports = createTestPorts()
    const directory = await folderWithDocument(new TextEncoder().encode('not a document'))
    const picked = pickFolder(ports, directory)

    const result = await openFolder(ports, undefined)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-open', decode: { kind: 'not-json' } },
    })
    expect(await ports.folders.findKnown(picked)).toEqual(expect.any(String))
  })

  it('a pick that rejects gives storage-unavailable', async () => {
    const ports = createTestPorts()
    vi.spyOn(ports.folders, 'pick').mockRejectedValue(new Error('The picker failed'))

    const result = await openFolder(ports, undefined)

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: 'The picker failed' },
    })
  })
})

describe('a folder flow whose folder access fails', () => {
  it('a remember that rejects gives storage-unavailable', async () => {
    const ports = createTestPorts()
    pickFolder(ports, await folderWithDocument())
    vi.spyOn(ports.folders, 'remember').mockRejectedValue(new Error('The handle store failed'))

    const result = await openFolder(ports, undefined)

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'storage-unavailable', message: 'The handle store failed' },
    })
  })

  it('a forget that rejects after folder-empty still gives folder-empty', async () => {
    const ports = createTestPorts()
    pickFolder(ports, new InMemoryDirectory())
    vi.spyOn(ports.folders, 'forget').mockRejectedValue(new Error('The handle store failed'))

    const result = await openFolder(ports, undefined)

    expect(result).toEqual(FOLDER_EMPTY)
  })

  it('a forget that rejects after folder-empty is logged once', async () => {
    const ports = createTestPorts()
    pickFolder(ports, new InMemoryDirectory())
    vi.spyOn(ports.folders, 'forget').mockRejectedValue(new Error('The handle store failed'))

    await openFolder(ports, undefined)

    expect(console.error).toHaveBeenCalledTimes(1)
  })
})

describe('a folder opened over a current project whose flush fails', () => {
  async function openFolderOverFailingFlush() {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const realSave = ports.workspace.save.bind(ports.workspace)
    failSaves(ports.workspace)
    rename(current, 'Edited before the failed Open folder')
    const picked = pickFolder(ports, await folderWithDocument())
    const result = await openFolder(ports, current)
    const storeWorksAgain = () => {
      ports.workspace.save = realSave
    }
    return { ports, current, picked, result, storeWorksAgain }
  }

  it('gives flush-failed and keeps the folder remembered', async () => {
    const { ports, picked, result } = await openFolderOverFailingFlush()

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await ports.folders.findKnown(picked)).toEqual(expect.any(String))
  })

  it('a retry once the store works again opens the same id', async () => {
    const { ports, current, picked, storeWorksAgain } = await openFolderOverFailingFlush()
    const rememberedId = await ports.folders.findKnown(picked)
    storeWorksAgain()
    ports.folders.pickNext(picked)

    const handle = handleOf(await openFolder(ports, current))

    expect(handle.id).toBe(rememberedId)
  })
})
