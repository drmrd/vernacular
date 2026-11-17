// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_REVISION, createEmptyProject } from '../../core'
import type { Project } from '../../core'
import { ProjectNotFoundError } from '../project-store'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

/** The document a store hands back: the saved project, stamped with the revision of this build. */
function withCurrentRevision(project: Project): Project {
  return { ...project, meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION } }
}

describe('ZipBundleProjectStore', () => {
  it('round-trips its project through a real exported and reopened bundle', async () => {
    const project = sampleProject()
    const store = new ZipBundleProjectStore('house')
    await store.save('house', project)

    const bytes = await store.exportBundle()
    expect(bytes).toBeInstanceOf(Uint8Array)

    const reopened = await ZipBundleProjectStore.fromBundle('house', bytes)
    expect(await reopened.load('house')).toEqual(withCurrentRevision(project))
  })

  it('rejects loading a foreign id with ProjectNotFoundError', async () => {
    const store = new ZipBundleProjectStore('house')
    await store.save('house', sampleProject())

    await expect(store.load('other')).rejects.toBeInstanceOf(ProjectNotFoundError)
  })

  it('lists nothing before a save and its single project after', async () => {
    const store = new ZipBundleProjectStore('house')
    expect(await store.list()).toEqual([])

    await store.save('house', sampleProject())
    expect(await store.list()).toEqual([{ id: 'house', name: 'My House' }])
  })
})
