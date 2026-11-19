// @vitest-environment node
// The archive store packs with fflate, which wants the node realm of Uint8Array.
import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProject } from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FileSystemFolderProjectStore } from '../filesystem/file-system-folder-project-store'
import { ZipBundleProjectStore } from '../zip/zip-bundle-project-store'
import { WorkspaceDocumentStore } from './document-store'
import type { DocumentStore } from './document-store'
import { PassThroughDirectory, readProject, storeOver } from './document-store-test-kit'

const OWN_ID = 'house'
const OTHER_ID = 'cottage'
const FOLDER_DOCUMENT = 'vernacular.json'
const WORKSPACE_DOCUMENT = 'a/vernacular.json'
const CHANGED_AT = '2026-03-04T05:06:07.000Z'
const UNREADABLE_TIME = new Error('the change time cannot be read')

function projectNamed(name: string): Project {
  return createEmptyProject({ name, units: 'metric', period: 'craftsman', appVersion: '0.1.0' })
}

/** Test support: passes every call through and records the paths read. */
class ReadRecordingDirectory extends PassThroughDirectory {
  readonly reads: string[] = []

  override async readFile(path: string): Promise<Uint8Array | undefined> {
    this.reads.push(path)
    return super.readFile(path)
  }
}

/** Test support: passes every call through, except that the time of change of one file rejects. */
class UnreadableTimeDirectory extends ReadRecordingDirectory {
  constructor(
    inner: DirectoryPort,
    private readonly unreadablePath: string,
  ) {
    super(inner)
  }

  override modifiedAt(path: string): Promise<string | undefined> {
    return path === this.unreadablePath ? Promise.reject(UNREADABLE_TIME) : super.modifiedAt(path)
  }
}

const storesBoundToOneProject: { name: string; over: (folder: DirectoryPort) => DocumentStore }[] =
  [
    {
      name: 'the store of a picked folder',
      over: (f) => new FileSystemFolderProjectStore(OWN_ID, f),
    },
    { name: 'the store of an archive', over: (f) => new ZipBundleProjectStore(OWN_ID, f) },
  ]

describe.each(storesBoundToOneProject)('$name, asked for an id that is not its own', ({ over }) => {
  async function folderHoldingADocument(): Promise<ReadRecordingDirectory> {
    const folder = new ReadRecordingDirectory(
      new InMemoryDirectory({ now: () => new Date(CHANGED_AT) }),
    )
    await over(folder).save(OWN_ID, projectNamed('Stored'))
    folder.reads.length = 0
    return folder
  }

  it('reads as not found', async () => {
    const store = over(await folderHoldingADocument())

    expect(await store.read(OTHER_ID)).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('still lists only its own id', async () => {
    const store = over(await folderHoldingADocument())

    expect(await store.list()).toEqual([{ id: OWN_ID, lastChangedAt: CHANGED_AT }])
  })

  it('rejects a save and leaves the document of the folder byte-identical', async () => {
    const folder = await folderHoldingADocument()
    const before = await folder.readFile(FOLDER_DOCUMENT)

    await expect(over(folder).save(OTHER_ID, projectNamed('Intruder'))).rejects.toBeInstanceOf(
      Error,
    )

    expect(before).toBeDefined()
    expect(await folder.readFile(FOLDER_DOCUMENT)).toEqual(before)
  })

  it('holds no files', async () => {
    const store = over(await folderHoldingADocument())

    expect([...(await store.storedFiles(OTHER_ID))]).toEqual([])
  })

  it('reads no file of the folder for a read', async () => {
    const folder = await folderHoldingADocument()
    const store = over(folder)

    await store.read(OTHER_ID)

    expect(folder.reads).toEqual([])
  })
})

describe('reading a project whose time of last change cannot be read', () => {
  async function storeWithUnreadableTime(): Promise<WorkspaceDocumentStore> {
    const inner = new InMemoryDirectory()
    await inner.writeFile(WORKSPACE_DOCUMENT, versionFixtureBytes(CURRENT_SCHEMA_VERSION))
    const root = new UnreadableTimeDirectory(inner, WORKSPACE_DOCUMENT)
    return storeOver(root)
  }

  it('still reads the project, with no time of last change', async () => {
    const store = await storeWithUnreadableTime()

    const read = await store.read('a')

    expect(read.ok).toBe(true)
    if (!read.ok) return
    expect(read.value.project).toEqual(projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION)))
    expect(read.lastChangedAt).toBeUndefined()
  })

  it('still loads the project', async () => {
    const store = await storeWithUnreadableTime()

    const loaded = await readProject(store, 'a')

    expect(loaded).toEqual(projectOf(versionFixtureBytes(CURRENT_SCHEMA_VERSION)))
  })
})
