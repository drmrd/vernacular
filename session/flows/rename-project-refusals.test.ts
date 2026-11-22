import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openOrThrow, rename, workspaceRequest } from '../handle/handle-test-kit'
import {
  FIRST_ID,
  SECOND_ID,
  holdInSecondTab,
  placeProjectThatDoesNotOpen,
  storeTwoProjects,
  storedBytesOf,
} from './card-flows-test-kit'
import { renameProject } from './rename-project'

const NEW_NAME = 'Renamed House'
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

describe('a rename that cannot open its project', () => {
  it('of a project that another tab holds leaves every stored file byte-identical', async () => {
    const ports = await storeTwoProjects()
    await holdInSecondTab(ports, SECOND_ID)
    const filesBefore = await storedBytesOf(ports, [FIRST_ID, SECOND_ID])
    const recordsBefore = await ports.index.all()

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result).toEqual({ ok: false, failure: { kind: 'open-elsewhere' } })
    expect(await storedBytesOf(ports, [FIRST_ID, SECOND_ID])).toEqual(filesBefore)
    expect(await ports.index.all()).toEqual(recordsBefore)
  })

  it('keeps the open project and its unsaved edit', async () => {
    const ports = await storeTwoProjects()
    const handle = await openOrThrow(ports, workspaceRequest(FIRST_ID))
    rename(handle, EDITED_NAME)
    await holdInSecondTab(ports, SECOND_ID)

    const result = await renameProject(ports, handle, { id: SECOND_ID, name: NEW_NAME })

    expect(result.ok).toBe(false)
    expect(handle.session.getProject().meta.name).toBe(EDITED_NAME)
    expect(await ports.locks.heldIds()).toEqual(new Set([FIRST_ID, SECOND_ID]))
    expect(await handle.save()).toEqual({ ok: true })
    await handle.close()
  })

  it('gives not-found for a project that is not stored', async () => {
    const ports = await storeTwoProjects()

    const result = await renameProject(ports, undefined, { id: 'never-stored', name: NEW_NAME })

    expect(result).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('gives did-not-open for a project that a newer build wrote', async () => {
    const ports = await storeTwoProjects()
    await placeProjectThatDoesNotOpen(ports, 'from-a-newer-build')

    const result = await renameProject(ports, undefined, {
      id: 'from-a-newer-build',
      name: NEW_NAME,
    })

    expect(result).toMatchObject({ ok: false, failure: { kind: 'did-not-open' } })
  })

  it('resolves with a failure when the ports throw', async () => {
    const ports = await storeTwoProjects()
    vi.spyOn(ports.locks, 'tryAcquire').mockRejectedValue(new Error('The lock port failed'))

    const result = await renameProject(ports, undefined, { id: SECOND_ID, name: NEW_NAME })

    expect(result.ok).toBe(false)
  })
})
