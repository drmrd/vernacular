import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  NEW_PROJECT_NAME,
  backToTheProject,
  editTheProject,
  expectOpenProject,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  lockedIds,
  logSaves,
  projectWithWalls,
  renderAppAt,
  settleForAWhile,
  startNewProjectFromThePage,
  stubCapableStorage,
} from './app-test-support'
import {
  FIRST_ID,
  MISSING_ID,
  PROJECTS_ADDRESS,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  nameOf,
  visit,
} from './history-navigation-test-support'

const NOT_STORED_SENTENCE = 'This project is not stored in this browser.'
const OPEN_FAILURE_PREFIX = /could not open the project/i
const FLUSH_WAIT_MS = 300
const releases: Array<() => void> = []

beforeEach(() => {
  stubCapableStorage()
})
afterEach(() => {
  for (const release of releases.splice(0)) release()
  cleanup()
  vi.useRealTimers()
  Reflect.deleteProperty(document, 'visibilityState')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Renders the application at the address of the first project and waits for its editor. */
async function openFirstProject() {
  const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
  const rendered = renderAppAt(ports, addressOf(FIRST_ID))
  await expectOpenProject(nameOf(FIRST_ID))
  return { ports, ...rendered }
}

/** Keeps every later save of the ports waiting, so that an edit stays unsaved. */
function holdSaves(ports: TestPorts): void {
  releases.push(logSaves(ports.workspace).hold())
}

/** Adds a floor to the open project and waits until the editor shows it. */
async function addAFloor(): Promise<void> {
  await editTheProject()
  await screen.findByRole('button', { name: /2nd floor/i })
}

/**
 * Adds a floor while the timers are faked, then drops the fake clock: the autosave timer that the
 * edit started is on that clock, so it never fires.
 */
async function addAFloorWithoutAutosave(): Promise<void> {
  const addFloor = await screen.findByRole('button', { name: /add floor/i })
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  fireEvent.click(addFloor)
  vi.useRealTimers()
  await screen.findByRole('button', { name: /2nd floor/i })
}

/** Clicks "Back to <name>" for the first project on the page. */
function returnToTheFirstProject(): Promise<void> {
  return backToTheProject(nameOf(FIRST_ID))
}

/** Whether a new cancelable `beforeunload` event is vetoed, the sign of the browser's warning. */
function unloadIsVetoed(): boolean {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Makes the tab look hidden, and tells the listeners of the document. */
function hideTheTab(): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
}

describe('The Projects page with a notice', () => {
  it('shows the sentence of an unknown project, New project, and the stored cards, and no Retry', async () => {
    const ports = await durablePortsWith(FIRST_ID)

    renderAppAt(ports, addressOf(MISSING_ID))

    const alert = await findThePageAlert()
    expect(alert).toHaveTextContent(NOT_STORED_SENTENCE)
    expect(alert).not.toHaveTextContent(OPEN_FAILURE_PREFIX)
    const page = await findTheProjectsPage()
    expect(within(page).getByRole('button', { name: 'New project' })).toBeInTheDocument()
    expect(await findCardLink(nameOf(FIRST_ID))).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('shows the notice and Back to the project when a move leads to a project that does not open, and Back keeps the undo history', async () => {
    const { bar } = await openFirstProject()
    await addAFloor()

    await visit(bar, addressOf(MISSING_ID))

    const alert = await findThePageAlert()
    expect(alert).toHaveTextContent(NOT_STORED_SENTENCE)
    expect(alert).not.toHaveTextContent(OPEN_FAILURE_PREFIX)
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    await returnToTheFirstProject()
    expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /2nd floor/i })).not.toBeInTheDocument(),
    )
  })

  it('starts a new project from the notice with New project', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    renderAppAt(ports, addressOf(MISSING_ID))
    await findThePageAlert()

    await startNewProjectFromThePage()

    await expectOpenProject(NEW_PROJECT_NAME)
    expect(lockedIds(ports)).not.toContain(FIRST_ID)
  })
})

describe('The Projects page over an open project', () => {
  it('shows Back to the project and a card for each project over an open project', async () => {
    const { bar } = await openFirstProject()

    await visit(bar, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    expect(
      within(page).getByRole('button', { name: `Back to ${nameOf(FIRST_ID)}` }),
    ).toBeInTheDocument()
    expect(await findCardLink(nameOf(FIRST_ID))).toBeInTheDocument()
    expect(await findCardLink(nameOf(SECOND_ID))).toBeInTheDocument()
    expect(within(page).queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument()
  })

  it('returns to the project with its unsaved edit and its undo history', async () => {
    const { ports, bar } = await openFirstProject()
    holdSaves(ports)
    await addAFloor()
    await visit(bar, PROJECTS_ADDRESS)

    await returnToTheFirstProject()

    expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /2nd floor/i })).not.toBeInTheDocument(),
    )
  })

  it('changes nothing in the project when a key of the editor is pressed while the page shows', async () => {
    const { ports, bar } = await openFirstProject()
    holdSaves(ports)
    await addAFloor()
    await visit(bar, PROJECTS_ADDRESS)
    await findTheProjectsPage()

    await userEvent.keyboard('{Control>}z{/Control}{Meta>}z{/Meta}{Delete}')

    await returnToTheFirstProject()
    expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
  })
})

describe('The Projects page with no project open', () => {
  it('shows the cards of the stored projects, latest use first, and opens nothing', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)

    renderAppAt(ports, PROJECTS_ADDRESS)

    const page = await findTheProjectsPage()
    await findCardLink(nameOf(SECOND_ID))
    const names = within(page)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(names[0]).toContain(nameOf(FIRST_ID))
    expect(names[1]).toContain(nameOf(SECOND_ID))
    expect(within(page).queryByRole('button', { name: /^Back to/ })).not.toBeInTheDocument()
    expect(lockedIds(ports)).toEqual([])
  })
})

describe('The unsaved work of a project while the page shows', () => {
  it('asks before the tab closes while the page shows over a project with unsaved changes', async () => {
    const { ports, bar } = await openFirstProject()
    holdSaves(ports)
    await addAFloor()
    await visit(bar, PROJECTS_ADDRESS)
    await findTheProjectsPage()

    expect(unloadIsVetoed()).toBe(true)
  })

  it('saves the open project when the tab is hidden while the page shows', async () => {
    const { ports, bar } = await openFirstProject()
    const log = logSaves(ports.workspace)
    await addAFloorWithoutAutosave()
    await visit(bar, PROJECTS_ADDRESS)
    await findTheProjectsPage()
    expect(log.saved).toEqual([])

    hideTheTab()

    await waitFor(() => expect(log.saved).toEqual([FIRST_ID]), { timeout: FLUSH_WAIT_MS })
  })

  it('offers recovered work once, and not again after the page was shown and left', async () => {
    const ports = await durablePortsWith(FIRST_ID)
    await ports.workspace.snapshots(FIRST_ID).writeSnapshot(projectWithWalls('Recovered', 1))
    const { bar } = renderAppAt(ports, addressOf(FIRST_ID))
    const prompt = await screen.findByRole('alert')
    expect(within(prompt).getByRole('button', { name: /restore/i })).toBeInTheDocument()
    await visit(bar, PROJECTS_ADDRESS)

    await returnToTheFirstProject()

    await screen.findByRole('navigation', { name: /breadcrumb/i })
    await settleForAWhile()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
  })
})
