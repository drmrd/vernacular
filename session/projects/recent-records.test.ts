import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../../storage'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { IN_FOLDER } from '../handle/handle-test-kit'
import { recentRecords } from '..'
import { latestWorkspaceRecord } from './recent-records'
import {
  STORED_AT,
  USED_AT,
  notJsonBytes,
  failedRecord,
  idsOf,
  unreadRecordOf,
} from './rebuild-test-kit'

const EARLY = '2026-10-01T08:00:00.000Z'
const MIDDLE = '2026-10-10T08:00:00.000Z'
const LATE = '2026-10-20T08:00:00.000Z'

/** A sound workspace record under `id`, used last at `lastUsedAt`. */
function usedAt(id: string, lastUsedAt: string | undefined): ProjectRecord {
  return sampleRecord({ id, name: `House ${id}`, lastUsedAt })
}

/**
 * Seven records, out of order, whose ids follow their times of use: `a` was used first, `g` last.
 */
function sevenRecords(): ProjectRecord[] {
  return [
    usedAt('c', '2026-10-03T08:00:00.000Z'),
    usedAt('g', '2026-10-07T08:00:00.000Z'),
    usedAt('a', '2026-10-01T08:00:00.000Z'),
    usedAt('e', '2026-10-05T08:00:00.000Z'),
    usedAt('b', '2026-10-02T08:00:00.000Z'),
    usedAt('f', '2026-10-06T08:00:00.000Z'),
    usedAt('d', '2026-10-04T08:00:00.000Z'),
  ]
}

describe('the recent records of the project index', () => {
  it('gives the five records used last, latest first, without the open one', () => {
    expect(idsOf(recentRecords(sevenRecords(), 'f'))).toEqual(['g', 'e', 'd', 'c', 'b'])
  })

  it('with no open id it gives the five records used last of all', () => {
    expect(idsOf(recentRecords(sevenRecords()))).toEqual(['g', 'f', 'e', 'd', 'c'])
  })

  it('fewer than five records give them all, latest first', () => {
    const records = [usedAt('a', EARLY), usedAt('b', LATE), usedAt('c', MIDDLE)]

    expect(recentRecords(records)).toEqual([
      usedAt('b', LATE),
      usedAt('c', MIDDLE),
      usedAt('a', EARLY),
    ])
  })

  it('a record with no time of use comes last, and equal times order by id', () => {
    const records = [
      usedAt('a', undefined),
      usedAt('z', EARLY),
      usedAt('d', MIDDLE),
      usedAt('c', MIDDLE),
    ]

    expect(idsOf(recentRecords(records))).toEqual(['c', 'd', 'z', 'a'])
  })

  it('folder records and records of projects that did not open are listed like the others', () => {
    const away = sampleRecord({ id: 'away', location: IN_FOLDER, lastUsedAt: LATE })
    const broken = { ...failedRecord('broken', notJsonBytes(), 'not-json'), lastUsedAt: MIDDLE }

    expect(recentRecords([usedAt('a', EARLY), broken, away])).toEqual([
      away,
      broken,
      usedAt('a', EARLY),
    ])
  })

  it('the given list is not changed', () => {
    const records = Object.freeze(sevenRecords())

    expect(idsOf(recentRecords(records, 'f'))).toEqual(['g', 'e', 'd', 'c', 'b'])
    expect(idsOf(records)).toEqual(idsOf(sevenRecords()))
  })
})

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

  it('the given list is not changed', () => {
    const records = Object.freeze([usedAt('a', EARLY), usedAt('b', LATE), usedAt('c', MIDDLE)])

    expect(latestWorkspaceRecord(records)?.id).toBe('b')
    expect(records.map((record) => record.id)).toEqual(['a', 'b', 'c'])
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
