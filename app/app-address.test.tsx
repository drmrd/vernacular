import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createTestPorts, rememberFolder, type TestPorts } from '../session/handle/handle-test-kit'
import { folderRecord } from '../session/projects/rebuild-test-kit'
import { App } from './app'
import {
  AUTOSAVE_TIMEOUT_MS,
  NEW_PROJECT_NAME,
  START_ID,
  builtPorts,
  documentBytes,
  editTheProject,
  expectOpenProject,
  lockedIds,
  namedProject,
  renderApp,
  renderAppAt,
  resetWindowAddress,
  secondTab,
  settleForAWhile,
  storedIds,
  stubCapableStorage,
  usedLast,
} from './app-test-support'
import {
  FIRST_ID,
  SECOND_ID,
  addressOf,
  durablePortsWith,
  nameOf,
} from './history-navigation-test-support'

const FOLDER_ID = 'project-folder'
const FOLDER_NAME = 'Folder House'
const NO_PERMISSION_SENTENCE = 'Vernacular has no permission to use this folder.'
const BARE_ADDRESS = ''

beforeEach(() => {
  stubCapableStorage()
})
afterEach(() => {
  cleanup()
  resetWindowAddress()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** The id of the one project that the ports hold the lock of. */
function theOnlyLockedId(ports: TestPorts): string {
  const [id, ...others] = lockedIds(ports)
  if (id === undefined || others.length > 0) throw new Error('Expected exactly one locked project')
  return id
}

/** Durable ports with the first project, and a project in a folder that was used after it. */
async function portsWithAFolderProjectUsedLast(): Promise<TestPorts> {
  const ports = await durablePortsWith(FIRST_ID)
  await rememberFolder(ports, FOLDER_ID, documentBytes(namedProject(FOLDER_NAME)))
  await ports.index.put(folderRecord(FOLDER_ID, { name: FOLDER_NAME }))
  await usedLast(ports, FOLDER_ID)
  return ports
}

describe('The application at the start', () => {
  it('starts a new project under a new id in an empty browser', async () => {
    const ports = createTestPorts({ durable: true })

    const { bar } = renderAppAt(ports, BARE_ADDRESS)

    await expectOpenProject(NEW_PROJECT_NAME)
    expect(lockedIds(ports)).toHaveLength(1)
    expect(lockedIds(ports)).not.toContain(START_ID)
    expect(bar.hash()).toBe(BARE_ADDRESS)
  })

  it('opens the project of the address in place of the project used last', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)

    renderAppAt(ports, addressOf(SECOND_ID))

    await expectOpenProject(nameOf(SECOND_ID))
    expect(lockedIds(ports)).toEqual([SECOND_ID])
  })

  it('shows the address of a new project after its first save', async () => {
    const ports = createTestPorts({ durable: true })
    const { bar } = renderAppAt(ports, BARE_ADDRESS)
    await expectOpenProject(NEW_PROJECT_NAME)
    const newId = theOnlyLockedId(ports)
    expect(bar.hash()).toBe(BARE_ADDRESS)

    await editTheProject()

    await waitFor(() => expect(bar.hash()).toBe(addressOf(newId)), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
  })
})

describe('The application at the start with a project in a folder', () => {
  it('opens a folder project that was used last when access is granted', async () => {
    const ports = await portsWithAFolderProjectUsedLast()

    renderAppAt(ports, BARE_ADDRESS)

    await expectOpenProject(FOLDER_NAME)
    expect(lockedIds(ports)).toEqual([FOLDER_ID])
  })

  it('shows the permission sentence for a folder project that was used last, and opens it after Retry', async () => {
    const ports = await portsWithAFolderProjectUsedLast()
    ports.folders.setPermission(FOLDER_ID, 'prompt')

    renderAppAt(ports, BARE_ADDRESS)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(NO_PERMISSION_SENTENCE)
    expect(alert).not.toHaveTextContent(/could not open the project/i)
    expect(lockedIds(ports)).toEqual([])
    expect(screen.getByRole('button', { name: 'Start a new project' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await expectOpenProject(FOLDER_NAME)
  })
})

describe('The address that the application follows', () => {
  it('gives each mount on injected ports its own address', async () => {
    const first = createTestPorts({ durable: true })
    renderAppAt(first, BARE_ADDRESS)
    await expectOpenProject(NEW_PROJECT_NAME)
    await editTheProject()
    await waitFor(async () => expect(await storedIds(first)).toHaveLength(1), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    const firstId = theOnlyLockedId(first)
    cleanup()
    await settleForAWhile()
    const second = createTestPorts({ durable: true })

    const historyLength = window.history.length

    renderApp(second)

    await expectOpenProject(NEW_PROJECT_NAME)
    await editTheProject()
    await waitFor(async () => expect(await storedIds(second)).toHaveLength(1), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })
    await settleForAWhile()
    expect(lockedIds(second)).not.toEqual([firstId])
    expect(window.location.hash).toBe(BARE_ADDRESS)
    expect(window.history.length).toBe(historyLength)
  })

  it('uses the address of the window when it builds its own ports', async () => {
    const ports = await durablePortsWith(FIRST_ID, SECOND_ID)
    window.history.replaceState(null, '', window.location.pathname + addressOf(SECOND_ID))

    render(<App resolvePorts={() => Promise.resolve(builtPorts(ports))} />)

    await expectOpenProject(nameOf(SECOND_ID))
    expect(window.location.hash).toBe(addressOf(SECOND_ID))
  })

  it('two tabs of an empty browser each start their own new project', async () => {
    const ports = createTestPorts({ durable: true })
    renderAppAt(ports, BARE_ADDRESS)
    await expectOpenProject(NEW_PROJECT_NAME)

    renderAppAt(secondTab(ports), BARE_ADDRESS)

    await waitFor(() => expect(lockedIds(ports)).toHaveLength(2))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
