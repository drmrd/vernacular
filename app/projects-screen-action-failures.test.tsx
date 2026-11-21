import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DocumentDecodeError, InMemoryDirectory } from '../storage'
import { failSaves, pickFolder, type TestPorts } from '../session/handle/handle-test-kit'
import { projectFileOf } from './action-test-support'
import {
  FAILED_ID,
  backToTheProject,
  documentBytes,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  lockedIds,
  namedProject,
  plantFailedProject,
  projectFromANewerBuild,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  addressOf,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import { FOLDER_EMPTY, OPEN_ELSEWHERE, SAVE_FAILED_DURING_SWITCH } from './open-failure-text'
import {
  FOLDER_ID,
  FOLDER_NAME,
  OTHER_TAB_LINE,
  addAFloor,
  chooseInThePicker,
  clickPageAction,
  dropOnThePage,
  expectTheEditAndUndoIt,
  findTheCardThatDidNotOpen,
  listFolderProject,
  openFirstProjectOn,
  portsWithAProjectThatDoesNotOpen,
  setUpProjectsScreenTests,
  showThePageOn,
  theSentenceOfANewerBuildDocument,
} from './projects-screen-test-support'

setUpProjectsScreenTests()

const DID_NOT_OPEN_LINE = 'This project did not open.'
const NOT_A_PROJECT_REASON = new DocumentDecodeError({ kind: 'not-a-project' }).message

/** Renders the page with a notice up: the card of a project that did not open was clicked. */
async function renderThePageWithANotice(ports: TestPorts): Promise<void> {
  renderAppAt(ports, PROJECTS_ADDRESS)
  await userEvent.click(await findTheCardThatDidNotOpen())
  await findThePageAlert()
}

/** Imports `file` from the page the way a user does: through the picker of Import file, or by a drop. */
async function importTheFile(
  file: File,
  way: 'chosen in the picker' | 'dropped on the page',
): Promise<void> {
  if (way === 'dropped on the page') return dropOnThePage(file)
  chooseInThePicker(file)
  return clickPageAction('Import file')
}

describe('Open folder beside an open project, on a listed folder whose document does not decode', () => {
  it('shows the reason in the one alert of the page, marks the card, and keeps the edit', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const directory = await listFolderProject(ports, projectFromANewerBuild())
    const { bar } = await openFirstProjectOn(ports)
    await addAFloor()
    await showThePageOn(bar)
    await findCardLink(FOLDER_NAME)
    pickFolder(ports, directory)

    await clickPageAction('Open folder')

    expect(await findThePageAlert()).toHaveTextContent(await theSentenceOfANewerBuildDocument())
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    await waitFor(async () =>
      expect(await findCardLink(FOLDER_NAME)).toHaveTextContent(DID_NOT_OPEN_LINE),
    )
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })
})

describe('Open folder after a start that failed, on a listed folder that another tab holds', () => {
  it('shows the sentence in one alert inside the page and keeps the line on the card', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await plantFailedProject(ports)
    const directory = await listFolderProject(ports, documentBytes(namedProject(FOLDER_NAME)))
    ports.lockRegistry.add(FOLDER_ID)
    renderAppAt(ports, addressOf(FAILED_ID))
    expect(await findCardLink(FOLDER_NAME)).toHaveTextContent(OTHER_TAB_LINE)
    pickFolder(ports, directory)

    await clickPageAction('Open folder')
    await settleForAWhile()

    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(await findThePageAlert()).toHaveTextContent(OPEN_ELSEWHERE)
    expect(await findCardLink(FOLDER_NAME)).toHaveTextContent(OTHER_TAB_LINE)
  })
})

describe('A page notice that is up when the user starts another try', () => {
  it('is gone when Open folder is chosen and the pick is cancelled', async () => {
    await renderThePageWithANotice(await portsWithAProjectThatDoesNotOpen())

    await clickPageAction('Open folder')
    await settleForAWhile()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each(['chosen in the picker', 'dropped on the page'] as const)(
    'is replaced by the one toast of a file that does not import, %s',
    async (way) => {
      await renderThePageWithANotice(await portsWithAProjectThatDoesNotOpen())

      await importTheFile(new File(['not a project'], 'broken.building'), way)
      await settleForAWhile()

      const alerts = screen.getAllByRole('alert')
      expect(alerts).toHaveLength(1)
      expect(alerts[0]).toHaveTextContent(`Open failed: ${NOT_A_PROJECT_REASON}`)
    },
  )
})

describe('Import file beside an open project whose save fails', () => {
  it('shows the save sentence in the one alert of the page, and keeps the page and the project', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const { bar } = await openFirstProjectOn(ports)
    await addAFloor()
    failSaves(ports.workspace)
    await showThePageOn(bar)
    chooseInThePicker(projectFileOf(namedProject('Imported House')))

    await clickPageAction('Import file')

    expect(await findThePageAlert()).toHaveTextContent(SAVE_FAILED_DURING_SWITCH)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    const page = await findTheProjectsPage()
    expect(within(page).getByRole('button', { name: 'Open folder' })).toBeInTheDocument()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })
})

describe('Open folder on a folder that holds no project', () => {
  it('shows the toast and then reads the cards once', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    pickFolder(ports, new InMemoryDirectory(), 'Old house')
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))
    const heldIds = vi.spyOn(ports.locks, 'heldIds')
    const readsBefore = heldIds.mock.calls.length

    await clickPageAction('Open folder')

    expect(await screen.findByRole('alert')).toHaveTextContent(FOLDER_EMPTY)
    await waitFor(() => expect(heldIds).toHaveBeenCalledTimes(readsBefore + 1))
    await settleForAWhile()
    expect(heldIds).toHaveBeenCalledTimes(readsBefore + 1)
  })
})
