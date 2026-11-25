// @vitest-environment node
// Pure storage/zip logic; node aligns Uint8Array realms with fflate.
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_REVISION, createEmptyProject } from '../../core'
import type { Project } from '../../core'
import { SECOND_FILE_NAME, readProject } from '../documents/document-store-test-kit'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { secondDocumentFileVersion } from '../project-files/project-file-name'
import { documentOfNewerVersion } from '../../tests/storage/conformance/conformance-documents'
import { ZipBundleProjectStore } from './zip-bundle-project-store'
import { unzipFolder } from './zip-codec'

const SAVED_AT = '2026-03-04T05:06:07.000Z'

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
    expect(await readProject(reopened, 'house')).toEqual(withCurrentRevision(project))
  })

  it('lists nothing before a save and its single project, with no name, after', async () => {
    const directory = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    const store = new ZipBundleProjectStore('house', directory)
    expect(await store.list()).toEqual([])

    await store.save('house', sampleProject())
    expect(await store.list()).toEqual([{ id: 'house', lastChangedAt: SAVED_AT }])
  })

  it('lists the project of a reopened bundle by id and time of last change only', async () => {
    const store = new ZipBundleProjectStore('house')
    await store.save('house', sampleProject())
    const reopened = await ZipBundleProjectStore.fromBundle('house', await store.exportBundle())

    const [summary, ...others] = await reopened.list()

    expect(others).toEqual([])
    expect(Object.keys(summary ?? {}).sort()).toEqual(['id', 'lastChangedAt'])
    expect(summary?.id).toBe('house')
  })

  it('lists its project when the stored bytes are not JSON, without parsing them', async () => {
    const directory = new InMemoryDirectory({ now: () => new Date(SAVED_AT) })
    await directory.writeFile('vernacular.json', new TextEncoder().encode('{ this is not json'))
    const store = new ZipBundleProjectStore('house', directory)

    expect(await store.list()).toEqual([{ id: 'house', lastChangedAt: SAVED_AT }])
  })

  it('exports no second document file, also after a save beside a newer main file', async () => {
    const directory = new InMemoryDirectory()
    await directory.writeFile('vernacular.json', documentOfNewerVersion())
    const store = new ZipBundleProjectStore('house', directory)
    await store.save('house', sampleProject())
    expect(await directory.readFile(SECOND_FILE_NAME)).toBeDefined()

    const paths = [...unzipFolder(await store.exportBundle()).keys()]

    expect(paths.filter((path) => secondDocumentFileVersion(path) !== undefined)).toEqual([])
  })
})
