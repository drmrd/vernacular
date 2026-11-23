import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, waitFor, act } from '@testing-library/react'
import { addFloor } from '../core'
import type { DocumentHandle } from '../session'
import {
  createTestPorts,
  openOrThrow,
  storedProject,
  workspaceRequest,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  AUTOSAVE_TIMEOUT_MS,
  FAILED_ID as PROJECT_ID,
  chooseFromTheProjectMenu,
  findTheShell,
  plantProject,
  renderWorkspace,
  settleForAWhile,
  stubCapableStorage,
} from './app-test-support'
import { leaveIsPrevented } from './leave-test-support'

const handles: DocumentHandle[] = []

afterEach(async () => {
  cleanup()
  await act(async () => {
    await Promise.all(handles.splice(0).map((handle) => handle.close()))
  })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** Opens the stored project `Drafthouse` and keeps its handle for the close after the test. */
async function openDrafthouse(ports: TestPorts): Promise<DocumentHandle> {
  await plantProject(ports, PROJECT_ID, 'Drafthouse')
  const handle = await openOrThrow(ports, workspaceRequest(PROJECT_ID))
  handles.push(handle)
  return handle
}

/** One edit through the dispatch boundary, the only way to change the project. */
async function addASecondFloor(handle: DocumentHandle): Promise<void> {
  await act(async () => {
    handle.session.dispatch(addFloor('Second floor'))
  })
}

describe('The unsaved-changes guard of the workspace', () => {
  it('arms the beforeunload guard while work is unsaved and disarms it after an explicit Save', async () => {
    stubCapableStorage()
    const handle = await openDrafthouse(createTestPorts({ durable: true }))
    renderWorkspace(handle)
    await findTheShell()

    await addASecondFloor(handle)
    await act(async () => {
      expect(leaveIsPrevented()).toBe(true)
    })

    await chooseFromTheProjectMenu(/save/i)

    await waitFor(() => expect(leaveIsPrevented()).toBe(false))
  })

  it('disarms the beforeunload guard after autosave persists the change', async () => {
    stubCapableStorage()
    const ports = createTestPorts({ durable: true })
    const save = vi.spyOn(ports.workspace, 'save')
    const handle = await openDrafthouse(ports)
    save.mockClear()
    renderWorkspace(handle)
    await findTheShell()

    await addASecondFloor(handle)
    await act(async () => {
      expect(leaveIsPrevented()).toBe(true)
    })

    // With no save of its own, the handle's autosave stores the change after its delay.
    await waitFor(() => expect(leaveIsPrevented()).toBe(false), { timeout: AUTOSAVE_TIMEOUT_MS })
    expect((await storedProject(ports.workspace, PROJECT_ID)).floors).toHaveLength(2)
    // One autosave writes the project: the workspace mounts none of its own.
    await settleForAWhile()
    expect(save).toHaveBeenCalledOnce()
  })
})
