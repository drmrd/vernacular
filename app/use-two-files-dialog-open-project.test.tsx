import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { COPY_NAME, MAIN_NAME, SECOND_PATH } from '../session/flows/choose-kept-file-test-kit'
import { documentNamed } from '../session/handle/second-file-test-kit'
import { NOT_JSON } from '../tests/storage/conformance/conformance-documents'
import {
  expectOpenProject,
  findThePageAlert,
  lockedIds,
  openProjectName,
  recordIds,
  settleForAWhile,
} from './app-test-support'
import {
  KEEP_BOTH,
  MAIN_STORED_AT,
  OPEN_AS_NEW,
  QUIET_ID,
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  REWRITTEN_AT,
  REWRITTEN_NAME,
  bothReadableSentence,
  chooseInTheDialog,
  expectNoDialog,
  expectNoLineOfTheSecondFile,
  expectTheDialogToSay,
  expectTheTabToHoldTheProject,
  expectThePageToStay,
  holdAnotherProject,
  holdTheProject,
  letAnotherTabTakeTheLockWhenItIsFreed,
  openTheDialogOverTheProject,
  openTheTwoFilesDialog,
  portsWithAFolderProjectInTwoFiles,
  portsWithTwoFiles,
} from './two-files-dialog-test-support'
import { setUpProjectsScreenTests } from './projects-screen-test-support'

setUpProjectsScreenTests()

const SECOND_FILE_UNREADABLE_REASON = 'The second plan file could not be read.'
const SECOND_FILE_UNREADABLE_NOTICE = `Could not change the plan files: ${SECOND_FILE_UNREADABLE_REASON}`
const ONE_MISSING_ASSET =
  'Vernacular could not find 1 of the assets this project uses. It shows as missing.'
const ANY_MISSING_ASSET = /Vernacular could not find \d+ of the assets this project uses\./

describe('A choice between the two plan files, over the project that this tab holds', () => {
  it('Open the second plan file as a new project, refused for a second plan file that cannot be read, keeps the page with the notice and the project open', async () => {
    const held = await holdTheProject('both-readable', NOT_JSON)
    const entries = [...held.bar.entries()]
    const dialog = await openTheDialogOverTheProject(held)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    expect(await findThePageAlert()).toHaveTextContent(SECOND_FILE_UNREADABLE_REASON)
    await expectNoDialog()
    expectThePageToStay(held, entries)
    await expectTheTabToHoldTheProject(held)
  })

  it('Open the second plan file as a new project, refused for a file that changed, shows the dialog again and keeps the project open', async () => {
    const held = await holdTheProject('both-readable')
    const entries = [...held.bar.entries()]
    const dialog = await openTheDialogOverTheProject(held)
    await held.rewriteTheSecondFile(documentNamed(REWRITTEN_NAME), REWRITTEN_AT)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    await expectTheDialogToSay(bothReadableSentence(MAIN_STORED_AT, REWRITTEN_AT))
    await waitFor(() =>
      expect(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: OPEN_AS_NEW }),
      ).toBeEnabled(),
    )
    await chooseInTheDialog(screen.getByRole('alertdialog'), KEEP_BOTH)
    await expectNoDialog()
    expectThePageToStay(held, entries)
    await expectTheTabToHoldTheProject(held)
  })

  it.each([
    { control: REPLACE_CONTROL, state: 'newer-main' },
    { control: REMOVE_CONTROL, state: 'both-readable' },
  ] as const)(
    '"$control", done, closes the dialog, takes the line off the card, and keeps the page and the project open',
    async ({ control, state }) => {
      const held = await holdTheProject(state)
      const entries = [...held.bar.entries()]
      const dialog = await openTheDialogOverTheProject(held)

      await chooseInTheDialog(dialog, control)

      await expectNoDialog()
      await expectNoLineOfTheSecondFile()
      expectThePageToStay(held, entries)
      await expectTheTabToHoldTheProject(held)
      expect(await held.ports.root.readFile(SECOND_PATH)).toBeUndefined()
    },
  )

  it.each([REPLACE_CONTROL, REMOVE_CONTROL])(
    '"%s", refused for a file that changed after the dialog showed, keeps the project open',
    async (control) => {
      const held = await holdTheProject('both-readable')
      const entries = [...held.bar.entries()]
      const dialog = await openTheDialogOverTheProject(held)
      await held.rewriteTheSecondFile(documentNamed(REWRITTEN_NAME), REWRITTEN_AT)

      await chooseInTheDialog(dialog, control)

      await expectTheDialogToSay(bothReadableSentence(MAIN_STORED_AT, REWRITTEN_AT))
      await waitFor(() =>
        expect(
          within(screen.getByRole('alertdialog')).getByRole('button', { name: control }),
        ).toBeEnabled(),
      )
      await chooseInTheDialog(screen.getByRole('alertdialog'), KEEP_BOTH)
      await expectNoDialog()
      expectThePageToStay(held, entries)
      await expectTheTabToHoldTheProject(held, MAIN_NAME)
    },
  )

  it.each([
    { control: OPEN_AS_NEW, second: NOT_JSON },
    { control: REPLACE_CONTROL, second: undefined },
  ] as const)(
    '"$control" shows the page with no project open, and holds no lock, when another tab takes the lock that the choice frees',
    async ({ control, second }) => {
      const held = await holdTheProject('both-readable', second)
      const entries = [...held.bar.entries()]
      const recordsBefore = await recordIds(held.ports)
      const dialog = await openTheDialogOverTheProject(held)
      letAnotherTabTakeTheLockWhenItIsFreed(held.ports)

      await chooseInTheDialog(dialog, control)

      await expectNoDialog()
      await settleForAWhile()
      expectThePageToStay(held, entries)
      expect(screen.queryByRole('button', { name: /^Back to / })).not.toBeInTheDocument()
      expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument()
      expect(
        screen.queryByRole('heading', { level: 1, name: /vernacular/i }),
      ).not.toBeInTheDocument()
      expect(lockedIds(held.ports)).toEqual([])
      expect(await recordIds(held.ports)).toEqual(recordsBefore)
    },
  )
})

describe('A choice between the two plan files that leaves the open project as it is', () => {
  it('Open the second plan file as a new project, done, shows the editor on the new project and frees the lock of the old one', async () => {
    const held = await holdTheProject('both-readable')
    const dialog = await openTheDialogOverTheProject(held)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    await expectOpenProject(COPY_NAME)
    await waitFor(() => expect(lockedIds(held.ports)).not.toContain(held.id))
    expect(lockedIds(held.ports)).toHaveLength(1)
  })

  it.each([REPLACE_CONTROL, REMOVE_CONTROL])(
    '"%s", on another project than the open one, leaves the open project open with its lock',
    async (control) => {
      const held = await holdAnotherProject()
      const dialog = await openTheDialogOverTheProject(held)

      await chooseInTheDialog(dialog, control)

      await expectNoDialog()
      await expectNoLineOfTheSecondFile()
      expect(lockedIds(held.ports)).toEqual([QUIET_ID])
      await expectTheTabToHoldTheProject(held)
    },
  )
})

describe('A failed choice of the dialog', () => {
  it('reads the words that start every failed choice, then that the second plan file could not be read', async () => {
    const { ports } = await portsWithTwoFiles('both-readable', NOT_JSON)
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    expect((await findThePageAlert()).textContent).toBe(SECOND_FILE_UNREADABLE_NOTICE)
  })
})

describe('Opening the second plan file of a folder project as a new project', () => {
  it('warns once that the asset that the folder lacks shows as missing', async () => {
    const ports = await portsWithAFolderProjectInTwoFiles(false)
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    expect(await openProjectName()).toBeTruthy()
    expect(await screen.findByText(ONE_MISSING_ASSET)).toBeInTheDocument()
    await settleForAWhile()
    expect(screen.getAllByText(ONE_MISSING_ASSET)).toHaveLength(1)
  })

  it('shows no warning when the folder holds every asset', async () => {
    const ports = await portsWithAFolderProjectInTwoFiles(true)
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    expect(await openProjectName()).toBeTruthy()
    await settleForAWhile()
    expect(screen.queryByText(ANY_MISSING_ASSET)).not.toBeInTheDocument()
  })
})
