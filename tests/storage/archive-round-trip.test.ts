// @vitest-environment node
// Writes and reads .building archives; node aligns Uint8Array realms with fflate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { exportArchive, importFile } from '../../session'
import {
  createTestPorts,
  DOCUMENT_FILE,
  openOrThrow,
  storedProject,
  workspaceRequest,
} from '../../session/testing'
import type { TestPorts } from '../../session/testing'
import { contentHashOf, projectReferring, seededBytes } from '../../storage/zip/zip-test-kit'

const PROJECT_ID = 'a'
const MODEL = seededBytes(4096)
const IMAGE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 4, 5, 6)

/** Workspace A: a stored project that places a furniture model and lays an underlay image, and both assets in its pool. */
async function workspaceWithHouse(): Promise<{ ports: TestPorts; hashes: string[] }> {
  const ports = createTestPorts()
  const model = await contentHashOf(MODEL)
  const image = await contentHashOf(IMAGE)
  const project = projectReferring(
    [{ scope: 'user', contentHash: model }],
    [{ scope: 'project', contentHash: image }],
  )
  await ports.workspace.save(PROJECT_ID, project)
  await ports.workspace.assets(PROJECT_ID).put(model, MODEL)
  await ports.workspace.assets(PROJECT_ID).put(image, IMAGE)
  return { ports, hashes: [model, image] }
}

async function storedDocument(ports: TestPorts, id: string): Promise<Uint8Array | undefined> {
  return ports.root.readFile(`${id}/${DOCUMENT_FILE}`)
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('an archive round trip', () => {
  it('a project with a furniture model and an underlay image is identical after an export and an import into an empty workspace', async () => {
    const { ports: portsA, hashes } = await workspaceWithHouse()
    const exported = await exportArchive(await openOrThrow(portsA, workspaceRequest(PROJECT_ID)))
    if (!exported.ok) throw new Error(`Expected an archive: ${exported.message}`)
    const portsB = createTestPorts()

    const imported = await importFile(portsB, undefined, {
      name: exported.fileName,
      bytes: exported.bytes,
    })

    if (!imported.ok) throw new Error(`Expected an import: ${JSON.stringify(imported.failure)}`)
    const idB = imported.handle.id
    expect(await storedProject(portsB.workspace, idB)).toEqual(
      await storedProject(portsA.workspace, PROJECT_ID),
    )
    expect(await storedDocument(portsB, idB)).toEqual(await storedDocument(portsA, PROJECT_ID))
    for (const hash of hashes) {
      expect(await portsB.workspace.assets(idB).get(hash)).toEqual(
        await portsA.workspace.assets(PROJECT_ID).get(hash),
      )
    }
    expect(imported.missingAssets).toEqual([])
    expect(exported.missingAssets).toEqual([])
  })
})
