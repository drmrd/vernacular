import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, cleanup } from '@testing-library/react'
import { addFloor, encodeDocument } from '../core'
import { InMemoryDirectory } from '../storage'
import {
  DOCUMENT_FILE,
  createTestPorts,
  pickFolder,
  storedProject,
  type TestPorts,
} from '../session/handle/handle-test-kit'
import {
  closeOpenedHandles,
  openStoredProject,
  renderActions,
  settleTheAction,
  waitForOtherProject,
} from './action-test-support'
import {
  capableCapabilities,
  documentBytes,
  namedProject,
  plantProject,
  START_ID,
} from './app-test-support'
import { useOpenFileAction } from './use-open-file-action'
import { useProjectActions } from './use-project-actions'

const DRAFT_NAME = 'Drafthouse'
const OTHER_ID = 'other'
const OTHER_NAME = 'Other house'
const FLOORS_WITH_THE_EDIT = 2

afterEach(async () => {
  cleanup()
  await closeOpenedHandles()
  vi.restoreAllMocks()
})

/** In-memory ports with the start project open and one unsaved edit in it: a second floor. */
async function openDrafthouseWithAnEdit() {
  const ports = createTestPorts()
  const handle = await openStoredProject(ports, START_ID, DRAFT_NAME)
  await act(async () => {
    handle.session.dispatch(addFloor('Second floor'))
  })
  expect(handle.saveStatus()).toBe('pending')
  return { ports, handle }
}

/** The number of floors that the store holds for the start project. */
async function storedFloorCount(ports: TestPorts): Promise<number> {
  return (await storedProject(ports.workspace, START_ID)).floors.length
}

describe('The project actions keep an unsaved edit when they switch projects', () => {
  it('a recent open stores the edit of the project that was left', async () => {
    const { ports, handle } = await openDrafthouseWithAnEdit()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })

    await waitForOtherProject(result, handle)
    expect(await storedFloorCount(ports)).toBe(FLOORS_WITH_THE_EDIT)
  })

  it('an open folder stores the edit of the project that was left', async () => {
    const { ports, handle } = await openDrafthouseWithAnEdit()
    const folder = new InMemoryDirectory()
    await folder.writeFile(DOCUMENT_FILE, await documentBytes(namedProject(OTHER_NAME)))
    pickFolder(ports, folder, OTHER_NAME)
    const capabilities = { ...capableCapabilities(), fileSystemAccess: true }
    const { result } = renderActions({ ports, handle, capabilities }, useProjectActions)

    await act(async () => {
      result.current.actions.onOpenFolder?.()
    })

    await waitForOtherProject(result, handle)
    expect(await storedFloorCount(ports)).toBe(FLOORS_WITH_THE_EDIT)
  })

  it('an import of a file stores the edit of the project that was left', async () => {
    const { ports, handle } = await openDrafthouseWithAnEdit()
    const { result } = renderActions({ ports, handle }, useOpenFileAction)
    const { bytes } = encodeDocument(namedProject(OTHER_NAME), undefined)
    const file = new File([bytes.buffer as ArrayBuffer], 'house.json')

    await act(async () => {
      await result.current.actions.onImportDroppedFile(file)
    })

    await waitForOtherProject(result, handle)
    expect(await storedFloorCount(ports)).toBe(FLOORS_WITH_THE_EDIT)
  })

  it('New project stores the edit of the project that was left', async () => {
    const { ports, handle } = await openDrafthouseWithAnEdit()
    const { result } = renderActions({ ports, handle }, useProjectActions)

    await act(async () => {
      await result.current.actions.onNewProject()
    })

    await waitForOtherProject(result, handle)
    expect(await storedFloorCount(ports)).toBe(FLOORS_WITH_THE_EDIT)
  })
})

describe('A Save that was kept from before a switch', () => {
  it('writes nothing after the project it belonged to was left', async () => {
    const { ports, handle } = await openDrafthouseWithAnEdit()
    await plantProject(ports, OTHER_ID, OTHER_NAME)
    const { result } = renderActions({ ports, handle }, useProjectActions)
    const savedBeforeTheSwitch = result.current.actions.onSave
    await act(async () => {
      result.current.actions.onOpenRecent(OTHER_ID)
    })
    await waitForOtherProject(result, handle)
    const save = vi.spyOn(ports.workspace, 'save')

    await act(async () => {
      savedBeforeTheSwitch()
    })
    await settleTheAction()

    expect(save).not.toHaveBeenCalled()
  })
})
