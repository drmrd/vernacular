import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID as START_ID,
  expectOpenProject,
  plantProject,
  projectWithWalls,
  renderApp,
  settleForAWhile,
  stubCapableStorage,
} from './app-test-support'

const CURRENT_NAME = 'Current'
const RECOVERED_NAME = 'Recovered'
const OTHER_ID = 'other'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Ports with the start project stored, and a recovered copy of it in the snapshots of `id`. */
async function portsWithRecoveredWork(id: string = START_ID): Promise<TestPorts> {
  const ports = createTestPorts()
  await plantProject(ports, START_ID, CURRENT_NAME)
  await ports.workspace.snapshots(id).writeSnapshot(projectWithWalls(RECOVERED_NAME, 1))
  return ports
}

describe('The recovery prompt of the application', () => {
  it('offers a recovery prompt that restores recovered work into the session', async () => {
    stubCapableStorage()
    renderApp(await portsWithRecoveredWork())

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/recovered/i)

    await userEvent.click(within(alert).getByRole('button', { name: /restore/i }))

    await expectOpenProject(RECOVERED_NAME)
  })

  it('discards recovered work and dismisses the prompt when Discard is clicked', async () => {
    stubCapableStorage()
    const ports = await portsWithRecoveredWork()
    renderApp(ports)

    // Discard deletes the recovered copy, so it asks first, through the confirmation dialog.
    const alert = await screen.findByRole('alert')
    await userEvent.click(within(alert).getByRole('button', { name: /delete recovered copy/i }))
    const dialog = await screen.findByRole('alertdialog')

    // It deletes the recovered copy, not the changes in the open document.
    expect(dialog).toHaveTextContent(/delete the recovered copy of current\?/i)
    expect(dialog).not.toHaveTextContent(/discard unsaved changes/i)

    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete recovered copy' }))

    await waitFor(async () =>
      expect(await ports.workspace.snapshots(START_ID).isRecoverable()).toBe(false),
    )
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('No recovery prompt', () => {
  it('shows no recovery prompt when nothing is recoverable', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, CURRENT_NAME)

    renderApp(ports)

    // The stored project of these ports is open, so the answer came from its snapshots.
    await expectOpenProject(CURRENT_NAME)
    await settleForAWhile()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('offers no recovery for a project whose snapshots belong to another id', async () => {
    stubCapableStorage()
    const ports = await portsWithRecoveredWork(OTHER_ID)

    renderApp(ports)

    await expectOpenProject(CURRENT_NAME)
    await settleForAWhile()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
