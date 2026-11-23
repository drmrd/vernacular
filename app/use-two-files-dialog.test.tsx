import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import {
  COPY_NAME,
  REPLACED_PREFIX,
  SET_ASIDE_PREFIX,
  secondBytes,
} from '../session/flows/choose-kept-file-test-kit'
import { documentNamed } from '../session/handle/second-file-test-kit'
import {
  expectOpenProject,
  findThePageAlert,
  findTheProjectsPage,
  settleForAWhile,
} from './app-test-support'
import {
  KEEP_BOTH,
  MAIN_STORED_AT,
  NEWER_MAIN_SENTENCE,
  OPEN_AS_NEW,
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  REWRITTEN_AT,
  SECOND_STORED_AT,
  bothReadableSentence,
  chooseAPlanFileOnTheCard,
  chooseInTheDialog,
  endTheTwoFilesInAnotherTab,
  expectNoDialog,
  expectNoLineOfTheSecondFile,
  expectTheDialogToSay,
  filesOfTheProject,
  findTheLineOfTheSecondFile,
  holdTheChoice,
  openTheTwoFilesDialog,
  portsWithTwoFiles,
  showThePageOf,
  storedFiles,
} from './two-files-dialog-test-support'
import type { ChoiceMethod } from './two-files-dialog-test-support'
import { setUpProjectsScreenTests } from './projects-screen-test-support'

setUpProjectsScreenTests()

const CHOICES = [
  { name: OPEN_AS_NEW, method: 'readSecondFile' },
  { name: REPLACE_CONTROL, method: 'promoteSecondFile' },
  { name: REMOVE_CONTROL, method: 'setAsideSecondFile' },
] as const satisfies readonly { readonly name: string; readonly method: ChoiceMethod }[]

describe('The choice between two plan files, from the card of a project', () => {
  it('shows the dialog beside a newer main file, from the card menu, with the name of the second file', async () => {
    const { ports } = await portsWithTwoFiles('newer-main')

    const dialog = await openTheTwoFilesDialog(ports)

    expect(dialog).toHaveTextContent(NEWER_MAIN_SENTENCE)
    expect(within(dialog).queryByRole('button', { name: REMOVE_CONTROL })).not.toBeInTheDocument()
  })

  it('shows the dialog when the build reads both files, with the time of each file and the removal', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')

    const dialog = await openTheTwoFilesDialog(ports)

    expect(dialog).toHaveTextContent(bothReadableSentence(MAIN_STORED_AT, SECOND_STORED_AT))
    expect(within(dialog).getByRole('button', { name: REMOVE_CONTROL })).toBeEnabled()
    expect(within(dialog).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('Keep both plan files closes the dialog and changes no stored file', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    const filesBefore = await filesOfTheProject(ports)
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, KEEP_BOTH)

    await expectNoDialog()
    await settleForAWhile()
    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
    expect(await findTheLineOfTheSecondFile()).toBeInTheDocument()
  })

  it('Escape keeps both plan files, like the primary control', async () => {
    const { ports } = await portsWithTwoFiles('newer-main')
    const filesBefore = await filesOfTheProject(ports)
    await openTheTwoFilesDialog(ports)

    await userEvent.keyboard('{Escape}')

    await expectNoDialog()
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })

  it.each(CHOICES)(
    '"$name" runs its flow once, disables every control while it runs, and closes the dialog',
    async ({ name, method }) => {
      const { ports } = await portsWithTwoFiles('both-readable')
      const held = holdTheChoice(ports, method)
      const dialog = await openTheTwoFilesDialog(ports)

      await chooseInTheDialog(dialog, name)

      await waitFor(() => expect(held.calls).toHaveBeenCalledOnce())
      await waitFor(() => {
        const buttons = within(screen.getByRole('alertdialog')).getAllByRole('button')
        expect(buttons).toHaveLength(4)
        for (const button of buttons) expect(button).toBeDisabled()
      })
      held.release()
      await expectNoDialog()
      expect(held.calls).toHaveBeenCalledOnce()
    },
  )

  it('Replace stores the second plan file as the main file, keeps the old main file in the backups, and takes the line off the card', async () => {
    const { ports } = await portsWithTwoFiles('newer-main')
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, REPLACE_CONTROL)

    await expectNoDialog()
    await expectNoLineOfTheSecondFile()
    expect(await storedFiles(ports)).toEqual({ main: secondBytes(), second: undefined })
    const kept = [...(await filesOfTheProject(ports)).keys()]
    expect(kept.some((path) => path.includes(REPLACED_PREFIX))).toBe(true)
  })

  it('Remove the second plan file keeps the main file, moves the second file to the backups, and takes the line off the card', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    const before = await storedFiles(ports)
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await expectNoDialog()
    await expectNoLineOfTheSecondFile()
    expect(await storedFiles(ports)).toEqual({ main: before.main, second: undefined })
    const kept = [...(await filesOfTheProject(ports)).keys()]
    expect(kept.some((path) => path.includes(SET_ASIDE_PREFIX))).toBe(true)
  })

  it('Open the second plan file as a new project opens the editor on the new project', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    const dialog = await openTheTwoFilesDialog(ports)

    await chooseInTheDialog(dialog, OPEN_AS_NEW)

    await expectOpenProject(COPY_NAME)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('A choice that finds that the files changed', () => {
  it('shows the dialog again with the facts of the files now, and changes no stored file', async () => {
    const { ports, rewriteTheSecondFile } = await portsWithTwoFiles('both-readable')
    const dialog = await openTheTwoFilesDialog(ports)
    await rewriteTheSecondFile(documentNamed('Rewritten while the dialog showed'), REWRITTEN_AT)
    const filesBefore = await filesOfTheProject(ports)

    await chooseInTheDialog(dialog, REPLACE_CONTROL)

    await expectTheDialogToSay(bothReadableSentence(MAIN_STORED_AT, REWRITTEN_AT))
    await waitFor(() =>
      expect(
        within(screen.getByRole('alertdialog')).getByRole('button', { name: REPLACE_CONTROL }),
      ).toBeEnabled(),
    )
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('closes the dialog, with no notice, when no second file is left', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    const dialog = await openTheTwoFilesDialog(ports)
    await endTheTwoFilesInAnotherTab(ports)
    const filesBefore = await filesOfTheProject(ports)

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await expectNoDialog()
    await settleForAWhile()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })
})

describe('A choice that fails', () => {
  it('closes the dialog and shows the failure in the notice of the page', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    const filesBefore = await filesOfTheProject(ports)
    const dialog = await openTheTwoFilesDialog(ports)
    const failure = new Error('The disk did not answer')
    vi.spyOn(ports.workspace, 'setAsideSecondFile').mockRejectedValueOnce(failure)

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await expectNoDialog()
    expect(await findThePageAlert()).toHaveTextContent(
      `Could not change the plan files: ${failure.message}`,
    )
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })
})

describe('A card whose project has no second plan file left', () => {
  it('shows no dialog for the action and reads the cards again, so that the line is gone', async () => {
    const { ports } = await portsWithTwoFiles('both-readable')
    await showThePageOf(ports)
    await endTheTwoFilesInAnotherTab(ports)

    await chooseAPlanFileOnTheCard(ports)

    await expectNoLineOfTheSecondFile()
    await settleForAWhile()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
