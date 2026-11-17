import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../core'
import { InMemoryProjectStore } from './in-memory-project-store'
import { ProjectNotFoundError } from './project-store'

function sampleProject() {
  return createEmptyProject({
    name: 'Sample',
    units: 'metric',
    period: 'craftsman',
    appVersion: '0.1.0',
  })
}

describe('InMemoryProjectStore', () => {
  it('round-trips a saved project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    expect((await store.load('p1')).meta.name).toBe('Sample')
  })

  it('lists a saved project by id and time of last change, with no name', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())

    const [summary, ...others] = await store.list()

    expect(others).toEqual([])
    expect(Object.keys(summary ?? {}).sort()).toEqual(['id', 'lastChangedAt'])
    expect(summary?.id).toBe('p1')
    expect(Number.isNaN(Date.parse(String(summary?.lastChangedAt)))).toBe(false)
  })

  it('lists the saved projects sorted by id', async () => {
    const store = new InMemoryProjectStore()
    await store.save('b', sampleProject())
    await store.save('a', sampleProject())

    expect((await store.list()).map((summary) => summary.id)).toEqual(['a', 'b'])
  })

  it('throws when loading an unknown id', async () => {
    const store = new InMemoryProjectStore()
    await expect(store.load('missing')).rejects.toThrow('No project stored')
    await expect(store.load('missing')).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('deletes a project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    await store.delete('p1')
    expect(await store.list()).toEqual([])
    await expect(store.load('p1')).rejects.toThrow('No project stored')
  })

  it('isolates stored state from later mutation of the saved input', async () => {
    const store = new InMemoryProjectStore()
    const project = sampleProject()
    await store.save('p1', project)
    project.meta.name = 'Mutated'
    expect((await store.load('p1')).meta.name).toBe('Sample')
  })

  it('isolates stored state from mutation of a loaded project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    const loaded = await store.load('p1')
    loaded.meta.name = 'Mutated'
    expect((await store.load('p1')).meta.name).toBe('Sample')
  })
})
