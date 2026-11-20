import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InMemoryProjectIndex } from '../storage'
import { reconcileIndex } from '../session'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  NEW_PROJECT_NAME,
  findTheShell,
  openProjectName,
  plantProject,
  renderApp,
  startNewProjectFromTheFailureView,
  stubCapableStorage,
} from './app-test-support'
import { holdIndexReads, type ReleaseReads } from './held-index-test-support'

const KEPT_NAME = 'Kept House'

/** An in-memory index whose reads throw before they return a promise. */
function indexWhoseReadsThrow(): InMemoryProjectIndex {
  const index = new InMemoryProjectIndex()
  const refuse = () => {
    throw new Error('storage is unavailable')
  }
  vi.spyOn(index, 'all').mockImplementation(refuse)
  vi.spyOn(index, 'get').mockImplementation(refuse)
  return index
}

describe('An index whose read throws', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens the project stored under current and reports no error', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ports = createTestPorts({ index: indexWhoseReadsThrow() })
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const error = vi.spyOn(console, 'error')

    renderApp(ports)

    expect(await openProjectName()).toBe(KEPT_NAME)
    expect(error).not.toHaveBeenCalled()
  })
})

describe('The failure view while the index does not answer', () => {
  let releaseReads: ReleaseReads = () => undefined

  afterEach(() => {
    releaseReads()
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /**
   * Renders the application on a kept project whose first read rejects, waits for the failure view,
   * and then holds every read of the index.
   */
  async function failedOpenWithAHeldIndex(): Promise<TestPorts> {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    await reconcileIndex(ports)
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    renderApp(ports)
    await screen.findByRole('alert')
    releaseReads = holdIndexReads(ports.index)
    return ports
  }

  it('Retry does not wait for the index', async () => {
    await failedOpenWithAHeldIndex()

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(await openProjectName()).toBe(KEPT_NAME)
  })

  it('Start a new project does not wait for the index', async () => {
    await failedOpenWithAHeldIndex()

    await startNewProjectFromTheFailureView()

    await findTheShell()
    expect(await openProjectName()).toBe(NEW_PROJECT_NAME)
  })
})
