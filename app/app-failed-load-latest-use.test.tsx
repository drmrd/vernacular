import { describe, it, expect, afterEach, vi, type MockInstance } from 'vitest'
import { screen, cleanup, waitFor } from '@testing-library/react'
import { InMemoryDirectory, type DocumentStore } from '../storage'
import {
  DOCUMENT_FILE,
  createTestPorts,
  pickFolder,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  NEW_PROJECT_NAME,
  START_ID,
  chooseFromTheProjectMenu,
  documentBytes,
  editTheProject,
  expectOpenProject,
  failedOpenSentence,
  lockedIds,
  namedProject,
  openProjectName,
  plantFailedProject,
  plantProject,
  recordIds,
  reloadOf,
  renderApp,
  settleForAWhile,
  startNewProjectFromTheFailureView,
  stubCapableStorage,
} from './app-test-support'

const FIRST_ID = 'project-first'
const SECOND_ID = 'project-second'

// Durable ports whose workspace holds a project that this build cannot open.
async function durablePortsWithAFailedProject(): Promise<TestPorts> {
  const ports = createTestPorts({ durable: true })
  await plantFailedProject(ports)
  return ports
}

// The save-status label of the shell is how the user learns that a save went through.
async function expectTheSaveReportedSaved(): Promise<void> {
  expect(
    await screen.findByText(/all changes saved/i, {}, { timeout: AUTOSAVE_TIMEOUT_MS }),
  ).toBeInTheDocument()
}

// The ids of the records of the index, other than the record of the project that failed to open.
async function recordIdsBesideTheFailedOne(ports: TestPorts): Promise<string[]> {
  return (await recordIds(ports)).filter((id) => id !== FAILED_ID)
}

// The ids of every save that the spy of the store saw.
function savedIds(save: MockInstance<DocumentStore['save']>): string[] {
  return save.mock.calls.map(([id]) => id)
}

async function documentText(directory: InMemoryDirectory): Promise<string> {
  const bytes = await directory.readFile(DOCUMENT_FILE)
  return new TextDecoder().decode(bytes)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('The start after a project started from a failed load', () => {
  it('still shows the failure dialog on the next boot when the new project was never saved', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    renderApp(ports)
    await startNewProjectFromTheFailureView()
    await screen.findByRole('button', { name: /add floor/i })
    cleanup()

    renderApp(reloadOf(ports))

    expect(await screen.findByRole('alert')).toHaveTextContent(await failedOpenSentence(ports))
    expect(await recordIdsBesideTheFailedOne(ports)).toEqual([])
  })

  it('opens the new project on the next boot once its first save went through', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    renderApp(ports)
    await startNewProjectFromTheFailureView()
    await editTheProject()
    await expectTheSaveReportedSaved()
    await waitFor(async () => expect(await recordIdsBesideTheFailedOne(ports)).toHaveLength(1), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    cleanup()

    renderApp(reloadOf(ports))

    expect(await openProjectName()).toBe(NEW_PROJECT_NAME)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('reports the save as saved when the index rejects its writes', async () => {
    stubCapableStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const ports = await durablePortsWithAFailedProject()
    const put = vi.spyOn(ports.index, 'put').mockRejectedValue(new Error('the index is full'))
    renderApp(ports)
    await startNewProjectFromTheFailureView()

    await editTheProject()

    await expectTheSaveReportedSaved()
    await waitFor(
      () => expect(put.mock.calls.some(([record]) => record.id !== FAILED_ID)).toBe(true),
      { timeout: AUTOSAVE_TIMEOUT_MS },
    )
    expect(await recordIdsBesideTheFailedOne(ports)).toEqual([])
  })
})

describe('The start after a switch between projects', () => {
  it('starts in the first project again when it was saved after a return to it', async () => {
    stubCapableStorage()
    const ports = createTestPorts({ durable: true })
    await plantProject(ports, FIRST_ID, 'First House')
    await plantProject(ports, SECOND_ID, 'Second House')
    const save = vi.spyOn(ports.workspace, 'save')
    renderApp(ports, { projectId: FIRST_ID })
    await expectOpenProject('First House')
    await chooseFromTheProjectMenu('Second House')
    await expectOpenProject('Second House')
    await editTheProject()
    await waitFor(() => expect(savedIds(save)).toContain(SECOND_ID), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await chooseFromTheProjectMenu('First House')
    await expectOpenProject('First House')
    await editTheProject()
    await waitFor(() => expect(savedIds(save)).toContain(FIRST_ID), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await settleForAWhile()
    cleanup()
    await settleForAWhile()

    renderApp(reloadOf(ports))

    await expectOpenProject('First House')
  })

  it('does not start in a project that was opened from a folder', async () => {
    stubCapableStorage()
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('not used')))
    const ports = createTestPorts({ durable: true })
    await plantProject(ports, START_ID, 'Old Cottage')
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, documentBytes(namedProject('Folder House')))
    const before = await documentText(folder)
    pickFolder(ports, folder, 'Old house')
    renderApp(ports)
    await expectOpenProject('Old Cottage')
    await chooseFromTheProjectMenu('Open folder')
    await expectOpenProject('Folder House')
    await editTheProject()
    await waitFor(async () => expect(await documentText(folder)).not.toBe(before), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await settleForAWhile()
    cleanup()
    await settleForAWhile()
    const reloaded = reloadOf(ports)

    renderApp(reloaded)

    await expectOpenProject('Old Cottage')
    expect(lockedIds(reloaded)).toEqual([START_ID])
  })
})
