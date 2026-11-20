// @vitest-environment node
// Reads .building archives; node aligns Uint8Array realms with fflate.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../../core'
import { ARCHIVE_LIMITS } from '../../storage'
import { currentBytes } from '../../tests/storage/conformance/conformance-documents'
import {
  assetEntry,
  buildZip,
  contentHashOf,
  projectArchive,
  projectReferring,
} from '../../storage/zip/zip-test-kit'
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

const CURRENT_ID = 'a'
const MODEL = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 2, 3)
const IMAGE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 4, 5, 6)
const POOL_FOLDER = 'assets/'

/** A project that places a furniture model and lays an underlay image. */
async function house(): Promise<Project> {
  return projectReferring(
    [{ scope: 'user', contentHash: await contentHashOf(MODEL) }],
    [{ scope: 'project', contentHash: await contentHashOf(IMAGE) }],
  )
}

/** The archive of the house with both of its assets. */
async function completeArchive(): Promise<Uint8Array> {
  return projectArchive(await house(), [await assetEntry(MODEL), await assetEntry(IMAGE)])
}

/** A handle on the stored project `a`. */
async function openCurrent(ports: TestPorts) {
  await placeDocument(ports, CURRENT_ID, currentBytes())
  return openOrThrow(ports, workspaceRequest(CURRENT_ID))
}

/** From now on each path written to the directory of `ports` goes into the returned log. */
function logWrites(ports: TestPorts): string[] {
  const log: string[] = []
  const write = ports.root.writeFile.bind(ports.root)
  ports.root.writeFile = (path, bytes) => {
    log.push(path)
    return write(path, bytes)
  }
  return log
}

const poolWrites = (writes: readonly string[]) =>
  writes.filter((path) => path.startsWith(POOL_FOLDER))

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
      bytes: await completeArchive(),
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
      bytes: await completeArchive(),
    })

    expect(result).toEqual({ ok: false, failure: { kind: 'flush-failed' } })
    expect(poolWrites(writes)).toEqual([])
  })

  it('an archive above a limit gives archive-too-large with the limit, and the current project stays open', async () => {
    const ports = createTestPorts()
    const current = await openCurrent(ports)
    const bytes = await completeArchive()
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
