import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { rememberFolder, type TestPorts } from '../session/handle/handle-test-kit'
import { folderRecord } from '../session/projects/rebuild-test-kit'
import type { MemoryAddressBar } from './address-bar'
import {
  documentBytes,
  editTheProject,
  expectOpenProject,
  findTheProjectsPage,
  namedProject,
  renderAppAt,
  stubCapableStorage,
  usedLast,
} from './app-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  nameOf,
  visit,
} from './history-navigation-test-support'

/** Test support: the set-up and the steps that the tests of the Projects page in the application share. */

/** The id of a project that a folder holds. */
export const FOLDER_ID = 'project-folder'

/** The name of the project that a folder holds. */
export const FOLDER_NAME = 'Folder House'

/** The line on the card of a project that another tab holds. */
export const OTHER_TAB_LINE = 'Already open in another tab.'

/** The line on the card of a folder project that needs the permission of the browser again. */
export const NEEDS_PERMISSION_LINE = 'This folder needs permission again.'

const releases: Array<() => void> = []

/** Lets `release` run at the end of the test, whatever the test did, so that no read stays held. */
export function releaseAfterTheTest(release: () => void): void {
  releases.push(release)
}

/** Registers what every test of the Projects page needs before it and after it. */
export function setUpProjectsScreenTests(): void {
  beforeEach(() => {
    stubCapableStorage()
  })
  afterEach(() => {
    for (const release of releases.splice(0)) release()
    cleanup()
    Reflect.deleteProperty(document, 'visibilityState')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })
}

/** Renders the application on `ports` at the address of the first project, and waits for its editor. */
export async function openFirstProjectOn(ports: TestPorts) {
  const rendered = renderAppAt(ports, addressOf(FIRST_ID))
  await expectOpenProject(nameOf(FIRST_ID))
  return { ports, ...rendered }
}

/** The same on durable ports that hold the first and the second project. */
export async function openFirstProject() {
  return openFirstProjectOn(await durablePortsWith(FIRST_ID, SECOND_ID))
}

/** Adds a floor to the open project and waits until the editor shows it. */
export async function addAFloor(): Promise<void> {
  await editTheProject()
  await screen.findByRole('button', { name: /2nd floor/i })
}

/** Types the address of the Projects page, as a user does who switches projects. */
export function showThePageOn(bar: MemoryAddressBar): Promise<void> {
  return visit(bar, PROJECTS_ADDRESS)
}

/** Waits until the editor shows the added floor, undoes the edit, and waits until the floor is gone. */
export async function expectTheEditAndUndoIt(): Promise<void> {
  expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /undo/i }))
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: /2nd floor/i })).not.toBeInTheDocument(),
  )
}

/** Makes the tab look as if it were in `state`, and tells the listeners of the document. */
export function changeVisibilityTo(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

/** What each link of the Projects page reads, in the order the page lists them. */
export async function textOfTheCards(): Promise<string[]> {
  const page = await findTheProjectsPage()
  return within(page)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '')
}

/** Durable ports with the first project and, used after it, a project that a folder holds. */
export async function portsWithAFolderProject(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await rememberFolder(ports, FOLDER_ID, documentBytes(namedProject(FOLDER_NAME)))
  await ports.index.put(folderRecord(FOLDER_ID, { name: FOLDER_NAME }))
  await usedLast(ports, FOLDER_ID)
  return ports
}
