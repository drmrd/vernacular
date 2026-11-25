import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MAIN_NAME } from '../session/flows/choose-kept-file-test-kit'
import { documentNamed } from '../session/handle/second-file-test-kit'
import { clickCardOf, findTheProjectsPage, lockedIds, settleForAWhile } from './app-test-support'
import { setUpProjectsScreenTests } from './projects-screen-test-support'
import {
  KEEP_BOTH,
  KEEP_BOTH_CONTROL,
  MAIN_STORED_AT,
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  REWRITTEN_AT,
  bothReadableSentence,
  chooseAPlanFileOnTheCard,
  chooseInTheDialog,
  endTheTwoFilesInAnotherTab,
  expectNoDialog,
  expectTheDialogToSay,
  filesOfTheProject,
  findTheTwoFilesDialog,
  portsWithTwoFiles,
  showThePageOf,
} from './two-files-dialog-test-support'

setUpProjectsScreenTests()

const CANCEL = 'Cancel'

/** Durable ports with the project `a` in two readable plan files, and the dialog that a click on its card shows before the open. */
async function askedBeforeTheOpen() {
  const twoFiles = await portsWithTwoFiles('both-readable')
  await showThePageOf(twoFiles.ports)
  await clickCardOf(MAIN_NAME)
  return { ...twoFiles, dialog: await findTheTwoFilesDialog() }
}

/** The control named `name` of the dialog that shows. */
const controlOfTheDialog = (name: string) =>
  within(screen.getByRole('alertdialog')).queryByRole('button', { name })

describe('A choice before the open that finds that the files changed', () => {
  it('shows the dialog again before the open, with the facts of the files now, and opens no project', async () => {
    const { ports, dialog, rewriteTheSecondFile } = await askedBeforeTheOpen()
    await rewriteTheSecondFile(documentNamed('Rewritten while the dialog showed'), REWRITTEN_AT)
    const filesBefore = await filesOfTheProject(ports)

    await chooseInTheDialog(dialog, REPLACE_CONTROL)

    await expectTheDialogToSay(bothReadableSentence(MAIN_STORED_AT, REWRITTEN_AT))
    await waitFor(() => expect(controlOfTheDialog(KEEP_BOTH_CONTROL)).toBeEnabled())
    expect(controlOfTheDialog(CANCEL)).toBeEnabled()
    expect(lockedIds(ports)).toEqual([])
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })

  it('closes the dialog on the Projects page, with no notice, when no second file is left', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()
    await endTheTwoFilesInAnotherTab(ports)
    const filesBefore = await filesOfTheProject(ports)

    await chooseInTheDialog(dialog, REMOVE_CONTROL)

    await expectNoDialog()
    await settleForAWhile()
    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await filesOfTheProject(ports)).toEqual(filesBefore)
  })
})

describe('Choose a plan file on the card after the dialog before the open was cancelled', () => {
  it('shows the dialog of the card, with Keep both plan files and no Cancel', async () => {
    const { ports, dialog } = await askedBeforeTheOpen()
    await chooseInTheDialog(dialog, CANCEL)
    await expectNoDialog()

    await chooseAPlanFileOnTheCard(ports)

    await findTheTwoFilesDialog()
    await waitFor(() => expect(controlOfTheDialog(KEEP_BOTH)).toBeEnabled())
    expect(controlOfTheDialog(KEEP_BOTH_CONTROL)).toBeNull()
    expect(controlOfTheDialog(CANCEL)).toBeNull()
  })
})
