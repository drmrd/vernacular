import { describe, expect, it } from 'vitest'
import { InMemoryRecentProjectStore } from './recent-project-store'

describe('InMemoryRecentProjectStore', () => {
  it('lists an entry that was just recorded', async () => {
    const store = new InMemoryRecentProjectStore()
    await store.record({ id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 })
    expect(await store.list()).toEqual([
      { id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 },
    ])
  })

  it('upserts by id rather than duplicating an existing entry', async () => {
    const store = new InMemoryRecentProjectStore()
    await store.record({ id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 })
    await store.record({ id: 'a', name: 'Alpha2', backend: 'zip-bundle', lastOpened: 300 })
    expect(await store.list()).toEqual([
      { id: 'a', name: 'Alpha2', backend: 'zip-bundle', lastOpened: 300 },
    ])
  })

  it('orders entries most-recently-opened first', async () => {
    const store = new InMemoryRecentProjectStore()
    await store.record({ id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 })
    await store.record({ id: 'b', name: 'Bravo', backend: 'file-system-folder', lastOpened: 300 })
    await store.record({ id: 'c', name: 'Charlie', backend: 'zip-bundle', lastOpened: 200 })
    const ids = (await store.list()).map((entry) => entry.id)
    expect(ids).toEqual(['b', 'c', 'a'])
  })

  it('removes an entry by id, leaving the others', async () => {
    const store = new InMemoryRecentProjectStore()
    await store.record({ id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 })
    await store.record({ id: 'b', name: 'Bravo', backend: 'zip-bundle', lastOpened: 200 })
    await store.remove('a')
    const ids = (await store.list()).map((entry) => entry.id)
    expect(ids).toEqual(['b'])
  })

  it('round-trips each backend value verbatim', async () => {
    const store = new InMemoryRecentProjectStore()
    await store.record({ id: 'a', name: 'Alpha', backend: 'opfs', lastOpened: 100 })
    await store.record({ id: 'b', name: 'Bravo', backend: 'file-system-folder', lastOpened: 200 })
    await store.record({ id: 'c', name: 'Charlie', backend: 'zip-bundle', lastOpened: 300 })
    const backendsById = new Map(
      (await store.list()).map((entry) => [entry.id, entry.backend] as const),
    )
    expect(backendsById.get('a')).toBe('opfs')
    expect(backendsById.get('b')).toBe('file-system-folder')
    expect(backendsById.get('c')).toBe('zip-bundle')
  })
})
