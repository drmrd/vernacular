// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, encodeDocument, type Project } from '../../core'
import { ARCHIVE_LIMITS } from '../../storage'
import type { ArchiveLimitName } from '../../storage'
import { misnamedAssetEntry } from '../../storage/zip/zip-edges-test-kit'
import {
  assetEntry,
  buildZip,
  documentEntry,
  projectArchive,
  projectReferring,
} from '../../storage/zip/zip-test-kit'
import {
  bytesOf,
  fixtureDocument,
  firstWallOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'

import { assetsOf } from '../handle/handle-assets'
import { createTestPorts, DOCUMENT_FILE, failSaves } from '../handle/handle-test-kit'
import { importFile } from './import-file'
import {
  completeArchive,
  house,
  IMAGE,
  importedOf,
  logWrites,
  MODEL,
  OTHER_ID,
  POOL_FOLDER,
  poolWrites,
} from './import-file-test-kit'

const ABSENT = 'd'.repeat(64)
const STRAY = Uint8Array.of(7, 7, 7)
const AUTOSAVE_FOLDER = '.house-autosave/'
const START_FILE = 'session-start.json'
const SNAPSHOT_PREFIX = 'snapshot-'
/** The entries of the archive of the house: the document and the two assets. */
const ENTRIES_OF_HOUSE = 3
const ONE_BYTE = 1

const building = (bytes: Uint8Array, name = 'house.building') => ({ name, bytes })

/** The document of `project` as parsed JSON, with a reference to one asset that has no scope. */
function documentWithScopelessReference(): Json {
  const project = projectReferring([{ scope: 'user', contentHash: ABSENT }])
  const parsed: Json = JSON.parse(
    new TextDecoder().decode(encodeDocument(project, undefined).bytes),
  )
  const furniture = (parsed.floors as { furniture: { assetRef: Json }[] }[])[0]!.furniture
  delete furniture[0]!.assetRef.scope
  return parsed
}

/** The bytes of a document that refers to the assets of `project` and breaks the format rules. */
function documentBreakingRulesReferring(project: Project): Uint8Array {
  const parsed: Json = JSON.parse(
    new TextDecoder().decode(encodeDocument(project, undefined).bytes),
  )
  const floors = parsed.floors as { walls: Json[] }[]
  floors[0]!.walls = [firstWallOf(fixtureDocument(CURRENT_SCHEMA_VERSION))]
  return bytesOf(withUnknownWallField(parsed))
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

describe('an import of a document whose reference has no scope', () => {
  it('is refused as a document that breaks the format rules, and nothing is stored', async () => {
    const ports = createTestPorts()
    const writes = logWrites(ports)
    const file = { name: 'house.json', bytes: bytesOf(documentWithScopelessReference()) }

    const result = await importFile(ports, undefined, file)

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'format-rules' } },
    })
    expect(writes).toEqual([])
  })
})

describe('an import of an archive above a limit', () => {
  const lowered: readonly (readonly [ArchiveLimitName, number])[] = [
    ['inflatedBytes', MODEL.length],
    ['entries', ENTRIES_OF_HOUSE - 1],
    ['documentBytes', ONE_BYTE],
  ]

  it.each(lowered)(
    'a lowered %s limit refuses the file with that limit',
    async (limit, allowed) => {
      const ports = createTestPorts()
      const { project } = await house()
      const writes = logWrites(ports)
      const limits = { ...ARCHIVE_LIMITS, [limit]: allowed }

      const result = await importFile(ports, undefined, {
        ...building(await completeArchive(project)),
        limits,
      })

      expect(result).toEqual({ ok: false, failure: { kind: 'archive-too-large', limit, allowed } })
      expect(writes).toEqual([])
    },
  )
})

describe('an import that finds the assets already in the pool', () => {
  it('a .json file whose needed assets the pool has reports none and writes nothing', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    await ports.workspace.assets(OTHER_ID).put(model, MODEL)
    await ports.workspace.assets(OTHER_ID).put(image, IMAGE)
    const writes = logWrites(ports)
    const file = { name: 'house.json', bytes: encodeDocument(project, undefined).bytes }

    const { missingAssets } = importedOf(await importFile(ports, undefined, file))

    expect(missingAssets).toEqual([])
    expect(poolWrites(writes)).toEqual([])
  })

  it('a needed asset that the archive holds only under a wrong name is not missing when the pool has it', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    await ports.workspace.assets(OTHER_ID).put(image, IMAGE)
    const bytes = projectArchive(project, [
      await assetEntry(MODEL),
      await misnamedAssetEntry(STRAY, IMAGE),
    ])

    const { handle, missingAssets } = importedOf(
      await importFile(ports, undefined, building(bytes)),
    )

    expect(missingAssets).toEqual([])
    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
    expect(await assetsOf(handle).get(image)).toEqual(IMAGE)
  })

  it('two imports of one file give two ids, and the second writes no asset', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    const file = building(await completeArchive(project))

    const first = importedOf(await importFile(ports, undefined, file)).handle
    const writes = logWrites(ports)
    const { handle: second, missingAssets } = importedOf(await importFile(ports, first, file))

    expect(second.id).not.toBe(first.id)
    expect(missingAssets).toEqual([])
    expect(poolWrites(writes)).toEqual([])
  })
})

describe('an import of an archive that is named or written unusually', () => {
  it('an ending in upper case still brings its assets', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()

    const file = building(await completeArchive(project), 'HOUSE.BUILDING')
    const { handle, missingAssets } = importedOf(await importFile(ports, undefined, file))

    expect(missingAssets).toEqual([])
    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
    expect(await assetsOf(handle).get(image)).toEqual(IMAGE)
  })

  it('a document that only breaks the format rules does not import, and nothing is stored', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    const bytes = buildZip([
      documentEntry(documentBreakingRulesReferring(project)),
      await assetEntry(MODEL),
      await assetEntry(IMAGE),
    ])
    const writes = logWrites(ports)

    const result = await importFile(ports, undefined, building(bytes))

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'format-rules' } },
    })
    expect(writes).toEqual([])
  })
})

describe('the order in which an import writes', () => {
  it('writes the assets, then the session start and the snapshot of the copy, then its document', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    const writes = logWrites(ports)

    const { handle } = importedOf(
      await importFile(ports, undefined, building(await completeArchive(project))),
    )

    const autosave = `${handle.id}/${AUTOSAVE_FOLDER}`
    const lastAsset = Math.max(
      ...writes.flatMap((path, index) => (path.startsWith(POOL_FOLDER) ? [index] : [])),
    )
    const start = writes.indexOf(`${autosave}${START_FILE}`)
    const snapshot = writes.findIndex((path) => path.startsWith(`${autosave}${SNAPSHOT_PREFIX}`))
    const document = writes.indexOf(`${handle.id}/${DOCUMENT_FILE}`)
    expect(lastAsset).toBeGreaterThanOrEqual(0)
    expect(start).toBeGreaterThan(lastAsset)
    expect(snapshot).toBeGreaterThan(start)
    expect(document).toBeGreaterThan(snapshot)
    expect(writes).toHaveLength(document + 1)
  })

  it('a save that fails still leaves the assets in the pool and only the autosave files in the copy', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    failSaves(ports.workspace)

    const { handle } = importedOf(
      await importFile(ports, undefined, building(await completeArchive(project))),
    )

    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
    expect(await assetsOf(handle).get(image)).toEqual(IMAGE)
    const stored = [...(await ports.workspace.storedFiles(handle.id)).keys()]
    expect(stored.length).toBeGreaterThan(0)
    expect(stored.every((path) => path.startsWith(AUTOSAVE_FOLDER))).toBe(true)
  })
})
