import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { failSaves } from '../session/handle/handle-test-kit'
import {
  failedOpenSentence,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import { renameFromTheCard, theRenameField } from './card-actions-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  findTheCardThatDidNotOpen,
  openFirstProject,
  openTheMenuOf,
  portsWithAProjectThatDoesNotOpen,
  setUpProjectsScreenTests,
  showThePageOn,
  textOfTheCards,
} from './projects-screen-test-support'

const NEW_NAME = 'Renamed House'
const OTHER_TAB_SENTENCE = 'This project is open in another tab.'

setUpProjectsScreenTests()

describe('A rename from the card of a project on the Projects page', () => {
  it('offers Rename in the "..." menu of an ordinary card', async () => {
    renderAppAt(await durablePortsWith(FIRST_ID), PROJECTS_ADDRESS)

    await openTheMenuOf(nameOf(FIRST_ID))

    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })

  it('shows the new name on the card of a closed project after the save, and closes the form', async () => {
    renderAppAt(await durablePortsWith(FIRST_ID, SECOND_ID), PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))

    await renameFromTheCard(nameOf(SECOND_ID), NEW_NAME)

    expect(await findCardLink(NEW_NAME)).toBeInTheDocument()
    expect(theRenameField()).toBeNull()
    const page = await findTheProjectsPage()
    expect(within(page).queryByRole('link', { name: nameOf(SECOND_ID) })).toBeNull()
  })

  it('moves the renamed card to the first place of the list', async () => {
    renderAppAt(await durablePortsWith(FIRST_ID, SECOND_ID), PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))

    await renameFromTheCard(nameOf(SECOND_ID), NEW_NAME)

    await waitFor(async () => {
      const [first] = await textOfTheCards()
      expect(first).toContain(NEW_NAME)
    })
  })

  it('changes the link back to the open project to its new name', async () => {
    const { bar } = await openFirstProject()
    await showThePageOn(bar)
    await findCardLink(nameOf(FIRST_ID))

    await renameFromTheCard(nameOf(FIRST_ID), NEW_NAME)

    const page = await findTheProjectsPage()
    expect(
      await within(page).findByRole('button', { name: `Back to ${NEW_NAME}` }),
    ).toBeInTheDocument()
  })

  it('says in the one alert of the page that another tab holds the project, and keeps the form open', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))
    ports.lockRegistry.add(SECOND_ID)

    await renameFromTheCard(nameOf(SECOND_ID), NEW_NAME)

    expect(await findThePageAlert()).toHaveTextContent(OTHER_TAB_SENTENCE)
    expect(theRenameField()).not.toBeNull()
  })

  it('shows the reason in the alert when the save fails', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    await findCardLink(nameOf(SECOND_ID))
    failSaves(ports.workspace)

    await renameFromTheCard(nameOf(SECOND_ID), NEW_NAME)

    expect(await findThePageAlert()).toHaveTextContent('Could not rename the project: disk full')
  })

  it('clears the sentence of an earlier failed open when it starts, and leaves one alert', async () => {
    const ports = await portsWithAProjectThatDoesNotOpen()
    renderAppAt(ports, PROJECTS_ADDRESS)
    await userEvent.click(await findTheCardThatDidNotOpen())
    expect(await findThePageAlert()).toHaveTextContent(await failedOpenSentence(ports))
    await settleForAWhile()
    ports.lockRegistry.add(FIRST_ID)

    await renameFromTheCard(nameOf(FIRST_ID), NEW_NAME)

    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(screen.getByRole('alert')).toHaveTextContent(OTHER_TAB_SENTENCE)
  })
})
