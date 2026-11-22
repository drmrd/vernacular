import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, act, within } from '@testing-library/react'
import { App } from './app'
import { reconcileIndex } from '../session'
import { createTestPorts, holdNextRead, type TestPorts } from '../session/handle/handle-test-kit'
import {
  FAILED_ID,
  LOADING_TEXT,
  builtPorts,
  clickCardOf,
  expectOpenProject,
  findCardLink,
  findTheProjectsPage,
  findTheShell,
  lockCalls,
  lockedIds,
  plantFailedProject,
  plantProject,
  renderApp,
  resetWindowAddress,
  secondTab,
  startNewProjectFromThePage,
  storedIds,
  stubCapableStorage,
} from './app-test-support'
import { closeTheDialog, findTheFailedOpenDialog } from './failed-open-dialog-test-support'

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

/** Durable ports whose locks put `lock:<id>` and `unlock:<id>` in `log`, in the order of the calls. */
function durableRecordingPorts(log: string[]): TestPorts {
  const ports = createTestPorts({ durable: true })
  const acquire = ports.locks.tryAcquire.bind(ports.locks)
  vi.spyOn(ports.locks, 'tryAcquire').mockImplementation(async (id) => {
    log.push(`lock:${id}`)
    const hold = await acquire(id)
    if (hold === undefined) return undefined
    return {
      release: () => {
        log.push(`unlock:${id}`)
        return hold.release()
      },
    }
  })
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

  it('stays silent when storage is healthy', async () => {
    stubCapableStorage()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    renderApp(createTestPorts({ durable: true }))

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
    const ports = durableRecordingPorts(log)

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
    const ports = durableRecordingPorts(log)
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
  it('shows the failed-open dialog over the Projects page when the project fails to load', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const read = vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('disk fault'))

    renderApp(ports)

    expect(await findTheFailedOpenDialog()).toBeInTheDocument()
    // The failure is the one of these ports, not of a store resolved elsewhere.
    expect(read).toHaveBeenCalled()
  })

  it('names the underlying failure in the dialog', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    vi.spyOn(ports.workspace, 'read').mockRejectedValue(new Error('stored project is corrupt'))

    renderApp(ports)

    expect(await findTheFailedOpenDialog()).toHaveTextContent(/stored project is corrupt/i)
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

    await closeTheDialog()
    await clickCardOf(KEPT_NAME)

    expect(await findTheShell()).toBeInTheDocument()
  })

  it('starts a new project from a failed boot without overwriting the stored one', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantFailedProject(ports)
    const save = vi.spyOn(ports.workspace, 'save')

    renderApp(ports)
    await closeTheDialog()
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
    await closeTheDialog()
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

    await closeTheDialog()
    await clickCardOf(KEPT_NAME)

    await findTheShell()
    // Resolving again would hand the open project other ports, and a resolution that
    // failed the second time would throw away a working start.
    expect(resolvePorts).toHaveBeenCalledTimes(1)
  })
})
