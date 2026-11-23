import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  BANNER_WITH_FOLDERS,
  BANNER_WITHOUT_FOLDERS,
  NEW_PROJECT_NAME,
  editTheProject,
  expectOpenProject,
  findTheProjectsPage,
  findTheShell,
  renderApp,
  renderAppAt,
  renderWithNoStorageAt,
  resetWindowAddress,
  settleForAWhile,
  startNewProjectFromThePage,
  stubCapableStorage,
} from './app-test-support'
import { PROJECTS_ADDRESS, visit } from './history-navigation-test-support'

const WARNING = 'The storage of this browser was not found. Projects stay in this tab.'
const DISMISS = 'Dismiss notification'
const TAB_ONLY_STATUS = 'In this tab only'
const TAB_ONLY_CARD_TEXT = 'In this tab only.'
/** The floor that the first project tops out at after its two edits: one floor, plus two added. */
const FIRST_PROJECT_TOP_FLOOR = /3rd floor/i

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

/** Dispatches a cancelable `beforeunload` event on the window, and says whether the application vetoed it. */
function leaveIsPrevented(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** The text of each live region of the open editor, in the order of the page. */
function statusReadouts(): string[] {
  return screen.queryAllByRole('status').map((region) => region.textContent ?? '')
}

/** Adds `floors` floors to the open project, and waits until the shell says that the tab holds them. */
async function editAndWaitForTheStore(floors = 1): Promise<void> {
  for (let done = 0; done < floors; done += 1) await editTheProject()
  await waitFor(() => expect(statusReadouts()).toContain(TAB_ONLY_STATUS), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
}

/** The cards of the Projects page, one list item each. */
function cardsOf(page: HTMLElement): Promise<HTMLElement[]> {
  return within(page).findAllByRole('listitem')
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
    const { bar } = renderWithNoStorageAt()
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
    expect(await cardsOf(page)).toHaveLength(2)
  })

  it('builds the ports once, and writes one warning that carries the error', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { resolvePorts } = renderWithNoStorageAt()

    await findTheShell()
    await settleForAWhile()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(WARNING, new Error('no storage backend'))
  })

  it('opens the other project from its card with no dialog', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { bar } = renderWithNoStorageAt()
    await findTheShell()
    await editAndWaitForTheStore(2)
    await visit(bar, PROJECTS_ADDRESS)
    await startNewProjectFromThePage()
    await expectOpenProject(NEW_PROJECT_NAME)
    await editAndWaitForTheStore()
    await visit(bar, PROJECTS_ADDRESS)
    const page = await findTheProjectsPage()
    // The cards come in the order of their latest use, so the first project is the second card.
    const cards = await cardsOf(page)

    await userEvent.click(within(cards[1] as HTMLElement).getByRole('link'))

    expect(await screen.findByRole('button', { name: FIRST_PROJECT_TOP_FLOOR })).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('The application over ports that keep nothing after the tab closes: the save status', () => {
  it('reads that the project is in this tab only after an edit, and never that all changes are saved', async () => {
    stubCapableStorage()
    renderAppAt(createTestPorts({ durable: false }), '')
    await findTheShell()

    await editTheProject()

    await waitFor(() => expect(statusReadouts()).toContain(TAB_ONLY_STATUS), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    expect(screen.queryByText(/all changes saved/i)).not.toBeInTheDocument()
  })

  it('reads on the card of the project that it is in this tab only', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts({ durable: false }), '')
    await findTheShell()
    await editAndWaitForTheStore()

    await visit(bar, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(await within(page).findByText(TAB_ONLY_CARD_TEXT)).toBeInTheDocument()
  })

  it('shows no discard dialog on a move to the Projects page after an edit', async () => {
    stubCapableStorage()
    const { bar } = renderAppAt(createTestPorts({ durable: false }), '')
    await findTheShell()
    await editAndWaitForTheStore()

    await visit(bar, PROJECTS_ADDRESS)

    await findTheProjectsPage()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('The application over ports that keep nothing after the tab closes: the leave warning', () => {
  beforeEach(() => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  })

  it('asks before the tab closes while the open project is in the tab only, from the first moment', async () => {
    renderWithNoStorageAt()
    await findTheShell()

    await waitFor(() => expect(leaveIsPrevented()).toBe(true))
  })

  it('asks before the tab closes on the Projects page over the open project', async () => {
    const { bar } = renderWithNoStorageAt()
    await findTheShell()
    await visit(bar, PROJECTS_ADDRESS)
    await findTheProjectsPage()

    await waitFor(() => expect(leaveIsPrevented()).toBe(true))
  })

  it('lets the tab close on the empty Projects page, where no project can be lost', async () => {
    renderWithNoStorageAt(PROJECTS_ADDRESS)
    await findTheProjectsPage()
    await settleForAWhile()

    expect(leaveIsPrevented()).toBe(false)
  })
})
