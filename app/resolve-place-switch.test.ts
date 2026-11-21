import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DocumentHandle } from '../session'
import { settle } from '../session/autosave/save-gate-test-kit'
import {
  failSaves,
  openOrThrow,
  recordingPorts,
  rename,
  storedName,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import type { Place } from './address'
import { lockedIds, plantProject } from './app-test-support'
import { resolvePlace } from './resolve-place'
import type { Screen } from './resolve-place'

const CURRENT_ID = 'project-current'
const CURRENT_NAME = 'Current House'
const OTHER_ID = 'project-other'
const OTHER_NAME = 'Other House'
const MISSING_ID = 'project-missing'
const EDITED_NAME = 'Edited before the move'

const START: Place = { kind: 'start' }
const PROJECTS: Place = { kind: 'projects' }

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** The place of the project under `id`. */
function projectPlace(id: string): Place {
  return { kind: 'project', id }
}

/** The handle of a screen that must show the editor. */
function editorHandleOf(screen: Screen): DocumentHandle {
  if (screen.kind !== 'editor') {
    throw new Error(`Expected the editor, got ${JSON.stringify(screen)}`)
  }
  return screen.handle
}

/** The screen of the page that tells why the project under `id` did not open. */
function pageAfterFailure(id: string, failure: unknown) {
  return { kind: 'projects', notice: { id, failure } }
}

interface OpenProject {
  readonly ports: TestPorts
  /** Every call of the store and the locks that happened after the open, in order. */
  readonly log: string[]
  readonly current: DocumentHandle
}

/** Ports whose store holds the current project and one other, with the current project open. */
async function withCurrentProjectOpen(): Promise<OpenProject> {
  const log: string[] = []
  const ports = recordingPorts(log)
  await plantProject(ports, CURRENT_ID, CURRENT_NAME)
  await plantProject(ports, OTHER_ID, OTHER_NAME)
  const current = await openOrThrow(ports, workspaceRequest(CURRENT_ID))
  await settle()
  log.length = 0
  return { ports, log, current }
}

/** Spies on every call that reads, writes, locks, or asks the index. */
function spiesOnEveryCall(ports: TestPorts) {
  return [
    vi.spyOn(ports.workspace, 'read'),
    vi.spyOn(ports.workspace, 'list'),
    vi.spyOn(ports.workspace, 'save'),
    vi.spyOn(ports.index, 'get'),
    vi.spyOn(ports.index, 'all'),
    vi.spyOn(ports.index, 'put'),
    vi.spyOn(ports.locks, 'tryAcquire'),
    vi.spyOn(ports.folders, 'reopen'),
  ]
}

describe('an address with a project open', () => {
  it('switches to the project of another address in the order flush, open, close', async () => {
    const { ports, log, current } = await withCurrentProjectOpen()
    rename(current, EDITED_NAME)

    const screen = await resolvePlace(ports, projectPlace(OTHER_ID), current)

    expect(log).toEqual([
      `save:${CURRENT_ID}`,
      `lock:${OTHER_ID}`,
      `read:${OTHER_ID}`,
      `unlock:${CURRENT_ID}`,
    ])
    const handle = editorHandleOf(screen)
    expect(handle.id).toBe(OTHER_ID)
    expect(handle.session.getProject().meta.name).toBe(OTHER_NAME)
    expect(lockedIds(ports)).toEqual([OTHER_ID])
  })

  it('returns the current handle for the address of the current project and writes nothing', async () => {
    const { ports, current } = await withCurrentProjectOpen()
    rename(current, EDITED_NAME)
    const calls = spiesOnEveryCall(ports)

    const screen = await resolvePlace(ports, projectPlace(CURRENT_ID), current)

    expect(screen.kind).toBe('editor')
    expect(editorHandleOf(screen)).toBe(current)
    for (const call of calls) expect(call).not.toHaveBeenCalled()
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(CURRENT_NAME)
    expect(lockedIds(ports)).toEqual([CURRENT_ID])
  })

  it('leaves the current project open and shows the page with the notice when the other project does not open', async () => {
    const { ports, current } = await withCurrentProjectOpen()
    rename(current, EDITED_NAME)

    const screen = await resolvePlace(ports, projectPlace(MISSING_ID), current)

    expect(screen).toStrictEqual(pageAfterFailure(MISSING_ID, { kind: 'not-found' }))
    expect(lockedIds(ports)).toEqual([CURRENT_ID])
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(EDITED_NAME)
    expect(current.session.getProject().meta.name).toBe(EDITED_NAME)
  })

  it('leaves the current project open and opens nothing when its changes cannot be saved', async () => {
    const { ports, log, current } = await withCurrentProjectOpen()
    failSaves(ports.workspace, log)
    rename(current, EDITED_NAME)

    const screen = await resolvePlace(ports, projectPlace(OTHER_ID), current)

    expect(screen).toStrictEqual(pageAfterFailure(OTHER_ID, { kind: 'flush-failed' }))
    expect(log).toEqual([`save:${CURRENT_ID}`])
    expect(lockedIds(ports)).toEqual([CURRENT_ID])
    expect(current.saveStatus()).toBe('error')
    expect(current.session.getProject().meta.name).toBe(EDITED_NAME)
  })

  it('saves an unsaved edit of the current project before the other project opens', async () => {
    const { ports, current } = await withCurrentProjectOpen()
    rename(current, EDITED_NAME)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(CURRENT_NAME)

    const screen = await resolvePlace(ports, projectPlace(OTHER_ID), current)

    expect(editorHandleOf(screen).id).toBe(OTHER_ID)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(EDITED_NAME)
  })

  it('shows the page for the projects address and leaves the current project open', async () => {
    const { ports, log, current } = await withCurrentProjectOpen()
    rename(current, EDITED_NAME)

    const screen = await resolvePlace(ports, PROJECTS, current)

    expect(screen).toStrictEqual({ kind: 'projects' })
    expect(log).toEqual([])
    expect(lockedIds(ports)).toEqual([CURRENT_ID])
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(CURRENT_NAME)
    expect(current.session.getProject().meta.name).toBe(EDITED_NAME)
  })

  it('keeps the current project for the start address and reads nothing', async () => {
    const { ports, log, current } = await withCurrentProjectOpen()
    const calls = spiesOnEveryCall(ports)

    const screen = await resolvePlace(ports, START, current)

    expect(editorHandleOf(screen)).toBe(current)
    expect(log).toEqual([])
    for (const call of calls) expect(call).not.toHaveBeenCalled()
    expect(lockedIds(ports)).toEqual([CURRENT_ID])
  })
})
