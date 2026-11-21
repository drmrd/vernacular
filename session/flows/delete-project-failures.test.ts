import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { failSaves, openOrThrow, rename, workspaceRequest } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import { listProjectCards } from '../projects/project-cards'
import { FIRST_ID, SECOND_ID, storedBytesOf } from './card-flows-test-kit'
import { deleteProject } from './delete-project'
import {
  EMPTY_LIBRARY,
  STEPS_OF_A_DELETE,
  everythingStored,
  expectOnlyRecoveryFilesAdded,
  failOnce,
  inOrder,
  placeFurnitureUsing,
  poolHashes,
  sharedScenario,
} from './delete-project-test-kit'

const UNSAVED_NAME = 'Edited, not yet stored'
const request = (id: string) => ({ id, libraryHashes: EMPTY_LIBRARY })

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Lets the saves of the store work again, then expects the open handle to store its project. */
async function expectHandleSavesAgain(
  ports: TestPorts,
  handle: DocumentHandle,
  realSave: TestPorts['workspace']['save'],
) {
  ports.workspace.save = realSave
  expect(await handle.save()).toEqual({ ok: true })
}

const unavailable = (error: Error) => ({
  ok: false,
  failure: { kind: 'storage-unavailable', message: expect.stringContaining(error.message) },
  currentClosed: false,
})

describe('a delete when the open project cannot be saved', () => {
  it('a delete stops when the open project cannot be saved, and removes nothing', async () => {
    const { ports, only } = await sharedScenario()
    const handle = await openOrThrow(ports, workspaceRequest(SECOND_ID))
    placeFurnitureUsing(handle, only)
    const realSave = ports.workspace.save.bind(ports.workspace)
    failSaves(ports.workspace)
    const before = await everythingStored(ports)

    const result = await deleteProject(ports, handle, request(FIRST_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' }, currentClosed: false })
    await expectOnlyRecoveryFilesAdded(ports, before, SECOND_ID)
    expect([...ports.lockRegistry]).toEqual([SECOND_ID])
    await expectHandleSavesAgain(ports, handle, realSave)
  })

  it('a hand-over that fails gives flush-failed, keeps the handle open, and keeps every stored file byte-identical', async () => {
    const { ports } = await sharedScenario()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    rename(handle, UNSAVED_NAME)
    const realSave = ports.workspace.save.bind(ports.workspace)
    failSaves(ports.workspace)
    const before = await everythingStored(ports)

    const result = await deleteProject(ports, handle, request(FIRST_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' }, currentClosed: false })
    await expectOnlyRecoveryFilesAdded(ports, before, FIRST_ID)
    expect([...ports.lockRegistry]).toEqual([FIRST_ID])
    await expectHandleSavesAgain(ports, handle, realSave)
  })
})

describe('a delete that fails part way never removes more', () => {
  it('a failed removal of the document keeps the record and every asset', async () => {
    const { ports, only, shared } = await sharedScenario()
    const error = failOnce(ports, 'removeDocument')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await ports.index.get(FIRST_ID)).toBeDefined()
    expect(await poolHashes(ports)).toEqual(inOrder([only, shared]))
  })

  it('a failed removal of the record removes no asset', async () => {
    const { ports, only, shared } = await sharedScenario()
    const error = failOnce(ports, 'removeRecord')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await poolHashes(ports)).toEqual(inOrder([only, shared]))
  })

  it('the next read of the cards drops the record of a project whose document is gone', async () => {
    const { ports } = await sharedScenario()
    failOnce(ports, 'removeRecord')
    await deleteProject(ports, undefined, request(FIRST_ID))

    const cards = await listProjectCards(ports)

    expect((await ports.workspace.storedFiles(FIRST_ID)).size).toBe(0)
    expect(cards.map((card) => card.id)).toEqual([SECOND_ID])
    expect(await ports.index.get(FIRST_ID)).toBeUndefined()
  })

  it('a failed removal of an asset leaves the files of every other project identical', async () => {
    const { ports, shared } = await sharedScenario()
    const before = await storedBytesOf(ports, [SECOND_ID])
    const error = failOnce(ports, 'removeAssets')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await storedBytesOf(ports, [SECOND_ID])).toEqual(before)
    expect(await poolHashes(ports)).toContain(shared)
  })

  it.each(['removeDocument', 'removeRecord', 'removeAssets'] as const)(
    'the lock is free after a delete that failed at the step %s',
    async (step) => {
      const { ports } = await sharedScenario()
      failOnce(ports, step)

      const result = await deleteProject(ports, undefined, request(FIRST_ID))

      expect(result.ok).toBe(false)
      expect([...ports.lockRegistry]).toEqual([])
    },
  )
})

describe('a delete when a read fails', () => {
  it('a failed read of the stored projects removes nothing', async () => {
    const { ports } = await sharedScenario()
    const before = await everythingStored(ports)
    const error = failOnce(ports, 'listStore')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await everythingStored(ports)).toEqual(before)
    expect([...ports.lockRegistry]).toEqual([])
  })

  it('a failed read of the index removes nothing', async () => {
    const { ports } = await sharedScenario()
    const before = await everythingStored(ports)
    const error = failOnce(ports, 'readIndex')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await everythingStored(ports)).toEqual(before)
    expect([...ports.lockRegistry]).toEqual([])
  })
})

describe('a delete when a port throws', () => {
  it('a lock that throws gives storage-unavailable and removes nothing', async () => {
    const { ports } = await sharedScenario()
    const before = await everythingStored(ports)
    const error = failOnce(ports, 'takeLock')

    const result = await deleteProject(ports, undefined, request(FIRST_ID))

    expect(result).toEqual(unavailable(error))
    expect(await everythingStored(ports)).toEqual(before)
  })

  it.each(STEPS_OF_A_DELETE)('the flow resolves when the step %s throws', async (step) => {
    const { ports } = await sharedScenario()
    const error = failOnce(ports, step)

    await expect(deleteProject(ports, undefined, request(FIRST_ID))).resolves.toEqual(
      unavailable(error),
    )
  })
})
