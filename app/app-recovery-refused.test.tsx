import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  NEWEST_COPY_NAME,
  autosaveFolderOf,
  plantRefusedCopy,
  refusedBytes,
} from '../session/handle/handle-refused-snapshots-test-kit'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  START_ID,
  expectOpenProject,
  plantProject,
  projectWithWalls,
  renderApp,
  settleForAWhile,
  stubCapableStorage,
} from './app-test-support'

const CURRENT_NAME = 'Current'
const RECOVERED_NAME = 'Recovered'
const COPY_KEPT_SENTENCE =
  "A recovery copy could not be read. It is kept with the project's backups."
const RESTORE_BUTTON = { name: /restore/i }
const SNAPSHOT_PREFIX = 'snapshot-'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Ports with the start project stored, and a recovered copy that can be read in its snapshots. */
async function portsWithReadableCopy(): Promise<TestPorts> {
  const ports = createTestPorts()
  await plantProject(ports, START_ID, CURRENT_NAME)
  await ports.workspace.snapshots(START_ID).writeSnapshot(projectWithWalls(RECOVERED_NAME, 1))
  return ports
}

/** Puts a copy that is not JSON in the place of each recovery copy that the start project holds. */
async function makeEachCopyUnreadable(ports: TestPorts): Promise<void> {
  const folder = autosaveFolderOf(START_ID)
  const copies = (await ports.root.list(folder)).filter((name) => name.startsWith(SNAPSHOT_PREFIX))
  await Promise.all(copies.map((name) => ports.root.writeFile(`${folder}/${name}`, refusedBytes())))
}

describe('The application when a recovery copy cannot be read', () => {
  it('says that a recovery copy could not be read and is kept, and shows no recovery prompt', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, CURRENT_NAME)
    await plantRefusedCopy(ports.root, autosaveFolderOf(START_ID))

    renderApp(ports)

    expect(await screen.findByText(COPY_KEPT_SENTENCE)).toBeInTheDocument()
    await expectOpenProject(CURRENT_NAME)
    await settleForAWhile()
    expect(screen.getAllByText(COPY_KEPT_SENTENCE)).toHaveLength(1)
    expect(screen.queryByRole('button', RESTORE_BUTTON)).not.toBeInTheDocument()
  })

  it('a Restore of a copy that cannot be read says the same sentence, and the prompt goes', async () => {
    stubCapableStorage()
    const ports = await portsWithReadableCopy()
    renderApp(ports)
    const restore = await screen.findByRole('button', RESTORE_BUTTON)
    // The open moved nothing, so the copy that the prompt offers goes bad only now.
    await makeEachCopyUnreadable(ports)

    await userEvent.click(restore)

    expect(await screen.findByText(COPY_KEPT_SENTENCE)).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('button', RESTORE_BUTTON)).not.toBeInTheDocument(),
    )
    await expectOpenProject(CURRENT_NAME)
  })

  it('the prompt stays when an older copy that can be read is left', async () => {
    stubCapableStorage()
    const ports = await portsWithReadableCopy()
    await plantRefusedCopy(ports.root, autosaveFolderOf(START_ID), NEWEST_COPY_NAME)

    renderApp(ports)

    expect(await screen.findByText(COPY_KEPT_SENTENCE)).toBeInTheDocument()
    await settleForAWhile()
    expect(screen.getByRole('button', RESTORE_BUTTON)).toBeInTheDocument()
  })
})
