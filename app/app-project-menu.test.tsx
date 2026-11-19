import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import { InMemoryRecentProjectStore } from '../storage'
import { createTestPorts, storedProject } from '../session/handle/handle-test-kit'
import {
  FAILED_ID as START_ID,
  NEW_PROJECT_NAME,
  chooseFromTheProjectMenu,
  editTheProject,
  expectOpenProject,
  findTheShell,
  plantProject,
  projectWithWalls,
  renderApp,
  stubCapableStorage,
} from './app-test-support'

const DRAFT_NAME = 'Drafthouse'
const HOUSE_ID = 'house'
const HOUSE_NAME = 'My House'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The state of the wall tool in the toolbar. */
function wallTool(): HTMLElement {
  return screen.getByRole('radio', { name: 'Wall' })
}

describe('The project menu of the application', () => {
  it('saves the current project through the store when Save is clicked', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)

    await findTheShell()
    save.mockClear()

    await chooseFromTheProjectMenu(/save/i)

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        START_ID,
        expect.objectContaining({ floors: expect.any(Array) }),
      ),
    )
  })

  it('lists a recent project and opens it into the session when clicked', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, 'Current')
    await plantProject(ports, HOUSE_ID, HOUSE_NAME)
    const recentProjects = new InMemoryRecentProjectStore()
    await recentProjects.record({ id: HOUSE_ID, name: HOUSE_NAME, backend: 'opfs', lastOpened: 1 })

    renderApp(ports, { recentProjects })

    await findTheShell()
    await chooseFromTheProjectMenu(HOUSE_NAME)

    await expectOpenProject(HOUSE_NAME)
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
