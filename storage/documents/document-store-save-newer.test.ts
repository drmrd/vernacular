import { afterEach, describe, expect, it, vi } from 'vitest'
import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  UNKNOWN_FIELD,
  atHigherRevision,
  bytesOf,
  firstWallOf,
  fixtureDocument,
  projectOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import {
  DOCUMENT_PATH,
  SECOND_FILE_NAME,
  SECOND_FILE_PATH,
  WriteLoggingDirectory,
  backupsOf,
  newerVersionBytes,
  rootHoldingFiles,
  storeOver,
} from './document-store-test-kit'

const EXTENSIONS_NAMESPACE = 'org.example.probe'
const EXTENSIONS_PAYLOAD = { [EXTENSIONS_NAMESPACE]: { tags: ['kept'] } }

function currentBytes(): Uint8Array {
  return versionFixtureBytes(CURRENT_SCHEMA_VERSION)
}

function validProject(): Project {
  return projectOf(currentBytes())
}

/** A project that breaks the format rules: an unknown field on its first wall. */
function faultyProject(): Project {
  const project = validProject()
  withUnknownWallField(project as unknown as Json)
  return project
}

function renamedProject(name: string): Project {
  const project = validProject()
  return { ...project, meta: { ...project.meta, name } }
}

function documentWithExtensions(): Uint8Array {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  document.extensions = structuredClone(EXTENSIONS_PAYLOAD)
  return bytesOf(document)
}

function storedJson(bytes: Uint8Array | undefined): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

describe('saving over a vernacular.json at a newer schema version', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('leaves that file byte for byte and writes the document to the second file', async () => {
    const newer = newerVersionBytes()
    const root = await rootHoldingFiles({ main: newer })
    const project = validProject()

    await storeOver(root).save('a', project)

    expect(await root.readFile(DOCUMENT_PATH)).toEqual(newer)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(encodeDocument(project, undefined).bytes)
  })

  it('reports the second file and the newer version, with no dropped graft and no faults', async () => {
    const root = await rootHoldingFiles({ main: newerVersionBytes() })

    const report = await storeOver(root).save('a', validProject())

    expect(report.secondFile).toEqual({
      name: SECOND_FILE_NAME,
      newerVersion: CURRENT_SCHEMA_VERSION + 1,
    })
    expect(report.graftDropped).toBeUndefined()
    expect(report.faults).toEqual([])
  })

  it('writes no console warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const root = await rootHoldingFiles({ main: newerVersionBytes() })

    await storeOver(root).save('a', validProject())

    expect(warn).not.toHaveBeenCalled()
  })

  it('writes exactly one path, the second file', async () => {
    const logging = new WriteLoggingDirectory(await rootHoldingFiles({ main: newerVersionBytes() }))

    await storeOver(logging).save('a', validProject())

    expect(logging.writes).toEqual([SECOND_FILE_PATH])
  })

  it('grafts the next save onto the second file and leaves the main file as it was', async () => {
    const newer = newerVersionBytes()
    const root = await rootHoldingFiles({ main: newer, second: documentWithExtensions() })

    await storeOver(root).save('a', renamedProject('Saved beside'))

    const stored = storedJson(await root.readFile(SECOND_FILE_PATH))
    expect((stored.meta as Json).name).toBe('Saved beside')
    expect(stored.extensions).toEqual({
      ...(fixtureDocument(CURRENT_SCHEMA_VERSION).extensions as Json),
      ...EXTENSIONS_PAYLOAD,
    })
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(newer)
  })

  it('backs up the second file when a project that breaks the format rules replaces a sound one', async () => {
    const second = currentBytes()
    const root = await rootHoldingFiles({ main: newerVersionBytes(), second })

    const report = await storeOver(root).save('a', faultyProject())

    expect(report.backedUp).toBe(true)
    const backups = await backupsOf(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.name.startsWith('last-valid-')).toBe(true)
    expect(backups[0]?.bytes).toEqual(second)
  })

  it('writes a readable main file and leaves the second file as it was, reporting none', async () => {
    const second = documentWithExtensions()
    const root = await rootHoldingFiles({ main: currentBytes(), second })
    const project = validProject()

    const report = await storeOver(root).save('a', project)

    expect(report.secondFile).toBeUndefined()
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(second)
  })

  it('writes a main file of a higher revision at the same version, grafting what it does not know', async () => {
    const higher = bytesOf(
      atHigherRevision(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))),
    )
    const root = await rootHoldingFiles({ main: higher })

    const report = await storeOver(root).save('a', validProject())

    expect(report.secondFile).toBeUndefined()
    expect(firstWallOf(storedJson(await root.readFile(DOCUMENT_PATH)))[UNKNOWN_FIELD]).toBe(1)
    expect(await root.readFile(SECOND_FILE_PATH)).toBeUndefined()
  })

  it('writes the main file when only a second file exists, and leaves the second file as it was', async () => {
    const second = documentWithExtensions()
    const root = await rootHoldingFiles({ second })

    const report = await storeOver(root).save('a', validProject())

    expect(report.secondFile).toBeUndefined()
    expect(await root.readFile(DOCUMENT_PATH)).toBeDefined()
    expect(await root.readFile(SECOND_FILE_PATH)).toEqual(second)
  })
})
