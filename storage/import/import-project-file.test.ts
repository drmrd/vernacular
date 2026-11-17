// @vitest-environment node
// Pure storage/import logic; node aligns Uint8Array realms with fflate.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, encodeDocument } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'
import { importProjectFile, UnsupportedProjectFileError } from './import-project-file'

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

const UNKNOWN_WALL_FIELD = 'x-unknown'
const UNKNOWN_WALL_FIELD_PATH = `/floors/0/walls/0/${UNKNOWN_WALL_FIELD}`

interface StoredDocument {
  meta: { schemaVersion: number }
  floors: { walls: Record<string, unknown>[] }[]
}

function currentFixtureDocument(): StoredDocument {
  return JSON.parse(
    new TextDecoder().decode(versionFixtureBytes(CURRENT_SCHEMA_VERSION)),
  ) as StoredDocument
}

function bytesOf(document: StoredDocument): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(document))
}

function warnedAbout(spy: { mock: { calls: unknown[][] } }, path: string): boolean {
  return spy.mock.calls.some((args) => JSON.stringify(args).includes(path))
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
    const document = currentFixtureDocument()
    document.meta.schemaVersion = CURRENT_SCHEMA_VERSION + 1

    await expect(importProjectFile('plan.json', bytesOf(document), 'p1')).rejects.toMatchObject({
      failure: { kind: 'newer-version' },
    })
  })

  it('opens a .json file that fails only the format rules and warns of the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const document = currentFixtureDocument()
    document.floors[0]!.walls[0]![UNKNOWN_WALL_FIELD] = 1

    const loaded = await importProjectFile('plan.json', bytesOf(document), 'p1')

    expect(loaded.floors[0]!.walls[0]).toHaveProperty(UNKNOWN_WALL_FIELD, 1)
    expect(warnedAbout(warn, UNKNOWN_WALL_FIELD_PATH)).toBe(true)
  })
})
