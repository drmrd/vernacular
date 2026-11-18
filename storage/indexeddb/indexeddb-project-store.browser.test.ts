import { describe, expect, expectTypeOf, it } from 'vitest'
import type { Project } from '../../core'
import { CURRENT_SCHEMA_REVISION, CURRENT_SCHEMA_VERSION, createEmptyProject } from '../../core'
import {
  bytesOf,
  fixtureDocument,
  projectOf,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { DocumentStore } from '../documents/document-store'
import { ProjectNotFoundError } from '../project-store'
import type { ProjectStore } from '../project-store'
import { IndexedDbDirectory } from './indexeddb-directory'
import { IndexedDbProjectStore } from './indexeddb-project-store'
import {
  legacyIdsOf,
  freshDatabaseName,
  registerDatabaseCleanup,
  seededDatabase,
  storedFilePathsOf,
} from './legacy-records-test-kit'

registerDatabaseCleanup()

const OLDER_VERSION = 8
const BACKUP_FOLDER = '.house-backups/'
const AUTOSAVE_FOLDER = '.house-autosave/'
const ASSET_HASH = 'ab'.repeat(32)
const ASSET_BYTES = Uint8Array.of(7, 8, 9)

function projectNamed(name: string): Project {
  return createEmptyProject({ name, units: 'imperial', period: 'modern', appVersion: '0.0.0' })
}

/** The document a store hands back: the saved project, stamped with the revision of this build. */
function withCurrentRevision(project: Project): Project {
  return { ...project, meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION } }
}

/** A database of legacy records that holds one record, `current`, at the given schema version. */
function seededCurrent(version = CURRENT_SCHEMA_VERSION): Promise<string> {
  return seededDatabase({ id: 'current', project: fixtureDocument(version) })
}

function pathsStartingWith(files: ReadonlyMap<string, Uint8Array>, folder: string): string[] {
  return [...files.keys()].filter((path) => path.startsWith(folder))
}

describe('listing the projects of the IndexedDB store', () => {
  it('gives each project as its id and a time of last change, sorted by id', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())
    await store.save('beta', projectNamed('Beta House'))
    await store.save('alpha', projectNamed('Alpha House'))

    const summaries = await store.list()

    expect(summaries.map((summary) => summary.id)).toEqual(['alpha', 'beta'])
    expect(summaries.map((summary) => Object.keys(summary).sort())).toEqual([
      ['id', 'lastChangedAt'],
      ['id', 'lastChangedAt'],
    ])
    summaries.forEach((summary) => {
      expect(typeof summary.lastChangedAt).toBe('string')
      expect(Number.isNaN(Date.parse(summary.lastChangedAt ?? ''))).toBe(false)
    })
  })

  it('lists a project whose stored bytes are not JSON, without parsing them', async () => {
    const name = freshDatabaseName()
    const store = new IndexedDbProjectStore(name)
    await store.save('alpha', projectNamed('Alpha House'))
    await new IndexedDbDirectory(name).writeFile(
      'broken/vernacular.json',
      new TextEncoder().encode('{ this is not json'),
    )

    const summaries = await store.list()

    expect(summaries.map((summary) => summary.id)).toEqual(['alpha', 'broken'])
  })

  it('lists nothing for an empty database', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())

    expect(await store.list()).toEqual([])
  })
})

describe('saving and loading with the IndexedDB store', () => {
  it('loads a saved project with the revision of this build', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())
    const project = projectNamed('Alpha House')

    await store.save('alpha', project)

    expect(await store.load('alpha')).toEqual(withCurrentRevision(project))
  })

  it('loads the project again through a new store over the same database', async () => {
    const name = freshDatabaseName()
    const project = projectNamed('Alpha House')
    await new IndexedDbProjectStore(name).save('alpha', project)

    const loaded = await new IndexedDbProjectStore(name).load('alpha')

    expect(loaded).toEqual(withCurrentRevision(project))
  })

  it('is durable', () => {
    expect(new IndexedDbProjectStore(freshDatabaseName()).durable).toBe(true)
  })
})

describe('deleting from the IndexedDB store', () => {
  it('removes one project and leaves the files of the other byte for byte', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())
    await store.save('alpha', projectNamed('Alpha House'))
    await store.save('beta', projectNamed('Beta House'))
    const betaFiles = await store.storedFiles('beta')

    await store.delete('alpha')

    expect((await store.list()).map((summary) => summary.id)).toEqual(['beta'])
    expect(await store.storedFiles('beta')).toEqual(betaFiles)
    expect((await store.load('beta')).meta.name).toBe('Beta House')
  })

  it('rejects the load of a project that does not exist with ProjectNotFoundError', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())

    await expect(store.load('nope')).rejects.toBeInstanceOf(ProjectNotFoundError)
  })
})

describe('the IndexedDB store over the records of an existing user', () => {
  it('lists the project of a version 1 record by its id', async () => {
    const store = new IndexedDbProjectStore(await seededCurrent())

    expect((await store.list()).map((summary) => summary.id)).toEqual(['current'])
  })

  it('loads the project of a version 1 record, and saves over it', async () => {
    const store = new IndexedDbProjectStore(await seededCurrent())
    const expected = projectOf(bytesOf(fixtureDocument(CURRENT_SCHEMA_VERSION)))

    expect(await store.load('current')).toEqual(expected)
    await store.save('current', projectNamed('Renamed House'))

    expect((await store.load('current')).meta.name).toBe('Renamed House')
  })

  it('loads the project of a version 1 record through a new store over the same database', async () => {
    const name = await seededCurrent()
    await new IndexedDbProjectStore(name).list()

    const loaded = await new IndexedDbProjectStore(name).load('current')

    expect(loaded).toEqual(projectOf(bytesOf(fixtureDocument(CURRENT_SCHEMA_VERSION))))
  })

  it('converts a version 1 record to a project file at the first operation', async () => {
    const name = await seededCurrent()

    await new IndexedDbProjectStore(name).list()

    expect(await legacyIdsOf(name)).not.toContain('current')
    expect(await storedFilePathsOf(name)).toContain('current/vernacular.json')
  })

  it('opens an old document of a version 1 record at the current version, with one backup of its bytes', async () => {
    const store = new IndexedDbProjectStore(await seededCurrent(OLDER_VERSION))

    const project = await store.load('current')

    expect(project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    const files = await store.storedFiles('current')
    const backups = pathsStartingWith(files, BACKUP_FOLDER)
    expect(backups).toHaveLength(1)
    const [backupPath = ''] = backups
    expect(files.get(backupPath)).toEqual(bytesOf(fixtureDocument(OLDER_VERSION)))
  })
})

describe('the recovery snapshots and assets of the IndexedDB store', () => {
  it('keeps a snapshot that restores, under the autosave folder of the project', async () => {
    const store = new IndexedDbProjectStore(freshDatabaseName())
    const snapshots = store.snapshots('current')

    await snapshots.writeSnapshot(projectNamed('Alpha House'))

    expect(await snapshots.isRecoverable()).toBe(true)
    expect((await snapshots.restore())?.ok).toBe(true)
    const files = await store.storedFiles('current')
    const names = pathsStartingWith(files, AUTOSAVE_FOLDER).map((path) =>
      path.slice(AUTOSAVE_FOLDER.length),
    )
    expect(names).toContain('session-start.json')
    const rolling = names.filter((name) => name !== 'session-start.json')
    expect(rolling).toHaveLength(1)
    expect(rolling[0]).toMatch(/^snapshot-.*\.json$/)
  })

  it('serves one asset pool that outlives the store instance', async () => {
    const name = freshDatabaseName()
    await new IndexedDbProjectStore(name).assets('current').put(ASSET_HASH, ASSET_BYTES)

    const bytes = await new IndexedDbProjectStore(name).assets('other').get(ASSET_HASH)

    expect(bytes).toEqual(ASSET_BYTES)
  })
})

describe('the type of a project store', () => {
  it('offers snapshots, assets, and stored files without narrowing, as the document store does', () => {
    const surface = (store: ProjectStore) => [
      store.snapshots('a'),
      store.assets('a'),
      store.storedFiles('a'),
    ]

    expectTypeOf(surface).parameter(0).toEqualTypeOf<DocumentStore>()
  })
})
