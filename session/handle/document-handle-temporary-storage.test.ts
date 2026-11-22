import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { currentBytes, soundProject } from '../../tests/storage/conformance/conformance-documents'
import { DEFAULT_AUTOSAVE_DELAY_MS } from '../autosave/create-autosave'
import { isStored } from './handle-stored'
import {
  IN_FOLDER,
  createTestPorts,
  openOrThrow,
  placeDocument,
  recordOf,
  rememberFolder,
  rename,
  workspaceRequest,
} from './handle-test-kit'
import type { TestPortsOptions } from './handle-test-kit'
import type { DocumentHandle, SaveStatus } from './handle-types'

const PROJECT_ID = 'a'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A handle on a stored sound document of the project `a`, over test ports as the options say. */
async function openStored(options: TestPortsOptions): Promise<DocumentHandle> {
  const ports = createTestPorts(options)
  await placeDocument(ports, PROJECT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(PROJECT_ID))
}

describe('the save status of a project that only the tab holds', () => {
  it('says that the project is held by the tab alone after an edit is written', async () => {
    const handle = await openStored({ durable: false })

    rename(handle, 'Edited')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)

    expect(handle.saveStatus()).toBe('tab-only')
  })

  it('never reports saved to a listener through a create, an edit, a save, and a flush', async () => {
    const ports = createTestPorts({ durable: false })
    const handle = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      create: soundProject,
    })
    const seen: SaveStatus[] = []
    handle.subscribe(() => seen.push(handle.saveStatus()))

    rename(handle, 'Edited')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)
    rename(handle, 'Edited again')
    await handle.save()
    rename(handle, 'Edited once more')
    await handle.flush()

    expect(seen).not.toContain('saved')
    expect(seen).toContain('tab-only')
  })

  it('still counts a written project as stored, with its record in the index and a save that is ok', async () => {
    const ports = createTestPorts({ durable: false })
    const handle = await openOrThrow(ports, {
      ...workspaceRequest(PROJECT_ID),
      create: soundProject,
    })
    rename(handle, 'Written')

    expect(await handle.save()).toEqual({ ok: true })

    expect(handle.saveStatus()).toBe('tab-only')
    expect(isStored(handle)).toBe(true)
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({ id: PROJECT_ID, name: 'Written' })
  })

  it('reads saved for a project in a folder, which outlives the tab, and records it in the index', async () => {
    const ports = createTestPorts({ durable: false })
    await rememberFolder(ports, PROJECT_ID, currentBytes())
    const handle = await openOrThrow(ports, { id: PROJECT_ID, location: IN_FOLDER })
    expect(handle.durable).toBe(true)

    rename(handle, 'Written in the folder')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)

    expect(handle.saveStatus()).toBe('saved')
    expect(await recordOf(ports, PROJECT_ID)).toMatchObject({
      id: PROJECT_ID,
      location: IN_FOLDER,
    })
  })

  it('reads saved after an edit is written to durable storage', async () => {
    const handle = await openStored({ durable: true })

    rename(handle, 'Edited')
    await vi.advanceTimersByTimeAsync(DEFAULT_AUTOSAVE_DELAY_MS)

    expect(handle.saveStatus()).toBe('saved')
  })
})
