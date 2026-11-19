import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../core'
import { readProject } from './documents/document-store-test-kit'
import { InMemoryProjectStore } from './in-memory-project-store'

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
    expect((await readProject(store, 'p1')).meta.name).toBe('Sample')
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

  it('reads an unknown id as not found', async () => {
    const store = new InMemoryProjectStore()
    expect(await store.read('missing')).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('deletes a project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    await store.delete('p1')
    expect(await store.list()).toEqual([])
    await expect(readProject(store, 'p1')).rejects.toThrow('No project stored')
  })

  it('isolates stored state from later mutation of the saved input', async () => {
    const store = new InMemoryProjectStore()
    const project = sampleProject()
    await store.save('p1', project)
    project.meta.name = 'Mutated'
    expect((await readProject(store, 'p1')).meta.name).toBe('Sample')
  })

  it('isolates stored state from mutation of a loaded project', async () => {
    const store = new InMemoryProjectStore()
    await store.save('p1', sampleProject())
    const loaded = await readProject(store, 'p1')
    loaded.meta.name = 'Mutated'
    expect((await readProject(store, 'p1')).meta.name).toBe('Sample')
  })
})
