// @vitest-environment node
// Pure storage/import logic; node aligns Uint8Array realms with fflate.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject, encodeDocument } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import { ARCHIVE_LIMITS } from '../zip/archive-limits'
import { zipFolder } from '../zip/zip-codec'
import { misnamedAssetEntry } from '../zip/zip-edges-test-kit'
import { assetEntry, buildZip, contentHashOf, documentEntry } from '../zip/zip-test-kit'
import { importProjectFile } from './import-project-file'
import type { ProjectFileRead } from './import-project-file'

const OLDER_VERSION = 8
const DOCUMENT_FILE = 'vernacular.json'
const ASSET_FILE = `assets/${'e'.repeat(64)}`
const NOT_JSON = new TextEncoder().encode('{not json')
const MODEL = Uint8Array.of(0x67, 0x6c, 0x54, 0x46, 1, 2, 3)
const IMAGE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 4, 5, 6)

function sampleProject() {
  return createEmptyProject({
    name: 'My House',
    units: 'imperial',
    period: 'modern',
    appVersion: '0.0.0',
  })
}

function sampleBytes(): Uint8Array {
  return encodeDocument(sampleProject(), undefined).bytes
}

function archiveOf(files: Record<string, Uint8Array>): Uint8Array {
  return zipFolder(new Map(Object.entries(files)))
}

/** The read of a file that must give a project. Throws, naming the failure, otherwise. */
function readOf(read: ProjectFileRead): Extract<ProjectFileRead, { readonly ok: true }> {
  if (!read.ok) throw new Error(`Expected a project: ${JSON.stringify(read.failure)}`)
  return read
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('importProjectFile', () => {
  it('reads the project of an archive that the application wrote', async () => {
    const bytes = archiveOf({ [DOCUMENT_FILE]: sampleBytes() })

    const read = readOf(await importProjectFile('house.building', bytes))

    expect(read.project.meta.name).toBe('My House')
  })

  it('reads the project of a .json file, whatever stands before the ending', async () => {
    for (const name of ['vernacular.json', 'plan.json', 'a.b.json']) {
      const read = readOf(await importProjectFile(name, sampleBytes()))

      expect(read.project.meta.name).toBe('My House')
    }
  })

  it('matches the ending without regard to case', async () => {
    const archive = archiveOf({ [DOCUMENT_FILE]: sampleBytes() })

    expect(readOf(await importProjectFile('PLAN.JSON', sampleBytes())).project.meta.name).toBe(
      'My House',
    )
    expect(readOf(await importProjectFile('House.Building', archive)).project.meta.name).toBe(
      'My House',
    )
  })

  it('another ending gives unsupported-file with the name as given', async () => {
    expect(await importProjectFile('Notes.TXT', sampleBytes())).toEqual({
      ok: false,
      failure: { kind: 'unsupported-file', fileName: 'Notes.TXT' },
    })
  })

  it('bytes that are not JSON give decode with not-json', async () => {
    expect(await importProjectFile('broken.json', NOT_JSON)).toMatchObject({
      ok: false,
      failure: { kind: 'decode', decode: { kind: 'not-json' } },
    })
  })

  it('a document of a higher schema version gives decode with newer-version', async () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1

    expect(await importProjectFile('plan.json', bytesOf(document))).toMatchObject({
      ok: false,
      failure: { kind: 'decode', decode: { kind: 'newer-version' } },
    })
  })

  it('a file that only breaks the format rules gives the decode failure', async () => {
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))

    expect(await importProjectFile('plan.json', bytesOf(document))).toMatchObject({
      ok: false,
      failure: { kind: 'decode', decode: { kind: 'format-rules' } },
    })
  })

  it('a .json file gives no assets and no rejected assets', async () => {
    const read = readOf(await importProjectFile('plan.json', sampleBytes()))

    expect(read.assets).toEqual(new Map())
    expect(read.rejectedAssets).toEqual([])
  })
})

describe('importProjectFile for a .building archive', () => {
  it('an archive whose migrated document breaks the format rules gives the decode failure', async () => {
    const document = withUnknownWallField(fixtureDocument(OLDER_VERSION))
    const bytes = archiveOf({ [DOCUMENT_FILE]: bytesOf(document) })

    expect(await importProjectFile('plan.building', bytes)).toMatchObject({
      ok: false,
      failure: { kind: 'decode', decode: { kind: 'format-rules' } },
    })
  })

  it('an archive whose document breaks the format rules gives the failure with its checked assets', async () => {
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))
    const bytes = buildZip([
      documentEntry(bytesOf(document)),
      await assetEntry(MODEL),
      await misnamedAssetEntry(MODEL, IMAGE),
    ])

    expect(await importProjectFile('plan.building', bytes)).toMatchObject({
      ok: false,
      failure: {
        kind: 'decode',
        decode: { kind: 'format-rules' },
        supplied: {
          assets: new Map([[await contentHashOf(MODEL), MODEL]]),
          rejectedAssets: [await contentHashOf(IMAGE)],
        },
      },
    })
  })

  it('a JSON file that breaks the format rules gives the failure with no assets', async () => {
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))

    const read = await importProjectFile('plan.json', bytesOf(document))

    expect(read).toMatchObject({ ok: false, failure: { kind: 'decode' } })
    expect(read).not.toHaveProperty('failure.supplied')
  })

  it('an archive whose document is not JSON gives decode with not-json', async () => {
    const bytes = archiveOf({ [DOCUMENT_FILE]: NOT_JSON })

    expect(await importProjectFile('plan.building', bytes)).toMatchObject({
      ok: false,
      failure: { kind: 'decode', decode: { kind: 'not-json' } },
    })
  })

  it('an archive with no document gives archive with no-document', async () => {
    const bytes = archiveOf({ [ASSET_FILE]: new Uint8Array([1]) })

    expect(await importProjectFile('plan.building', bytes)).toEqual({
      ok: false,
      failure: { kind: 'archive', archive: { kind: 'no-document' } },
    })
  })

  it('bytes that are no archive give archive with not-an-archive', async () => {
    const bytes = new TextEncoder().encode('not an archive')

    expect(await importProjectFile('plan.building', bytes)).toEqual({
      ok: false,
      failure: { kind: 'archive', archive: { kind: 'not-an-archive' } },
    })
  })

  it('an archive above a limit that is passed in gives archive with too-large and that limit', async () => {
    const bytes = archiveOf({ [DOCUMENT_FILE]: sampleBytes() })
    const limits = { ...ARCHIVE_LIMITS, archiveBytes: bytes.length - 1 }

    expect(await importProjectFile('plan.building', bytes, limits)).toEqual({
      ok: false,
      failure: {
        kind: 'archive',
        archive: { kind: 'too-large', limit: 'archiveBytes', allowed: bytes.length - 1 },
      },
    })
  })

  it('gives the assets of an archive by hash, and its rejected assets', async () => {
    const bytes = buildZip([
      documentEntry(sampleBytes()),
      await assetEntry(MODEL),
      await misnamedAssetEntry(MODEL, IMAGE),
    ])

    const read = readOf(await importProjectFile('plan.building', bytes))

    expect(read.assets).toEqual(new Map([[await contentHashOf(MODEL), MODEL]]))
    expect(read.rejectedAssets).toEqual([await contentHashOf(IMAGE)])
  })
})
