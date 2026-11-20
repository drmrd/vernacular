import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { reconcileIndex } from '../session'
import {
  createTestPorts,
  failSaves,
  recordSaves,
  recordSnapshots,
  storedProject,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  NEW_PROJECT_NAME,
  START_ID,
  chooseFromTheProjectMenu,
  editTheProject,
  expectOpenProject,
  findTheShell,
  lockedIds,
  plantProject,
  projectWithWalls,
  renderApp,
  settleForAWhile,
  stubCapableStorage,
  usedLast,
} from './app-test-support'

const DRAFT_NAME = 'Drafthouse'
const HOUSE_ID = 'house'
const HOUSE_NAME = 'My House'
const TWIN_IDS = ['twin-a', 'twin-b']
const TWIN_NAME = 'Twin House'
const SAVE_FAILED_TOAST = 'Save failed. Your latest changes are not saved yet.'
const WRITE_OF_THE_START_PROJECT = [
  `writeSnapshot:${START_ID}`,
  `save:${START_ID}`,
  `prune:${START_ID}`,
]

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Opens the project menu. */
async function openTheProjectMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: /project/i }))
}

/** Waits until the ports hold the lock of exactly one of the two projects with one name, and gives its id. */
function theOnlyLockedTwin(ports: TestPorts): Promise<string> {
  return waitFor(() => {
    const [locked, ...others] = lockedIds(ports)
    if (locked === undefined || others.length > 0 || !TWIN_IDS.includes(locked)) {
      throw new Error(`Expected one of ${TWIN_IDS.join(', ')} to be open alone`)
    }
    return locked
  })
}

/** The state of the wall tool in the toolbar. */
function wallTool(): HTMLElement {
  return screen.getByRole('radio', { name: 'Wall' })
}

describe('The project menu of the application', () => {
  it('saves the current project through the store when Save is clicked', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const log: string[] = []
    recordSnapshots(ports.workspace, log)
    recordSaves(ports.workspace, log)
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)

    await findTheShell()
    save.mockClear()
    log.length = 0

    await chooseFromTheProjectMenu(/save/i)

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        START_ID,
        expect.objectContaining({ floors: expect.any(Array) }),
      ),
    )
    // The write ahead comes first, and the snapshots are pruned once the save is stored.
    await waitFor(() => expect(log).toEqual(WRITE_OF_THE_START_PROJECT))
  })

  it('lists a recent project and opens it into the session when clicked', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, 'Current')
    await plantProject(ports, HOUSE_ID, HOUSE_NAME)
    await reconcileIndex(ports)
    await usedLast(ports, START_ID)

    renderApp(ports)

    await findTheShell()
    await chooseFromTheProjectMenu(HOUSE_NAME)

    await expectOpenProject(HOUSE_NAME)
  })

  it('lists two recent projects with one name, and each opens its own project', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, 'Current')
    for (const id of TWIN_IDS) await plantProject(ports, id, TWIN_NAME)
    await reconcileIndex(ports)
    await usedLast(ports, START_ID)
    renderApp(ports)
    await expectOpenProject('Current')

    await openTheProjectMenu()
    const rows = await screen.findAllByRole('menuitem', { name: TWIN_NAME })
    expect(rows).toHaveLength(TWIN_IDS.length)
    await userEvent.click(rows[0] as HTMLElement)
    const first = await theOnlyLockedTwin(ports)
    await openTheProjectMenu()
    await userEvent.click(await screen.findByRole('menuitem', { name: TWIN_NAME }))

    await waitFor(() => expect(lockedIds(ports)).toEqual(TWIN_IDS.filter((id) => id !== first)))
  })

  it('lists no entry for the project of a first start that was left with no edit', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    renderApp(ports)
    await expectOpenProject(NEW_PROJECT_NAME)
    await plantProject(ports, HOUSE_ID, HOUSE_NAME)

    await chooseFromTheProjectMenu(/new project/i)
    await waitFor(() => expect(lockedIds(ports)).not.toContain(START_ID))
    await settleForAWhile()

    await openTheProjectMenu()
    expect(await screen.findByRole('menuitem', { name: HOUSE_NAME })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: NEW_PROJECT_NAME })).not.toBeInTheDocument()
  })
})

describe('A new project from the project menu', () => {
  it('re-arms the wall tool when a mid-session New replaces walls with a fresh empty project', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await ports.workspace.save(START_ID, projectWithWalls(DRAFT_NAME, 1))

    renderApp(ports)

    // The starting project has a wall, so the wall tool starts unarmed.
    await expectOpenProject(DRAFT_NAME)
    expect(wallTool()).toHaveAttribute('aria-checked', 'false')

    await chooseFromTheProjectMenu(/new project/i)

    // The fresh empty project runs the decision of the first tool again.
    await waitFor(() => expect(wallTool()).toHaveAttribute('aria-checked', 'true'))
  })

  it('New project asks no question, stores the unsaved edit, and keeps the old project stored', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, DRAFT_NAME)
    renderApp(ports)
    await expectOpenProject(DRAFT_NAME)

    await editTheProject()
    await chooseFromTheProjectMenu(/new project/i)

    await expectOpenProject(NEW_PROJECT_NAME)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    // The project that was left is stored with the floor that the edit added.
    const left = await storedProject(ports.workspace, START_ID)
    expect(left.meta.name).toBe(DRAFT_NAME)
    expect(left.floors).toHaveLength(2)
  })
})

describe('A failed Save from the project menu', () => {
  it('shows exactly one toast that says the latest changes are not saved yet', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, DRAFT_NAME)
    renderApp(ports)
    await expectOpenProject(DRAFT_NAME)
    failSaves(ports.workspace)

    await chooseFromTheProjectMenu(/save/i)

    await screen.findByText(SAVE_FAILED_TOAST)
    await settleForAWhile()
    expect(screen.getAllByText(SAVE_FAILED_TOAST)).toHaveLength(1)
  })
})
