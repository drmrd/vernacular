import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InMemoryDirectory } from '../../storage'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  DOCUMENT_FILE,
  createTestPorts,
  handleOf,
  openOrThrow,
  rename,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { FIRST_ID, holdInSecondTab } from './card-flows-test-kit'
import {
  FOLDER_ID,
  everythingStored,
  failOnce,
  sharedScenario,
  storeFolderProject,
} from './delete-project-test-kit'
import { openRecent } from './open-recent'
import { removeFolderFromList } from './remove-folder-from-list'

const SAVED_NAME = 'Saved into the folder first'
const DISK_FULL_MESSAGE = 'the folder cannot be written'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Workspace projects, a folder project, and the folder's directory. */
async function portsWithAFolder() {
  const { ports } = await sharedScenario()
  const directory = await storeFolderProject(ports)
  return { ports, directory }
}

/** The name of the project that the document at the root of the folder holds. */
async function nameInFolder(directory: InMemoryDirectory) {
  const bytes = await directory.readFile(DOCUMENT_FILE)
  if (bytes === undefined) throw new Error('The folder holds no document')
  return projectOf(bytes).meta.name
}

async function openFolderProject(ports: TestPorts) {
  return handleOf(await openRecent(ports, undefined, FOLDER_ID))
}

describe('removing a folder project from the list', () => {
  it('removing a folder from the list leaves every file of the folder byte-identical', async () => {
    const { ports, directory } = await portsWithAFolder()
    const before = await treeOf(directory)

    const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(result).toEqual({ ok: true, currentClosed: false })
    expect(Object.keys(before).length).toBeGreaterThan(0)
    expect(await treeOf(directory)).toEqual(before)
  })

  it('removing a folder from the list forgets the folder and the record', async () => {
    const { ports } = await portsWithAFolder()

    await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(await ports.folders.permission(FOLDER_ID)).toBe('missing')
    expect(await ports.index.get(FOLDER_ID)).toBeUndefined()
    expect(await ports.index.get(FIRST_ID)).toBeDefined()
  })

  it('leaves the workspace store and the pool byte-identical', async () => {
    const { ports } = await portsWithAFolder()
    const before = (await everythingStored(ports)).files

    await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect((await everythingStored(ports)).files).toEqual(before)
  })

  it('frees the lock afterward', async () => {
    const { ports } = await portsWithAFolder()

    await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect([...ports.lockRegistry]).toEqual([])
  })
})

describe('removing the folder project that is open in this tab', () => {
  it('the open folder project is saved to its folder before it leaves the list', async () => {
    const { ports, directory } = await portsWithAFolder()
    const handle = await openFolderProject(ports)
    rename(handle, SAVED_NAME)

    const result = await removeFolderFromList(ports, handle, FOLDER_ID)

    expect(result).toEqual({ ok: true, currentClosed: true })
    expect(await nameInFolder(directory)).toBe(SAVED_NAME)
    expect(await ports.folders.permission(FOLDER_ID)).toBe('missing')
    expect(await ports.index.get(FOLDER_ID)).toBeUndefined()
    expect([...ports.lockRegistry]).toEqual([])
  })

  it('a folder stays in the list when its open project cannot be saved', async () => {
    const { ports, directory } = await portsWithAFolder()
    const handle = await openFolderProject(ports)
    rename(handle, SAVED_NAME)
    vi.spyOn(directory, 'writeFile').mockRejectedValue(new Error(DISK_FULL_MESSAGE))

    const result = await removeFolderFromList(ports, handle, FOLDER_ID)

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' }, currentClosed: false })
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
    expect(await ports.index.get(FOLDER_ID)).toBeDefined()
    expect(ports.lockRegistry.has(FOLDER_ID)).toBe(true)
  })
})

describe('removing a project that cannot be removed from the list', () => {
  it('a folder that another tab holds gives open-elsewhere, and nothing is forgotten', async () => {
    const { ports } = await portsWithAFolder()
    await holdInSecondTab(ports, FOLDER_ID)
    const before = await everythingStored(ports)

    const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(result).toEqual({ ok: false, failure: { kind: 'open-elsewhere' }, currentClosed: false })
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
    expect(await everythingStored(ports)).toEqual(before)
  })

  it('a workspace project gives workspace-project, and nothing is touched', async () => {
    const { ports } = await portsWithAFolder()
    const before = await everythingStored(ports)

    const result = await removeFolderFromList(ports, undefined, FIRST_ID)

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'workspace-project' },
      currentClosed: false,
    })
    expect(await everythingStored(ports)).toEqual(before)
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })

  it('removing an id with no record that is the open workspace project gives workspace-project and keeps the handle open', async () => {
    const { ports } = await portsWithAFolder()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    await ports.index.remove(FIRST_ID)
    const before = await everythingStored(ports)

    const result = await removeFolderFromList(ports, handle, FIRST_ID)

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'workspace-project' },
      currentClosed: false,
    })
    expect(await everythingStored(ports)).toEqual(before)
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
    expect(ports.lockRegistry.has(FIRST_ID)).toBe(true)
    expect(await handle.save()).toEqual({ ok: true })
  })
})

describe('removing a folder project when a step fails', () => {
  const unavailable = (error: Error) => ({
    ok: false,
    failure: { kind: 'storage-unavailable', message: expect.stringContaining(error.message) },
    currentClosed: false,
  })

  it('a failed read of the record gives storage-unavailable, and nothing is forgotten', async () => {
    const { ports } = await portsWithAFolder()
    const error = failOnce(ports, 'readRecord')

    const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(result).toEqual(unavailable(error))
    expect(await ports.index.get(FOLDER_ID)).toBeDefined()
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })

  it('a failed forget keeps the record', async () => {
    const { ports } = await portsWithAFolder()
    const error = failOnce(ports, 'forgetFolder')

    const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(result).toEqual(unavailable(error))
    expect(await ports.index.get(FOLDER_ID)).toBeDefined()
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })

  it('a failed record removal after the forget gives storage-unavailable', async () => {
    const { ports } = await portsWithAFolder()
    const error = failOnce(ports, 'removeRecord')

    const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

    expect(result).toEqual(unavailable(error))
    expect(await ports.folders.permission(FOLDER_ID)).toBe('missing')
  })

  it.each(['forgetFolder', 'removeRecord'] as const)(
    'frees the lock after a failure at the step %s',
    async (step) => {
      const { ports } = await portsWithAFolder()
      failOnce(ports, step)

      const result = await removeFolderFromList(ports, undefined, FOLDER_ID)

      expect(result.ok).toBe(false)
      expect([...ports.lockRegistry]).toEqual([])
    },
  )

  it('resolves when the lock port throws', async () => {
    const ports = createTestPorts()
    await storeFolderProject(ports)
    const error = failOnce(ports, 'takeLock')

    await expect(removeFolderFromList(ports, undefined, FOLDER_ID)).resolves.toEqual(
      unavailable(error),
    )
  })
})
