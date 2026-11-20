// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeDocument, type AssetReference, type Project } from '../../core'
import { collectReferencedAssets } from '../../storage'
import { misnamedAssetEntry } from '../../storage/zip/zip-edges-test-kit'
import { assetEntry, contentHashOf, projectArchive } from '../../storage/zip/zip-test-kit'
import { assetsOf } from '../handle/handle-assets'
import {
  createTestPorts,
  DOCUMENT_FILE,
  placeDocument,
  storedName,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
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
} from './import-file-test-kit'

const STRAY = Uint8Array.of(7, 7, 7)
const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'

const building = (bytes: Uint8Array) => ({ name: 'house.building', bytes })

/** The hash of each asset that the project refers to, in the order of first reference. */
function referencedHashes(project: Project): string[] {
  return [...new Set(collectReferencedAssets(project).map((reference) => reference.contentHash))]
}

/** From now on each write under the asset pool rejects; other writes work. */
function failPoolWrites(ports: TestPorts): void {
  const write = ports.root.writeFile.bind(ports.root)
  ports.root.writeFile = (path, bytes) =>
    path.startsWith(POOL_FOLDER) ? Promise.reject(new Error('disk full')) : write(path, bytes)
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

describe('an import of an archive with assets', () => {
  it('an archive with a furniture model and an underlay image imports with each asset in the pool, same bytes', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()

    const { handle } = importedOf(
      await importFile(ports, undefined, building(await completeArchive(project))),
    )

    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
    expect(await assetsOf(handle).get(image)).toEqual(IMAGE)
  })

  it('an entry whose bytes do not hash to its name is not in the pool, and missingAssets names it', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    const bytes = projectArchive(project, [
      await assetEntry(MODEL),
      await misnamedAssetEntry(STRAY, IMAGE),
    ])
    const writes = logWrites(ports)

    const { handle, missingAssets } = importedOf(
      await importFile(ports, undefined, building(bytes)),
    )

    expect(missingAssets).toEqual([image])
    expect(writes).not.toContain(`${POOL_FOLDER}${image}`)
    expect(await assetsOf(handle).has(image)).toBe(false)
    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
  })

  it('an archive that lacks one referenced asset imports, opens, and reports one in missingAssets', async () => {
    const ports = createTestPorts()
    const { image, project } = await house()
    const bytes = projectArchive(project, [await assetEntry(MODEL)])

    const { handle, missingAssets } = importedOf(
      await importFile(ports, undefined, building(bytes)),
    )

    expect(handle.session.getProject().meta.name).toBe(project.meta.name)
    expect(await storedName(ports.workspace, handle.id)).toBe(project.meta.name)
    expect(missingAssets).toEqual([image])
  })

  it('an archive with every asset reports none', async () => {
    const ports = createTestPorts()
    const { project } = await house()

    const result = await importFile(ports, undefined, building(await completeArchive(project)))

    expect(importedOf(result).missingAssets).toEqual([])
  })

  it('a .json file whose assets the pool lacks reports them', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    await ports.workspace.assets(OTHER_ID).put(model, MODEL)
    const file = { name: 'house.json', bytes: encodeDocument(project, undefined).bytes }

    const { missingAssets } = importedOf(await importFile(ports, undefined, file))

    expect(missingAssets).toEqual([image])
  })

  it('a pack reference that packSupplies accepts is not reported', async () => {
    const ports = createTestPorts()
    const packHash = 'f'.repeat(64)
    const { project } = await house([{ scope: PACK_SCOPE, contentHash: packHash }])
    const file = {
      ...building(await completeArchive(project)),
      packSupplies: (reference: AssetReference) => reference.contentHash === packHash,
    }

    expect(importedOf(await importFile(ports, undefined, file)).missingAssets).toEqual([])
  })

  it('the import hashes no asset again: the digest runs once for each asset of the archive', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    const bytes = await completeArchive(project)
    const digest = vi.spyOn(crypto.subtle, 'digest')

    const result = await importFile(ports, undefined, building(bytes))

    expect(digest).toHaveBeenCalledTimes(2)
    const { handle } = importedOf(result)
    expect(await assetsOf(handle).get(model)).toEqual(MODEL)
    expect(await assetsOf(handle).get(image)).toEqual(IMAGE)
  })
})

describe('an import that copies only what it may', () => {
  it('an asset that the document does not refer to is not in the pool', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    const stray = await contentHashOf(STRAY)
    const bytes = projectArchive(project, [await assetEntry(MODEL), await assetEntry(STRAY)])
    const writes = logWrites(ports)

    const { handle } = importedOf(await importFile(ports, undefined, building(bytes)))

    expect(writes).not.toContain(`${POOL_FOLDER}${stray}`)
    expect(await assetsOf(handle).has(stray)).toBe(false)
  })

  it('an asset that the pool has is not written again', async () => {
    const ports = createTestPorts()
    const { model, project } = await house()
    await ports.workspace.assets(OTHER_ID).put(model, MODEL)
    const writes = logWrites(ports)

    importedOf(await importFile(ports, undefined, building(await completeArchive(project))))

    expect(writes).not.toContain(`${POOL_FOLDER}${model}`)
    expect(await ports.workspace.assets(OTHER_ID).get(model)).toEqual(MODEL)
  })

  it('the stored files of another project are the same after the import', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    await placeDocument(ports, OTHER_ID, encodeDocument(project, undefined).bytes)
    const before = await ports.workspace.storedFiles(OTHER_ID)

    importedOf(await importFile(ports, undefined, building(await completeArchive(project))))

    expect(await ports.workspace.storedFiles(OTHER_ID)).toEqual(before)
  })

  it('the assets are written before the document of the copy', async () => {
    const ports = createTestPorts()
    const { model, image, project } = await house()
    const writes = logWrites(ports)

    const result = await importFile(ports, undefined, building(await completeArchive(project)))

    const documentPath = `${importedOf(result).handle.id}/${DOCUMENT_FILE}`
    expect(writes).toContain(documentPath)
    expect(writes.slice(0, writes.indexOf(documentPath))).toEqual(
      expect.arrayContaining([`${POOL_FOLDER}${model}`, `${POOL_FOLDER}${image}`]),
    )
  })
})

describe('an import whose pool fails', () => {
  it('a pool write that fails still opens the copy and reports the asset', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    failPoolWrites(ports)

    const result = await importFile(ports, undefined, building(await completeArchive(project)))

    const { handle, missingAssets } = importedOf(result)
    expect(missingAssets).toEqual(referencedHashes(project))
    expect(await storedName(ports.workspace, handle.id)).toBe(project.meta.name)
  })

  it('a pool that cannot be reached still opens the copy, logs the error, and reports every needed asset', async () => {
    const ports = createTestPorts()
    const { project } = await house()
    ports.workspace.assets = () => {
      throw new Error('the pool cannot be reached')
    }

    const result = await importFile(ports, undefined, building(await completeArchive(project)))

    const { handle, missingAssets } = importedOf(result)
    expect(missingAssets).toEqual(referencedHashes(project))
    expect(await storedName(ports.workspace, handle.id)).toBe(project.meta.name)
    expect(console.error).toHaveBeenCalled()
  })
})
