import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileIndex } from '../session'
import type { DocumentHandle } from '../session'
import {
  IN_FOLDER,
  createTestPorts,
  openOrThrow,
  rememberFolder,
  workspaceRequest,
} from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  NEW_PROJECT_ID_PATTERN,
  documentNamed,
  folderRecord,
} from '../session/projects/rebuild-test-kit'
import {
  FAILED_ID,
  NEW_PROJECT_NAME,
  lockedIds,
  plantFailedProject,
  plantProject,
  recordIds,
  secondTab,
  storedIds,
  usedLast,
} from './app-test-support'
import { spiesOnEveryCall } from './history-navigation-test-support'
import { resolvePlace } from './resolve-place'
import type { Screen } from './resolve-place'
import {
  PROJECTS,
  START,
  editorHandleOf,
  pageAfterFailure,
  projectPlace,
} from './resolve-place-test-support'

const FOLDER_ID = 'project-folder'
const FOLDER_PROJECT_NAME = 'Kept in a folder'

/** Every handle that a test opened, so that the end of the test can close it. */
let opened: DocumentHandle[] = []

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(async () => {
  await Promise.all(opened.map((handle) => handle.close()))
  opened = []
  vi.restoreAllMocks()
})

/** The handle of a screen that must show the editor, which the end of the test closes. */
function openedHandleOf(screen: Screen): DocumentHandle {
  const handle = editorHandleOf(screen)
  opened.push(handle)
  return handle
}

/** Ports whose store holds two projects and whose index holds a record of each. */
async function portsWithTwoProjects(): Promise<TestPorts> {
  const ports = createTestPorts()
  await plantProject(ports, 'project-old', 'Old Cottage')
  await plantProject(ports, 'project-second', 'Second House')
  await reconcileIndex(ports)
  return ports
}

/** Ports with a folder remembered under `FOLDER_ID` and the only record, which names that folder. */
async function portsWithFolderProject(permission?: 'prompt' | 'denied'): Promise<TestPorts> {
  const ports = createTestPorts()
  await rememberFolder(ports, FOLDER_ID, documentNamed(FOLDER_PROJECT_NAME))
  await ports.index.put(folderRecord(FOLDER_ID))
  if (permission !== undefined) ports.folders.setPermission(FOLDER_ID, permission)
  return ports
}

describe('the start address', () => {
  it('opens the latest project for the start address', async () => {
    const ports = await portsWithTwoProjects()
    await usedLast(ports, 'project-old')

    const handle = openedHandleOf(await resolvePlace(ports, START))

    expect(handle.id).toBe('project-old')
    expect(handle.session.getProject().meta.name).toBe('Old Cottage')
    expect(lockedIds(ports)).toEqual(['project-old'])
  })

  it('opens a new project for the start address of an empty browser', async () => {
    const ports = createTestPorts()

    const handle = openedHandleOf(await resolvePlace(ports, START))

    expect(handle.id).toMatch(NEW_PROJECT_ID_PATTERN)
    expect(handle.session.getProject().meta.name).toBe(NEW_PROJECT_NAME)
    expect(lockedIds(ports)).toEqual([handle.id])
  })
})

describe('a project address', () => {
  it('opens the stored project of a project address', async () => {
    const ports = await portsWithTwoProjects()

    const handle = openedHandleOf(await resolvePlace(ports, projectPlace('project-second')))

    expect(handle.id).toBe('project-second')
    expect(handle.session.getProject().meta.name).toBe('Second House')
    expect(lockedIds(ports)).toEqual(['project-second'])
  })

  it('never makes a new project for a project address', async () => {
    const ports = createTestPorts()
    await plantProject(ports, 'project-other', 'Other House')
    const save = vi.spyOn(ports.workspace, 'save')
    const unknownIds = ['current', '3f2b8c1e-9a4d-4e57-8b1a-6c0d5e7f9a21']

    for (const id of unknownIds) {
      const screen = await resolvePlace(ports, projectPlace(id))
      expect(screen).toStrictEqual(pageAfterFailure(id, { kind: 'not-found' }))
    }

    expect(save).not.toHaveBeenCalled()
    expect(await storedIds(ports)).toEqual(['project-other'])
    expect(lockedIds(ports)).toEqual([])
  })
})

describe('the projects address', () => {
  it('shows the page with no notice for the projects address and reads nothing', async () => {
    const ports = await portsWithTwoProjects()
    const calls = spiesOnEveryCall(ports)

    const screen = await resolvePlace(ports, PROJECTS)

    expect(screen).toStrictEqual({ kind: 'projects' })
    for (const call of calls) expect(call).not.toHaveBeenCalled()
  })
})

describe('a project that does not open', () => {
  it('shows the page with the notice of a project that did not open', async () => {
    const ports = createTestPorts()
    await plantFailedProject(ports)

    const screen = await resolvePlace(ports, projectPlace(FAILED_ID))

    expect(screen).toMatchObject(pageAfterFailure(FAILED_ID, { kind: 'did-not-open' }))
    expect(screen).not.toHaveProperty('handle')
  })

  it('shows the page with the notice of a project that is open in another tab', async () => {
    const ports = createTestPorts()
    await plantProject(ports, 'project-shared', 'Shared House')
    opened.push(await openOrThrow(secondTab(ports), workspaceRequest('project-shared')))

    const screen = await resolvePlace(ports, projectPlace('project-shared'))

    expect(screen).toStrictEqual(pageAfterFailure('project-shared', { kind: 'open-elsewhere' }))
  })

  it('shows the page with the notice of an unknown id and stores nothing', async () => {
    const ports = createTestPorts()
    await plantProject(ports, 'project-a', 'House A')

    const screen = await resolvePlace(ports, projectPlace('missing'))

    expect(screen).toStrictEqual(pageAfterFailure('missing', { kind: 'not-found' }))
    expect(await storedIds(ports)).toEqual(['project-a'])
    expect(await recordIds(ports)).toEqual([])
    expect(lockedIds(ports)).toEqual([])
  })

  it('leaves no lock behind after a project did not open', async () => {
    const ports = createTestPorts()
    await plantFailedProject(ports)

    await resolvePlace(ports, projectPlace(FAILED_ID))
    await resolvePlace(ports, START)

    expect(lockedIds(ports)).toEqual([])
  })
})

describe('a project in a folder', () => {
  it.each(['prompt', 'denied'] as const)(
    'shows the page with the notice of a folder that needs permission and asks the browser nothing when access is %s',
    async (permission) => {
      const byAddress = await portsWithFolderProject(permission)
      const byStart = await portsWithFolderProject(permission)
      const askedByAddress = vi.spyOn(byAddress.folders, 'reopen')
      const askedByStart = vi.spyOn(byStart.folders, 'reopen')

      const addressed = await resolvePlace(byAddress, projectPlace(FOLDER_ID))
      const started = await resolvePlace(byStart, START)

      const expected = pageAfterFailure(FOLDER_ID, { kind: 'folder-permission' })
      expect(addressed).toStrictEqual(expected)
      expect(started).toStrictEqual(expected)
      expect(askedByAddress).not.toHaveBeenCalled()
      expect(askedByStart).not.toHaveBeenCalled()
      expect(lockedIds(byAddress)).toEqual([])
      expect(lockedIds(byStart)).toEqual([])
    },
  )

  it('opens a folder project from its record when access is granted', async () => {
    const byAddress = await portsWithFolderProject()
    const byStart = await portsWithFolderProject()

    const addressed = openedHandleOf(await resolvePlace(byAddress, projectPlace(FOLDER_ID)))
    const started = openedHandleOf(await resolvePlace(byStart, START))

    for (const handle of [addressed, started]) {
      expect(handle.id).toBe(FOLDER_ID)
      expect(handle.location).toEqual(IN_FOLDER)
      expect(handle.session.getProject().meta.name).toBe(FOLDER_PROJECT_NAME)
    }
  })
})
