import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearLegacyActiveProjectId,
  legacyActiveProjectIdIsStored,
  plantLegacyActiveProjectId,
} from '../../storage/active-project/legacy-active-project-id-test-kit'
import { treeOf } from '../../storage/documents/document-store-test-kit'
import { holdReads, sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { placeDocument, rememberFolder } from '../handle/handle-test-kit'
import type { TestPorts } from '../handle/handle-test-kit'
import { reconcileIndex } from '..'
import {
  STORED_AT,
  USED_AT,
  documentNamed,
  failedRecord,
  folderRecord,
  markedRecordOf,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundRecordOf,
  unreadRecordOf,
  type RebuildPortsOptions,
} from './rebuild-test-kit'

beforeEach(() => {
  clearLegacyActiveProjectId()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
  clearLegacyActiveProjectId()
})

/** Ports whose workspace is durable, as the browser of a user who comes from the older code has. */
function upgradePorts(options: RebuildPortsOptions = {}): TestPorts {
  return rebuildPorts({ durable: true, ...options })
}

describe("today's project and the folder that the older code kept under its id", () => {
  it('a store with only current and no index gets one record for it with a time of use, and a second call keeps it', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['current'])

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])

    expect(await ports.index.all()).toEqual([soundRecordOf('current')])
    const put = vi.spyOn(ports.index, 'put')
    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])
    expect(put).not.toHaveBeenCalled()
  })

  it('a folder handle stored under current gives no folder record, the stored handle is removed, and no folder file is touched', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['current'])
    const folder = await rememberFolder(ports, 'current', documentNamed('In the folder'))
    const before = await treeOf(folder)

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])

    expect(await ports.folders.permission('current')).toBe('missing')
    expect(await ports.index.all()).toEqual([soundRecordOf('current')])
    expect(await treeOf(folder)).toEqual(before)
  })

  it('a workspace that is not durable leaves the remembered id and the folder alone', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['current'])
    await rememberFolder(ports, 'current', documentNamed('In the folder'))
    plantLegacyActiveProjectId('current')
    const forget = vi.spyOn(ports.folders, 'forget')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])

    expect(forget).not.toHaveBeenCalled()
    expect(await ports.folders.permission('current')).not.toBe('missing')
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('a forget that rejects does not stop the rebuild, and the next call tries it again', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['current'])
    await rememberFolder(ports, 'current')
    const forget = vi
      .spyOn(ports.folders, 'forget')
      .mockRejectedValueOnce(new Error('the store of folder handles refused'))

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])
    expect(forget.mock.calls).toEqual([['current']])
    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('current')])

    expect(forget.mock.calls).toEqual([['current'], ['current']])
    expect(await ports.folders.permission('current')).toBe('missing')
  })

  it('current keeps its id and its stored files: nothing is moved or rewritten', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['current'])
    plantLegacyActiveProjectId('current')
    const before = await treeOf(ports.root)

    const records = await reconcileIndex(ports)

    expect(records.map((record) => record.id)).toEqual(['current'])
    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('a document under current that does not decode gets a record that says so, and its bytes stay', async () => {
    const ports = upgradePorts()
    await placeDocument(ports, 'current', notJsonBytes())
    const before = await treeOf(ports.root)

    expect(await reconcileIndex(ports)).toEqual([
      failedRecord('current', notJsonBytes(), 'not-json'),
    ])

    expect(await treeOf(ports.root)).toEqual(before)
  })

  it('the folder is never reopened, so the browser asks nothing', async () => {
    const ports = upgradePorts()
    await rememberFolder(ports, 'current', documentNamed('In the folder'))
    ports.folders.setPermission('current', 'prompt')
    const permission = vi.spyOn(ports.folders, 'permission')
    const reopen = vi.spyOn(ports.folders, 'reopen')
    const forget = vi.spyOn(ports.folders, 'forget')

    await reconcileIndex(ports)

    expect(reopen).not.toHaveBeenCalled()
    expect([permission.mock.calls, forget.mock.calls]).toEqual([[['current']], [['current']]])
  })
})

describe('the project that the older code remembered', () => {
  it('the remembered project becomes the latest use, the remembered id is gone when the call resolves, and its record was put one time', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['a', 'b', 'c'])
    plantLegacyActiveProjectId('b')
    const put = vi.spyOn(ports.index, 'put')
    const marked = markedRecordOf(ports, 'b')
    expect(marked.lastUsedAt).not.toBe(STORED_AT)

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a'), marked, soundRecordOf('c')])

    expect(legacyActiveProjectIdIsStored()).toBe(false)
    expect(await ports.index.get('b')).toEqual(marked)
    expect(put.mock.calls.filter(([record]) => record.id === 'b')).toEqual([[marked]])
  })

  it('a remembered id that the store does not hold changes no record, and the remembered id is gone', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['a'])
    plantLegacyActiveProjectId('gone')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a')])

    expect(await ports.index.all()).toEqual([soundRecordOf('a')])
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('an index that already holds the record of the remembered project leaves the remembered id alone and changes no time of use', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['a', 'b'])
    const held = soundRecordOf('b', { lastUsedAt: USED_AT })
    await ports.index.put(held)
    plantLegacyActiveProjectId('b')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a'), held])

    expect(await ports.index.get('b')).toEqual(held)
    expect(legacyActiveProjectIdIsStored()).toBe(true)
  })

  it('an index that holds records of other projects only still marks the remembered project, and the remembered id is gone', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['a', 'b'])
    await ports.index.put(soundRecordOf('a'))
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(ports, 'b')

    expect(await reconcileIndex(ports)).toEqual([soundRecordOf('a'), marked])

    expect(await ports.index.get('b')).toEqual(marked)
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a folder record under the remembered id does not stop the mark', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['b'])
    await ports.index.put(folderRecord('b'))
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(ports, 'b')

    expect(await reconcileIndex(ports)).toEqual([marked])

    expect(await ports.index.get('b')).toEqual(marked)
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a remembered project whose document is not JSON gets its record with the mark, and the remembered id is gone', async () => {
    const ports = upgradePorts()
    await placeDocument(ports, 'b', notJsonBytes())
    plantLegacyActiveProjectId('b')
    const lastUsedAt = markedRecordOf(ports, 'b').lastUsedAt
    const marked = { ...failedRecord('b', notJsonBytes(), 'not-json'), lastUsedAt }

    expect(await reconcileIndex(ports)).toEqual([marked])

    expect(await ports.index.get('b')).toEqual(marked)
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a remembered project whose read rejects gets no mark and keeps the remembered id, and the next call that reads it marks it', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['b'])
    plantLegacyActiveProjectId('b')
    vi.spyOn(ports.workspace, 'read').mockRejectedValueOnce(new Error('the store cannot be read'))

    expect(await reconcileIndex(ports)).toEqual([unreadRecordOf('b')])
    expect(legacyActiveProjectIdIsStored()).toBe(true)

    expect(await reconcileIndex(ports)).toEqual([markedRecordOf(ports, 'b')])
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('the remembered id is read before the index: an id that is removed while the read of the index is pending still gives the mark', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['b'])
    plantLegacyActiveProjectId('b')
    const read = holdReads(ports.index, 'all')

    const rebuilding = reconcileIndex(ports)
    await vi.waitFor(() => expect(read.started()).toBe(1))
    clearLegacyActiveProjectId()
    read.answerOldest()

    expect(await rebuilding).toEqual([markedRecordOf(ports, 'b')])
    expect(await ports.index.get('b')).toEqual(markedRecordOf(ports, 'b'))
  })

  it('two ports over one store and one index that run together leave a marked record and no remembered id', async () => {
    const tab = upgradePorts()
    const otherTab = upgradePorts({ root: tab.root, index: tab.index })
    await placeSound(tab, ['a', 'b'])
    plantLegacyActiveProjectId('b')
    const marked = markedRecordOf(tab, 'b')

    const results = await Promise.all([reconcileIndex(tab), reconcileIndex(otherTab)])

    expect(results).toEqual([
      [soundRecordOf('a'), marked],
      [soundRecordOf('a'), marked],
    ])
    expect(await tab.index.get('b')).toEqual(marked)
    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })

  it('a value that is not a valid id changes no record, and it is gone', async () => {
    const ports = upgradePorts()
    await placeSound(ports, ['a'])
    await ports.index.put(sampleRecord({ id: 'a', lastChangedAt: STORED_AT }))
    plantLegacyActiveProjectId('../current')

    expect(await reconcileIndex(ports)).toEqual([
      sampleRecord({ id: 'a', lastChangedAt: STORED_AT }),
    ])

    expect(legacyActiveProjectIdIsStored()).toBe(false)
  })
})
