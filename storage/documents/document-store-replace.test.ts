import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, encodeDocument } from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import {
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  bytesOf,
  firstWallOf,
  fixtureDocument,
  paintKeyOfKind,
  projectOf,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import type { DirectoryPort } from '../fs/directory-port'
import { ProjectNotFoundError } from '../project-store'
import type { ReplaceReport } from './document-store'
import {
  BACKUP_DIRECTORY,
  DOCUMENT_PATH,
  PassThroughDirectory,
  WriteLoggingDirectory,
  backupsOf,
  readProject,
  rootHolding,
  storeOver,
  treeOf,
} from './document-store-test-kit'

const OLDER_VERSION = 15
const NOT_A_VERSION = 0
const PRE_REPAIR = 'pre-repair'
const NOT_JSON = new TextEncoder().encode('{ not json')
const PATTERN_FIELDS: Json = { patternId: 'plank', scale: 100 }
const NAMESPACE = 'org.example.probe'
const EXTENSIONS: Json = { [NAMESPACE]: { tags: ['kept'] } }

/** Test support: rejects each write under a backup directory and passes everything else through. */
class BackupRefusingDirectory extends PassThroughDirectory {
  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (path.startsWith(`${BACKUP_DIRECTORY}/`))
      return Promise.reject(new Error('the disk is full'))
    return super.writeFile(path, bytes)
  }
}

/** The valid project that a repair would hand over. */
function validProject(): Project {
  return projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION))
}

/** A stored file that breaks the format rules: an unknown field on its first wall. */
function storedWithUnknownField(): Uint8Array {
  return bytesOf(withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION)))
}

/** A stored file whose first solid paint entry also carries the fields of a pattern entry. */
function storedWithMixedPaintEntry(): { bytes: Uint8Array; key: string } {
  const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
  const key = paintKeyOfKind(document, 'solid')
  Object.assign((document.paint as Record<string, Json>)[key]!, PATTERN_FIELDS)
  return { bytes: bytesOf(document), key }
}

function jsonOf(bytes: Uint8Array | undefined): Json {
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function preRepairBackups(
  root: DirectoryPort,
): Promise<{ name: string; bytes: Uint8Array }[]> {
  return (await backupsOf(root)).filter(({ name }) => name.startsWith(`${PRE_REPAIR}-`))
}

describe('replacing the stored document of a project', () => {
  it('replaces the stored document with the given project', async () => {
    const root = await rootHolding(storedWithUnknownField())
    const project = validProject()

    const report = await storeOver(root).replaceStored('a', project)

    expect(report).toEqual({ replaced: true })
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(encodeDocument(project, undefined).bytes)
  })

  it('keeps the stored bytes in a pre-repair backup, byte for byte, before the write', async () => {
    const stored = storedWithUnknownField()
    const root = await rootHolding(stored)
    const logging = new WriteLoggingDirectory(root)

    await storeOver(logging).replaceStored('a', validProject())

    const backups = await preRepairBackups(root)
    expect(backups).toHaveLength(1)
    expect(backups[0]?.bytes).toEqual(stored)
    const backupWrite = logging.writes.findIndex((path) => path.includes(`${PRE_REPAIR}-`))
    const documentWrite = logging.writes.indexOf(DOCUMENT_PATH)
    expect(backupWrite).toBeGreaterThanOrEqual(0)
    expect(backupWrite).toBeLessThan(documentWrite)
  })

  it('names the backup by the version of the stored document', async () => {
    const root = await rootHolding(versionFixtureBytes(OLDER_VERSION))

    await storeOver(root).replaceStored('a', validProject())

    const [backup] = await preRepairBackups(root)
    expect(backup?.name.startsWith(`${PRE_REPAIR}-v${OLDER_VERSION}-`)).toBe(true)
  })
})

describe('the data that a replace leaves out', () => {
  it('does not put back a field that only the stored document had', async () => {
    const root = await rootHolding(storedWithUnknownField())
    expect(firstWallOf(jsonOf(await root.readFile(DOCUMENT_PATH)))).toHaveProperty(UNKNOWN_FIELD)

    await storeOver(root).replaceStored('a', validProject())

    expect(firstWallOf(jsonOf(await root.readFile(DOCUMENT_PATH)))).not.toHaveProperty(
      UNKNOWN_FIELD,
    )
  })

  it('does not put back the fields of another variant on a paint entry', async () => {
    const { bytes, key } = storedWithMixedPaintEntry()
    const root = await rootHolding(bytes)
    const before = jsonOf(await root.readFile(DOCUMENT_PATH)).paint as Record<string, Json>
    expect(before[key]).toMatchObject(PATTERN_FIELDS)

    await storeOver(root).replaceStored('a', validProject())

    const after = jsonOf(await root.readFile(DOCUMENT_PATH)).paint as Record<string, Json>
    expect(after[key]).not.toHaveProperty('patternId')
    expect(after[key]).not.toHaveProperty('scale')
  })

  it('keeps the data under extensions that the given project holds', async () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    document.extensions = structuredClone(EXTENSIONS)
    const root = await rootHolding(storedWithUnknownField())

    await storeOver(root).replaceStored('a', projectOf(bytesOf(document)))

    expect(jsonOf(await root.readFile(DOCUMENT_PATH)).extensions).toEqual(EXTENSIONS)
  })
})

describe('a read and a save after a replace', () => {
  it('give the project, and a save does not bring the removed data back', async () => {
    const root = await rootHolding(storedWithUnknownField())
    const store = storeOver(root)
    const project = validProject()
    await store.replaceStored('a', project)

    const read = await readProject(store, 'a')
    await store.save('a', read)

    expect(read).toEqual(projectOf(encodeDocument(project, undefined).bytes))
    expect(firstWallOf(jsonOf(await root.readFile(DOCUMENT_PATH)))).not.toHaveProperty(
      UNKNOWN_FIELD,
    )
  })
})

describe('a replace that cannot go ahead', () => {
  it('writes nothing and reports the faults when the given project breaks the format rules', async () => {
    const root = await rootHolding(storedWithUnknownField())
    const before = await treeOf(root)
    const faulty = validProject()
    withUnknownWallField(faulty as unknown as Json)

    const report: ReplaceReport = await storeOver(root).replaceStored('a', faulty)

    if (report.replaced) throw new Error('Expected the replace to report faults')
    expect(report.faults.map((fault) => fault.path)).toContain(UNKNOWN_WALL_FIELD_PATH)
    expect(await treeOf(root)).toEqual(before)
  })

  it('writes nothing when the backup cannot be written', async () => {
    const root = await rootHolding(storedWithUnknownField())
    const before = await treeOf(root)

    const outcome = storeOver(new BackupRefusingDirectory(root)).replaceStored('a', validProject())

    await expect(outcome).rejects.toBeInstanceOf(Error)
    expect(await treeOf(root)).toEqual(before)
  })

  it('rejects when no document is stored', async () => {
    const store = storeOver(await rootHolding(undefined))

    await expect(store.replaceStored('a', validProject())).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    )
  })
})

describe('a replace over stored bytes that are not JSON', () => {
  it('replaces them, and names that backup by version 0', async () => {
    const root = await rootHolding(NOT_JSON)
    const project = validProject()

    const report = await storeOver(root).replaceStored('a', project)

    expect(report).toEqual({ replaced: true })
    expect(await root.readFile(DOCUMENT_PATH)).toEqual(encodeDocument(project, undefined).bytes)
    const [backup] = await preRepairBackups(root)
    expect(backup?.name.startsWith(`${PRE_REPAIR}-v${NOT_A_VERSION}-`)).toBe(true)
    expect(backup?.bytes).toEqual(NOT_JSON)
  })
})
