import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../../storage'
import { sampleRecord } from '../../storage/project-index/project-record-test-kit'
import { IN_FOLDER } from '../handle/handle-test-kit'
import { recentRecords } from '..'
import { notJsonBytes, failedRecord, idsOf } from './rebuild-test-kit'

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
