// @vitest-environment node
// Pure storage/import logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { createEmptyProject } from '../../core'
import { serializeProjectJson } from '../folder/project-json'
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

  it('reconstructs a project from bare vernacular.json bytes', async () => {
    const project = sampleProject()
    const bytes = serializeProjectJson(project)

    const loaded = await importProjectFile('vernacular.json', bytes, 'p1')

    expect(loaded.meta.name).toBe(project.meta.name)
  })

  it('reconstructs a project from any .json file bytes', async () => {
    const project = sampleProject()
    const bytes = serializeProjectJson(project)

    const loaded = await importProjectFile('plan.json', bytes, 'p1')

    expect(loaded.meta.name).toBe(project.meta.name)
  })
})
