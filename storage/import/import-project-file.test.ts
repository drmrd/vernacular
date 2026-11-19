// @vitest-environment node
// Pure storage/import logic; node aligns Uint8Array realms with fflate.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, encodeDocument } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { DocumentDecodeError } from '../documents/document-decode-error'
import { ProjectNotFoundError } from '../project-store'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'
import { zipFolder } from '../zip/zip-codec'
import { importProjectFile, UnsupportedProjectFileError } from './import-project-file'

const OLDER_VERSION = 8
const DOCUMENT_FILE = 'vernacular.json'
const ASSET_FILE = 'assets/unrelated.bin'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

function warnedAbout(spy: { mock: { calls: unknown[][] } }, path: string): boolean {
  return spy.mock.calls.some((args) => JSON.stringify(args).includes(path))
}

function archiveOf(files: Record<string, Uint8Array>): Uint8Array {
  return zipFolder(new Map(Object.entries(files)))
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (rejected: unknown) => rejected,
  )
}

afterEach(() => {
  vi.restoreAllMocks()
})

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
    const { bytes } = encodeDocument(project, undefined)

    const loaded = await importProjectFile('vernacular.json', bytes, 'p1')

    expect(loaded.meta.name).toBe(project.meta.name)
  })

  it('reconstructs a project from any .json file bytes', async () => {
    const project = sampleProject()
    const { bytes } = encodeDocument(project, undefined)

    const loaded = await importProjectFile('plan.json', bytes, 'p1')

    expect(loaded.meta.name).toBe(project.meta.name)
  })

  it('rejects an unknown extension with an error naming the file', async () => {
    await expect(importProjectFile('notes.txt', new Uint8Array(), 'p1')).rejects.toBeInstanceOf(
      UnsupportedProjectFileError,
    )
    await expect(importProjectFile('notes.txt', new Uint8Array(), 'p1')).rejects.toThrow(
      /notes\.txt/,
    )
  })

  it('rejects invalid JSON bytes under a .json name', async () => {
    await expect(
      importProjectFile('broken.json', new TextEncoder().encode('{not json'), 'p1'),
    ).rejects.toThrow()
  })

  it('rejects a .json file saved at a higher schema version as a newer version', async () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1

    await expect(importProjectFile('plan.json', bytesOf(document), 'p1')).rejects.toMatchObject({
      failure: { kind: 'newer-version' },
    })
  })

  it('opens a .json file that fails only the format rules and warns of the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))

    const loaded = await importProjectFile('plan.json', bytesOf(document), 'p1')

    expect(loaded.floors[0]!.walls[0]).toHaveProperty(UNKNOWN_FIELD, 1)
    expect(warnedAbout(warn, UNKNOWN_WALL_FIELD_PATH)).toBe(true)
  })
})

describe('importProjectFile for a .building archive', () => {
  it('opens a migrated archive that breaks the format rules at the current version and warns of the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const document = withUnknownWallField(fixtureDocument(OLDER_VERSION))

    const loaded = await importProjectFile(
      'plan.building',
      archiveOf({ [DOCUMENT_FILE]: bytesOf(document) }),
      'p1',
    )

    expect(loaded.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(warnedAbout(warn, UNKNOWN_WALL_FIELD_PATH)).toBe(true)
  })

  it('rejects an archive whose document is not JSON as a decode failure of that kind', async () => {
    const notJson = new TextEncoder().encode('{not json')

    const error = await rejectionOf(
      importProjectFile('plan.building', archiveOf({ [DOCUMENT_FILE]: notJson }), 'p1'),
    )

    expect(error).toBeInstanceOf(DocumentDecodeError)
    expect((error as DocumentDecodeError).failure.kind).toBe('not-json')
  })

  it('rejects an archive with no document as a project not found under the id that was asked for', async () => {
    const withoutDocument = archiveOf({ [ASSET_FILE]: new Uint8Array([1]) })

    const error = await rejectionOf(importProjectFile('plan.building', withoutDocument, 'p1'))

    expect(error).toBeInstanceOf(ProjectNotFoundError)
    expect((error as ProjectNotFoundError).projectId).toBe('p1')
  })
})
