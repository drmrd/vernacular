// @vitest-environment node
// Pure storage/import logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../core'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'
import { importProjectFile } from './import-project-file'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

describe('importProjectFile', () => {
  it('reconstructs a project from its exported .building bundle bytes', async () => {
    const project = sampleProject()
    const store = new ZipBundleProjectStore('p1')
    await store.save('p1', project)

    const bytes = await store.exportBundle()
    const loaded = await importProjectFile('x.building', bytes, 'p1')

    expect(loaded.meta.name).toBe(project.meta.name)
  })
})
