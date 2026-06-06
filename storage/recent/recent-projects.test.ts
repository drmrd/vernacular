import { describe, expect, it } from 'vitest'
import { orderRecentProjects } from './recent-projects'
import type { RecentProjectEntry } from './recent-project-store'

const EARLIEST = 100
const MIDDLE = 200
const LATEST = 300

describe('orderRecentProjects', () => {
  it('orders distinct entries most-recently-opened first', () => {
    const entries: RecentProjectEntry[] = [
      { id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: EARLIEST },
      { id: 'b', name: 'Bravo', backend: 'file-system-folder', lastOpened: LATEST },
      { id: 'c', name: 'Charlie', backend: 'zip-bundle', lastOpened: MIDDLE },
    ]
    expect(orderRecentProjects(entries).map((entry) => entry.id)).toEqual(['b', 'c', 'a'])
  })

  it('collapses repeated ids to the occurrence with the newer lastOpened', () => {
    const entries: RecentProjectEntry[] = [
      { id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: EARLIEST },
      { id: 'a', name: 'Alpha Renamed', backend: 'zip-bundle', lastOpened: LATEST },
    ]
    expect(orderRecentProjects(entries)).toEqual([
      { id: 'a', name: 'Alpha Renamed', backend: 'zip-bundle', lastOpened: LATEST },
    ])
  })

  it('returns an empty array for empty input', () => {
    expect(orderRecentProjects([])).toEqual([])
  })

  it('does not mutate the input array', () => {
    const entries: RecentProjectEntry[] = [
      { id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: EARLIEST },
      { id: 'b', name: 'Bravo', backend: 'zip-bundle', lastOpened: LATEST },
    ]
    const snapshot = entries.map((entry) => ({ ...entry }))
    const result = orderRecentProjects(entries)
    expect(result).not.toBe(entries)
    expect(entries).toEqual(snapshot)
  })
})
