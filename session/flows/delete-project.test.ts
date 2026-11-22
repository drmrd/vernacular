import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import { settle } from '../autosave/save-gate-test-kit'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import {
  createTestPorts,
  openOrThrow,
  placeDocument,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { listProjectCards } from '../projects/project-cards'
import {
  FIRST_ID,
  NEWER_ID,
  SECOND_ID,
  addRecoveryFiles,
  holdInSecondTab,
  secondTabOf,
  storeProjectThatDoesNotOpen,
  storedBytesOf,
} from './card-flows-test-kit'
import { deleteProject } from './delete-project'
import {
  EMPTY_LIBRARY,
  FOLDER_ID,
  beforeStoreDelete,
  everythingStored,
  holdNextDelete,
  inOrder,
  poolHashes,
  putInPool,
  sharedScenario,
  storeFolderProject,
} from './delete-project-test-kit'

const EDITED_NAME = 'Edited after the delete'
const NOT_STORED_ID = 'not-stored'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const request = (id: string) => ({ id, libraryHashes: EMPTY_LIBRARY })

describe('a delete of a closed workspace project', () => {
  it('a delete leaves the stored files of every other project identical', async () => {
    const { ports } = await sharedScenario()
    await addRecoveryFiles(ports, SECOND_ID)
    const before = await storedBytesOf(ports, [SECOND_ID])

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result.ok).toBe(true)
    expect(before.get(SECOND_ID)?.size).toBeGreaterThan(0)
    expect(await storedBytesOf(ports, [SECOND_ID])).toEqual(before)
  })

  it('the store, the index, and the pool hold nothing that only the deleted project used', async () => {
    const { ports, only, shared } = await sharedScenario()

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual({ ok: true, currentClosed: false, removedAssets: [only] })
    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
    expect((await ports.workspace.list()).map((listed) => listed.id)).toEqual([SECOND_ID])
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
    expect(await poolHashes(ports)).toEqual([shared])
  })

  it('a delete of a project that another tab holds fails and leaves every file byte-identical', async () => {
    const { ports } = await sharedScenario()
    await holdInSecondTab(ports, FIRST_ID)
    const before = await everythingStored(ports)

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'open-elsewhere' }, currentClosed: false })
    expect(await everythingStored(ports)).toEqual(before)
  })

  it('no other tab can take the project while its delete runs', async () => {
    const { ports } = await sharedScenario()
    const hold = holdNextDelete(ports.workspace)

    const running = deleteProject(ports, undefined, request(FIRST_ID))
    await hold.whenStarted()
    const taken = await secondTabOf(ports).locks.tryAcquire(FIRST_ID)
    hold.release()
    const result = await running

    expect(taken).toBeUndefined()
    expect(result.ok).toBe(true)
  })

  it('the lock is free after a delete', async () => {
    const { ports } = await sharedScenario()

    await deleteProject(ports, undefined, request(FIRST_ID))

    expect([...ports.lockRegistry]).toEqual([])
  })

  it('a record that lands after the delete is dropped by the next read of the cards', async () => {
    const { ports } = await sharedScenario()
    const record = await ports.index.get(FIRST_ID)
    await deleteProject(ports, undefined, request(FIRST_ID))
    if (record !== undefined) await ports.index.put(record)

    const cards = await listProjectCards(ports)

    expect(record).toBeDefined()
    expect(cards.map((card) => card.id)).toEqual([SECOND_ID])
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
  })
})

describe('a delete of the project that is open in this tab', () => {
  it('deleting the open project ends its handle before the store removes anything', async () => {
    const { ports } = await sharedScenario()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    const seen: { saved: boolean; lockHeld: boolean }[] = []
    beforeStoreDelete(ports.workspace, async () => {
      seen.push({ saved: (await handle.save()).ok, lockHeld: ports.lockRegistry.has(FIRST_ID) })
    })

    const result = await deleteProject(ports, handle, request(FIRST_ID))

    expect(seen).toEqual([{ saved: false, lockHeld: true }])
    expect(result).toMatchObject({ ok: true, currentClosed: true })
    expect([...ports.lockRegistry]).toEqual([])
  })

  it('nothing writes the deleted project after its delete', async () => {
    const { ports } = await sharedScenario()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    rename(handle, EDITED_NAME)

    await deleteProject(ports, handle, request(FIRST_ID))
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS * 2)
    await settle()

    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
    expect((await ports.index.all()).map((record) => record.id)).toEqual([SECOND_ID])
  })
})

describe('a delete of another project than the open one', () => {
  it('keeps the open project open, and an edit after the delete still saves', async () => {
    const { ports } = await sharedScenario()
    const handle = await openOrThrow(ports, workspaceRequest(SECOND_ID))

    const result = await deleteProject(ports, handle, request(FIRST_ID))
    rename(handle, EDITED_NAME)
    const saved = await handle.save()

    expect(result).toMatchObject({ ok: true, currentClosed: false })
    expect(saved.ok).toBe(true)
    expect(await storedName(ports.workspace, SECOND_ID)).toBe(EDITED_NAME)
    await handle.close()
  })
})

describe('a delete of a project of another kind', () => {
  it('a delete of a folder project removes nothing', async () => {
    const { ports } = await sharedScenario()
    const directory = await storeFolderProject(ports)
    const before = await everythingStored(ports)
    const folderBefore = await treeOf(directory)

    const result = await deleteProject(ports, undefined, request(FOLDER_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'folder-project' }, currentClosed: false })
    expect(await everythingStored(ports)).toEqual(before)
    expect(await treeOf(directory)).toEqual(folderBefore)
    expect(await ports.folders.permission(FOLDER_ID)).toBe('granted')
  })

  it('a delete of a project that did not open works', async () => {
    const ports = createTestPorts()
    await storeProjectThatDoesNotOpen(ports)

    const result = await deleteProject(ports, undefined, request(NEWER_ID))

    expect(result.ok).toBe(true)
    expect((await ports.workspace.storedFiles(NEWER_ID)).size).toBe(0)
    expect(await ports.index.get(NEWER_ID)).toBeUndefined()
  })

  it('a delete of a project that fails the strict check works', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, FIRST_ID, documentBreakingFormatRules())

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result.ok).toBe(true)
    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
  })

  it('a delete of an id that is not stored resolves ok and removes no asset', async () => {
    const { ports, only, shared } = await sharedScenario()
    const stray = await putInPool(ports, 'that no project uses')

    const result = await deleteProject(ports, undefined, request(NOT_STORED_ID))

    expect(result).toEqual({ ok: true, currentClosed: false, removedAssets: [] })
    expect(await poolHashes(ports)).toEqual(inOrder([only, shared, stray]))
  })
})
