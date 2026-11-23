// @vitest-environment node
// Hashes files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createTestPorts,
  openOrThrow,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { removeSecondFile, replaceWithSecondFile } from './choose-kept-file'
import {
  MAIN_NAME,
  SECOND_NAME,
  SECOND_PATH,
  choiceOf,
  keptHandleOf,
  secondBytes,
  storeProject,
} from './choose-kept-file-test-kit'
import { PROJECT_ID, workspaceBackups } from './open-failed-test-kit'

const EDITED_NAME = 'Edited, not yet stored'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a choice for the project that this tab has open', () => {
  it('closes the handle, makes the choice, and gives the project opened again from the main file', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')
    const current = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    const result = await replaceWithSecondFile(ports, current, await choiceOf(ports))

    const reopened = keptHandleOf(result)
    expect(reopened).not.toBe(current)
    expect(reopened.id).toBe(PROJECT_ID)
    expect(reopened.session.getProject().meta.name).toBe(SECOND_NAME)
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
    await current.close()
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('stores its pending changes first, so that the files differ from the choice, and opens the project again', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'both-readable')
    const current = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
    rename(current, EDITED_NAME)
    const choice = await choiceOf(ports)

    const result = await removeSecondFile(ports, current, choice)

    expect(result).toMatchObject({ ok: false, failure: { kind: 'files-changed' } })
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_NAME)
    expect(await ports.root.readFile(SECOND_PATH)).toEqual(secondBytes())
    expect(await workspaceBackups(ports)).toEqual([])
    const reopened = result.handle
    expect(reopened).toBeDefined()
    expect(reopened).not.toBe(current)
    expect(reopened?.id).toBe(PROJECT_ID)
    expect(reopened?.session.getProject().meta.name).toBe(EDITED_NAME)
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('opens the project again, with the main file as it was, after a choice that had no pending changes to store', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'both-readable')
    const current = await openOrThrow(ports, workspaceRequest(PROJECT_ID))

    const result = await removeSecondFile(ports, current, await choiceOf(ports))

    const reopened = keptHandleOf(result)
    expect(reopened).not.toBe(current)
    expect(reopened.session.getProject().meta.name).toBe(MAIN_NAME)
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
  })
})
