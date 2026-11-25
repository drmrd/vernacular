import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DID_NOT_OPEN } from '../editor/projects'
import {
  PROJECT_ID,
  REPAIRED_NAME,
  STORED_NAME,
  otherRepairBytes,
  placeInWorkspace,
} from '../session/flows/open-failed-test-kit'
import { addressOf } from './history-navigation-test-support'
import {
  CHOICE_TITLE,
  PAINT_REPAIR_SENTENCE,
  STORED_TITLE,
  clickInTheDialog,
  filesOfTheRepairableProject,
  findTheFailedOpenDialog,
  openTheChoice,
  openTheDialogFromTheCard,
  portsWithARepairableProject,
} from './failed-open-dialog-test-support'
import { expectOpenProject } from './app-test-support'
import {
  setUpProjectsScreenTests,
  showThePageOn,
  textOfTheCards,
} from './projects-screen-test-support'

const REPAIR_INTRODUCTION = 'A repair can open this project.'
const STORED_CHOICE_SENTENCE =
  'A new file stores a repaired version of this project. The stored file stays unchanged.'
const FIELDS_SENTENCE = /It removes \d+ fields? that the format does not define\./

setUpProjectsScreenTests()

describe('The repair choices of the failed-open dialog on the Projects page', () => {
  it('with an offer, "Open with the repair" shows the choice, and Cancel returns to the dialog', async () => {
    const ports = await portsWithARepairableProject()
    const filesBefore = await filesOfTheRepairableProject(ports)
    const { dialog } = await openTheDialogFromTheCard(ports)
    expect(dialog).toHaveTextContent(REPAIR_INTRODUCTION)
    expect(dialog).toHaveTextContent(PAINT_REPAIR_SENTENCE)

    const choice = await openTheChoice(dialog)

    expect(choice).toHaveTextContent(STORED_CHOICE_SENTENCE)
    expect(screen.queryByRole('alertdialog', { name: STORED_TITLE })).not.toBeInTheDocument()
    expect(within(choice).getByRole('button', { name: 'Open as a new project' })).toBeEnabled()
    expect(within(choice).getByRole('button', { name: 'Replace the stored project' })).toBeEnabled()
    await clickInTheDialog(choice, 'Cancel')
    expect(await findTheFailedOpenDialog()).toHaveTextContent(REPAIR_INTRODUCTION)
    expect(screen.queryByRole('alertdialog', { name: CHOICE_TITLE })).not.toBeInTheDocument()
    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesOfTheRepairableProject(ports)).toEqual(filesBefore)
  })

  it('"Open as a new project" opens the repaired copy, and the page then has two cards', async () => {
    const ports = await portsWithARepairableProject()
    const filesBefore = await filesOfTheRepairableProject(ports)
    const { dialog, rendered } = await openTheDialogFromTheCard(ports)

    await clickInTheDialog(await openTheChoice(dialog), 'Open as a new project')

    await expectOpenProject(REPAIRED_NAME)
    await showThePageOn(rendered.bar)
    const cards = await textOfTheCards()
    expect(cards).toHaveLength(2)
    expect(cards.filter((text) => text.includes(REPAIRED_NAME))).toHaveLength(1)
    expect(cards.filter((text) => text.includes(DID_NOT_OPEN))).toHaveLength(1)
    expect(await filesOfTheRepairableProject(ports)).toEqual(filesBefore)
  })

  it('"Replace the stored project" opens the project under its own address', async () => {
    const ports = await portsWithARepairableProject()
    const { dialog, rendered } = await openTheDialogFromTheCard(ports)

    await clickInTheDialog(await openTheChoice(dialog), 'Replace the stored project')

    await expectOpenProject(STORED_NAME)
    expect(rendered.bar.hash()).toBe(addressOf(PROJECT_ID))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('a replace that finds another stored file closes the choice and shows the dialog of the new try', async () => {
    const ports = await portsWithARepairableProject()
    const { dialog } = await openTheDialogFromTheCard(ports)
    const choice = await openTheChoice(dialog)
    await placeInWorkspace(ports, otherRepairBytes())
    const filesBefore = await filesOfTheRepairableProject(ports)

    await clickInTheDialog(choice, 'Replace the stored project')

    await waitFor(() =>
      expect(screen.queryByRole('alertdialog', { name: CHOICE_TITLE })).toBeNull(),
    )
    expect(await findTheFailedOpenDialog()).toHaveTextContent(FIELDS_SENTENCE)
    expect(await filesOfTheRepairableProject(ports)).toEqual(filesBefore)
  })
})
