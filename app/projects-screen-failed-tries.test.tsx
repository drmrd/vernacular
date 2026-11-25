import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { failSaves, holdNextRead } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  backToTheProject,
  clickCardOf,
  expectOpenProject,
  filesUnder,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  lockedIds,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  NEWER_VERSION_CAUSE,
  closeTheDialog,
  findTheFailedOpenDialog,
} from './failed-open-dialog-test-support'
import {
  addAFloor,
  expectTheEditAndUndoIt,
  findTheCardThatDidNotOpen,
  openFirstProject,
  portsWithAProjectThatDoesNotOpen,
  releaseAfterTheTest,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

const SAVE_FAILED_SENTENCE = 'The changes could not be saved, so the project stays open.'

setUpProjectsScreenTests()

describe('A click on the card of a project that did not open', () => {
  it('shows the reason in the dialog, and keeps the page and its address', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)

    await userEvent.click(await findTheCardThatDidNotOpen())

    expect(await findTheFailedOpenDialog()).toHaveTextContent(NEWER_VERSION_CAUSE)
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    await closeTheDialog()
    expect(await findTheProjectsPage()).toBeInTheDocument()
  })

  it('shows the editor and no alert after a later click on a card that opens', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    await userEvent.click(await findTheCardThatDidNotOpen())
    await closeTheDialog()

    await clickCardOf(nameOf(FIRST_ID))

    await expectOpenProject(nameOf(FIRST_ID))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('leaves every file of that project byte-identical and takes no lock', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    const card = await findTheCardThatDidNotOpen()
    const filesBefore = await filesUnder(ports.root, FAILED_ID)

    await userEvent.click(card)
    await findTheFailedOpenDialog()
    await settleForAWhile()

    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesUnder(ports.root, FAILED_ID)).toEqual(filesBefore)
    expect(lockedIds(ports)).toEqual([])
  })

  it('reads the cards again once the try has ended', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    const card = await findTheCardThatDidNotOpen()
    const heldIds = vi.spyOn(ports.locks, 'heldIds')
    const readsBefore = heldIds.mock.calls.length

    await userEvent.click(card)
    await findTheFailedOpenDialog()

    await waitFor(() => expect(heldIds).toHaveBeenCalledTimes(readsBefore + 1))
    await settleForAWhile()
    expect(heldIds).toHaveBeenCalledTimes(readsBefore + 1)
  })

  it('clears the earlier dialog while a new try runs, and shows the dialog of that try when it fails', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    const card = await findTheCardThatDidNotOpen()
    await userEvent.click(card)
    await closeTheDialog()
    const letTheReadGo = holdNextRead(ports.workspace)

    await userEvent.click(card)

    await settleForAWhile()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    letTheReadGo()
    expect(await findTheFailedOpenDialog()).toHaveTextContent(NEWER_VERSION_CAUSE)
  })
})

describe('The cards after a try that ends with no change on the page', () => {
  it('are not read again when a try that fails ends after the page is gone', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const { unmount } = renderAppAt(ports, PROJECTS_ADDRESS)
    const card = await findTheCardThatDidNotOpen()
    const heldIds = vi.spyOn(ports.locks, 'heldIds')
    const readsBefore = heldIds.mock.calls.length
    const letTheReadGo = holdNextRead(ports.workspace)
    releaseAfterTheTest(letTheReadGo)
    await userEvent.click(card)
    await settleForAWhile()

    unmount()
    letTheReadGo()
    await settleForAWhile()

    expect(heldIds).toHaveBeenCalledTimes(readsBefore)
  })

  it('show no notice and are not read again when a try is refused because another try runs', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(FIRST_ID))
    releaseAfterTheTest(holdNextRead(ports.workspace))
    await clickCardOf(nameOf(SECOND_ID))
    await settleForAWhile()
    const heldIds = vi.spyOn(ports.locks, 'heldIds')

    await clickCardOf(nameOf(FIRST_ID))
    await settleForAWhile()

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(heldIds).not.toHaveBeenCalled()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
  })
})

describe('A switch from the Projects page whose save of the earlier project fails', () => {
  it('keeps the page and the open project with its edit, and says that the changes were not saved', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    failSaves(ports.workspace)
    await showThePageOn(bar)

    await clickCardOf(nameOf(SECOND_ID))

    expect(await findThePageAlert()).toHaveTextContent(SAVE_FAILED_SENTENCE)
    const page = await findTheProjectsPage()
    expect(within(page).getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(lockedIds(ports)).toEqual([FIRST_ID])
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })
})
