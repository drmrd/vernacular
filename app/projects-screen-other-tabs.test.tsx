import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  backToTheProject,
  clickCardOf,
  findCardLink,
  findTheProjectsPage,
  renderAppAt,
  settleForAWhile,
} from './app-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'
import {
  OTHER_TAB_LINE,
  addAFloor,
  changeVisibilityTo,
  expectTheEditAndUndoIt,
  openFirstProject,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

setUpProjectsScreenTests()

describe('A project that another tab holds, on the Projects page', () => {
  it('keeps the page, the address, and the line when its card is clicked with no project open', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    ports.lockRegistry.add(SECOND_ID)
    const { bar } = renderAppAt(ports, PROJECTS_ADDRESS)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)

    await clickCardOf(nameOf(SECOND_ID))
    await settleForAWhile()

    expect(await findTheProjectsPage()).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
  })

  it('keeps the open project with its edit, the page, and the line when its card is clicked', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    ports.lockRegistry.add(SECOND_ID)
    await showThePageOn(bar)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)

    await clickCardOf(nameOf(SECOND_ID))
    await settleForAWhile()

    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
    await backToTheProject(nameOf(FIRST_ID))
    await expectTheEditAndUndoIt()
  })

  it('drops the line when the tab becomes visible after the other tab let go, and reads nothing when it becomes hidden', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    ports.lockRegistry.add(SECOND_ID)
    renderAppAt(ports, PROJECTS_ADDRESS)
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
    ports.lockRegistry.delete(SECOND_ID)
    const heldIds = vi.spyOn(ports.locks, 'heldIds')

    changeVisibilityTo('hidden')
    await settleForAWhile()

    expect(heldIds).not.toHaveBeenCalled()
    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
    changeVisibilityTo('visible')
    await waitFor(() =>
      expect(screen.getByRole('link', { name: nameOf(SECOND_ID) })).not.toHaveTextContent(
        OTHER_TAB_LINE,
      ),
    )
  })

  it('shows the line on its card, and no alert, at the address of that project', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    ports.lockRegistry.add(SECOND_ID)

    const { bar } = renderAppAt(ports, addressOf(SECOND_ID))

    expect(await findCardLink(nameOf(SECOND_ID))).toHaveTextContent(OTHER_TAB_LINE)
    const page = await findTheProjectsPage()
    expect(within(page).queryByRole('alert')).not.toBeInTheDocument()
    expect(bar.hash()).toBe(addressOf(SECOND_ID))
  })
})
