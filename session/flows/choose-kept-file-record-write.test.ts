// @vitest-environment node
// Hashes files with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestPorts, handleOf, openOrThrow, workspaceRequest } from '../handle/handle-test-kit'
import { openSecondFileAsNew, removeSecondFile, replaceWithSecondFile } from './choose-kept-file'
import {
  MAIN_NAME,
  SECOND_NAME,
  SECOND_PATH,
  SET_ASIDE_PREFIX,
  bytesOfCopies,
  choiceOf,
  failRecordWriteWithoutSecondFile,
  keptHandleOf,
  recordedSecondFile,
  secondBytes,
  storeProject,
} from './choose-kept-file-test-kit'
import { PROJECT_ID, workspaceBackups } from './open-failed-test-kit'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a choice whose record write fails after the files were changed', () => {
  it('still gives the new project, and reports that the second file moved, when opening the second file as a new project', async () => {
    const ports = createTestPorts({ durable: true })
    await storeProject(ports, 'newer-main')
    const choice = await choiceOf(ports)
    failRecordWriteWithoutSecondFile(ports)

    const result = await openSecondFileAsNew(ports, undefined, choice)

    expect(result).toMatchObject({ ok: true, secondFileMoved: true })
    expect(handleOf(result).id).not.toBe(PROJECT_ID)
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    expect(bytesOfCopies(await workspaceBackups(ports), SET_ASIDE_PREFIX)).toEqual([secondBytes()])
    expect(await recordedSecondFile(ports)).toBeDefined()
    expect(vi.mocked(console.warn)).toHaveBeenCalledOnce()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })

  it('still opens the project from the main file when replacing the main file before an open', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'newer-main')
    const choice = await choiceOf(ports, true)
    failRecordWriteWithoutSecondFile(ports)

    const result = await replaceWithSecondFile(ports, undefined, choice)

    const handle = keptHandleOf(result)
    expect(handle.id).toBe(PROJECT_ID)
    expect(handle.session.getProject().meta.name).toBe(SECOND_NAME)
    expect(vi.mocked(console.warn)).toHaveBeenCalledOnce()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })

  it('still opens the project again when removing the second file of a project that this tab holds', async () => {
    const ports = createTestPorts()
    await storeProject(ports, 'both-readable')
    const current = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      keepBothFiles: true,
    })
    const choice = await choiceOf(ports)
    failRecordWriteWithoutSecondFile(ports)

    const result = await removeSecondFile(ports, current, choice)

    const reopened = keptHandleOf(result)
    expect(reopened).not.toBe(current)
    expect(reopened.id).toBe(PROJECT_ID)
    expect(reopened.session.getProject().meta.name).toBe(MAIN_NAME)
    expect(await ports.root.readFile(SECOND_PATH)).toBeUndefined()
    expect(vi.mocked(console.warn)).toHaveBeenCalledOnce()
    expect(vi.mocked(console.error)).not.toHaveBeenCalled()
  })
})
