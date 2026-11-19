import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isValidProjectId } from '../../storage'
import {
  currentBytes,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import {
  IN_WORKSPACE,
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { createNewProject } from './create-new-project'

const CURRENT_ID = 'a'

/** A handle on the stored project `a`. */
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

describe('a new project with no project open', () => {
  it('a new project gets a new id from newProjectId, and two calls give two ids', async () => {
    const ports = createTestPorts()

    const first = handleOf(await createNewProject(ports, undefined, soundProject))
    const second = handleOf(await createNewProject(ports, first, soundProject))

    expect(isValidProjectId(first.id)).toBe(true)
    expect(isValidProjectId(second.id)).toBe(true)
    expect(second.id).not.toBe(first.id)
  })

  it('nothing is stored before the first save', async () => {
    const ports = createTestPorts()

    const handle = handleOf(await createNewProject(ports, undefined, soundProject))

    expect((await ports.workspace.storedFiles(handle.id)).size).toBe(0)
    expect((await ports.workspace.list()).map((summary) => summary.id)).not.toContain(handle.id)
    expect(handle.saveStatus()).toBe('idle')
    expect(await handle.save()).toEqual({ ok: true })
    expect((await ports.workspace.list()).map((summary) => summary.id)).toContain(handle.id)
  })

  it('with no current project it opens the new one', async () => {
    const ports = createTestPorts()

    const handle = handleOf(await createNewProject(ports, undefined, soundProject))

    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(await ports.locks.heldIds()).toEqual(new Set([handle.id]))
  })

  it('the factory is called once, and the session holds its document', async () => {
    const ports = createTestPorts()
    const create = vi.fn(() => renamed(soundProject(), 'Started fresh'))

    const handle = handleOf(await createNewProject(ports, undefined, create))

    expect(create).toHaveBeenCalledTimes(1)
    expect(handle.session.getProject().meta.name).toBe('Started fresh')
  })
})

describe('a new project with a project open', () => {
  it('a project with an unsaved edit is switched with no question, and the edit is stored', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    rename(current, 'Edited just before New project')

    const result = await createNewProject(ports, current, soundProject)

    expect(handleOf(result).id).not.toBe(CURRENT_ID)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe('Edited just before New project')
  })

  it('the old project is closed and its lock is free', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)

    const handle = handleOf(await createNewProject(ports, current, soundProject))

    expect(await ports.locks.heldIds()).toEqual(new Set([handle.id]))
    expect(await current.save()).toMatchObject({ ok: false })
  })

  it('a flush that fails gives flush-failed, keeps the current project open, and locks no new id', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    failSaves(ports.workspace)
    rename(current, 'Edited before the failed New project')

    const result = await createNewProject(ports, current, soundProject)

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(current.saveStatus()).toBe('error')
  })
})
