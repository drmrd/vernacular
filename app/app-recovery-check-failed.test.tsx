import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { DocumentStore } from '../storage'
import { autosaveFolderOf, refusedBytes } from '../session/handle/handle-refused-snapshots-test-kit'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  START_ID,
  plantProject,
  projectWithWalls,
  renderApp,
  stubCapableStorage,
} from './app-test-support'

const COPY_KEPT_SENTENCE =
  "A recovery copy could not be read. It is kept with the project's backups."
const CHECK_FAILED_MESSAGE = 'checking for a recovered copy failed'
const RESTORE_BUTTON = { name: /restore/i }
const SNAPSHOT_PREFIX = 'snapshot-'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A switch that makes each later check for a recovered copy reject with `error`. */
interface FailingChecks {
  readonly error: Error
  failFromNow(): void
}

/**
 * From now on each `snapshots(id)` of the store gives the real snapshots, except that
 * `isRecoverable` rejects once the switch is on. Call this before the open.
 */
function failChecksOnDemand(store: DocumentStore): FailingChecks {
  const error = new Error('the snapshots cannot be listed')
  let failing = false
  const realSnapshots = store.snapshots.bind(store)
  store.snapshots = (id) => {
    const real = realSnapshots(id)
    return {
      writeSnapshot: (project) => real.writeSnapshot(project),
      prune: () => real.prune(),
      isRecoverable: () => (failing ? Promise.reject(error) : real.isRecoverable()),
      restore: () => real.restore(),
      setAsideRefused: () => real.setAsideRefused(),
    }
  }
  return {
    error,
    failFromNow: () => {
      failing = true
    },
  }
}

async function makeEachCopyUnreadable(ports: TestPorts): Promise<void> {
  const folder = autosaveFolderOf(START_ID)
  const copies = (await ports.root.list(folder)).filter((name) => name.startsWith(SNAPSHOT_PREFIX))
  await Promise.all(copies.map((name) => ports.root.writeFile(`${folder}/${name}`, refusedBytes())))
}

describe('The application when the check after a Restore that did not restore fails', () => {
  it('logs the failed check and keeps the recovery prompt', async () => {
    stubCapableStorage()
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const ports = createTestPorts()
    await plantProject(ports, START_ID, 'Current')
    await ports.workspace.snapshots(START_ID).writeSnapshot(projectWithWalls('Recovered', 1))
    const checks = failChecksOnDemand(ports.workspace)
    renderApp(ports)
    const restore = await screen.findByRole('button', RESTORE_BUTTON)
    await makeEachCopyUnreadable(ports)
    checks.failFromNow()

    await userEvent.click(restore)

    expect(await screen.findByText(COPY_KEPT_SENTENCE)).toBeInTheDocument()
    await waitFor(() => expect(logged).toHaveBeenCalledWith(CHECK_FAILED_MESSAGE, checks.error))
    expect(screen.getByRole('button', RESTORE_BUTTON)).toBeInTheDocument()
  })
})
