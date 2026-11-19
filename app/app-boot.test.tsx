import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import { OPEN_ELSEWHERE } from './open-failure-text'
import { createTestPorts, holdNextRead, recordingPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  LOADING_TEXT,
  RecordingActiveProjectIdStore,
  builtPorts,
  editTheProject,
  expectOpenProject,
  findTheShell,
  lockCalls,
  lockedIds,
  plantFailedProject,
  plantProject,
  renderApp,
  secondTab,
  startNewProjectFromTheFailureView,
  storedIds,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('The application boots from its ports', () => {
  it('boots from the ports and renders the editor shell with a ground floor', async () => {
    stubCapableStorage()

    renderApp(createTestPorts())

    expect(await findTheShell()).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
  })

  it('raises a banner when booting into a storage-degraded environment', async () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('indexedDB', undefined)

    renderApp(createTestPorts())

    await findTheShell()
    expect(await screen.findByRole('alert')).toHaveTextContent(/storage/i)
  })

  it('stays silent when storage is healthy', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderApp(createTestPorts())

    await findTheShell()
    // Flush the storage-probe microtask chain so the negative assertion is deterministic.
    await act(async () => {})

    expect(warn).not.toHaveBeenCalled()
  })

  it('renders the editor inside a themed container', async () => {
    stubCapableStorage()

    renderApp(createTestPorts())

    await findTheShell()
    expect(document.querySelector('[data-theme]')).not.toBeNull()
  })

  it('stores nothing at the first start of an empty browser', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)

    await findTheShell()
    await act(async () => {})
    expect(lockedIds(ports)).toEqual([FAILED_ID])
    expect(save).not.toHaveBeenCalled()
    expect(await storedIds(ports)).toEqual([])
  })

  it('under StrictMode the application opens its project once and shows the shell', async () => {
    stubCapableStorage()
    const log: string[] = []
    const ports = recordingPorts(log)

    render(
      <StrictMode>
        <App ports={ports} />
      </StrictMode>,
    )

    await findTheShell()
    await act(async () => {})
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lockCalls(log)).toEqual([`lock:${FAILED_ID}`])
  })

  it('opens the project again after an unmount and a new render on the same ports', async () => {
    stubCapableStorage()
    const log: string[] = []
    const ports = recordingPorts(log)
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const { unmount } = renderApp(ports)
    await expectOpenProject(KEPT_NAME)

    unmount()
    renderApp(ports)

    await expectOpenProject(KEPT_NAME)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(lockCalls(log)).toEqual([
      `lock:${FAILED_ID}`,
      `unlock:${FAILED_ID}`,
      `lock:${FAILED_ID}`,
    ])
  })
})

describe('The application after a failed start', () => {
  it('shows a recoverable error when the project fails to load', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const read = vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('disk fault'))

    renderApp(ports)

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not open the project/i)
    // The failure is the one of these ports, not of a store resolved elsewhere.
    expect(read).toHaveBeenCalledWith(FAILED_ID)
  })

  it('names the underlying failure in the boot error notice', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('stored project is corrupt'))

    renderApp(ports)

    expect(await screen.findByRole('alert')).toHaveTextContent(/stored project is corrupt/i)
  })

  it('says that the project is open in another tab when another tab holds it', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await secondTab(ports).locks.tryAcquire(FAILED_ID)

    renderApp(ports)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(OPEN_ELSEWHERE)
    expect(alert).not.toHaveTextContent(/could not open the project/i)
  })

  it('boots into the shell when the failed boot is retried', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    // Fails once, then reads normally: Retry has to run the start again, not just
    // repaint the notice.
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))

    renderApp(ports)

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    expect(await findTheShell()).toBeInTheDocument()
  })

  it('starts a new project from a failed boot without overwriting the stored one', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)
    await startNewProjectFromTheFailureView()

    await findTheShell()
    // The stored bytes survive: they are only replaced by an explicit save.
    expect(save).not.toHaveBeenCalled()
    // The new project holds its own id on these ports, and nothing is stored under it yet.
    const [newId] = lockedIds(ports)
    expect(lockedIds(ports)).toHaveLength(1)
    expect(newId).not.toBe(FAILED_ID)
    expect(await storedIds(ports)).toEqual([FAILED_ID])
  })

  it('shows the loading view, and no button of the failure view, while a new project opens', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    renderApp(ports)
    await screen.findByRole('alert')
    const letTheReadGo = holdNextRead(ports.workspace)

    await userEvent.click(screen.getByRole('button', { name: 'Start a new project' }))

    expect(await screen.findByText(LOADING_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start a new project' })).not.toBeInTheDocument()
    letTheReadGo()
    expect(await findTheShell()).toBeInTheDocument()
  })
})

describe('The application that resolves its ports', () => {
  it('resolves the ports asynchronously and boots into the shell when none are injected', async () => {
    stubCapableStorage()
    const resolvePorts = vi.fn(() => Promise.resolve(builtPorts(createTestPorts())))

    render(<App resolvePorts={resolvePorts} />)

    expect(await findTheShell()).toBeInTheDocument()
    expect(screen.getByRole('main', { name: /viewport/i })).toBeInTheDocument()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
  })

  it('retries only the failed open and leaves the resolved ports alone', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    // The ports resolve normally; only the first open fails.
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    const resolvePorts = vi.fn(() => Promise.resolve(builtPorts(ports)))

    render(<App resolvePorts={resolvePorts} />)

    await screen.findByRole('alert')
    await userEvent.click(screen.getByRole('button', { name: /retry/i }))

    await findTheShell()
    // Resolving again would hand the open project other ports, and a resolution that
    // failed the second time would throw away a working start.
    expect(resolvePorts).toHaveBeenCalledTimes(1)
  })

  it('renders the error state when the ports do not resolve', async () => {
    stubCapableStorage()
    const resolvePorts = vi.fn(() => Promise.reject(new Error('no storage backend')))

    render(<App resolvePorts={resolvePorts} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
  })

  it('starts a new project that is not durable when the ports do not resolve, and builds no ports again', async () => {
    stubCapableStorage()
    const resolvePorts = vi.fn(() => Promise.reject(new Error('no storage backend')))
    const remembered = new RecordingActiveProjectIdStore()
    render(<App resolvePorts={resolvePorts} activeProjectIds={remembered} />)

    await startNewProjectFromTheFailureView()
    await editTheProject()

    expect(
      await screen.findByText(/all changes saved/i, {}, { timeout: AUTOSAVE_TIMEOUT_MS }),
    ).toBeInTheDocument()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
    expect(remembered.writes).toEqual([])
  })

  it('a Retry after the ports did not resolve builds them again and opens the project', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    const resolvePorts = vi
      .fn(() => Promise.resolve(builtPorts(ports)))
      .mockRejectedValueOnce(new Error('no storage backend'))
    render(<App resolvePorts={resolvePorts} />)
    await screen.findByRole('alert')

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))

    await expectOpenProject(KEPT_NAME)
    expect(resolvePorts).toHaveBeenCalledTimes(2)
  })
})
