import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ARCHIVE_LIMITS, InMemoryDirectory, InMemoryFolderAccess } from '../storage'
import {
  DOCUMENT_FILE,
  pickFolder,
  rememberFolder,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import { projectFileOf, unreadableFile } from './action-test-support'
import {
  chooseFromTheProjectMenu,
  documentBytes,
  expectOpenProject,
  filesUnder,
  findCardLink,
  findTheProjectsPage,
  lockedIds,
  namedProject,
  recordIds,
  renderAppAt,
  settleForAWhile,
  storedIds,
} from './app-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  durablePortsWith,
  goBack,
  nameOf,
} from './history-navigation-test-support'
import { FOLDER_EMPTY } from './open-failure-text'
import { TOO_LARGE_SENTENCE } from './open-file-action-test-support'
import {
  FOLDER_ID,
  FOLDER_NAME,
  addAFloor,
  chooseInThePicker,
  clickPageAction,
  dropOnThePage,
  expectTheEditAndUndoIt,
  namesOfThePageButtons,
  openFirstProject,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

const IMPORTED_NAME = 'Imported House'
const DIRECTORY_NAME = 'Old house'

setUpProjectsScreenTests()

/** A directory that holds the document of a project named `name`. */
async function directoryHolding(name: string): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  await directory.writeFile(DOCUMENT_FILE, documentBytes(namedProject(name)))
  return directory
}

/** Renders the application at the Projects page, once the card of the first project shows. */
async function renderThePageOn(ports: TestPorts) {
  const rendered = renderAppAt(ports, PROJECTS_ADDRESS)
  await findCardLink(nameOf(FIRST_ID))
  return rendered
}

describe('The actions of the Projects page', () => {
  it('lists New project, Import file, and Open folder, in that order', async () => {
    await renderThePageOn(await durablePortsWith(FIRST_ID))

    expect(await namesOfThePageButtons()).toEqual(['New project', 'Import file', 'Open folder'])
  })

  it('leaves out Open folder where the browser cannot open folders', async () => {
    const ports = await durablePortsWith(FIRST_ID)

    await renderThePageOn({ ...ports, folders: new InMemoryFolderAccess({ supported: false }) })

    expect(await namesOfThePageButtons()).toEqual(['New project', 'Import file'])
  })
})

describe('Importing a file from the Projects page', () => {
  async function expectTheImportOpenedACopy(ports: TestPorts): Promise<void> {
    await expectOpenProject(IMPORTED_NAME)
    await waitFor(() => expect(lockedIds(ports)).toHaveLength(1))
    const [openedId] = lockedIds(ports)
    expect([FIRST_ID, SECOND_ID]).not.toContain(openedId)
    await waitFor(async () => expect(await storedIds(ports)).toContain(openedId))
  }

  it('opens a copy of the chosen file under a new id and leaves the stored projects as they were', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const firstBefore = await filesUnder(ports.root, FIRST_ID)
    const secondBefore = await filesUnder(ports.root, SECOND_ID)
    await renderThePageOn(ports)
    chooseInThePicker(projectFileOf(namedProject(IMPORTED_NAME)))

    await clickPageAction('Import file')

    await expectTheImportOpenedACopy(ports)
    expect(await filesUnder(ports.root, FIRST_ID)).toEqual(firstBefore)
    expect(await filesUnder(ports.root, SECOND_ID)).toEqual(secondBefore)
  })

  it('imports a file that is dropped on the page in the same way', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    await renderThePageOn(ports)

    await dropOnThePage(projectFileOf(namedProject(IMPORTED_NAME)))

    await expectTheImportOpenedACopy(ports)
  })

  it('shows the refusal of a file above the size limit as an alert, and keeps the page', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await renderThePageOn(ports)
    chooseInThePicker(unreadableFile({ size: ARCHIVE_LIMITS.archiveBytes + 1 }).file)

    await clickPageAction('Import file')

    expect(await screen.findByRole('alert')).toHaveTextContent(TOO_LARGE_SENTENCE)
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(lockedIds(ports)).toEqual([])
  })
})

describe('Opening a folder from the Projects page', () => {
  it('opens the project of the picked folder and leaves a card for it', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    pickFolder(ports, await directoryHolding(FOLDER_NAME), DIRECTORY_NAME)
    const { bar } = await renderThePageOn(ports)

    await clickPageAction('Open folder')

    await expectOpenProject(FOLDER_NAME)
    await showThePageOn(bar)
    expect(await findCardLink(FOLDER_NAME)).toHaveTextContent(`Folder: ${DIRECTORY_NAME}`)
  })

  it('opens the existing entry of a folder that is already on the list', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const directory = await rememberFolder(
      ports,
      FOLDER_ID,
      documentBytes(namedProject(FOLDER_NAME)),
    )
    pickFolder(ports, directory)
    const remember = vi.spyOn(ports.folders, 'remember')
    await renderThePageOn(ports)

    await clickPageAction('Open folder')

    await expectOpenProject(FOLDER_NAME)
    expect(lockedIds(ports)).toEqual([FOLDER_ID])
    expect(remember).not.toHaveBeenCalled()
  })

  it('says that a folder with no project holds none, and adds no record', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    pickFolder(ports, new InMemoryDirectory(), DIRECTORY_NAME)
    await renderThePageOn(ports)
    const recordsBefore = await recordIds(ports)

    await clickPageAction('Open folder')

    expect(await screen.findByRole('alert')).toHaveTextContent(FOLDER_EMPTY)
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(await recordIds(ports)).toEqual(recordsBefore)
  })

  it('shows nothing when the user cancels the pick', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await renderThePageOn(ports)

    await clickPageAction('Open folder')
    await settleForAWhile()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    const page = await findTheProjectsPage()
    expect(within(page).getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(lockedIds(ports)).toEqual([])
  })
})

describe('Switching projects from the Project menu', () => {
  it('shows the page with the project still open, one move after the editor, and Back returns to it', async () => {
    const { bar } = await openFirstProject()
    await addAFloor()

    await chooseFromTheProjectMenu('Switch projects')

    const page = await findTheProjectsPage()
    expect(
      within(page).getByRole('button', { name: `Back to ${nameOf(FIRST_ID)}` }),
    ).toBeInTheDocument()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    await goBack(bar)
    await expectTheEditAndUndoIt()
  })
})
