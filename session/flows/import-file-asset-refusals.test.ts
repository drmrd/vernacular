// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ARCHIVE_LIMITS } from '../../storage'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import { assetEntry, buildZip } from '../../storage/zip/zip-test-kit'
import {
  createTestPorts,
  failSaves,
  openOrThrow,
  placeDocument,
  recordingPorts,
  rename,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { importFile } from './import-file'
import { completeArchive, house, IMAGE, logWrites, MODEL, poolWrites } from './import-file-test-kit'

const CURRENT_ID = 'a'

/** A handle on the stored project `a`. */
async function openCurrent(ports: TestPorts) {
  await placeDocument(ports, CURRENT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(CURRENT_ID))
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

describe('an import with assets that is refused', () => {
  it('a refused file writes nothing to the pool and calls no port', async () => {
    const calls: string[] = []
    const ports = recordingPorts(calls)
    const writes = logWrites(ports)

    const result = await importFile(ports, undefined, {
      name: 'house.zip',
      bytes: await completeArchive((await house()).project),
    })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'unsupported-file', fileName: 'house.zip' },
    })
    expect(calls).toEqual([])
    expect(writes).toEqual([])
  })

  it('a switch that fails with flush-failed writes nothing to the pool', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    failSaves(ports.workspace)
    rename(current, 'Edited before the failed import')
    const writes = logWrites(ports)

    const result = await importFile(ports, current, {
      name: 'house.building',
      bytes: await completeArchive((await house()).project),
    })

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(poolWrites(writes)).toEqual([])
  })

  it('an archive above a limit gives archive-too-large with the limit, and the current project stays open', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const bytes = await completeArchive((await house()).project)
    const limits = { ...ARCHIVE_LIMITS, archiveBytes: bytes.length - 1 }
    const writes = logWrites(ports)

    const result = await importFile(ports, current, { name: 'house.building', bytes, limits })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'archive-too-large', limit: 'archiveBytes', allowed: bytes.length - 1 },
    })
    expect(poolWrites(writes)).toEqual([])
    expect(await ports.locks.heldIds()).toEqual(new Set([CURRENT_ID]))
    expect(await current.save()).toEqual({ ok: true })
  })

  it('an archive with no document gives did-not-import with not-a-project', async () => {
    const ports = createTestPorts()
    const bytes = buildZip([await assetEntry(MODEL), await assetEntry(IMAGE)])

    const result = await importFile(ports, undefined, { name: 'house.building', bytes })

    expect(result).toEqual({
      ok: false,
      failure: { kind: 'did-not-import', decode: { kind: 'not-a-project' } },
    })
  })
})
