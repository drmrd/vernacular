import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../core'
import { InMemoryProjectStore } from './in-memory-project-store'

function sampleProject() {
  return createEmptyProject({
    name: 'Sample',
    units: 'metric',
    era: 'craftsman',
    appVersion: '0.1.0',
  })
}

describe('InMemoryProjectStore', () => {
  it('round-trips a saved project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    expect((await store.load('p1')).meta.name).toBe('Sample')
  })

  it('lists saved projects as summaries', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    expect(await store.list()).toEqual([{ id: 'p1', name: 'Sample' }])
  })

  it('throws when loading an unknown id', async () => {
    const store = new InMemoryProjectStore()
    await expect(store.load('missing')).rejects.toThrow('No project stored')
  })

  it('deletes a project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    await store.delete('p1')
    expect(await store.list()).toEqual([])
  })
})
