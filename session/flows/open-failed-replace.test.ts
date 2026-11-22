// @vitest-environment node
// Hashes assets with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  DOCUMENT_FILE,
  IN_FOLDER,
  IN_WORKSPACE,
  createTestPorts,
  failSaves,
  handleOf,
  openOrThrow,
  rename,
  storedName,
  storedProject,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { folderRecord } from '../projects/rebuild-test-kit'
import { replaceWithRepaired } from './open-failed'
import {
  EDITED_NAME,
  OTHER_ID,
  PRE_REPAIR_PREFIX,
  PROJECT_ID,
  STORED_NAME,
  folderBackups,
  folderRequest,
  holdFromAnotherTab,
  mixedPaintBytes,
  offerOf,
  openAnotherProject,
  otherRepairBytes,
  placeInFolder,
  placeInWorkspace,
  repairedBody,
  replaceRequest,
  soundBytes,
  storedBytes,
  withoutMeta,
  workspaceBackups,
} from './open-failed-test-kit'

const NOT_JSON = new TextEncoder().encode('{not json')
const EDITED_AFTER_REPLACE = 'Edited after the replace'

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** A workspace that holds the project `a` with two mixed paint entries, and the repair that it offers. */
async function refusedProject() {
  const ports = createTestPorts()
  await placeInWorkspace(ports, mixedPaintBytes())
  return { ports, offer: await offerOf(ports, workspaceRequest(PROJECT_ID)) }
}

/** Expects that the project `a` holds the bytes that it held before, and that no backup was written. */
async function expectNothingWritten(ports: TestPorts, original: Uint8Array) {
  expect(await storedBytes(ports)).toEqual(original)
  expect(await workspaceBackups(ports)).toEqual([])
}

describe('Replace the stored project', () => {
  it('Replace stores the repaired document, and the project opens under its own id', async () => {
    const { ports, offer } = await refusedProject()

    const handle = handleOf(await replaceWithRepaired(ports, undefined, replaceRequest(offer)))

    expect(handle.id).toBe(PROJECT_ID)
    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(handle.session.getProject().meta.name).toBe(STORED_NAME)
    expect(withoutMeta(await storedProject(ports.workspace, PROJECT_ID))).toEqual(repairedBody())
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('Replace leaves a pre-repair backup with the original bytes, byte for byte', async () => {
    const { ports, offer } = await refusedProject()

    await replaceWithRepaired(ports, undefined, replaceRequest(offer))

    expect(await workspaceBackups(ports)).toEqual([
      { name: expect.stringContaining(PRE_REPAIR_PREFIX), bytes: mixedPaintBytes() },
    ])
  })

  it('the replaced document does not hold the removed data again after a save and a reload', async () => {
    const { ports, offer } = await refusedProject()
    const handle = handleOf(await replaceWithRepaired(ports, undefined, replaceRequest(offer)))
    rename(handle, EDITED_AFTER_REPLACE)
    expect(await handle.save()).toEqual({ ok: true })

    const reloaded = createTestPorts({ root: ports.root, index: ports.index })
    const reopened = await openOrThrow(reloaded, workspaceRequest(PROJECT_ID))

    expect(reopened.session.getProject().meta.name).toBe(EDITED_AFTER_REPLACE)
    expect(withoutMeta(reopened.session.getProject())).toEqual(repairedBody())
  })

  it('a replace of a folder project writes into the folder, with the backup in the folder', async () => {
    const ports = createTestPorts()
    const folder = await placeInFolder(ports, mixedPaintBytes())
    await ports.index.put(folderRecord(PROJECT_ID, { location: IN_FOLDER }))
    const offer = await offerOf(ports, folderRequest())

    const handle = handleOf(await replaceWithRepaired(ports, undefined, replaceRequest(offer)))

    expect(handle.location).toEqual(IN_FOLDER)
    const stored = await folder.readFile(DOCUMENT_FILE)
    expect(withoutMeta(projectOf(stored ?? new Uint8Array()))).toEqual(repairedBody())
    expect(await folderBackups(folder)).toEqual([
      { name: expect.stringContaining(PRE_REPAIR_PREFIX), bytes: mixedPaintBytes() },
    ])
    expect(await ports.root.list(PROJECT_ID)).toEqual([])
  })
})

describe('a replace that the stored project does not allow', () => {
  it('Replace refuses with repair-changed and writes nothing when the stored file differs from the one the offer was made for', async () => {
    const { ports, offer } = await refusedProject()
    await placeInWorkspace(ports, otherRepairBytes())
    const before = await treeOf(ports.root, PROJECT_ID)

    const result = await replaceWithRepaired(ports, undefined, replaceRequest(offer))

    expect(result).toEqual({ ok: false, failure: { kind: 'repair-changed' } })
    expect(await treeOf(ports.root, PROJECT_ID)).toEqual(before)
  })

  it('Replace writes nothing and opens the project when the stored file now passes the check', async () => {
    const { ports, offer } = await refusedProject()
    await placeInWorkspace(ports, soundBytes())

    const handle = handleOf(await replaceWithRepaired(ports, undefined, replaceRequest(offer)))

    expect(handle.id).toBe(PROJECT_ID)
    await expectNothingWritten(ports, soundBytes())
  })

  it('Replace gives did-not-open and writes nothing when the stored file now fails for another reason', async () => {
    const { ports, offer } = await refusedProject()
    await placeInWorkspace(ports, NOT_JSON)

    const result = await replaceWithRepaired(ports, undefined, replaceRequest(offer))

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-open', decode: { kind: 'not-json' } },
    })
    await expectNothingWritten(ports, NOT_JSON)
  })

  it('Replace gives open-elsewhere and writes nothing when another tab holds the project', async () => {
    const { ports, offer } = await refusedProject()
    await holdFromAnotherTab(ports)

    const result = await replaceWithRepaired(ports, undefined, replaceRequest(offer))

    expect(result).toEqual({ ok: false, failure: { kind: 'open-elsewhere' } })
    await expectNothingWritten(ports, mixedPaintBytes())
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })

  it('Replace gives flush-failed and writes nothing when the current project cannot be flushed', async () => {
    const { ports, offer } = await refusedProject()
    const current = await openAnotherProject(ports)
    failSaves(ports.workspace)
    rename(current, EDITED_NAME)

    const result = await replaceWithRepaired(ports, current, replaceRequest(offer))

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    await expectNothingWritten(ports, mixedPaintBytes())
  })

  it('the lock of the project is free after a replace that refuses', async () => {
    const { ports, offer } = await refusedProject()
    await placeInWorkspace(ports, otherRepairBytes())

    await replaceWithRepaired(ports, undefined, replaceRequest(offer))

    expect(await ports.locks.heldIds()).toEqual(new Set())
  })
})

describe('a replace with another project open', () => {
  it('with another project open, the replaced project opens through a switch, and an edit made just before is stored', async () => {
    const { ports, offer } = await refusedProject()
    const current = await openAnotherProject(ports)
    rename(current, EDITED_NAME)

    const handle = handleOf(await replaceWithRepaired(ports, current, replaceRequest(offer)))

    expect(handle.id).toBe(PROJECT_ID)
    expect(await storedName(ports.workspace, OTHER_ID)).toBe(EDITED_NAME)
    expect(await ports.locks.heldIds()).toEqual(new Set([PROJECT_ID]))
  })
})
