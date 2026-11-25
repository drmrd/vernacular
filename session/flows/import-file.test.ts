// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import type { Project } from '../../core'
import { InMemoryAssetCache, exportProjectBundle, isValidProjectId } from '../../storage'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  currentBytes,
  documentBreakingFormatRules,
  renamed,
  soundProject,
} from '../../tests/storage/conformance/conformance-documents'
import {
  createTestPorts,
  DOCUMENT_FILE,
  failSaves,
  handleOf,
  openOrThrow,
  placeDocument,
  recordOf,
  recordingPorts,
  rename,
  storedName,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { importFile } from './import-file'
import type { ImportedFile } from './import-file'
import { mixedPaintBytes, TWO_PAINT_ENTRIES_SENTENCE } from './open-failed-test-kit'
import { switchProject } from './switch-project'

const CURRENT_ID = 'a'
const OTHER_ID = 'b'
const IMPORTED_NAME = 'Imported house'

/** The bytes of a .building archive of the project, as an export of it writes them. */
async function archiveOf(project: Project): Promise<Uint8Array> {
  const exported = await exportProjectBundle('archived', project, {
    assets: new InMemoryAssetCache(),
  })
  return exported.bytes
}

/** A .json file of a sound document of the current version, named `IMPORTED_NAME`. */
function jsonFile(name = 'house.json'): ImportedFile {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  metaOf(document).name = IMPORTED_NAME
  return { name, bytes: bytesOf(document) }
}

/** A handle on the stored project `a`. */
async function openCurrent(ports: TestPorts) {
  await placeDocument(ports, CURRENT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(CURRENT_ID))
}

async function storedIds(ports: TestPorts): Promise<string[]> {
  return (await ports.workspace.list()).map((summary) => summary.id)
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

describe('an import of a .json file', () => {
  it('a .json file becomes a copy under a new id', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const originalName = current.session.getProject().meta.name

    const handle = handleOf(await importFile(ports, current, jsonFile()))

    expect(handle.id).not.toBe(CURRENT_ID)
    expect(isValidProjectId(handle.id)).toBe(true)
    expect(handle.session.getProject().meta.name).toBe(IMPORTED_NAME)
    expect(await storedName(ports.workspace, CURRENT_ID)).toBe(originalName)
  })

  it('the file is unchanged', async () => {
    const ports = createTestPorts()
    const file = jsonFile()
    const original = file.bytes.slice()

    const handle = handleOf(await importFile(ports, undefined, file))
    rename(handle, 'Edited after the import')
    await handle.save()

    expect(file.bytes).toEqual(original)
  })

  it('two imports of one file give two ids', async () => {
    const ports = createTestPorts()
    const file = jsonFile()

    const first = handleOf(await importFile(ports, undefined, file))
    const second = handleOf(await importFile(ports, first, file))

    expect(second.id).not.toBe(first.id)
    expect(await storedIds(ports)).toEqual([first.id, second.id].sort())
  })

  it('a refused file leaves the current project open and every store as it was', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const file = { name: 'faulty.json', bytes: documentBreakingFormatRules() }
    const before = [await treeOf(ports.root), await recordOf(ports, CURRENT_ID)]

    const result = await importFile(ports, current, file)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'format-rules' } },
    })
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(await storedIds(ports)).toEqual([CURRENT_ID])
    expect([await treeOf(ports.root), await recordOf(ports, CURRENT_ID)]).toEqual(before)
  })

  it('a refused file with a mixed paint entry carries a repair', async () => {
    const ports = createTestPorts()

    const file = { name: 'mixed.json', bytes: mixedPaintBytes() }

    const result = await importFile(ports, undefined, file)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', repair: { sentences: [TWO_PAINT_ENTRIES_SENTENCE] } },
    })
  })

  it('the copy is stored before the flow resolves, with no edit', async () => {
    const ports = createTestPorts()

    const handle = handleOf(await importFile(ports, undefined, jsonFile()))

    expect(await storedName(ports.workspace, handle.id)).toBe(IMPORTED_NAME)
    expect(handle.saveStatus()).toBe('saved')
  })

  it('an edit made just before the import is stored in the old project', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    rename(current, 'Edited just before the import')

    await importFile(ports, current, jsonFile())

    expect(await storedName(ports.workspace, CURRENT_ID)).toBe('Edited just before the import')
  })

  it('the ending is matched without regard to case', async () => {
    const ports = createTestPorts()

    const handle = handleOf(await importFile(ports, undefined, jsonFile('HOUSE.JSON')))

    expect(handle.session.getProject().meta.name).toBe(IMPORTED_NAME)
  })
})

describe('an import of a .building archive', () => {
  it('a .building archive opens its document under a new id', async () => {
    const ports = createTestPorts()
    const bytes = await archiveOf(renamed(soundProject(), 'Archived house'))

    const handle = handleOf(await importFile(ports, undefined, { name: 'house.building', bytes }))

    expect(isValidProjectId(handle.id)).toBe(true)
    expect(handle.session.getProject().meta.name).toBe('Archived house')
    expect(await storedName(ports.workspace, handle.id)).toBe('Archived house')
  })
})

describe('an import that is refused before any flush', () => {
  it('a name with another ending gives unsupported-file with the name and calls no port', async () => {
    const log: string[] = []
    const ports = recordingPorts(log)
    const current = await openCurrent(ports)
    rename(current, 'Edited before the refused import')
    log.length = 0

    const result = await importFile(ports, current, { name: 'plan.pdf', bytes: currentBytes() })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'unsupported-file', fileName: 'plan.pdf' },
    })
    expect(log).toEqual([])
    expect(current.saveStatus()).toBe('pending')
  })

  it('bytes that are not JSON give did-not-import with not-json, and the current project stays open', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const file = { name: 'broken.json', bytes: new TextEncoder().encode('not a document') }

    const result = await importFile(ports, current, file)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'not-json' } },
    })
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(await current.save()).toEqual({ ok: true })
  })

  it('a document of a newer version gives did-not-import with newer-version', async () => {
    const ports = createTestPorts()
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1

    const result = await importFile(ports, undefined, { name: 'n.json', bytes: bytesOf(document) })

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'newer-version' } },
    })
  })

  it('a .building file that is no archive gives did-not-import with not-a-project', async () => {
    const ports = createTestPorts()
    const file = { name: 'house.building', bytes: new TextEncoder().encode('not an archive') }

    const result = await importFile(ports, undefined, file)

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'not-a-project' } },
    })
  })
})

describe('an import whose saves fail', () => {
  it('a flush that fails gives flush-failed and stores no copy', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    failSaves(ports.workspace)
    rename(current, 'Edited before the failed import')

    const result = await importFile(ports, current, jsonFile())

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await storedIds(ports)).toEqual([CURRENT_ID])
  })

  it('a save of the copy that fails still gives the handle, with the status error and its snapshot kept', async () => {
    const ports = createTestPorts()
    failSaves(ports.workspace)

    const handle = handleOf(await importFile(ports, undefined, jsonFile()))

    expect(handle.saveStatus()).toBe('error')
    expect((await ports.workspace.storedFiles(handle.id)).has(DOCUMENT_FILE)).toBe(false)
    expect(await ports.workspace.snapshots(handle.id).isRecoverable()).toBe(true)
  })
})

describe('an import whose copy was not stored', () => {
  async function importWithFailingSave() {
    const ports = createTestPorts()
    await placeDocument(ports, OTHER_ID, currentBytes())
    const realSave = ports.workspace.save.bind(ports.workspace)
    failSaves(ports.workspace)
    const copy = handleOf(await importFile(ports, undefined, jsonFile()))
    const storeWorksAgain = () => {
      ports.workspace.save = realSave
    }
    return { ports, copy, storeWorksAgain }
  }

  it('blocks the next switch with flush-failed, and the copy stays open', async () => {
    const { ports, copy } = await importWithFailingSave()

    const result = await switchProject(ports, copy, workspaceRequest(OTHER_ID))

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await ports.locks.heldIds()).toEqual(new Set([copy.id]))
    expect(copy.saveStatus()).toBe('error')
  })

  it('stores the copy at the next switch once the store works again', async () => {
    const { ports, copy, storeWorksAgain } = await importWithFailingSave()
    storeWorksAgain()

    handleOf(await switchProject(ports, copy, workspaceRequest(OTHER_ID)))

    expect(await storedName(ports.workspace, copy.id)).toBe(IMPORTED_NAME)
  })
})
