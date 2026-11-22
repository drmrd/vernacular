import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import { createMemoryAddressBar, type MemoryAddressBar } from './address-bar'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  NEW_PROJECT_NAME,
  editTheProject,
  expectOpenProject,
  findTheProjectsPage,
  findTheShell,
  renderApp,
  renderAppAt,
  resetWindowAddress,
  settleForAWhile,
  startNewProjectFromThePage,
  stubCapableStorage,
} from './app-test-support'
import { PROJECTS_ADDRESS, visit } from './history-navigation-test-support'

const BANNER_WITH_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it, or open a folder.'
const BANNER_WITHOUT_FOLDERS =
  'This browser is not keeping your projects. They last until this tab closes. To keep one, export it.'
const WARNING = 'The storage of this browser was not found. Projects stay in this tab.'
const DISMISS = 'Dismiss notification'
const TAB_ONLY_STATUS = 'In this tab only'
const TAB_ONLY_CARD_TEXT = 'In this tab only.'
/** What the shell says once a change is stored, or once it is held by the tab alone. */
const STORED_LABEL = /all changes saved|in this tab only/i

afterEach(() => {
  cleanup()
  resetWindowAddress()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Gives the browser the folder access that the banner offers. */
function offerFolderAccess(): void {
  vi.stubGlobal('showDirectoryPicker', vi.fn())
}

/** Renders the application on a builder of ports that rejects, and on an address bar of its own. */
function renderWithNoStorage(): { bar: MemoryAddressBar; resolvePorts: () => Promise<never> } {
  const bar = createMemoryAddressBar()
  const resolvePorts = vi.fn(() => Promise.reject<never>(new Error('no storage backend')))
  render(<App resolvePorts={resolvePorts} address={bar} />)
  return { bar, resolvePorts }
}

/** Adds `floors` floors to the open project, and waits until the shell says that it holds them. */
async function editAndWaitForTheStore(floors = 1): Promise<void> {
  for (let done = 0; done < floors; done += 1) await editTheProject()
  await screen.findByText(STORED_LABEL, {}, { timeout: AUTOSAVE_TIMEOUT_MS })
}

/** The text of each live region of the open editor, in the order of the page. */
function statusReadouts(): string[] {
  return screen.queryAllByRole('status').map((region) => region.textContent ?? '')
}

/** Dismisses the banner of the tab. */
async function dismissTheBanner(): Promise<void> {
  const banner = await screen.findByRole('alert')
  await userEvent.click(within(banner).getByRole('button', { name: DISMISS }))
}

describe('The application over ports that keep nothing after the tab closes', () => {
  it('says so in a banner that offers a folder, where the browser opens folders', async () => {
    stubCapableStorage()
    offerFolderAccess()

    renderApp(createTestPorts())

    await findTheShell()
    expect(
      within(await screen.findByRole('alert')).getByText(BANNER_WITH_FOLDERS),
    ).toBeInTheDocument()
  })

  it('says so without the folder offer where the browser opens no folders', async () => {
    stubCapableStorage()

    renderApp(createTestPorts())

    await findTheShell()
    const banner = await screen.findByRole('alert')
    expect(within(banner).getByText(BANNER_WITHOUT_FOLDERS)).toBeInTheDocument()
    expect(banner).not.toHaveTextContent(/open a folder/i)
  })

  it('shows no banner over ports that keep the projects', async () => {
    stubCapableStorage()
    offerFolderAccess()

    renderApp(createTestPorts({ durable: true }))

    await findTheShell()
    await settleForAWhile()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the banner in the editor and on the Projects page with the same message, outside the page', async () => {
    stubCapableStorage()
    offerFolderAccess()
    const { bar } = renderAppAt(createTestPorts(), '')
    expect(
      within(await screen.findByRole('alert')).getByText(BANNER_WITH_FOLDERS),
    ).toBeInTheDocument()

    await visit(bar, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(
      within(await screen.findByRole('alert')).getByText(BANNER_WITH_FOLDERS),
    ).toBeInTheDocument()
    expect(within(page).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not bring the banner back for a new project once it was dismissed', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts(), '')
    await dismissTheBanner()
    await visit(bar, PROJECTS_ADDRESS)

    await startNewProjectFromThePage()

    await expectOpenProject(NEW_PROJECT_NAME)
    await settleForAWhile()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps the address bare after the first save', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts(), '')
    await findTheShell()

    await editAndWaitForTheStore()

    expect(bar.hash()).toBe('')
  })
})

describe('The application whose builder of the ports rejects', () => {
  it('opens a new project with no click, raises the banner, and lists the projects that were made', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { bar } = renderWithNoStorage()
    expect(await findTheShell()).toBeInTheDocument()
    expect(
      within(await screen.findByRole('alert')).getByText(BANNER_WITHOUT_FOLDERS),
    ).toBeInTheDocument()
    await editAndWaitForTheStore()
    await visit(bar, PROJECTS_ADDRESS)

    await startNewProjectFromThePage()
    await expectOpenProject(NEW_PROJECT_NAME)
    await editAndWaitForTheStore()
    await visit(bar, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(await within(page).findAllByRole('link')).toHaveLength(2)
  })

  it('builds the ports once, and writes one warning that carries the error', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { resolvePorts } = renderWithNoStorage()

    await findTheShell()
    await settleForAWhile()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(WARNING, new Error('no storage backend'))
  })

  it('opens the other project from its card with no dialog', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { bar } = renderWithNoStorage()
    await findTheShell()
    await editAndWaitForTheStore(2)
    await visit(bar, PROJECTS_ADDRESS)
    await startNewProjectFromThePage()
    await expectOpenProject(NEW_PROJECT_NAME)
    await editAndWaitForTheStore()
    await visit(bar, PROJECTS_ADDRESS)
    const page = await findTheProjectsPage()
    // The cards come in the order of their latest use, so the first project is the second card.
    const cards = await within(page).findAllByRole('link')

    await userEvent.click(cards[1] as HTMLElement)

    expect(await screen.findByRole('button', { name: /3rd floor/i })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('The application over ports that keep nothing after the tab closes: the save status', () => {
  it('reads that the project is in this tab only after an edit, and never that all changes are saved', async () => {
    stubCapableStorage()
    renderAppAt(createTestPorts(), '')
    await findTheShell()

    await editTheProject()

    await waitFor(() => expect(statusReadouts().join(' ')).toContain(TAB_ONLY_STATUS), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    expect(screen.queryByText(/all changes saved/i)).not.toBeInTheDocument()
  })

  it('reads on the card of the project that it is in this tab only', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts(), '')
    await findTheShell()
    await editAndWaitForTheStore()

    await visit(bar, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(await within(page).findByText(TAB_ONLY_CARD_TEXT)).toBeInTheDocument()
  })

  it('shows no discard dialog on a move to the Projects page after an edit', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts(), '')
    await findTheShell()
    await editAndWaitForTheStore()

    await visit(bar, PROJECTS_ADDRESS)

    await findTheProjectsPage()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})
