import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InMemoryProjectIndex, withMemoryFallback } from '../../storage'
import type { StoreRead } from '../../storage'
import {
  BACKUP_DIRECTORY,
  backupsOf,
  treeOf,
} from '../../storage/documents/document-store-test-kit'
import {
  failingIndex,
  holdReads,
  sampleRecord,
  watch,
} from '../../storage/project-index/project-record-test-kit'
import { INDEX_READ_WAIT_MS } from '../../storage/project-index/with-memory-fallback'
import { settle } from '../autosave/save-gate-test-kit'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { documentBreakingFormatRules } from '../../tests/storage/conformance/conformance-documents'
import { IN_WORKSPACE, placeDocument, rememberFolder } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  EARLIER_CHANGE,
  REBUILD_BUILD,
  STORED_AT,
  documentNamed,
  folderRecord,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundRecordOf,
} from './rebuild-test-kit'

const OLDER_VERSION = 8

/** The two ways a read can give no document for a listed id although the store listed it. */
const READS_WITHOUT_A_DOCUMENT: readonly (readonly [string, () => Promise<StoreRead>])[] = [
  ['rejects', () => Promise.reject(new Error('the store cannot be read'))],
  ['answers not-found', () => Promise.resolve({ ok: false, failure: { kind: 'not-found' } })],
]

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a rebuild whose index or store fails', () => {
  it('it never rejects: an index with no fall-back that rejects every call still gives a record for every stored project', async () => {
    const ports = rebuildPorts({ index: failingIndex() })
    await placeSound(ports, ['a', 'b'])

    await expect(reconcileIndex(ports)).resolves.toEqual([soundRecordOf('a'), soundRecordOf('b')])
  })

  it('a store whose listing rejects drops nothing, and the result is what the index holds', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const held = [
      sampleRecord({ id: 'a', lastChangedAt: EARLIER_CHANGE }),
      folderRecord('f'),
      sampleRecord({ id: 'gone' }),
    ]
    for (const record of held) await ports.index.put(record)
    vi.spyOn(ports.workspace, 'list').mockRejectedValue(new Error('the workspace cannot be listed'))
    const read = vi.spyOn(ports.workspace, 'read')
    const put = vi.spyOn(ports.index, 'put')
    const remove = vi.spyOn(ports.index, 'remove')

    expect(await reconcileIndex(ports)).toEqual(held)
    expect(await ports.index.all()).toEqual(held)
    expect([read, put, remove].map((spy) => spy.mock.calls.length)).toEqual([0, 0, 0])
  })

  it('a put that rejects leaves the rebuilt record in the result, and a remove that rejects still leaves the dropped record out', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(sampleRecord({ id: 'gone' }))
    const put = vi.spyOn(ports.index, 'put').mockRejectedValue(new Error('the index is full'))
    vi.spyOn(ports.index, 'remove').mockRejectedValue(new Error('the index is locked'))

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])
    expect(put).toHaveBeenCalledWith(soundRecordOf('a'))
  })

  it.each(READS_WITHOUT_A_DOCUMENT)(
    'a project whose read %s keeps its record, and with none gets one in the result that the index does not get',
    async (_way, failedRead) => {
      const ports = rebuildPorts()
      await placeSound(ports, ['kept', 'new'])
      const kept = sampleRecord({ id: 'kept', lastChangedAt: EARLIER_CHANGE })
      await ports.index.put(kept)
      const read = vi.spyOn(ports.workspace, 'read').mockImplementation(failedRead)
      const put = vi.spyOn(ports.index, 'put')

      const [first, second] = await reconcileIndex(ports)

      expect(first).toEqual(kept)
      expect(second).toMatchObject({ id: 'new', location: IN_WORKSPACE, assetHashes: [] })
      expect([second?.name, second?.floorCount, second?.preview]).toEqual([
        undefined,
        undefined,
        undefined,
      ])
      expect(second?.assetListComplete).toBe(false)
      expect([second?.lastChangedAt, second?.lastUsedAt]).toEqual([STORED_AT, STORED_AT])
      expect(second?.lastOpen).toStrictEqual({
        opened: false,
        build: REBUILD_BUILD,
        reason: 'storage-unavailable',
      })
      expect(put).not.toHaveBeenCalled()
      expect(await ports.index.all()).toEqual([kept])
      read.mockRestore()
      expect(await reconcileIndex(ports)).toEqual([
        soundRecordOf('kept', { lastUsedAt: kept.lastUsedAt }),
        soundRecordOf('new'),
      ])
    },
  )

  it('the index is read before the store is listed', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const reads = holdReads(ports.index, 'all')
    const list = vi.spyOn(ports.workspace, 'list')

    const rebuilding = reconcileIndex(ports)
    await settle()

    expect(reads.started()).toBe(1)
    expect(list).not.toHaveBeenCalled()
    reads.answerOldest()
    expect(await rebuilding).toEqual([soundRecordOf('a')])
    expect(list).toHaveBeenCalledTimes(1)
  })
})

describe('what a rebuild leaves alone', () => {
  it('no stored file changes for a sound project, a broken one, and one that only fails the check', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['sound'])
    await placeDocument(ports, 'broken', notJsonBytes())
    await placeDocument(ports, 'faulty', documentBreakingFormatRules())
    const before = await treeOf(ports.root)

    expect(await reconcileIndex(ports)).toHaveLength(3)

    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('a project of an older version gains its migration backup and nothing else', async () => {
    const ports = rebuildPorts()
    const original = versionFixtureBytes(OLDER_VERSION)
    await placeDocument(ports, 'a', original)
    const before = await treeOf(ports.root)

    await reconcileIndex(ports)

    const backups = await backupsOf(ports.root)
    expect(backups.map(({ bytes }) => bytes)).toEqual([original])
    const backupPath = `${BACKUP_DIRECTORY}/${backups[0]?.name ?? ''}`
    expect(await treeOf(ports.root)).toEqual({ ...before, [backupPath]: Array.from(original) })
  })

  it('a folder record is not read and not rebuilt, also when its times differ', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await rememberFolder(ports, 'f', documentNamed('In the folder'))
    const away = folderRecord('f', { lastChangedAt: EARLIER_CHANGE })
    await ports.index.put(away)
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const read = vi.spyOn(ports.workspace, 'read')
    const put = vi.spyOn(ports.index, 'put')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a'), away])

    expect(reopen).not.toHaveBeenCalled()
    expect(read.mock.calls).toEqual([['a']])
    expect(put.mock.calls.map(([record]) => record.id)).toEqual(['a'])
  })

  it('it asks the lock port nothing', async () => {
    const asked: PropertyKey[] = []
    const plain = rebuildPorts()
    const locks = new Proxy(plain.locks, {
      get(target, key, receiver) {
        asked.push(key)
        return Reflect.get(target, key, receiver)
      },
    })
    const ports = { ...plain, locks }
    await placeSound(ports, ['a', 'kept'])
    await placeDocument(ports, 'broken', notJsonBytes())
    await ports.index.put(sampleRecord({ id: 'kept', lastChangedAt: EARLIER_CHANGE }))
    await ports.index.put(sampleRecord({ id: 'gone' }))

    expect(await reconcileIndex(ports)).toHaveLength(3)

    expect(asked).toEqual([])
  })
})

describe('calls that overlap, and an index that never answers', () => {
  it('calls that overlap for one ports object share one run', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a', 'b'])
    const list = vi.spyOn(ports.workspace, 'list')
    const read = vi.spyOn(ports.workspace, 'read')

    const [first, second] = await Promise.all([reconcileIndex(ports), reconcileIndex(ports)])

    expect(second).toEqual(first)
    expect(first).toEqual([soundRecordOf('a'), soundRecordOf('b')])
    expect([list.mock.calls.length, read.mock.calls.length]).toEqual([1, 2])
    await reconcileIndex(ports)
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('over the memory fall-back, an index whose read never answers gives every stored project a record when the read time is up, and not one millisecond before', async () => {
    vi.useFakeTimers()
    const first = new InMemoryProjectIndex()
    holdReads(first, 'all')
    const ports = rebuildPorts({ index: withMemoryFallback(first) })
    await placeSound(ports, ['a', 'b'])

    const rebuilding = reconcileIndex(ports)
    const state = watch(rebuilding)
    await vi.advanceTimersByTimeAsync(INDEX_READ_WAIT_MS - 1)

    expect(state()).toEqual({ status: 'pending' })
    await vi.advanceTimersByTimeAsync(1)
    const records = [soundRecordOf('a'), soundRecordOf('b')]
    await expect(rebuilding).resolves.toEqual(records)
    expect(await ports.index.all()).toEqual(records)
  })
})
