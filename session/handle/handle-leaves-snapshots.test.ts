import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentBytes, renamed } from '../../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  placeDocument,
  recordSnapshots,
  rename,
  storedName,
  storedProject,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPorts } from './handle-test-kit'
import { openDocumentHandle } from './open-document-handle'

const PROJECT_ID = 'a'
const EDITED_NAME = 'Edited by the handle'
const UNSAVED_NAME = 'Unsaved work from a crashed tab'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** Opens the project `a` with the option that leaves its snapshots alone. Throws if it does not open. */
async function openLeavingSnapshots(ports: TestPorts) {
  const opened = await openDocumentHandle(ports, workspaceRequest(PROJECT_ID), {
    leaveSnapshots: true,
  })
  if (!opened.ok) throw new Error(`Expected the open to succeed: ${JSON.stringify(opened.failure)}`)
  return opened.handle
}

describe('a handle opened to leave the snapshots', () => {
  it('writes none and removes none, and its save reaches the store', async () => {
    const log: string[] = []
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    recordSnapshots(ports.workspace, log)
    const handle = await openLeavingSnapshots(ports)
    rename(handle, EDITED_NAME)

    expect(await handle.save()).toEqual({ ok: true })
    expect(await handle.close()).toEqual({ ok: true })

    expect(log).toEqual([])
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe(EDITED_NAME)
  })

  it('leaves a snapshot from before the open as the one to restore', async () => {
    const ports = createTestPorts()
    await placeDocument(ports, PROJECT_ID, currentBytes())
    const unsaved = renamed(await storedProject(ports.workspace, PROJECT_ID), UNSAVED_NAME)
    await ports.workspace.snapshots(PROJECT_ID).writeSnapshot(unsaved)
    const handle = await openLeavingSnapshots(ports)
    rename(handle, EDITED_NAME)

    await handle.save()
    await handle.close()

    const snapshots = ports.workspace.snapshots(PROJECT_ID)
    expect(await snapshots.isRecoverable()).toBe(true)
    expect(await snapshots.restore()).toMatchObject({
      ok: true,
      value: { project: { meta: { name: UNSAVED_NAME } } },
    })
  })
})
