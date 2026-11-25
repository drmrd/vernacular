import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { mixedPaintBytes } from '../session/flows/open-failed-test-kit'
import { failSaves } from '../session/handle/handle-test-kit'
import { backToTheProject, findThePageAlert, lockedIds, settleForAWhile } from './app-test-support'
import {
  FILE_TITLE,
  clickInTheDialog,
  filesOfTheRepairableProject,
  findTheChoiceDialog,
  findTheFailedOpenDialog,
  openTheChoice,
  openTheDialogFromTheCard,
  portsWithARepairableProject,
} from './failed-open-dialog-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import { OPEN_ELSEWHERE, SAVE_FAILED_DURING_SWITCH } from './open-failure-text'
import {
  addAFloor,
  chooseInThePicker,
  clickPageAction,
  expectTheEditAndUndoIt,
  openFirstProjectOn,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

setUpProjectsScreenTests()

describe('A repair choice that fails, on the Projects page', () => {
  it('for a file shows the sentence of the failure, brings back no dialog, and keeps the open project', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const { bar } = await openFirstProjectOn(ports)
    failSaves(ports.workspace)
    await addAFloor()
    await showThePageOn(bar)
    chooseInThePicker(new File([mixedPaintBytes().buffer as ArrayBuffer], 'house.json'))
    await clickPageAction('Import file')
    const dialog = await findTheFailedOpenDialog(FILE_TITLE)
    await clickInTheDialog(dialog, 'Open with the repair')
    const choice = await findTheChoiceDialog()

    await clickInTheDialog(choice, 'Open as a new project')
    await settleForAWhile()

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(await findThePageAlert()).toHaveTextContent(SAVE_FAILED_DURING_SWITCH)
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })

  it.each(['Open as a new project', 'Replace the stored project'])(
    'for a stored project, "%s" shows the sentence of the failure and keeps the stored files',
    async (choiceName) => {
      const ports = await portsWithARepairableProject()
      const filesBefore = await filesOfTheRepairableProject(ports)
      const { dialog } = await openTheDialogFromTheCard(ports)
      const choice = await openTheChoice(dialog)
      vi.spyOn(ports.locks, 'tryAcquire').mockResolvedValue(undefined)

      await clickInTheDialog(choice, choiceName)

      expect(await findThePageAlert()).toHaveTextContent(OPEN_ELSEWHERE)
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(filesBefore.size).toBeGreaterThan(0)
      expect(await filesOfTheRepairableProject(ports)).toEqual(filesBefore)
    },
  )
})
