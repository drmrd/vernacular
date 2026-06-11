import { describe, expect, it } from 'vitest'
import type { Project } from '../../core'
import { createEmptyProject } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import type { ProjectSummary } from '../project-store'
import { ProjectNotFoundError } from '../project-store'
import { OpfsProjectStore } from './opfs-project-store'

function projectNamed(name: string): Project {
  return createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

describe('OpfsProjectStore', () => {
  it('round-trips each project under its own id namespace', async () => {
    const root = new InMemoryDirectory()
    const store = new OpfsProjectStore(root)
    const projectA = projectNamed('Alpha House')
    const projectB = projectNamed('Beta House')

    await store.save('alpha', projectA)
    await store.save('beta', projectB)

    expect(await store.load('alpha')).toEqual(projectA)
    expect(await store.load('beta')).toEqual(projectB)
    expect(await root.readFile('alpha/project.json')).toBeDefined()
  })

  it('lists every saved project as an id and name summary', async () => {
    const root = new InMemoryDirectory()
    const store = new OpfsProjectStore(root)

    await store.save('alpha', projectNamed('Alpha House'))
    await store.save('beta', projectNamed('Beta House'))

    const summaries = await store.list()
    expect(new Set(summaries)).toEqual(
      new Set([
        { id: 'alpha', name: 'Alpha House' },
        { id: 'beta', name: 'Beta House' },
      ]),
    )
  })

  it('lists nothing over an empty root', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())

    expect(await store.list()).toEqual([])
  })

  it('isolates stored state from mutation of the saved input', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())
    const project = projectNamed('Alpha House')

    await store.save('alpha', project)
    project.meta.name = 'Mutated'

    expect((await store.load('alpha')).meta.name).toBe('Alpha House')
  })

  it('isolates stored state from mutation of a loaded project', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())
    await store.save('alpha', projectNamed('Alpha House'))

    const loaded = await store.load('alpha')
    loaded.meta.name = 'Mutated'

    expect((await store.load('alpha')).meta.name).toBe('Alpha House')
  })

  it('throws ProjectNotFoundError when loading an unknown id', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())

    await expect(store.load('nope')).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('omits id directories that hold no project.json from the listing', async () => {
    const root = new InMemoryDirectory()
    await root.writeFile('ghost/.house-autosave/snap.json', new TextEncoder().encode('x'))
    const store = new OpfsProjectStore(root)
    await store.save('alpha', projectNamed('Alpha House'))

    const summaries = await store.list()

    expect(summaries).toHaveLength(1)
    expect(summaries).toContainEqual({ id: 'alpha', name: 'Alpha House' })
    expect(summaries.map((summary: ProjectSummary) => summary.id)).not.toContain('ghost')
  })

  it('omits id directories whose project.json lacks a string meta.name from the listing', async () => {
    const root = new InMemoryDirectory()
    await root.writeFile(
      'broken/project.json',
      new TextEncoder().encode(JSON.stringify({ meta: {} })),
    )
    const store = new OpfsProjectStore(root)
    await store.save('alpha', projectNamed('Alpha House'))

    const summaries = await store.list()

    expect(summaries).toHaveLength(1)
    expect(summaries).toContainEqual({ id: 'alpha', name: 'Alpha House' })
    expect(summaries.map((summary: ProjectSummary) => summary.id)).not.toContain('broken')
  })

  it('removes a deleted project from later loads and listings', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())
    await store.save('alpha', projectNamed('Alpha House'))

    await store.delete('alpha')

    await expect(store.load('alpha')).rejects.toBeInstanceOf(ProjectNotFoundError)
    expect((await store.list()).map((summary: ProjectSummary) => summary.id)).not.toContain('alpha')
  })
})
