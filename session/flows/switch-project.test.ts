import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameProject } from '../../core'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import {
  createTestPorts,
  failSaves,
  holdNextRead,
  openOrThrow,
  placeDocument,
  recordingPorts,
  storedProject,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { switchProject } from './switch-project'
import type { SwitchResult } from './switch-project'

const CURRENT_ID = 'a'
const TARGET_ID = 'b'
const MISSING_ID = 'missing'
const FLUSH_FAILED = { ok: false, failure: { kind: 'flush-failed' } }

async function placeProjects(ports: TestPorts, ...ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => placeDocument(ports, id, currentBytes())))
}

/** A handle on the stored project `a`, and a log of every call that follows. */
async function openCurrent(ports: TestPorts, log: string[] = []) {
  const handle = await openOrThrow(ports, workspaceRequest(CURRENT_ID))
  log.length = 0
  return handle
}

function handleOf(result: SwitchResult): DocumentHandle {
  if (!result.ok)
    throw new Error(`Expected the switch to succeed: ${JSON.stringify(result.failure)}`)
  return result.handle
}

function rename(handle: DocumentHandle, name: string): void {
  handle.session.dispatch(renameProject(name))
}

async function storedName(ports: TestPorts, id: string): Promise<string> {
  return (await storedProject(ports.workspace, id)).meta.name
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a switch from a stored project to another stored project', () => {
  it('flushes the current project, opens the target, then closes the current project', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await placeProjects(ports, CURRENT_ID, TARGET_ID)
    const current = await openCurrent(ports, log)
    rename(current, 'Edited before the switch')

    const result = await switchProject(ports, current, workspaceRequest(TARGET_ID))

    expect(log).toEqual(['save:a', 'lock:b', 'read:b', 'unlock:a'])
    expect(handleOf(result).id).toBe(TARGET_ID)
  })

  it('stores an edit made just before the switch', async () => {
    const ports = createTestPorts()
    await placeProjects(ports, CURRENT_ID, TARGET_ID)
    const current = await openCurrent(ports)
    rename(current, 'Edited just before the switch')

    await switchProject(ports, current, workspaceRequest(TARGET_ID))

    expect(await storedName(ports, CURRENT_ID)).toBe('Edited just before the switch')
  })

  it('frees the lock of the old project, so a second switch back to it opens', async () => {
    const ports = createTestPorts()
    await placeProjects(ports, CURRENT_ID, TARGET_ID)
    const current = await openCurrent(ports)
    const target = handleOf(await switchProject(ports, current, workspaceRequest(TARGET_ID)))
    expect(await ports.locks.heldIds()).toEqual(new Set([TARGET_ID]))

    const back = await switchProject(ports, target, workspaceRequest(CURRENT_ID))

    expect(handleOf(back).id).toBe(CURRENT_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
  })
})

describe('a switch that does not happen', () => {
  it('stops before the target opens and leaves the current handle open when the flush fails', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await placeProjects(ports, CURRENT_ID, TARGET_ID)
    const current = await openCurrent(ports, log)
    failSaves(ports.workspace, log)
    rename(current, 'Edited before the failed switch')

    const result = await switchProject(ports, current, workspaceRequest(TARGET_ID))

    expect(result).toEqual(FLUSH_FAILED)
    expect(log).toEqual(['save:a'])
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(current.saveStatus()).toBe('error')
  })

  it('returns the open failure of a target that does not open and keeps the current handle open', async () => {
    const ports = createTestPorts()
    await placeProjects(ports, CURRENT_ID)
    const current = await openCurrent(ports)
    const originalName = current.session.getProject().meta.name
    rename(current, 'Edited before the refused switch')

    const result = await switchProject(ports, current, workspaceRequest(MISSING_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'not-found' } })
    expect(await storedName(ports, CURRENT_ID)).toBe('Edited before the refused switch')
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(current.session.undo()).toBe(true)
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    expect(await storedName(ports, CURRENT_ID)).toBe(originalName)
  })

  it('returns the current handle and writes nothing when the target is the current project', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    await placeProjects(ports, CURRENT_ID)
    const current = await openCurrent(ports, log)
    rename(current, 'Edited, not yet stored')

    const result = await switchProject(ports, current, workspaceRequest(CURRENT_ID))

    expect(handleOf(result)).toBe(current)
    expect(log).toEqual([])
    expect(await storedName(ports, CURRENT_ID)).not.toBe('Edited, not yet stored')
  })
})

describe('a switch whose close of the current project fails', () => {
  async function switchWithEditWhileTargetLoads() {
    const ports = createTestPorts()
    await placeProjects(ports, CURRENT_ID)
    const current = await openCurrent(ports)
    const letTargetRead = holdNextRead(ports.workspace)
    const target = { ...workspaceRequest(TARGET_ID), create: soundProject }

    const switching = switchProject(ports, current, target)
    await settle()
    rename(current, 'Edited while the target loaded')
    failSaves(ports.workspace)
    letTargetRead()
    return { ports, current, target, result: await switching }
  }

  it('returns flush-failed and keeps the current handle open with the edit', async () => {
    const { ports, current, result } = await switchWithEditWhileTargetLoads()

    expect(result).toEqual(FLUSH_FAILED)
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(current.session.getProject().meta.name).toBe('Edited while the target loaded')
    expect(current.saveStatus()).toBe('error')
  })

  it('closes the target, so its lock is free and it stored nothing', async () => {
    const { ports, target } = await switchWithEditWhileTargetLoads()

    expect((await ports.workspace.storedFiles(TARGET_ID)).size).toBe(0)
    const secondTab = createTestPorts({ root: ports.root, lockRegistry: ports.lockRegistry })
    await expect(openOrThrow(secondTab, target)).resolves.toMatchObject({ id: TARGET_ID })
  })
})

describe('a switch with no current project', () => {
  it('opens the target', async () => {
    const ports = createTestPorts()
    await placeProjects(ports, TARGET_ID)

    const result = await switchProject(ports, undefined, workspaceRequest(TARGET_ID))

    expect(handleOf(result).id).toBe(TARGET_ID)
    expect(await ports.locks.heldIds()).toEqual(new Set([TARGET_ID]))
  })

  it('returns the open failure of the target unchanged', async () => {
    const ports = createTestPorts()

    const result = await switchProject(ports, undefined, workspaceRequest(MISSING_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'not-found' } })
    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})
