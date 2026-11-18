import { describe, expect, expectTypeOf, it } from 'vitest'
import { createEmptyProject, encodeDocument } from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { PassThroughDirectory } from '../documents/document-store-test-kit'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FileSystemFolderProjectStore } from './file-system-folder-project-store'

const PROJECT_ID = 'house'
const CHANGED_AT = '2026-03-04T05:06:07.000Z'
const DOCUMENT_PATH = 'vernacular.json'
const NOTES_PATH = 'notes.txt'
const DRAWING_PATH = 'drawings/plan.pdf'
const AUTOSAVE_DIRECTORY = '.house-autosave'
const BACKUP_DIRECTORY = '.house-backups'
const OLDEST_VERSION = 8
const NOTES = new TextEncoder().encode('remember the milk')
const DRAWING = new TextEncoder().encode('%PDF-1.4 plan of the ground floor')

function projectNamed(name: string): Project {
  return createEmptyProject({ name, units: 'metric', period: 'craftsman', appVersion: '0.1.0' })
}

/** Every file below `prefix`; a path with no children is a file. */
async function filesUnder(port: DirectoryPort, prefix: string): Promise<string[]> {
  const files: string[] = []
  for (const name of await port.list(prefix)) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    const children = await port.list(path)
    files.push(...(children.length === 0 ? [path] : await filesUnder(port, path)))
  }
  return files
}

/**
 * Test support: passes every call to the folder, and records each path written and each file that
 * a removal took away, whether by `removeFile` or by `removeTree`.
 */
class RecordingDirectory extends PassThroughDirectory {
  readonly written = new Set<string>()
  readonly removed: string[] = []

  override writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.written.add(path)
    return super.writeFile(path, bytes)
  }

  override async removeFile(path: string): Promise<void> {
    if ((await this.inner.readFile(path)) !== undefined) this.removed.push(path)
    await super.removeFile(path)
  }

  override async removeTree(prefix: string): Promise<void> {
    this.removed.push(...(await filesUnder(this.inner, prefix)))
    await super.removeTree(prefix)
  }
}

/** The folder of a project that sits among the user's own files. */
async function folderAmongOtherFiles(): Promise<InMemoryDirectory> {
  const folder = new InMemoryDirectory({ now: () => new Date(CHANGED_AT) })
  await folder.writeFile(NOTES_PATH, NOTES)
  await folder.writeFile(DRAWING_PATH, DRAWING)
  await folder.writeFile(DOCUMENT_PATH, encodeDocument(projectNamed('Stored'), undefined).bytes)
  return folder
}

function storeOver(folder: DirectoryPort): FileSystemFolderProjectStore {
  return new FileSystemFolderProjectStore(PROJECT_ID, folder)
}

/** Calls every method of the store that reads or writes, including a snapshot write and a prune. */
async function useEveryMethod(store: FileSystemFolderProjectStore): Promise<void> {
  await store.load(PROJECT_ID)
  await store.save(PROJECT_ID, projectNamed('Edited'))
  await store.snapshots(PROJECT_ID).writeSnapshot(projectNamed('Snapshotted'))
  await store.snapshots(PROJECT_ID).prune()
  await store.list()
}

describe('the store of a picked folder', () => {
  it('leaves the files that it did not write byte-identical through every method', async () => {
    const folder = await folderAmongOtherFiles()

    await useEveryMethod(storeOver(new RecordingDirectory(folder)))

    expect(await folder.readFile(NOTES_PATH)).toEqual(NOTES)
    expect(await folder.readFile(DRAWING_PATH)).toEqual(DRAWING)
  })

  it('removes only files that it wrote itself, under the autosave directory', async () => {
    const recording = new RecordingDirectory(await folderAmongOtherFiles())

    await useEveryMethod(storeOver(recording))

    const notItsOwn = recording.removed.filter(
      (path) => !recording.written.has(path) || !path.startsWith(`${AUTOSAVE_DIRECTORY}/`),
    )
    expect(notItsOwn).toEqual([])
    expect(recording.removed.length).toBeGreaterThan(0)
  })

  it('has no delete', () => {
    const store = storeOver(new InMemoryDirectory())

    expect('delete' in store).toBe(false)
    expectTypeOf(store).not.toHaveProperty('delete')
  })

  it('saves the document to vernacular.json at the folder root, where a second store loads it', async () => {
    const folder = new InMemoryDirectory()

    await storeOver(folder).save(PROJECT_ID, projectNamed('Saved House'))

    expect(await folder.list('')).toEqual([DOCUMENT_PATH])
    expect((await storeOver(folder).load(PROJECT_ID)).meta.name).toBe('Saved House')
  })

  it('lists its one id with the time of last change when the folder holds a document', async () => {
    const folder = await folderAmongOtherFiles()

    expect(await storeOver(folder).list()).toEqual([{ id: PROJECT_ID, lastChangedAt: CHANGED_AT }])
  })

  it('lists nothing when the folder holds no document', async () => {
    const folder = new InMemoryDirectory()
    await folder.writeFile(NOTES_PATH, NOTES)

    expect(await storeOver(folder).list()).toEqual([])
  })

  it('keeps the migration backup in the backups directory inside the folder', async () => {
    const folder = await folderAmongOtherFiles()
    const stored = versionFixtureBytes(OLDEST_VERSION)
    await folder.writeFile(DOCUMENT_PATH, stored)

    await storeOver(folder).load(PROJECT_ID)

    const backups = await folder.list(BACKUP_DIRECTORY)
    expect(backups).toHaveLength(1)
    expect(await folder.readFile(`${BACKUP_DIRECTORY}/${backups[0]}`)).toEqual(stored)
    expect(await folder.list(AUTOSAVE_DIRECTORY)).toEqual([])
  })

  it('keeps recovery snapshots in the autosave directory inside the folder', async () => {
    const folder = new InMemoryDirectory()
    await storeOver(folder).save(PROJECT_ID, projectNamed('Saved House'))

    await storeOver(folder).snapshots(PROJECT_ID).writeSnapshot(projectNamed('Edited House'))

    expect((await folder.list('')).sort()).toEqual([AUTOSAVE_DIRECTORY, DOCUMENT_PATH])
    expect((await folder.list(AUTOSAVE_DIRECTORY)).length).toBeGreaterThan(0)
  })
})
