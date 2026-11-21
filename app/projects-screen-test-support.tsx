import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { DID_NOT_OPEN } from '../editor/projects'
import { reconcileIndex } from '../session'
import { createTestPorts, rememberFolder, type TestPorts } from '../session/handle/handle-test-kit'
import type { InMemoryDirectory } from '../storage'
import { folderRecord } from '../session/projects/rebuild-test-kit'
import type { MemoryAddressBar } from './address-bar'
import {
  documentBytes,
  editTheProject,
  expectOpenProject,
  failedOpenSentence,
  findTheProjectsPage,
  namedProject,
  plantFailedProject,
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

/**
 * Lists a project that a folder holds, under `FOLDER_ID`, with `bytes` as its document and a record
 * used after every other. Gives the directory of the folder, which a later pick can choose again.
 */
export async function listFolderProject(
  ports: TestPorts,
  bytes: Uint8Array,
): Promise<InMemoryDirectory> {
  const directory = await rememberFolder(ports, FOLDER_ID, bytes)
  await ports.index.put(folderRecord(FOLDER_ID, { name: FOLDER_NAME }))
  await usedLast(ports, FOLDER_ID)
  return directory
}

/** Durable ports with the first project and, used after it, a project that a folder holds. */
export async function portsWithAFolderProject(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
  return ports
}

/** Durable ports with a project that opens and, in the index, a project that did not open. */
export async function portsWithAProjectThatDoesNotOpen(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await plantFailedProject(ports)
  await reconcileIndex(ports)
  return ports
}

/** Waits for the card that says its project did not open, and gives its link. */
export async function findTheCardThatDidNotOpen(): Promise<HTMLElement> {
  const page = await findTheProjectsPage()
  return waitFor(() => {
    const [card] = within(page)
      .getAllByRole('link')
      .filter((link) => link.textContent?.includes(DID_NOT_OPEN))
    if (card === undefined) throw new Error('No card says that its project did not open')
    return card
  })
}

/** The sentence of the notice for a stored document that a newer build wrote. */
export async function theSentenceOfANewerBuildDocument(): Promise<string> {
  const scratch = createTestPorts()
  await plantFailedProject(scratch)
  return failedOpenSentence(scratch)
}

/** Makes the file picker that Import file opens choose `file`, as a user does who picks one. */
export function chooseInThePicker(file: File): void {
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
    this: HTMLInputElement,
  ) {
    Object.defineProperty(this, 'files', { value: [file] })
    this.dispatchEvent(new Event('change'))
  })
}

/** Drops `file` on the Projects page, as a user does who drags a file over it and lets go. */
export async function dropOnThePage(file: File): Promise<void> {
  const page = await findTheProjectsPage()
  const heading = within(page).getByRole('heading', { level: 1, name: 'Projects' })
  fireEvent.dragEnter(heading, { dataTransfer: { types: ['Files'] } })
  fireEvent.drop(heading, { dataTransfer: { files: [file] } })
}

/** Clicks the page action named `name`, once the page shows. */
export async function clickPageAction(name: string): Promise<void> {
  const page = await findTheProjectsPage()
  await userEvent.click(within(page).getByRole('button', { name }))
}

/** The names of the buttons of the Projects page outside its cards, in the order the page lists them. */
export async function namesOfThePageButtons(): Promise<Array<string | null>> {
  const page = await findTheProjectsPage()
  return within(page)
    .getAllByRole('button')
    .filter((button) => button.closest('li') === null)
    .map((button) => button.textContent)
}

/** Opens the "..." menu of the card of the project named `name`, once the card shows. */
export async function openTheMenuOf(name: string): Promise<void> {
  const page = await findTheProjectsPage()
  await userEvent.click(await within(page).findByRole('button', { name: `Actions for ${name}` }))
}

/** Opens the menu of the card of the project named `name` and chooses the entry `action`. */
export async function chooseAnActionOf(name: string, action: string): Promise<void> {
  await openTheMenuOf(name)
  await userEvent.click(await screen.findByRole('menuitem', { name: action }))
}
