import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NO_PROJECTS } from '../editor/projects'
import { storedProject } from '../session/handle/handle-test-kit'
import {
  NEW_PROJECT_NAME,
  backToTheProject,
  clickCardOf,
  expectOpenProject,
  findCardLink,
  findTheProjectsPage,
  lockedIds,
  renderAppAt,
  startNewProjectFromThePage,
} from './app-test-support'
import { holdIndexReads } from './held-index-test-support'
import {
  FIRST_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  goBack,
  nameOf,
} from './history-navigation-test-support'
import {
  addAFloor,
  expectTheEditAndUndoIt,
  openFirstProject,
  releaseAfterTheTest,
  setUpProjectsScreenTests,
  showThePageOn,
} from './projects-screen-test-support'

setUpProjectsScreenTests()

describe('The Projects page in the application', () => {
  it('shows a link to each stored project, with the address of that project', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)

    renderAppAt(ports, PROJECTS_ADDRESS)

    const first = await findCardLink(nameOf(FIRST_ID))
    const second = await findCardLink(nameOf(SECOND_ID))
    expect(first).toHaveAttribute('href', addressOf(FIRST_ID))
    expect(second).toHaveAttribute('href', addressOf(SECOND_ID))
    const page = await findTheProjectsPage()
    expect(within(page).getAllByRole('link')).toHaveLength(2)
  })

  it('shows its heading and New project, and no empty sentence, while the index does not answer', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    const release = holdIndexReads(ports.index)
    releaseAfterTheTest(release)

    renderAppAt(ports, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(within(page).getByRole('heading', { level: 1, name: 'Projects' })).toBeInTheDocument()
    expect(within(page).getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(within(page).queryByText(NO_PROJECTS)).not.toBeInTheDocument()
    expect(within(page).queryAllByRole('link')).toHaveLength(0)
    release()
    await findCardLink(nameOf(FIRST_ID))
    expect(within(page).queryByText(NO_PROJECTS)).not.toBeInTheDocument()
  })
})

describe('Going back to the open project from the Projects page', () => {
  it('returns to the editor from Back to the project, with the unsaved edit and its undo history', async () => {
    const { bar } = await openFirstProject()
    await addAFloor()
    await showThePageOn(bar)

    await backToTheProject(nameOf(FIRST_ID))

    expect(screen.queryByRole('main', { name: 'Projects' })).not.toBeInTheDocument()
    await expectTheEditAndUndoIt()
  })

  it('returns to the editor from the card of the open project, and opens nothing again', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    await showThePageOn(bar)
    const tryAcquire = vi.spyOn(ports.locks, 'tryAcquire')

    await clickCardOf(nameOf(FIRST_ID))

    await expectTheEditAndUndoIt()
    expect(tryAcquire).not.toHaveBeenCalled()
    expect(lockedIds(ports)).toEqual([FIRST_ID])
  })
})

describe('Switching projects from the Projects page', () => {
  it('opens another project from its card with no dialog, stores the earlier edit, and leaves the page one move back', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    expect((await storedProject(ports.workspace, FIRST_ID)).floors).toHaveLength(1)
    await showThePageOn(bar)

    await clickCardOf(nameOf(SECOND_ID))

    await expectOpenProject(nameOf(SECOND_ID))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect((await storedProject(ports.workspace, FIRST_ID)).floors).toHaveLength(2)
    await waitFor(() => expect(bar.hash()).toBe(addressOf(SECOND_ID)))
    await goBack(bar)
    await findTheProjectsPage()
    expect(bar.hash()).toBe(PROJECTS_ADDRESS)
  })
})

describe('Starting a new project from the Projects page beside an open project', () => {
  it('shows a new editor under a new id, and stores the edit of the earlier project', async () => {
    const { ports, bar } = await openFirstProject()
    await addAFloor()
    await showThePageOn(bar)

    await startNewProjectFromThePage()

    await expectOpenProject(NEW_PROJECT_NAME)
    expect(screen.queryByRole('main', { name: 'Projects' })).not.toBeInTheDocument()
    await waitFor(() => expect(lockedIds(ports)).toHaveLength(1))
    expect(lockedIds(ports)).not.toContain(FIRST_ID)
    expect((await storedProject(ports.workspace, FIRST_ID)).floors).toHaveLength(2)
  })
})
