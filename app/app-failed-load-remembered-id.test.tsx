import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { App } from './app'
import {
  InMemoryActiveProjectIdStore,
  InMemoryDirectory,
  InMemoryRecentProjectStore,
} from '../storage'
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
  RecordingActiveProjectIdStore,
  chooseFromTheProjectMenu,
  documentBytes,
  editTheProject,
  expectOpenProject,
  failedOpenSentence,
  namedProject,
  openProjectName,
  plantFailedProject,
  plantProject,
  reloadOf,
  rememberedId,
  renderApp,
  settleForAWhile,
  startNewProjectFromTheFailureView,
  stubCapableStorage,
} from './app-test-support'

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

async function documentText(directory: InMemoryDirectory): Promise<string> {
  const bytes = await directory.readFile(DOCUMENT_FILE)
  return new TextDecoder().decode(bytes)
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('The remembered id after a project started from a failed load', () => {
  it('still shows the failure dialog on the next boot when the new project was never saved', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    const port = new InMemoryActiveProjectIdStore()
    renderApp(ports, { activeProjectIds: port })
    await startNewProjectFromTheFailureView()
    await screen.findByRole('button', { name: /add floor/i })
    cleanup()

    renderApp(reloadOf(ports), { activeProjectIds: port })

    expect(await screen.findByRole('alert')).toHaveTextContent(await failedOpenSentence(ports))
    expect(await port.read()).toBeUndefined()
  })

  it('opens the new project on the next boot once its first save went through', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    const port = new InMemoryActiveProjectIdStore()
    renderApp(ports, { activeProjectIds: port })
    await startNewProjectFromTheFailureView()
    await editTheProject()
    await expectTheSaveReportedSaved()
    await waitFor(async () => expect(await port.read()).toBeDefined(), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    cleanup()

    renderApp(reloadOf(ports), { activeProjectIds: port })

    expect(await openProjectName()).toBe(NEW_PROJECT_NAME)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(await port.read()).not.toBe(FAILED_ID)
  })

  it('never writes the port when the session runs on the in-memory fallback', async () => {
    stubCapableStorage()
    const port = new RecordingActiveProjectIdStore()
    const resolvePorts = vi.fn(() => Promise.reject(new Error('no storage backend')))
    render(<App resolvePorts={resolvePorts} activeProjectIds={port} />)
    await startNewProjectFromTheFailureView()
    await editTheProject()

    await expectTheSaveReportedSaved()

    expect(resolvePorts).toHaveBeenCalledTimes(1)
    expect(port.writes).toEqual([])
  })

  it('reports the save as saved when the id write rejects and writes the id at the next save', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    const port = new RecordingActiveProjectIdStore(1)
    renderApp(ports, { activeProjectIds: port })
    await startNewProjectFromTheFailureView()
    await editTheProject()
    await waitFor(() => expect(port.writes).toHaveLength(1), { timeout: AUTOSAVE_TIMEOUT_MS })
    await expectTheSaveReportedSaved()

    await editTheProject()

    await waitFor(() => expect(port.writes).toHaveLength(2), { timeout: AUTOSAVE_TIMEOUT_MS })
    const [failedWrite, retriedWrite] = port.writes
    expect(retriedWrite).toBe(failedWrite)
    expect(retriedWrite).not.toBe(FAILED_ID)
    expect(await port.read()).toBe(retriedWrite)
  })
})

describe('The remembered id after a switch between projects', () => {
  it('remembers the first project again when it is saved after a return to it', async () => {
    stubCapableStorage()
    const ports = createTestPorts({ durable: true })
    await plantProject(ports, FAILED_ID, 'First House')
    await plantProject(ports, SECOND_ID, 'Second House')
    const recentProjects = new InMemoryRecentProjectStore()
    await recentProjects.record({
      id: SECOND_ID,
      name: 'Second House',
      backend: 'opfs',
      lastOpened: 1,
    })
    await recentProjects.record({
      id: FAILED_ID,
      name: 'First House',
      backend: 'opfs',
      lastOpened: 2,
    })
    const port = await rememberedId(FAILED_ID)
    const write = vi.spyOn(port, 'write')
    renderApp(ports, { activeProjectIds: port, recentProjects })
    await expectOpenProject('First House')

    await chooseFromTheProjectMenu('Second House')
    await expectOpenProject('Second House')
    await editTheProject()
    await waitFor(() => expect(write).toHaveBeenCalledWith(SECOND_ID), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await chooseFromTheProjectMenu('First House')
    await expectOpenProject('First House')
    await editTheProject()

    await waitFor(async () => expect(await port.read()).toBe(FAILED_ID), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    expect(write.mock.calls).toEqual([[SECOND_ID], [FAILED_ID]])
  })

  it('does not remember a project that was opened from a folder', async () => {
    stubCapableStorage()
    vi.stubGlobal('showDirectoryPicker', () => Promise.reject(new Error('not used')))
    const ports = createTestPorts({ durable: true })
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, documentBytes(namedProject('Folder House')))
    const before = await documentText(folder)
    pickFolder(ports, folder, 'Old house')
    const port = new RecordingActiveProjectIdStore()
    renderApp(ports, { activeProjectIds: port })
    await expectOpenProject(NEW_PROJECT_NAME)

    await chooseFromTheProjectMenu('Open folder')
    await expectOpenProject('Folder House')
    await editTheProject()
    await waitFor(async () => expect(await documentText(folder)).not.toBe(before), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await settleForAWhile()

    expect(port.writes).toEqual([])
  })
})
