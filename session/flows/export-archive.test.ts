// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createUnderlay,
} from '../../core'
import type { Project } from '../../core'
import { ZipBundleProjectStore, bundleFilename } from '../../storage'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { gateSaves, settle } from '../autosave/save-gate-test-kit'
import type { DocumentHandle } from '../handle/handle-types'
import {
  createTestPorts,
  failSaves,
  openOrThrow,
  placeDocument,
  rename,
  storedName,
  storedProject,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { exportArchive } from './export-archive'
import type { ExportArchiveResult } from './export-archive'

const PROJECT_ID = 'a'
const APP_VERSION = '0.0.0'
const FURNITURE_HASH = 'f'.repeat(64)
const UNDERLAY_HASH = 'e'.repeat(64)
const PACK_HASH = 'd'.repeat(64)
const ASSET_BYTES = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 2, 3)
const FURNITURE_SIZE = { width: 600, depth: 600 }
const UNDERLAY_SIZE = { width: 1000, height: 800 }

/** A new project with one floor that holds a piece of furniture and an underlay image. */
function projectWithTwoAssets(): Project {
  const project = createEmptyProject({
    name: 'House with assets',
    units: 'metric',
    period: 'victorian',
    appVersion: APP_VERSION,
  })
  const floor = createFloor('Ground', { id: 'ground' })
  floor.furniture = [
    createFurnitureInstance({
      assetRef: { scope: 'user', contentHash: FURNITURE_HASH },
      position: { x: 0, y: 0 },
      footprint: FURNITURE_SIZE,
    }),
  ]
  floor.underlays = [
    createUnderlay({ image: { scope: 'project', contentHash: UNDERLAY_HASH }, ...UNDERLAY_SIZE }),
  ]
  project.floors = [floor]
  return project
}

/** A new project with one floor that holds a piece of furniture from the starter pack. */
function projectWithPackAsset(): Project {
  const project = createEmptyProject({
    name: 'House with a pack asset',
    units: 'metric',
    period: 'victorian',
    appVersion: APP_VERSION,
  })
  const floor = createFloor('Ground', { id: 'ground' })
  floor.furniture = [
    createFurnitureInstance({
      assetRef: { scope: 'pack:vernacular-starter@1.0.0', contentHash: PACK_HASH },
      position: { x: 0, y: 0 },
      footprint: FURNITURE_SIZE,
    }),
  ]
  project.floors = [floor]
  return project
}

/** The ports, and a handle on a stored sound document of the project `a`. */
async function openStored(): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  await placeDocument(ports, PROJECT_ID, currentBytes())
  return { ports, handle: await openOrThrow(ports, workspaceRequest(PROJECT_ID)) }
}

/** The ports, and a handle on a new project; the shared pool holds the `held` hashes. */
async function openWithAssets(
  held: readonly string[] = [FURNITURE_HASH, UNDERLAY_HASH],
  create: () => Project = projectWithTwoAssets,
): Promise<{ ports: TestPorts; handle: DocumentHandle }> {
  const ports = createTestPorts()
  const pool = ports.workspace.assets(PROJECT_ID)
  for (const hash of held) await pool.put(hash, ASSET_BYTES)
  const request = { ...workspaceRequest(PROJECT_ID), create }
  return { ports, handle: await openOrThrow(ports, request) }
}

/** The bytes of an export that must succeed. Throws, naming the message, otherwise. */
function exportedBytes(result: ExportArchiveResult): Uint8Array {
  if (!result.ok) throw new Error(`Expected the export to succeed: ${result.message}`)
  return result.bytes
}

/** The project of an archive. */
async function documentIn(archive: Uint8Array): Promise<Project> {
  const store = await ZipBundleProjectStore.fromBundle(PROJECT_ID, archive)
  return storedProject(store, PROJECT_ID)
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

describe('an export of the open project', () => {
  it('pending changes are written before the archive is made', async () => {
    const { ports, handle } = await openStored()
    const gate = gateSaves(ports.workspace)
    rename(handle, 'Edited before the export')
    let exported = false

    const exporting = exportArchive(handle).then((result) => {
      exported = true
      return result
    })
    await settle()
    expect(gate.started()).toBe(1)
    expect(exported).toBe(false)

    gate.endOldestSave()
    expect((await exporting).ok).toBe(true)
    expect(await storedName(ports.workspace, PROJECT_ID)).toBe('Edited before the export')
  })

  it('the document of the archive holds the last edit', async () => {
    const { handle } = await openStored()
    rename(handle, 'The last edit')

    const archive = exportedBytes(await exportArchive(handle))

    expect((await documentIn(archive)).meta.name).toBe('The last edit')
  })

  it("the file name is the bundle file name of the project's name", async () => {
    const { handle } = await openStored()
    rename(handle, 'Queen Anne cottage')

    const result = await exportArchive(handle)

    expect(result).toMatchObject({ ok: true, fileName: bundleFilename('Queen Anne cottage') })
  })

  it('with nothing unsaved it calls no store save', async () => {
    const { ports, handle } = await openStored()
    const save = vi.spyOn(ports.workspace, 'save')

    await exportArchive(handle)
    await settle()

    expect(save).not.toHaveBeenCalled()
  })

  it('a write that fails does not stop the export', async () => {
    const { ports, handle } = await openStored()
    failSaves(ports.workspace)
    rename(handle, 'Not stored, still exported')

    const archive = exportedBytes(await exportArchive(handle))

    expect((await documentIn(archive)).meta.name).toBe('Not stored, still exported')
    expect(handle.saveStatus()).toBe('error')
  })
})

describe('an export of a closed handle', () => {
  it('still exports the project of its session', async () => {
    const { handle } = await openStored()
    rename(handle, 'Named before the close')
    await handle.close()

    const archive = exportedBytes(await exportArchive(handle))

    expect((await documentIn(archive)).meta.name).toBe('Named before the close')
  })
})

describe('the assets of an export', () => {
  it('an asset of the pool that the project refers to is in the archive', async () => {
    const { handle } = await openWithAssets()

    const archive = exportedBytes(await exportArchive(handle))

    const store = await ZipBundleProjectStore.fromBundle(PROJECT_ID, archive)
    expect(await store.assetCache().get(FURNITURE_HASH)).toEqual(ASSET_BYTES)
  })

  it('progress is reported once for each referenced asset', async () => {
    const { handle } = await openWithAssets()
    const progress: Array<[number, number]> = []

    await exportArchive(handle, { onProgress: (done, total) => progress.push([done, total]) })

    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ])
  })

  it('an asset that the pool lacks is named in missingAssets and the archive is still made', async () => {
    const { handle } = await openWithAssets([FURNITURE_HASH])

    const result = await exportArchive(handle)

    expect(result).toMatchObject({ ok: true, missingAssets: [UNDERLAY_HASH] })
    expect((await documentIn(exportedBytes(result))).meta.name).toBe('House with assets')
  })

  it('with every asset in the pool missingAssets is empty', async () => {
    const { handle } = await openWithAssets()

    const result = await exportArchive(handle)

    expect(result).toMatchObject({ ok: true, missingAssets: [] })
  })

  it('a pack asset that packSupplies accepts is neither carried nor reported', async () => {
    const { handle } = await openWithAssets([PACK_HASH], projectWithPackAsset)

    const result = await exportArchive(handle, { packSupplies: () => true })

    expect(result).toMatchObject({ ok: true, missingAssets: [] })
    const store = await ZipBundleProjectStore.fromBundle(PROJECT_ID, exportedBytes(result))
    expect(await store.assetCache().get(PACK_HASH)).toBeUndefined()
  })
})

describe('an export of an object that no open built', () => {
  it('an object that no open built gives ok: false with a message', async () => {
    const { handle } = await openStored()

    const result = await exportArchive({ ...handle })

    expect(result).toEqual({ ok: false, message: expect.any(String) })
  })
})
