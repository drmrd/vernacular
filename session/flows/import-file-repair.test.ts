// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate, and its digest is the real one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { assetsOf } from '../handle/handle-assets'
import { createTestPorts, handleOf, storedName } from '../handle/handle-test-kit'
import { importFile } from './import-file'
import type { ImportedFile } from './import-file'
import { IMAGE, importedOf } from './import-file-test-kit'
import {
  REPAIRED_NAME,
  missingRequiredFieldBytes,
  mixedPaintArchive,
  mixedPaintBytes,
  repairedBody,
  storedIds,
  withoutMeta,
} from './open-failed-test-kit'

const SOUND_NAME = 'Imported house'

/** A file of the format that `bytes` holds, with the option that opens the repaired copy. */
function repairing(name: string, bytes: Uint8Array): ImportedFile {
  return { name, bytes, applyRepair: true }
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

describe('an import with the repair', () => {
  it('an import with the repair opens the repaired copy of a file with a mixed paint entry, named as a repaired copy', async () => {
    const ports = createTestPorts()

    const handle = handleOf(
      await importFile(ports, undefined, repairing('mixed.json', mixedPaintBytes())),
    )

    expect(handle.session.getProject().meta.name).toBe(REPAIRED_NAME)
    expect(await storedName(ports.workspace, handle.id)).toBe(REPAIRED_NAME)
    expect(withoutMeta(handle.session.getProject())).toEqual(repairedBody())
  })

  it('an import with the repair of an archive stores the assets of the archive', async () => {
    const ports = createTestPorts()
    const { bytes, imageHash } = await mixedPaintArchive()

    const { handle, missingAssets } = importedOf(
      await importFile(ports, undefined, repairing('mixed.building', bytes)),
    )

    expect(await assetsOf(handle).get(imageHash)).toEqual(IMAGE)
    expect(await ports.workspace.assets(handle.id).get(imageHash)).toEqual(IMAGE)
    expect(missingAssets).not.toContain(imageHash)
  })

  it('an import with the repair of a file that has no repair gives did-not-import', async () => {
    const ports = createTestPorts()

    const result = await importFile(
      ports,
      undefined,
      repairing('no-walls.json', missingRequiredFieldBytes()),
    )

    expect(result).toMatchObject({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'format-rules' } },
    })
    expect(await storedIds(ports)).toEqual([])
  })

  it('the repair option changes nothing for a sound file', async () => {
    const ports = createTestPorts()
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).name = SOUND_NAME

    const handle = handleOf(
      await importFile(ports, undefined, repairing('house.json', bytesOf(document))),
    )

    expect(handle.session.getProject().meta.name).toBe(SOUND_NAME)
  })
})
