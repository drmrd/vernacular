import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../../storage'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { IN_FOLDER } from '../handle/handle-test-kit'
import { latestWorkspaceRecord } from './recent-records'
import { STORED_AT, USED_AT, notJsonBytes, failedRecord, unreadRecordOf } from './rebuild-test-kit'

const EARLY = '2026-10-01T08:00:00.000Z'
const MIDDLE = '2026-10-10T08:00:00.000Z'
const LATE = '2026-10-20T08:00:00.000Z'

/** A sound workspace record under `id`, used last at `lastUsedAt`. */
function usedAt(id: string, lastUsedAt: string | undefined): ProjectRecord {
  return sampleRecord({ id, name: `House ${id}`, lastUsedAt })
}

describe('the start record of the project index', () => {
  it('the workspace record with the latest use is the start record', () => {
    const records = [usedAt('a', EARLY), usedAt('b', LATE), usedAt('c', MIDDLE)]

    expect(latestWorkspaceRecord(records)).toEqual(usedAt('b', LATE))
  })

  it('a folder record is never the start record, also when it was used last', () => {
    const away = sampleRecord({ id: 'away', location: IN_FOLDER, lastUsedAt: LATE })
    const records = [usedAt('a', EARLY), away, usedAt('b', MIDDLE)]

    expect(latestWorkspaceRecord(records)?.id).toBe('b')
  })

  it('a record with no time of use comes after every record with one, and equal times order by id', () => {
    expect(latestWorkspaceRecord([usedAt('a', undefined), usedAt('z', EARLY)])?.id).toBe('z')
    expect(latestWorkspaceRecord([usedAt('d', MIDDLE), usedAt('c', MIDDLE)])?.id).toBe('c')
  })

  it('with no workspace record there is no start record', () => {
    const away = sampleRecord({ id: 'away', location: IN_FOLDER, lastUsedAt: LATE })

    expect(latestWorkspaceRecord([])).toBeUndefined()
    expect(latestWorkspaceRecord([away])).toBeUndefined()
  })

  it('a record that did not open can be the start record', () => {
    const broken = { ...failedRecord('broken', notJsonBytes(), 'not-json'), lastUsedAt: LATE }
    const records = [usedAt('a', EARLY), broken]

    expect(latestWorkspaceRecord(records)).toEqual(broken)
  })

  it('a placeholder of a failed read can be the start record', () => {
    const unread = unreadRecordOf('unread')
    const records = [usedAt('a', USED_AT), unread]

    expect(unread.lastUsedAt).toBe(STORED_AT)
    expect(latestWorkspaceRecord(records)).toEqual(unread)
  })
})
