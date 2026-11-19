import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, waitFor } from '@testing-library/react'
import { InMemoryActiveProjectIdStore } from '../storage'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  editTheProject,
  filesUnder,
  projectFromANewerBuild,
  renderApp,
  startNewProjectFromTheFailureView,
  storedIds,
  stubCapableStorage,
} from './app-test-support'

// The failed project with a backup and a snapshot beside its document, so that every
// file of it can be compared before and after.
async function seedFailedProject(ports: TestPorts): Promise<void> {
  const bytes = projectFromANewerBuild()
  await ports.root.writeFile(`${FAILED_ID}/vernacular.json`, bytes)
  await ports.root.writeFile(`${FAILED_ID}/.house-backups/vernacular.pre-migration.json`, bytes)
  await ports.root.writeFile(`${FAILED_ID}/.house-autosave/snapshot-1.json`, bytes)
}

describe('A project started after a failed load', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('autosaves under its own id and leaves every file of the failed project untouched', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await seedFailedProject(ports)
    const before = await filesUnder(ports.root, FAILED_ID)
    expect(await storedIds(ports)).toEqual([FAILED_ID])
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports, { activeProjectIds: new InMemoryActiveProjectIdStore() })

    await startNewProjectFromTheFailureView()
    await editTheProject()
    await waitFor(() => expect(save).toHaveBeenCalled(), { timeout: AUTOSAVE_TIMEOUT_MS })
    await save.mock.results[0]?.value

    expect(await filesUnder(ports.root, FAILED_ID)).toEqual(before)
    const ids = await storedIds(ports)
    const newId = ids.find((id) => id !== FAILED_ID)
    expect(ids).toEqual(expect.arrayContaining([FAILED_ID, newId]))
    expect(ids).toHaveLength(2)
  })
})
