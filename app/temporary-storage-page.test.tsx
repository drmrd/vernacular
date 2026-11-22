import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  BANNER_WITHOUT_FOLDERS,
  NEW_PROJECT_NAME,
  expectOpenProject,
  findThePageAlert,
  findTheProjectsPage,
  renderAppAt,
  renderWithNoStorageAt,
  resetWindowAddress,
  settleForAWhile,
  startNewProjectFromThePage,
  stubCapableStorage,
} from './app-test-support'
import { PROJECTS_ADDRESS, addressOf } from './history-navigation-test-support'
import { NOT_STORED } from './open-failure-text'

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  resetWindowAddress()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Waits for the one banner of the tab, and gives it. */
async function findTheOnlyBanner(): Promise<HTMLElement> {
  const banner = await screen.findByRole('alert')
  await settleForAWhile()
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  return banner
}

describe('The Projects page over ports that keep nothing after the tab closes', () => {
  it('shows the banner, outside the page, as soon as it renders with no project, and keeps it once one opens', async () => {
    stubCapableStorage()
    renderWithNoStorageAt(PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()

    const banner = await findTheOnlyBanner()
    expect(within(banner).getByText(BANNER_WITHOUT_FOLDERS)).toBeInTheDocument()
    expect(page).not.toContainElement(banner)
    expect(within(page).queryAllByRole('listitem')).toHaveLength(0)

    await startNewProjectFromThePage()

    await expectOpenProject(NEW_PROJECT_NAME)
    expect(within(await findTheOnlyBanner()).getByText(BANNER_WITHOUT_FOLDERS)).toBeInTheDocument()
  })

  it('says that the project is not stored, and shows the banner, at the address of a project', async () => {
    stubCapableStorage()
    renderWithNoStorageAt(addressOf('project-elsewhere'))

    const notice = await findThePageAlert()

    expect(notice).toHaveTextContent(NOT_STORED)
    const page = await findTheProjectsPage()
    const banner = await screen.findByText(BANNER_WITHOUT_FOLDERS)
    expect(page).not.toContainElement(banner)
    expect(screen.getAllByRole('alert')).toHaveLength(2)
  })

  it('shows no banner on an empty Projects page over ports that keep the projects', async () => {
    stubCapableStorage()
    renderAppAt(createTestPorts({ durable: true }), PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()

    await settleForAWhile()
    expect(within(page).queryAllByRole('listitem')).toHaveLength(0)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
