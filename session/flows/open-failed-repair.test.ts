// @vitest-environment node
// Hashes assets with the real digest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssetReference, RepairOffer } from '../../core'
import { DirectoryAssetCache } from '../../storage'
import type { PackSupplies } from '../../storage'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import type { TestPorts, TestPortsOptions } from '../handle/handle-test-kit'
import {
  IN_WORKSPACE,
  createTestPorts,
  failSaves,
  handleOf,
  recordOf,
  rename,
  storedName,
  storedProject,
  workspaceRequest,
} from '../handle/handle-test-kit'
import { IMAGE } from './import-file-test-kit'
import { repairedCopyName, openRepairedAsNew } from './open-failed'
import {
  EDITED_NAME,
  OTHER_ID,
  PROJECT_ID,
  REPAIRED_NAME,
  STORED_NAME,
  folderRequest,
  mixedPaintBytes,
  offerOf,
  openAnotherProject,
  placeFolderProjectReferringToImage,
  placeInWorkspace,
  repairedBody,
  repairedCopyRequest,
  storedIds,
  withoutMeta,
} from './open-failed-test-kit'

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
async function refusedProject(options: TestPortsOptions = {}) {
  const ports = createTestPorts(options)
  await placeInWorkspace(ports, mixedPaintBytes())
  return { ports, offer: await offerOf(ports, workspaceRequest(PROJECT_ID)) }
}

const PACK_SCOPE = 'pack:vernacular-starter@1.0.0'

/** Opens the repaired copy of the offer, with the assets that installed packs supply. */
function openCopySuppliedBy(ports: TestPorts, offer: RepairOffer, packSupplies: PackSupplies) {
  return openRepairedAsNew(ports, undefined, { ...repairedCopyRequest(offer), packSupplies })
}

describe('Open as a new project', () => {
  it('Open as a new project leaves every file of the stored project byte-identical', async () => {
    const { ports, offer } = await refusedProject()
    const before = await treeOf(ports.root, PROJECT_ID)

    await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer))

    expect(await treeOf(ports.root, PROJECT_ID)).toEqual(before)
  })

  it('it adds a project named "<name> (repaired copy)" that decodes and passes the check', async () => {
    const { ports, offer } = await refusedProject()

    const handle = handleOf(await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer)))

    expect(handle.id).not.toBe(PROJECT_ID)
    expect(await storedIds(ports)).toContain(handle.id)
    expect((await storedProject(ports.workspace, handle.id)).meta.name).toBe(REPAIRED_NAME)
  })

  it('the copy is the open project, is saved at once, and has a record in the index', async () => {
    const { ports, offer } = await refusedProject({ durable: true })

    const handle = handleOf(await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer)))

    expect(handle.session.getProject().meta.name).toBe(REPAIRED_NAME)
    expect(handle.saveStatus()).toBe('saved')
    expect(await ports.locks.heldIds()).toEqual(new Set([handle.id]))
    expect(await recordOf(ports, handle.id)).toMatchObject({
      id: handle.id,
      name: REPAIRED_NAME,
      location: IN_WORKSPACE,
    })
  })

  it('the copy holds none of the removed data and every other value', async () => {
    const { ports, offer } = await refusedProject()

    const handle = handleOf(await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer)))

    expect(withoutMeta(await storedProject(ports.workspace, handle.id))).toEqual(repairedBody())
  })

  it('a copy of a folder project is stored in the workspace with its assets, and the folder is byte-identical', async () => {
    const ports = createTestPorts()
    const { folder, imageHash } = await placeFolderProjectReferringToImage(ports)
    await new DirectoryAssetCache(folder).put(imageHash, IMAGE)
    const offer = await offerOf(ports, folderRequest())
    const before = await treeOf(folder)

    const handle = handleOf(await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer)))

    expect(handle.location).toEqual(IN_WORKSPACE)
    expect(await ports.workspace.assets(handle.id).get(imageHash)).toEqual(IMAGE)
    expect(await treeOf(folder)).toEqual(before)
  })

  it('an asset that the folder cannot give is reported as missing, and the copy still opens', async () => {
    const ports = createTestPorts()
    const { imageHash } = await placeFolderProjectReferringToImage(ports)
    const offer = await offerOf(ports, folderRequest())

    const result = await openRepairedAsNew(ports, undefined, repairedCopyRequest(offer))

    expect(result).toMatchObject({ ok: true, missingAssets: expect.arrayContaining([imageHash]) })
    expect(handleOf(result).session.getProject().meta.name).toBe(REPAIRED_NAME)
  })

  it('with another project open, the copy opens through a switch, and an edit made just before is stored', async () => {
    const { ports, offer } = await refusedProject()
    const current = await openAnotherProject(ports)
    rename(current, EDITED_NAME)

    const handle = handleOf(await openRepairedAsNew(ports, current, repairedCopyRequest(offer)))

    expect(await storedName(ports.workspace, OTHER_ID)).toBe(EDITED_NAME)
    expect(await ports.locks.heldIds()).toEqual(new Set([handle.id]))
  })

  it('a flush that fails gives flush-failed, and no project is added', async () => {
    const { ports, offer } = await refusedProject()
    const current = await openAnotherProject(ports)
    const before = await storedIds(ports)
    failSaves(ports.workspace)
    rename(current, EDITED_NAME)

    const result = await openRepairedAsNew(ports, current, repairedCopyRequest(offer))

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(await storedIds(ports)).toEqual(before)
  })

  it('the name of a repaired copy is the name with " (repaired copy)" after it', () => {
    expect(repairedCopyName(STORED_NAME)).toBe(REPAIRED_NAME)
  })
})

describe('Open as a new project, with the assets that installed packs supply', () => {
  /** A folder project whose underlay image is a pack asset that the folder does not hold. */
  async function refusedPackProject() {
    const ports = createTestPorts()
    const { imageHash } = await placeFolderProjectReferringToImage(ports, PACK_SCOPE)
    return { ports, imageHash, offer: await offerOf(ports, folderRequest()) }
  }

  it('a pack reference that an installed pack supplies is not a missing asset', async () => {
    const { ports, imageHash, offer } = await refusedPackProject()
    const supplied = (reference: AssetReference) => reference.contentHash === imageHash

    const result = await openCopySuppliedBy(ports, offer, supplied)

    if (!result.ok) throw new Error('The copy did not open')
    expect(result.missingAssets).not.toContain(imageHash)
  })

  it('a pack reference that no installed pack supplies, and no pool holds, is a missing asset', async () => {
    const { ports, imageHash, offer } = await refusedPackProject()

    const result = await openCopySuppliedBy(ports, offer, () => false)

    expect(result).toMatchObject({ ok: true, missingAssets: expect.arrayContaining([imageHash]) })
  })
})
