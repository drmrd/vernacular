import { describe, it, expect, afterEach, vi } from 'vitest'
import { screen, cleanup, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ActiveProjectIdStore } from '../storage'
import { settle } from '../session/autosave/save-gate-test-kit'
import { createTestPorts, holdNextRead, recordingPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  LOADING_TEXT,
  NEW_PROJECT_NAME,
  RecordingActiveProjectIdStore,
  chooseFromTheProjectMenu,
  editTheProject,
  expectOpenProject,
  findTheShell,
  lockCalls,
  lockedIds,
  logSaves,
  openProjectName,
  plantFailedProject,
  plantProject,
  renderApp,
  settleForAWhile,
  startNewProjectFromTheFailureView,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'

function startANewProjectButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Start a new project' })
}

// The lock calls of every project other than the failed one, in their order.
function newProjectLockCalls(log: readonly string[]): string[] {
  const failed = [`lock:${FAILED_ID}`, `unlock:${FAILED_ID}`]
  return lockCalls(log).filter((call) => !failed.includes(call))
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('A new project that opens after a failed start', () => {
  it('while a new project opens, the failure view is gone, so no Retry can run beside it', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    renderApp(ports)
    await screen.findByRole('alert')
    const letTheReadGo = holdNextRead(ports.workspace)

    await userEvent.click(startANewProjectButton())

    expect(await screen.findByText(LOADING_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    letTheReadGo()
    await expectOpenProject(NEW_PROJECT_NAME)
    const [newId] = lockedIds(ports)
    expect(lockedIds(ports)).toHaveLength(1)
    expect(newId).not.toBe(FAILED_ID)
  })
})

describe('A save that finishes after another new project started', () => {
  it('remembers exactly the id of the project that was saved', async () => {
    stubCapableStorage()
    const ports = createTestPorts({ durable: true })
    await plantFailedProject(ports)
    const saves = logSaves(ports.workspace)
    const remembered = new RecordingActiveProjectIdStore()
    renderApp(ports, { activeProjectIds: remembered })
    await startNewProjectFromTheFailureView()
    const letTheSavesGo = saves.hold()
    await editTheProject()
    await waitFor(() => expect(ports.workspace.save).toHaveBeenCalled(), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    const firstId = vi.mocked(ports.workspace.save).mock.calls[0]?.[0]

    await chooseFromTheProjectMenu(/new project/i)
    letTheSavesGo()
    await waitFor(() => expect(saves.saved).toContain(firstId), { timeout: AUTOSAVE_TIMEOUT_MS })
    await waitFor(() => expect(remembered.writes).toContain(firstId))
    await waitFor(() => expect(lockedIds(ports)).not.toContain(firstId))
    await settleForAWhile()

    expect(firstId).not.toBe(FAILED_ID)
    expect(remembered.writes).toEqual([firstId])
    expect(await remembered.read()).toBe(firstId)
  })
})

describe('A port that rejects its read', () => {
  it('opens the project stored under current instead of staying on the loading view', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const port: ActiveProjectIdStore = {
      read: () => Promise.reject(new Error('storage is unavailable')),
      write: () => Promise.resolve(),
    }

    renderApp(ports, { activeProjectIds: port })

    expect(await openProjectName()).toBe(KEPT_NAME)
  })
})

describe('Guards on starting a new project from the failure view', () => {
  it('starts one new project on a double click', async () => {
    stubCapableStorage()
    const log: string[] = []
    const ports = recordingPorts(log)
    await plantFailedProject(ports)
    renderApp(ports)
    await screen.findByRole('alert')

    await userEvent.dblClick(startANewProjectButton())

    await findTheShell()
    await act(async () => {})
    expect(newProjectLockCalls(log).filter((call) => call.startsWith('lock:'))).toHaveLength(1)
    expect(lockedIds(ports)).toHaveLength(1)
  })

  it('closes the project and logs no warning when unmounted while the new project opens', async () => {
    stubCapableStorage()
    const log: string[] = []
    const ports = recordingPorts(log)
    await plantFailedProject(ports)
    renderApp(ports)
    await screen.findByRole('alert')
    const letTheReadGo = holdNextRead(ports.workspace)
    await userEvent.click(startANewProjectButton())
    const error = vi.spyOn(console, 'error')
    const warn = vi.spyOn(console, 'warn')

    cleanup()
    await act(async () => {
      letTheReadGo()
      await settle()
    })

    await waitFor(() => expect(newProjectLockCalls(log)).toHaveLength(2))
    const [locked, unlocked] = newProjectLockCalls(log)
    expect(locked).toMatch(/^lock:/)
    expect(unlocked).toBe(locked?.replace(/^lock:/, 'unlock:'))
    expect(lockedIds(ports)).toEqual([])
    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})
