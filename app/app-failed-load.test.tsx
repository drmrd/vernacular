import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import { reconcileIndex } from '../session'
import { createTestPorts, recordOf, type TestPorts } from '../session/handle/handle-test-kit'
import {
  clearLegacyActiveProjectId,
  legacyActiveProjectIdIsStored,
  plantLegacyActiveProjectId,
} from '../storage/active-project/legacy-active-project-id-test-kit'
import {
  START_ID,
  expectOpenProject,
  failedOpenSentence,
  lockedIds,
  openProjectName,
  plantFailedProject,
  plantProject,
  reloadOf,
  renderApp,
  settleForAWhile,
  stubCapableStorage,
  usedLast,
} from './app-test-support'

const SECOND_ID = 'project-second'

/** Ports whose store holds "Old Cottage" under current and "Second House" under the second id. */
async function portsWithTwoProjects(durable = false): Promise<TestPorts> {
  const ports = createTestPorts({ durable })
  await plantProject(ports, START_ID, 'Old Cottage')
  await plantProject(ports, SECOND_ID, 'Second House')
  return ports
}

/** The same ports, with an index that holds a record of every stored project. */
async function indexedPortsWithTwoProjects(): Promise<TestPorts> {
  const ports = await portsWithTwoProjects()
  await reconcileIndex(ports)
  return ports
}

afterEach(() => {
  cleanup()
  clearLegacyActiveProjectId()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('The application opens the project that was used last', () => {
  it('opens the workspace project that was used last', async () => {
    stubCapableStorage()
    const ports = await indexedPortsWithTwoProjects()
    await usedLast(ports, SECOND_ID)

    renderApp(ports)

    expect(await openProjectName()).toBe('Second House')
  })

  it('opens the project stored under current when the index holds no record', async () => {
    stubCapableStorage()
    // The second project is stored first, so that it is not the one changed last.
    const ports = createTestPorts()
    await plantProject(ports, SECOND_ID, 'Second House')
    await plantProject(ports, START_ID, 'Old Cottage')

    renderApp(ports)

    expect(await openProjectName()).toBe('Old Cottage')
  })

  it('opens a fresh project when the store no longer holds the project of the latest record', async () => {
    stubCapableStorage()
    const ports = await indexedPortsWithTwoProjects()
    await usedLast(ports, START_ID)
    const realRead = ports.workspace.read.bind(ports.workspace)
    const read = vi
      .spyOn(ports.workspace, 'read')
      .mockImplementation((id) =>
        id === START_ID
          ? Promise.resolve({ ok: false, failure: { kind: 'not-found' } })
          : realRead(id),
      )

    renderApp(ports)

    expect(await openProjectName()).toBe('Untitled project')
    expect(read).toHaveBeenCalledWith(START_ID)
    expect(read).not.toHaveBeenCalledWith(SECOND_ID)
  })
})

describe('The application that starts from the records of the index', () => {
  it('starts in the workspace project used last also when it did not open', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    await plantProject(ports, SECOND_ID, 'Second House')
    await reconcileIndex(ports)
    await usedLast(ports, START_ID)
    const read = vi.spyOn(ports.workspace, 'read')

    renderApp(ports)

    expect(await screen.findByRole('alert')).toHaveTextContent(await failedOpenSentence(ports))
    expect(read).not.toHaveBeenCalledWith(SECOND_ID)
    expect(lockedIds(ports)).not.toContain(SECOND_ID)
  })

  it('a store with only current and no index starts in that project and then has its record', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, 'Old Cottage')

    renderApp(ports)

    expect(await openProjectName()).toBe('Old Cottage')
    await waitFor(async () =>
      expect(await recordOf(ports, START_ID)).toMatchObject({
        name: 'Old Cottage',
        location: { kind: 'workspace' },
      }),
    )
  })

  it('starts once in the project that an older build remembered', async () => {
    stubCapableStorage()
    const ports = await portsWithTwoProjects(true)
    plantLegacyActiveProjectId(SECOND_ID)
    renderApp(ports)
    await expectOpenProject('Second House')
    expect(legacyActiveProjectIdIsStored()).toBe(false)
    cleanup()
    await settleForAWhile()
    await usedLast(ports, START_ID)

    renderApp(reloadOf(ports))

    await expectOpenProject('Old Cottage')
  })
})
