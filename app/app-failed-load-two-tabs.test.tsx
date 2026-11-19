import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InMemoryActiveProjectIdStore, type ActiveProjectIdStore } from '../storage'
import { createTestPorts, type TestPorts } from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID,
  KEPT_PROJECT_TEXT,
  RecordingActiveProjectIdStore,
  chooseFromTheProjectMenu,
  editTheProject,
  failedOpenSentence,
  filesUnder,
  logSaves,
  plantFailedProject,
  renderApp,
  secondTab,
  settleForAWhile,
  storedIds,
  stubCapableStorage,
  type SaveLog,
} from './app-test-support'

async function durablePortsWithAFailedProject(): Promise<TestPorts> {
  const ports = createTestPorts({ durable: true })
  await plantFailedProject(ports)
  return ports
}

// One boot of the application, as one browser tab would start it. Two calls on two
// ports of one root and one lock registry are two tabs.
function boot(ports: TestPorts, activeProjectIds: ActiveProjectIdStore): HTMLElement {
  return renderApp(ports, { activeProjectIds }).container
}

async function startNewProject(tab: HTMLElement): Promise<void> {
  await within(tab).findByRole('alert')
  await userEvent.click(within(tab).getByRole('button', { name: /start a new project/i }))
}

async function editTheProjectIn(tab: HTMLElement): Promise<void> {
  await userEvent.click(await within(tab).findByRole('button', { name: /add floor/i }))
}

// The id of the first finished save whose id is not one of `known`.
function nextSavedIdOutside(saves: SaveLog, known: readonly string[]): Promise<string> {
  return waitFor(
    () => {
      const id = saves.saved.find((saved) => !known.includes(saved))
      if (id === undefined) throw new Error('no save under a new id yet')
      return id
    },
    { timeout: AUTOSAVE_TIMEOUT_MS },
  )
}

function savesOf(saves: SaveLog, id: string): number {
  return saves.saved.filter((saved) => saved === id).length
}

async function editAndAwaitAnotherSave(tab: HTMLElement, saves: SaveLog, id: string) {
  const before = savesOf(saves, id)
  await editTheProjectIn(tab)
  await waitFor(() => expect(savesOf(saves, id)).toBeGreaterThan(before), {
    timeout: AUTOSAVE_TIMEOUT_MS,
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Two tabs that start a new project after a failed load', () => {
  it('gives each tab its own id and neither writes under the failed id or the other tab', async () => {
    stubCapableStorage()
    const firstPorts = await durablePortsWithAFailedProject()
    const secondPorts = secondTab(firstPorts)
    const saves = logSaves(firstPorts.workspace, secondPorts.workspace)
    const port = new InMemoryActiveProjectIdStore()
    const failedBefore = await filesUnder(firstPorts.root, FAILED_ID)
    const first = boot(firstPorts, port)
    const second = boot(secondPorts, port)
    await within(first).findByRole('alert')
    await within(second).findByRole('alert')

    await startNewProject(first)
    await editTheProjectIn(first)
    const firstId = await nextSavedIdOutside(saves, [FAILED_ID])
    await startNewProject(second)
    const firstFiles = await filesUnder(firstPorts.root, firstId)
    await editTheProjectIn(second)
    const secondId = await nextSavedIdOutside(saves, [FAILED_ID, firstId])
    expect(await filesUnder(firstPorts.root, firstId)).toEqual(firstFiles)

    const secondFiles = await filesUnder(firstPorts.root, secondId)
    await editAndAwaitAnotherSave(first, saves, firstId)
    expect(await filesUnder(firstPorts.root, secondId)).toEqual(secondFiles)
    expect(secondId).not.toBe(firstId)
    expect(await filesUnder(firstPorts.root, FAILED_ID)).toEqual(failedBefore)
    expect(await storedIds(firstPorts)).toHaveLength(3)
  })
})

describe('The failure dialog after a failed load', () => {
  it('says that the saved project is kept and the new one is stored separately', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    const tab = boot(ports, new InMemoryActiveProjectIdStore())

    const alert = await within(tab).findByRole('alert')

    expect(alert).toHaveTextContent(await failedOpenSentence(ports))
    expect(within(tab).getByText(KEPT_PROJECT_TEXT)).toBeInTheDocument()
  })
})

describe('A second fresh start while the first new project is still saving', () => {
  it('never remembers the id of a project that was not saved', async () => {
    stubCapableStorage()
    const ports = await durablePortsWithAFailedProject()
    const saves = logSaves(ports.workspace)
    const port = new RecordingActiveProjectIdStore()
    const tab = boot(ports, port)
    await startNewProject(tab)
    const letTheSavesGo = saves.hold()
    await editTheProject()
    await waitFor(() => expect(ports.workspace.save).toHaveBeenCalled(), {
      timeout: AUTOSAVE_TIMEOUT_MS,
    })

    await chooseFromTheProjectMenu(/new project/i)
    letTheSavesGo()
    await nextSavedIdOutside(saves, [FAILED_ID])
    await settleForAWhile()

    for (const id of port.writes) {
      expect(saves.saved).toContain(id)
    }
  })
})
