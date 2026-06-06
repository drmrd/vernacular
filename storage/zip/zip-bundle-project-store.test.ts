// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../core'
import { ProjectNotFoundError } from '../project-store'
import { ZipBundleProjectStore } from './zip-bundle-project-store'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
}

describe('ZipBundleProjectStore', () => {
  it('round-trips its project through a real exported and reopened bundle', async () => {
    const project = sampleProject()
    const store = new ZipBundleProjectStore('house')
    await store.save('house', project)

    const bytes = await store.exportBundle()
    expect(bytes).toBeInstanceOf(Uint8Array)

    const reopened = await ZipBundleProjectStore.fromBundle('house', bytes)
    expect(await reopened.load('house')).toEqual(project)
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
