import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectRecord } from '../../storage'
import { reconcileIndex } from '..'
import {
  REBUILD_BUILD,
  USED_AT,
  failedRecord,
  folderRecord,
  notJsonBytes,
  placeSound,
  rebuildPorts,
  soundDocumentOf,
  soundRecordOf,
} from './rebuild-test-kit'
import { placeDocument } from '../handle/handle-test-kit'

/** The build of an earlier release, under which a record was written. */
const OLDER_BUILD = 'an-older-build'

/**
 * The record that an earlier build wrote for the document `bytes` of `id` when it failed to open
 * for `reason`. Its time of change agrees with the store's, and it was used at `USED_AT`.
 */
function failedUnderOlderBuild(id: string, bytes: Uint8Array, reason: string): ProjectRecord {
  return {
    ...failedRecord(id, bytes, reason),
    lastUsedAt: USED_AT,
    lastOpen: { opened: false, build: OLDER_BUILD, reason },
  }
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('a record of a project that did not open', () => {
  it('a record that failed under another build is checked again, and a pass clears it', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    await ports.index.put(failedUnderOlderBuild('a', soundDocumentOf('a'), 'newer-version'))

    const records = await reconcileIndex(ports)

    const cleared = soundRecordOf('a', { lastUsedAt: USED_AT })
    expect(records).toEqual([cleared])
    expect(records[0]?.lastOpen).toStrictEqual({ opened: true, build: REBUILD_BUILD })
    expect(await ports.index.get('a')).toEqual(cleared)
  })

  it('a record that failed under this build is not checked again', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const failed = {
      ...failedRecord('a', soundDocumentOf('a'), 'newer-version'),
      lastUsedAt: USED_AT,
    }
    await ports.index.put(failed)
    const read = vi.spyOn(ports.workspace, 'read')

    const records = await reconcileIndex(ports)

    expect(records).toEqual([failed])
    expect(read).not.toHaveBeenCalled()
  })

  it('a check that fails again records this build and the new reason, and the next call reads nothing', async () => {
    const ports = rebuildPorts()
    await placeDocument(ports, 'broken', notJsonBytes())
    await ports.index.put(failedUnderOlderBuild('broken', notJsonBytes(), 'newer-version'))

    const records = await reconcileIndex(ports)

    const failedAgain = {
      ...failedRecord('broken', notJsonBytes(), 'not-json'),
      lastUsedAt: USED_AT,
    }
    expect(records).toEqual([failedAgain])
    expect(await ports.index.get('broken')).toEqual(failedAgain)
    const read = vi.spyOn(ports.workspace, 'read')
    expect(await reconcileIndex(ports)).toEqual([failedAgain])
    expect(read).not.toHaveBeenCalled()
  })

  it('a folder record that failed under another build stays as it is', async () => {
    const ports = rebuildPorts()
    const away = folderRecord('away', {
      lastOpen: { opened: false, build: OLDER_BUILD, reason: 'not-json' },
    })
    await ports.index.put(away)
    const permission = vi.spyOn(ports.folders, 'permission')

    const records = await reconcileIndex(ports)

    expect(records).toEqual([away])
    expect(await ports.index.get('away')).toEqual(away)
    expect(permission).not.toHaveBeenCalled()
  })

  it('a record that opened under another build is not read', async () => {
    const ports = rebuildPorts()
    await placeSound(ports, ['a'])
    const opened = soundRecordOf('a', {
      lastUsedAt: USED_AT,
      lastOpen: { opened: true, build: OLDER_BUILD },
    })
    await ports.index.put(opened)
    const read = vi.spyOn(ports.workspace, 'read')

    const records = await reconcileIndex(ports)

    expect(records).toEqual([opened])
    expect(read).not.toHaveBeenCalled()
  })
})
