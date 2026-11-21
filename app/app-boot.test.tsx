import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { App } from './app'
import { reconcileIndex } from '../session'
import {
  createTestPorts,
  holdNextRead,
  recordingPorts,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  LOADING_TEXT,
  builtPorts,
  clickCardOf,
  editTheProject,
  expectOpenProject,
  findCardLink,
  findThePageAlert,
  findTheProjectsPage,
  findTheShell,
  lockCalls,
  lockedIds,
  plantFailedProject,
  plantProject,
  renderApp,
  resetWindowAddress,
  secondTab,
  startNewProjectFromTheFailureView,
  startNewProjectFromThePage,
  storedIds,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'
const OPEN_ELSEWHERE_LINE = 'Already open in another tab.'

/** Ports whose store holds the kept project, indexed, and whose first read of any file fails once. */
async function portsThatFailOnceOnAKeptProject(): Promise<TestPorts> {
  const ports = createTestPorts()
  await plantProject(ports, FAILED_ID, KEPT_NAME)
  await reconcileIndex(ports)
  vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
  return ports
}

afterEach(() => {
  cleanup()
  resetWindowAddress()
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
    expect(lockedIds(ports)).toHaveLength(1)
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
    expect(lockCalls(log)).toEqual([expect.stringMatching(/^lock:/)])
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
  it('shows the Projects page with a notice when the project fails to load', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const read = vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('disk fault'))

    renderApp(ports)

    expect(await findThePageAlert()).toHaveTextContent(/could not open the project/i)
    // The failure is the one of these ports, not of a store resolved elsewhere.
    expect(read).toHaveBeenCalled()
  })

  it('names the underlying failure in the notice of the page', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('stored project is corrupt'))

    renderApp(ports)

    expect(await findThePageAlert()).toHaveTextContent(/stored project is corrupt/i)
  })

  it('says on the card that the project is open in another tab when another tab holds it', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, FAILED_ID, KEPT_NAME)
    await secondTab(ports).locks.tryAcquire(FAILED_ID)

    renderApp(ports)

    const page = await findTheProjectsPage()
    const card = await findCardLink(KEPT_NAME)
    expect(card).toHaveTextContent(OPEN_ELSEWHERE_LINE)
    expect(within(page).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('boots into the shell when the card of the failed project is clicked', async () => {
    stubCapableStorage()
    // Fails once, then reads normally: the click has to open the project again, not just
    // repaint the notice.
    const ports = await portsThatFailOnceOnAKeptProject()

    renderApp(ports)

    await findThePageAlert()
    await clickCardOf(KEPT_NAME)

    expect(await findTheShell()).toBeInTheDocument()
  })

  it('starts a new project from a failed boot without overwriting the stored one', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)
    await startNewProjectFromThePage()

    await findTheShell()
    // The stored bytes survive: they are only replaced by an explicit save.
    expect(save).not.toHaveBeenCalled()
    // The new project holds its own id on these ports, and nothing is stored under it yet.
    const [newId] = lockedIds(ports)
    expect(lockedIds(ports)).toHaveLength(1)
    expect(newId).not.toBe(FAILED_ID)
    expect(await storedIds(ports)).toEqual([FAILED_ID])
  })

  it('shows the loading view, and no Projects page, while a new project opens', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    renderApp(ports)
    await findThePageAlert()
    const letTheReadGo = holdNextRead(ports.workspace)

    await startNewProjectFromThePage()

    expect(await screen.findByText(LOADING_TEXT)).toBeInTheDocument()
    expect(screen.queryByRole('main', { name: 'Projects' })).not.toBeInTheDocument()
    expect(screen.queryAllByRole('link')).toEqual([])
    expect(screen.queryByRole('button', { name: 'New project' })).not.toBeInTheDocument()
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

  it('opens only the failed project from its card and leaves the resolved ports alone', async () => {
    stubCapableStorage()
    // The ports resolve normally; only the first open fails.
    const ports = await portsThatFailOnceOnAKeptProject()
    const resolvePorts = vi.fn(() => Promise.resolve(builtPorts(ports)))

    render(<App resolvePorts={resolvePorts} />)

    await findThePageAlert()
    await clickCardOf(KEPT_NAME)

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
    render(<App resolvePorts={resolvePorts} />)

    await startNewProjectFromTheFailureView()
    await editTheProject()

    expect(
      await screen.findByText(/all changes saved/i, {}, { timeout: AUTOSAVE_TIMEOUT_MS }),
    ).toBeInTheDocument()
    expect(resolvePorts).toHaveBeenCalledTimes(1)
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
