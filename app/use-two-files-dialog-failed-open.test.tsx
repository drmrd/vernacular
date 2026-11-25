import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { clickCardOf, findThePageAlert, settleForAWhile } from './app-test-support'
import {
  MAIN_NAME,
  letAnotherTabTakeTheLockOnceTheChoiceFreesIt,
} from '../session/flows/choose-kept-file-test-kit'
import { OPEN_ELSEWHERE } from './open-failure-text'
import { setUpProjectsScreenTests } from './projects-screen-test-support'
import {
  REMOVE_CONTROL,
  REPLACE_CONTROL,
  chooseInTheDialog,
  expectNoDialog,
  expectNoLineOfTheSecondFile,
  holdTheProject,
  letAnotherTabTakeTheLockWhenItIsFreed,
  openTheDialogOverTheProject,
  showThePageOf,
  findTheTwoFilesDialog,
  portsWithTwoFiles,
  storedFiles,
} from './two-files-dialog-test-support'

setUpProjectsScreenTests()

const CHANGE_FAILED_SENTENCE = /Could not change the plan files/
const CONTROLS = [REPLACE_CONTROL, REMOVE_CONTROL] as const

/** The alert of the page says the reason of the open alone, and no text says that the change failed. */
async function expectAFailedOpenOnly(): Promise<void> {
  expect((await findThePageAlert()).textContent).toBe(OPEN_ELSEWHERE)
  await settleForAWhile()
  expect(screen.queryByText(CHANGE_FAILED_SENTENCE)).not.toBeInTheDocument()
}

describe('A choice that is done, whose open of the project then fails', () => {
  it.each(CONTROLS)(
    '"%s", before a project is open, shows a failed open with the reason of the open, not a failed change',
    async (control) => {
      const { ports } = await portsWithTwoFiles('both-readable')
      await showThePageOf(ports)
      await clickCardOf(MAIN_NAME)
      const dialog = await findTheTwoFilesDialog()
      letAnotherTabTakeTheLockOnceTheChoiceFreesIt(ports)

      await chooseInTheDialog(dialog, control)

      await expectNoDialog()
      await expectNoLineOfTheSecondFile()
      await expectAFailedOpenOnly()
      expect((await storedFiles(ports)).second).toBeUndefined()
    },
  )

  it.each(CONTROLS)(
    '"%s", over the project that this tab holds, shows a failed open with the reason of the open, not a failed change',
    async (control) => {
      const held = await holdTheProject('both-readable')
      const dialog = await openTheDialogOverTheProject(held)
      letAnotherTabTakeTheLockWhenItIsFreed(held.ports)

      await chooseInTheDialog(dialog, control)

      await expectNoDialog()
      await expectNoLineOfTheSecondFile()
      await expectAFailedOpenOnly()
      expect((await storedFiles(held.ports)).second).toBeUndefined()
    },
  )
})
