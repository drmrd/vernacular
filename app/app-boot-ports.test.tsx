import { StrictMode } from 'react'
import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { App, type BuiltSessionPorts } from './app'
import { reconcileIndex } from '../session'
import {
  createTestPorts,
  recordOf,
  recordingPorts,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  START_ID,
  builtPorts,
  editTheProject,
  expectOpenProject,
  findTheShell,
  lockCalls,
  lockedIds,
  plantFailedProject,
  plantProject,
  resetWindowAddress,
  settleForAWhile,
  startNewProjectFromTheFailureView,
  storedIds,
  stubCapableStorage,
} from './app-test-support'

const KEPT_NAME = 'Kept House'
const NO_STORAGE = 'no storage backend'

afterEach(() => {
  cleanup()
  resetWindowAddress()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Asserts that a new project, started after a failed open, lives on `ports`: its lock is in their
 * lock registry, an edit is stored in their workspace, and their index holds its record.
 */
async function expectNewProjectOnThesePorts(ports: TestPorts): Promise<void> {
  const [newId = ''] = lockedIds(ports)
  expect(newId).not.toBe('')
  expect(newId).not.toBe(FAILED_ID)
  await editTheProject()
  await waitFor(async () => expect(await storedIds(ports)).toContain(newId), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
  await waitFor(async () => expect(await recordOf(ports, newId)).toMatchObject({ id: newId }))
}

describe('A new project after a failed open on ports that were resolved', () => {
  it('stays on the resolved ports: its lock, its stored edit, and its record', async () => {
    stubCapableStorage()
    const ports = createTestPorts({ durable: true })
    await plantFailedProject(ports)
    const resolvePorts = () => Promise.resolve(builtPorts(ports))
    render(<App resolvePorts={resolvePorts} />)

    await startNewProjectFromTheFailureView()
    await findTheShell()

    await expectNewProjectOnThesePorts(ports)
  })
})

describe('The application that unmounts while its ports are being resolved', () => {
  /** Renders the application on a builder that waits, unmounts it, and then resolves the builder. */
  async function unmountThenResolve(ports: TestPorts) {
    stubCapableStorage()
    let resolveBuild: (built: BuiltSessionPorts) => void = () => undefined
    const resolvePorts = () =>
      new Promise<BuiltSessionPorts>((resolve) => {
        resolveBuild = resolve
      })
    const { unmount } = render(<App resolvePorts={resolvePorts} />)
    await act(async () => {})
    unmount()
    await act(async () => {
      resolveBuild(builtPorts(ports))
    })
    await settleForAWhile()
  }

  it('holds no lock once the ports resolve', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)

    await unmountThenResolve(ports)

    expect(lockCalls(log)).toEqual([])
    expect(lockedIds(ports)).toEqual([])
  })

  it('logs nothing with console.error or console.warn', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await unmountThenResolve(createTestPorts())

    expect(error).not.toHaveBeenCalled()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('Retry clicked twice in one batch', () => {
  /** Clicks the Retry button twice before React renders again. */
  async function clickRetryTwice(): Promise<void> {
    const retry = await screen.findByRole('button', { name: 'Retry' })
    act(() => {
      retry.click()
      retry.click()
    })
  }

  it('after a failed open reads the project twice and takes its lock twice in all', async () => {
    stubCapableStorage()
    const log: string[] = []
    const ports = recordingPorts(log)
    await plantProject(ports, START_ID, KEPT_NAME)
    await reconcileIndex(ports)
    const read = vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('disk fault'))
    render(<App ports={ports} />)

    await clickRetryTwice()

    await expectOpenProject(KEPT_NAME)
    await settleForAWhile()
    expect(read).toHaveBeenCalledTimes(2)
    const locks = lockCalls(log).filter((call) => call.startsWith('lock:'))
    expect(locks).toEqual([`lock:${START_ID}`, `lock:${START_ID}`])
  })

  it('after a failed build of the ports builds them twice in all', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    await plantProject(ports, START_ID, KEPT_NAME)
    const resolvePorts = vi
      .fn(() => Promise.resolve(builtPorts(ports)))
      .mockRejectedValueOnce(new Error(NO_STORAGE))
    render(<App resolvePorts={resolvePorts} />)

    await clickRetryTwice()

    await expectOpenProject(KEPT_NAME)
    await settleForAWhile()
    expect(resolvePorts).toHaveBeenCalledTimes(2)
  })
})

describe('The application under StrictMode that resolves its ports', () => {
  /** Renders the strict application on a builder, and waits until its project is open and settled. */
  async function renderStrictAndSettle() {
    stubCapableStorage()
    const log: string[] = []
    const resolvePorts = vi.fn(() => Promise.resolve(builtPorts(recordingPorts(log))))
    render(
      <StrictMode>
        <App resolvePorts={resolvePorts} />
      </StrictMode>,
    )
    await findTheShell()
    await settleForAWhile()
    return { log, resolvePorts }
  }

  it('builds the ports once', async () => {
    const { resolvePorts } = await renderStrictAndSettle()

    expect(resolvePorts).toHaveBeenCalledTimes(1)
  })

  it('takes the lock of the start project once and no other', async () => {
    const { log } = await renderStrictAndSettle()

    expect(lockCalls(log)).toEqual([expect.stringMatching(/^lock:/)])
  })

  it('reads the index once for the start and once for the recent entries', async () => {
    stubCapableStorage()
    const ports = createTestPorts()
    const all = vi.spyOn(ports.index, 'all')
    render(
      <StrictMode>
        <App resolvePorts={() => Promise.resolve(builtPorts(ports))} />
      </StrictMode>,
    )

    await findTheShell()
    await settleForAWhile()

    expect(all).toHaveBeenCalledTimes(2)
  })
})
