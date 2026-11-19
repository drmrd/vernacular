import { describe, expect, it } from 'vitest'
import type { Project } from '../../core'
import { CURRENT_SCHEMA_REVISION, createEmptyProject } from '../../core'
import { readProject } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { ProjectNotFoundError } from '../project-store'
import { OpfsProjectStore } from './opfs-project-store'

const SAVED_AT = '2026-03-04T05:06:07.000Z'

function projectNamed(name: string): Project {
  return createEmptyProject({
    name,
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

/** The document a store hands back: the saved project, stamped with the revision of this build. */
function withCurrentRevision(project: Project): Project {
  return { ...project, meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION } }
}

describe('OpfsProjectStore', () => {
  it('round-trips each project under its own id namespace', async () => {
    const root = new InMemoryDirectory()
    const store = new OpfsProjectStore(root)
    const projectA = projectNamed('Alpha House')
    const projectB = projectNamed('Beta House')

    await store.save('alpha', projectA)
    await store.save('beta', projectB)

    expect(await readProject(store, 'alpha')).toEqual(withCurrentRevision(projectA))
    expect(await readProject(store, 'beta')).toEqual(withCurrentRevision(projectB))
    expect(await root.readFile('alpha/vernacular.json')).toBeDefined()
  })

  it('lists every saved project by id and time of last change, sorted by id, with no name', async () => {
    const root = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    const store = new OpfsProjectStore(root)

    await store.save('beta', projectNamed('Beta House'))
    await store.save('alpha', projectNamed('Alpha House'))

    const summaries = await store.list()
    expect(summaries).toEqual([
      { id: 'alpha', lastChangedAt: SAVED_AT },
      { id: 'beta', lastChangedAt: SAVED_AT },
    ])
    expect(summaries.map((summary) => Object.keys(summary).sort())).toEqual([
      ['id', 'lastChangedAt'],
      ['id', 'lastChangedAt'],
    ])
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

    expect((await readProject(store, 'alpha')).meta.name).toBe('Alpha House')
  })

  it('isolates stored state from mutation of a loaded project', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())
    await store.save('alpha', projectNamed('Alpha House'))

    const loaded = await readProject(store, 'alpha')
    loaded.meta.name = 'Mutated'

    expect((await readProject(store, 'alpha')).meta.name).toBe('Alpha House')
  })

  it('reads an unknown id as not found', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())

    expect(await store.read('nope')).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('omits id directories that hold no vernacular.json from the listing', async () => {
    const root = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    await root.writeFile('ghost/.house-autosave/snap.json', new TextEncoder().encode('x'))
    const store = new OpfsProjectStore(root)
    await store.save('alpha', projectNamed('Alpha House'))

    expect(await store.list()).toEqual([{ id: 'alpha', lastChangedAt: SAVED_AT }])
  })

  it('lists an id directory whose vernacular.json lacks a string meta.name', async () => {
    const root = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    await root.writeFile(
      'broken/vernacular.json',
      new TextEncoder().encode(JSON.stringify({ meta: {} })),
    )
    const store = new OpfsProjectStore(root)
    await store.save('alpha', projectNamed('Alpha House'))

    expect(await store.list()).toEqual([
      { id: 'alpha', lastChangedAt: SAVED_AT },
      { id: 'broken', lastChangedAt: SAVED_AT },
    ])
  })

  it('lists an id directory whose vernacular.json is not JSON, without parsing it', async () => {
    const root = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    await root.writeFile('broken/vernacular.json', new TextEncoder().encode('{ this is not json'))
    const store = new OpfsProjectStore(root)
    await store.save('alpha', projectNamed('Alpha House'))

    expect(await store.list()).toEqual([
      { id: 'alpha', lastChangedAt: SAVED_AT },
      { id: 'broken', lastChangedAt: SAVED_AT },
    ])
  })

  it('removes a deleted project from later loads and listings', async () => {
    const store = new OpfsProjectStore(new InMemoryDirectory())
    await store.save('alpha', projectNamed('Alpha House'))

    await store.delete('alpha')

    await expect(readProject(store, 'alpha')).rejects.toBeInstanceOf(ProjectNotFoundError)
    expect((await store.list()).map((summary) => summary.id)).not.toContain('alpha')
  })
})
