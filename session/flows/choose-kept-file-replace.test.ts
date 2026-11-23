// @vitest-environment node
// Hashes files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { createTestPorts } from '../handle/handle-test-kit'
import { removeSecondFile, replaceWithSecondFile } from './choose-kept-file'
import {
  REPLACED_PREFIX,
  SECOND_NAME,
  SECOND_PATH,
  SET_ASIDE_PREFIX,
  bytesOfCopies,
  choiceOf,
  keptHandleOf,
  mainBytesOf,
  recordedSecondFile,
  secondBytes,
  storeProject,
} from './choose-kept-file-test-kit'
import {
  PROJECT_ID,
  openAnotherProject,
  storedBytes,
  workspaceBackups,
} from './open-failed-test-kit'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('replacing the main file with the second file', () => {
  it('keeps a copy of the main file, makes the second file the main file, and leaves no second file', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')
    expect(await recordedSecondFile(ports)).toBeDefined()

    const result = await replaceWithSecondFile(ports, undefined, await choiceOf(ports))

    expect(result).toEqual({ ok: true, handle: undefined })
    expect(await storedBytes(ports)).toEqual(secondBytes())
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    const copies = await workspaceBackups(ports)
    expect(bytesOfCopies(copies, REPLACED_PREFIX)).toEqual([mainBytesOf('newer-main')])
    expect(bytesOfCopies(copies, SET_ASIDE_PREFIX)).toEqual([secondBytes()])
    expect(await recordedSecondFile(ports)).toBeUndefined()
  })

  it('opens the project from the main file when the choice was made before an open', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')

    const result = await replaceWithSecondFile(ports, undefined, await choiceOf(ports, true))

    const handle = keptHandleOf(result)
    expect(handle.id).toBe(PROJECT_ID)
    expect(handle.session.getProject().meta.name).toBe(SECOND_NAME)
    expect(handle.saveStatus()).not.toBe('second-file')
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('leaves the project that another card has open open, and gives that handle back', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')
    const current = await openAnotherProject(ports)

    const result = await replaceWithSecondFile(ports, current, await choiceOf(ports))

    expect(keptHandleOf(result)).toBe(current)
    expect(await storedBytes(ports)).toEqual(secondBytes())
    expect(await ports.locks.heldIds()).toEqual(new Set([current.id]))
  })
})

describe('removing the second file', () => {
  it('keeps a copy of the second file, leaves the main file as it was, and leaves no second file', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'both-readable')
    expect(await recordedSecondFile(ports)).toBeDefined()

    const result = await removeSecondFile(ports, undefined, await choiceOf(ports))

    expect(result).toEqual({ ok: true, handle: undefined })
    expect(await storedBytes(ports)).toEqual(mainBytesOf('both-readable'))
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    expect(bytesOfCopies(await workspaceBackups(ports), SET_ASIDE_PREFIX)).toEqual([secondBytes()])
    expect(await recordedSecondFile(ports)).toBeUndefined()
  })

  it('refuses a choice that was made for a newer main file, and writes nothing', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')
    const before = await treeOf(ports.root)

    const result = await removeSecondFile(ports, undefined, await choiceOf(ports))

    expect(result).toEqual({ ok: false, failure: { kind: 'files-changed' }, handle: undefined })
    expect(await treeOf(ports.root)).toEqual(before)
  })
})
