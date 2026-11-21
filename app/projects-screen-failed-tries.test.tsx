import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { DID_NOT_OPEN } from '../editor/projects'
import { reconcileIndex } from '../session'
import { failSaves, type TestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  backToTheProject,
  clickCardOf,
  expectOpenProject,
  failedOpenSentence,
  filesUnder,
  findThePageAlert,
  findTheProjectsPage,
  lockedIds,
  plantFailedProject,
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
  addAFloor,
  expectTheEditAndUndoIt,
  openFirstProject,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

const SAVE_FAILED_SENTENCE = 'The changes could not be saved, so the project stays open.'

setUpProjectsScreenTests()

/** Durable ports with a project that opens and, in the index, a project that did not open. */
async function portsWithAProjectThatDoesNotOpen(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await plantFailedProject(ports)
  await reconcileIndex(ports)
  return ports
}

/** Waits for the card that says its project did not open, and gives its link. */
async function findTheCardThatDidNotOpen(): Promise<HTMLElement> {
  const page = await findTheProjectsPage()
  return waitFor(() => {
    const [card] = within(page)
      .getAllByRole('link')
      .filter((link) => link.textContent?.includes(DID_NOT_OPEN))
    if (card === undefined) throw new Error('No card says that its project did not open')
    return card
  })
}

describe('A click on the card of a project that did not open', () => {
  it('shows the reason in the alert of the page, and keeps the page and its address', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)

    await userEvent.click(await findTheCardThatDidNotOpen())

    expect(await findThePageAlert()).toHaveTextContent(await failedOpenSentence(ports))
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(await findTheProjectsPage()).toBeInTheDocument()
  })

  it('shows the editor and no alert after a later click on a card that opens', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    await userEvent.click(await findTheCardThatDidNotOpen())
    await findThePageAlert()

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
    await findThePageAlert()
    await settleForAWhile()

    expect(filesBefore.size).toBeGreaterThan(0)
    expect(await filesUnder(ports.root, FAILED_ID)).toEqual(filesBefore)
    expect(lockedIds(ports)).toEqual([])
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
