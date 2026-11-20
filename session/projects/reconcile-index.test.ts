import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeDocument } from '../../core'
import type { Project } from '../../core'
import { openDespiteFaults, withMemoryFallback } from '../../storage'
import type { FormatRulesFailure, ProjectRecord } from '../../storage'
import { failingIndex, sampleRecord } from '../../storage/project-index/project-record-test-kit'
import {
  currentBytes,
  documentBreakingFormatRules,
} from '../../tests/storage/conformance/conformance-documents'
import { UNKNOWN_WALL_FIELD_PATH } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  IN_WORKSPACE,
  openOrThrow,
  placeDocument,
  rename,
  workspaceRequest,
} from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { UNNAMED_PROJECT, displayNameOf, reconcileIndex } from '..'
import { factsOf } from './project-facts'
import {
  EARLIER_CHANGE,
  LATER_BUILD_HASH,
  REBUILD_BUILD,
  STORED_AT,
  USED_AT,
  documentNamed,
  documentOfNewerVersion,
  failedRecord,
  folderRecord,
  idsOf,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundRecordOf,
} from './rebuild-test-kit'

let consoleWarn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

/** The part of a record that a list of projects shows. */
function shown(record: ProjectRecord) {
  const { id, location, name, floorCount, preview } = record
  return { id, location, name, floorCount, preview }
}

/** Opens and closes each project through a handle, so that the handle writes its record. */
async function openAndClose(ports: TestPorts, ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    const handle = await openOrThrow(ports, workspaceRequest(id))
    await handle.close()
  }
}

/** The project that a document which fails only the strict check opens as. */
function openedDespiteFaults(bytes: Uint8Array): Project {
  const decoded = decodeDocument(bytes)
  if (decoded.ok || decoded.failure.kind !== 'format-rules') {
    throw new Error(`Expected only the format rules to fail: ${JSON.stringify(decoded)}`)
  }
  const failure: FormatRulesFailure = decoded.failure
  return openDespiteFaults(failure)
}

describe('the records that the rebuild makes from the stored projects', () => {
  it("with the index emptied, each workspace project's record has the same name, floor count, and preview as before", async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'a', documentNamed('The parlour house'))
    await placeDocument(ports, 'b', documentNamed('The barn'))
    await openAndClose(ports, ['a', 'b'])
    const before = await ports.index.all()
    expect(idsOf(before)).toEqual(['a', 'b'])

    const after = await reconcileIndex(rebuildPorts({ root: ports.root }))

    expect(after.map(shown)).toEqual(before.map(shown))
  })

  it('a record for a workspace id the store lacks is dropped, and a folder record is kept', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const away = folderRecord('away')
    await ports.index.put(sampleRecord({ id: 'gone' }))
    await ports.index.put(away)

    const records = await reconcileIndex(ports)

    expect(records).toEqual([soundRecordOf('a'), away])
    expect(await ports.index.get('gone')).toBeUndefined()
    expect(await ports.index.get('away')).toEqual(away)
  })

  it('a lost lastUsedAt takes lastChangedAt', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])

    const [record] = await reconcileIndex(ports)

    expect(record?.lastChangedAt).toBe(STORED_AT)
    expect(record?.lastUsedAt).toBe(STORED_AT)
  })

  it('bytes that are not JSON give a record with opened: false, the placeholder name, and an asset list that is not complete, and the listing succeeds', async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'broken', notJsonBytes())
    await placeSound(ports, ['a'])

    const records = await reconcileIndex(ports)

    expect(records).toEqual([
      soundRecordOf('a'),
      failedRecord('broken', notJsonBytes(), 'not-json'),
    ])
    expect(records.map(displayNameOf)).toEqual(['House a', UNNAMED_PROJECT])
    expect(await ports.index.all()).toEqual(records)
  })

  it('a project that fails only the strict check gets its facts from the failed document and a record that says it opened, with a warning that carries the faults', async () => {
    const ports = rebuildPorts()
    const bytes = documentBreakingFormatRules()
    await placeDocument(ports, 'a', bytes)
    const facts = factsOf(openedDespiteFaults(bytes))
    consoleWarn.mockClear()

    const [record] = await reconcileIndex(ports)

    expect(record).toEqual({
      id: 'a',
      location: IN_WORKSPACE,
      name: facts.name,
      floorCount: facts.floorCount,
      preview: facts.preview,
      assetHashes: facts.assetHashes,
      assetListComplete: false,
      lastChangedAt: STORED_AT,
      lastUsedAt: STORED_AT,
      lastOpen: { opened: true, build: REBUILD_BUILD },
    })
    expect(record?.lastOpen).toStrictEqual({ opened: true, build: REBUILD_BUILD })
    expect(JSON.stringify(consoleWarn.mock.calls)).toContain(UNKNOWN_WALL_FIELD_PATH)
  })

  it('an index that rejects every call falls back to one rebuilt in memory', async () => {
    const failing = failingIndex()
    const ports = rebuildPorts({ index: withMemoryFallback(failing) })
    await placeSound(ports, ['a', 'b'])

    const records = await reconcileIndex(ports)

    expect(records).toEqual([soundRecordOf('a'), soundRecordOf('b')])
    expect(await ports.index.all()).toEqual(records)
    expect(failing.calls()).toBe(1)
    expect(consoleWarn).toHaveBeenCalledTimes(1)
  })
})

describe('the records that the rebuild keeps, replaces, and orders', () => {
  it('a record that agrees with its stored document is kept as it is, and the document is not read', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const kept = sampleRecord({ id: 'a', name: 'Kept as it is', lastChangedAt: STORED_AT })
    await ports.index.put(kept)
    const read = vi.spyOn(ports.workspace, 'read')

    const first = await reconcileIndex(ports)

    expect(first).toEqual([kept, soundRecordOf('b')])
    expect(read.mock.calls).toEqual([['b']])
    read.mockClear()
    const put = vi.spyOn(ports.index, 'put')
    const remove = vi.spyOn(ports.index, 'remove')
    expect(await reconcileIndex(ports)).toEqual(first)
    expect(read).not.toHaveBeenCalled()
    expect(put).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })

  it("a record whose time of change differs from the store's is rebuilt and keeps its time of use", async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const behind = sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE, lastUsedAt: USED_AT })
    await ports.index.put(behind)

    const records = await reconcileIndex(ports)

    const rebuilt = soundRecordOf('a', { lastUsedAt: USED_AT })
    expect(records).toEqual([rebuilt])
    expect(await ports.index.get('a')).toEqual(rebuilt)
  })

  it('a document of a newer version keeps what a best-effort read finds: its name and its asset hashes', async () => {
    const ports = rebuildPorts()
    const bytes = documentOfNewerVersion('Drawn by a later release')
    await placeDocument(ports, 'later', bytes)

    const [record] = await reconcileIndex(ports)

    expect(record).toEqual(failedRecord('later', bytes, 'newer-version'))
    expect(record?.name).toBe('Drawn by a later release')
    expect(record?.assetHashes).toContain(LATER_BUILD_HASH)
  })

  it('the result lists every record ordered by id, and the index holds the same records', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['c', 'a'])
    const away = folderRecord('b')
    await ports.index.put(away)

    const records = await reconcileIndex(ports)

    expect(records).toEqual([soundRecordOf('a'), away, soundRecordOf('c')])
    expect(await ports.index.all()).toEqual(records)
  })

  it('a rebuilt record of a sound document lists the same assets as the record of a save', async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'a', currentBytes())
    const handle = await openOrThrow(ports, workspaceRequest('a'))
    rename(handle, 'Saved before the index was lost')
    expect(await handle.save()).toEqual({ ok: true })
    await handle.close()
    const saved = await ports.index.get('a')
    expect(saved?.assetHashes.length).toBeGreaterThan(0)

    const [rebuilt] = await reconcileIndex(rebuildPorts({ root: ports.root }))

    expect(rebuilt?.assetHashes).toEqual(saved?.assetHashes)
    expect([rebuilt?.assetListComplete, saved?.assetListComplete]).toEqual([true, true])
  })

  it('a folder record under an id that the workspace holds is replaced by the record of the workspace project', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(folderRecord('a'))

    const records = await reconcileIndex(ports)

    const rebuilt = soundRecordOf('a', { lastUsedAt: expect.any(String) as string })
    expect(records).toEqual([rebuilt])
    expect(await ports.index.get('a')).toEqual(rebuilt)
  })
})
