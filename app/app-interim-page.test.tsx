import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TestPorts } from '../session/handle/handle-test-kit'
import {
  KEPT_PROJECT_TEXT,
  editTheProject,
  expectOpenProject,
  logSaves,
  projectWithWalls,
  renderAppAt,
  settleForAWhile,
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
const LIST_SENTENCE = 'The list of projects is not available yet.'
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

/** Waits for the page of the interim view, and gives its landmark. */
function theProjectsPage(): Promise<HTMLElement> {
  return screen.findByRole('main', { name: 'Projects' })
}

/** Clicks "Return to the project" on the page. */
async function returnToTheProject(): Promise<void> {
  const page = await theProjectsPage()
  await userEvent.click(within(page).getByRole('button', { name: 'Return to the project' }))
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

describe('The interim page with a notice', () => {
  it('shows the sentence of an unknown project with Retry and Start a new project, and no line about a saved project', async () => {
    const ports = await durablePortsWith(FIRST_ID)

    renderAppAt(ports, addressOf(MISSING_ID))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(NOT_STORED_SENTENCE)
    expect(alert).not.toHaveTextContent(OPEN_FAILURE_PREFIX)
    expect(screen.getByRole('main', { name: 'Error' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start a new project' })).toBeInTheDocument()
    expect(screen.queryByText(KEPT_PROJECT_TEXT)).not.toBeInTheDocument()
  })

  it('shows Retry and Return to the project when a move leads to a project that does not open, and Return keeps the undo history', async () => {
    const { bar } = await openFirstProject()
    await addAFloor()

    await visit(bar, addressOf(MISSING_ID))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(NOT_STORED_SENTENCE)
    expect(alert).not.toHaveTextContent(OPEN_FAILURE_PREFIX)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Return to the project' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start a new project' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Return to the project' }))
    expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /undo/i }))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /2nd floor/i })).not.toBeInTheDocument(),
    )
  })
})

describe('The interim page over an open project', () => {
  it('shows the page with one button for the projects address over an open project', async () => {
    const { bar } = await openFirstProject()

    await visit(bar, PROJECTS_ADDRESS)

    const page = await theProjectsPage()
    expect(within(page).getByRole('status')).toHaveTextContent(LIST_SENTENCE)
    const buttons = within(page).getAllByRole('button')
    expect(buttons.map((button) => button.textContent)).toEqual(['Return to the project'])
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).not.toBeInTheDocument()
  })

  it('returns to the project with its unsaved edit and its undo history', async () => {
    const { ports, bar } = await openFirstProject()
    holdSaves(ports)
    await addAFloor()
    await visit(bar, PROJECTS_ADDRESS)

    await returnToTheProject()

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
    await theProjectsPage()

    await userEvent.keyboard('{Control>}z{/Control}{Meta>}z{/Meta}{Delete}')

    await returnToTheProject()
    expect(await screen.findByRole('button', { name: /2nd floor/i })).toBeInTheDocument()
  })
})

describe('The interim page with no project open', () => {
  it('shows the page with Open the last project when nothing is open', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)

    renderAppAt(ports, PROJECTS_ADDRESS)

    const page = await theProjectsPage()
    expect(within(page).getByRole('status')).toHaveTextContent(LIST_SENTENCE)
    await userEvent.click(within(page).getByRole('button', { name: 'Open the last project' }))
    await expectOpenProject(nameOf(FIRST_ID))
  })
})

describe('The unsaved work of a project while the page shows', () => {
  it('asks before the tab closes while the page shows over a project with unsaved changes', async () => {
    const { ports, bar } = await openFirstProject()
    holdSaves(ports)
    await addAFloor()
    await visit(bar, PROJECTS_ADDRESS)
    await theProjectsPage()

    expect(unloadIsVetoed()).toBe(true)
  })

  it('saves the open project when the tab is hidden while the page shows', async () => {
    const { ports, bar } = await openFirstProject()
    const log = logSaves(ports.workspace)
    await addAFloorWithoutAutosave()
    await visit(bar, PROJECTS_ADDRESS)
    await theProjectsPage()
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

    await returnToTheProject()

    await screen.findByRole('navigation', { name: /breadcrumb/i })
    await settleForAWhile()
    expect(screen.queryByRole('button', { name: /restore/i })).not.toBeInTheDocument()
  })
})
