import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  COPY_NAME,
  MAIN_NAME,
  SECOND_NAME,
  SET_ASIDE_PREFIX,
  bytesOfCopies,
  mainBytesOf,
  secondBytes,
} from '../session/flows/choose-kept-file-test-kit'
import { PROJECT_ID, workspaceBackups } from '../session/flows/open-failed-test-kit'
import { DOCUMENT_FILE, pickFolder } from '../session/handle/handle-test-kit'
import type { TestPorts } from '../session/handle/handle-test-kit'
import { SECOND_FILE_NAME, documentNamed } from '../session/handle/second-file-test-kit'
import { InMemoryDirectory } from '../storage'
import {
  clickCardOf,
  expectOpenProject,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  lockedIds,
  renderApp,
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
import { clickPageAction, setUpProjectsScreenTests } from './projects-screen-test-support'
import {
  KEEP_BOTH_CONTROL,
  OPEN_AS_NEW,
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  TWO_FILES_TITLE,
  chooseInTheDialog,
  expectNoDialog,
  filesOfTheProject,
  findTheTwoFilesDialog,
  portsWithTwoFiles,
  showThePageOf,
  storedFiles,
} from './two-files-dialog-test-support'

setUpProjectsScreenTests()

const CANCEL = 'Cancel'
const TWO_FILES_SENTENCE =
  'This project has two plan files. Open it from the Projects page to choose one.'

/** Renders the Projects page and clicks the card of the project `a`. */
async function clickTheCard(ports: TestPorts): Promise<void> {
  await showThePageOf(ports)
  await clickCardOf(MAIN_NAME)
}

/** The ways in that ask before a project opens: each one shows the Projects page, then the dialog. */
const WAYS_IN = [
  { way: 'a click on the card of the project', go: clickTheCard },
  {
    way: 'the start of the application',
    go: (ports: TestPorts) => {
      renderApp(ports)
    },
  },
  {
    way: 'the address of the project',
    go: (ports: TestPorts) => {
      renderAppAt(ports, addressOf(PROJECT_ID))
    },
  },
] as const satisfies readonly {
  readonly way: string
  readonly go: (ports: TestPorts) => void | Promise<void>
}[]

/** Durable ports with the project `a`, whose two plan files this build reads, and the dialog that asks first. */
async function askedBeforeTheOpen(): Promise<{ ports: TestPorts; dialog: HTMLElement }> {
  const { ports } = await portsWithTwoFiles('both-readable')
  await clickTheCard(ports)
  return { ports, dialog: await findTheTwoFilesDialog() }
}

describe('The choice before a project with two readable plan files opens', () => {
  it.each(WAYS_IN)(
    'shows the dialog with "Open and keep both plan files" and Cancel on $way, and opens no project',
    async ({ go }) => {
      const { ports } = await portsWithTwoFiles('both-readable')

      await go(ports)

      const dialog = await findTheTwoFilesDialog()
      expect(within(dialog).getByRole('button', { name: KEEP_BOTH_CONTROL })).toBeEnabled()
      expect(within(dialog).getByRole('button', { name: CANCEL })).toBeEnabled()
      expect(within(dialog).queryByRole('button', { name: 'Keep both plan files' })).toBeNull()
      expect(lockedIds(ports)).toEqual([])
      expect(await findTheProjectsPage()).toBeInTheDocument()
    },
  )

  it('"Open and keep both plan files" opens the editor on the main file and leaves both files', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()

    await chooseInTheDialog(dialog, KEEP_BOTH_CONTROL)

    await expectOpenProject(MAIN_NAME)
    expect(await storedFiles(ports)).toEqual({
      main: mainBytesOf('both-readable'),
      second: secondBytes(),
    })
  })

  it('Cancel returns to the Projects page with no notice and changes no stored file', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()
    const filesBefore = await filesOfTheProject(ports)

    await chooseInTheDialog(dialog, CANCEL)

    await expectNoDialog()
    await settleForAWhile()
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lockedIds(ports)).toEqual([])
    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })
})

describe('A choice that resolves the two plan files before the project opens', () => {
  it('Remove the second plan file opens the main file, and the second file moves to the backups', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await expectOpenProject(MAIN_NAME)
    expect(await storedFiles(ports)).toEqual({
      main: mainBytesOf('both-readable'),
      second: undefined,
    })
    expect(bytesOfCopies(await workspaceBackups(ports), SET_ASIDE_PREFIX)).toEqual([secondBytes()])
  })

  it('Replace the main file with the second plan file opens the project from it', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()

    await chooseInTheDialog(dialog, REPLACE_CONTROL)

    await expectOpenProject(SECOND_NAME)
    expect(await storedFiles(ports)).toEqual({ main: secondBytes(), second: undefined })
  })

  it('Open the second plan file as a new project opens the new project', async () => {
    const { dialog } = await askedBeforeTheOpen()

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    await expectOpenProject(COPY_NAME)
    expect(screen.queryByRole('alertdialog', { name: TWO_FILES_TITLE })).not.toBeInTheDocument()
  })
})

describe('Open folder on a folder whose two plan files this build reads', () => {
  it('shows that the project has two plan files in the notice of the page, with no dialog', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, documentNamed(MAIN_NAME))
    await folder.writeFile(SECOND_FILE_NAME, documentNamed(SECOND_NAME))
    pickFolder(ports, folder, 'Old house')
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))

    await clickPageAction('Open folder')

    expect(await findThePageAlert()).toHaveTextContent(TWO_FILES_SENTENCE)
    await settleForAWhile()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
