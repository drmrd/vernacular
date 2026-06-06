import { describe, expect, it } from 'vitest'
import { orderRecentProjects, recentEntryFor } from './recent-projects'
import type { RecentEntryInput } from './recent-projects'
import type { ProjectBackend, RecentProjectEntry } from './recent-project-store'

const EARLIEST = 100
const MIDDLE = 200
const LATEST = 300

const OPENED_EARLIER = 1000
const OPENED_LATER = 2000

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

describe('recentEntryFor', () => {
  it('carries id, name, and backend through and sets lastOpened to openedAt', () => {
    const backend: ProjectBackend = 'file-system-folder'
    const input: RecentEntryInput = {
      id: 'a',
      name: 'Alpha',
      backend,
      openedAt: OPENED_EARLIER,
    }
    expect(recentEntryFor(input)).toEqual({
      id: 'a',
      name: 'Alpha',
      backend: 'file-system-folder',
      lastOpened: OPENED_EARLIER,
    })
  })

  it('composes with orderRecentProjects: same id collapses to the newer openedAt', () => {
    const earlier = recentEntryFor({
      id: 'a',
      name: 'Alpha',
      backend: 'opfs',
      openedAt: OPENED_EARLIER,
    })
    const later = recentEntryFor({
      id: 'a',
      name: 'Alpha Reopened',
      backend: 'zip-bundle',
      openedAt: OPENED_LATER,
    })
    expect(orderRecentProjects([earlier, later])).toEqual([later])
  })
})
