import { describe, expect, it } from 'vitest'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { WorkspaceFiles } from './workspace-files'

const HASH = 'abc123'
const ASSET_PATH = `${ASSET_DIRECTORY_PREFIX}/${HASH}`
const DOCUMENT_A = Uint8Array.of(1, 1)
const DOCUMENT_B = Uint8Array.of(2, 2)
const ASSET_BYTES = Uint8Array.of(7, 8, 9)

/** Test support: passes every call through and counts the reads. */
class ReadCountingDirectory implements DirectoryPort {
  reads = 0

  constructor(private readonly inner: DirectoryPort) {}

  async readFile(path: string): Promise<Uint8Array | undefined> {
    this.reads += 1
    return this.inner.readFile(path)
  }

  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    return this.inner.writeFile(path, bytes)
  }

  removeFile(path: string): Promise<void> {
    return this.inner.removeFile(path)
  }

  list(prefix: string): Promise<string[]> {
    return this.inner.list(prefix)
  }

  modifiedAt(path: string): Promise<string | undefined> {
    return this.inner.modifiedAt(path)
  }

  removeTree(prefix: string): Promise<void> {
    return this.inner.removeTree(prefix)
  }
}

async function seededRoot(): Promise<InMemoryDirectory> {
  const root = new InMemoryDirectory()
  await root.writeFile('a/vernacular.json', DOCUMENT_A)
  await root.writeFile('a/.house-backups/old.json', Uint8Array.of(3))
  await root.writeFile('a/.house-autosave/latest.json', Uint8Array.of(4))
  await root.writeFile('b/vernacular.json', DOCUMENT_B)
  await root.writeFile('b/.house-backups/old.json', Uint8Array.of(5))
  await root.writeFile(ASSET_PATH, ASSET_BYTES)
  await root.writeFile('c/.house-backups/x.json', Uint8Array.of(6))
  await root.writeFile('notes.txt', Uint8Array.of(10))
  return root
}

/** Test support: passes every call through and records the names of the members called. */
class CallRecordingDirectory implements DirectoryPort {
  readonly calls: { member: string; path: string }[] = []

  constructor(private readonly inner: DirectoryPort) {}

  readFile(path: string): Promise<Uint8Array | undefined> {
    this.calls.push({ member: 'readFile', path })
    return this.inner.readFile(path)
  }

  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.calls.push({ member: 'writeFile', path })
    return this.inner.writeFile(path, bytes)
  }

  removeFile(path: string): Promise<void> {
    this.calls.push({ member: 'removeFile', path })
    return this.inner.removeFile(path)
  }

  list(prefix: string): Promise<string[]> {
    this.calls.push({ member: 'list', path: prefix })
    return this.inner.list(prefix)
  }

  modifiedAt(path: string): Promise<string | undefined> {
    this.calls.push({ member: 'modifiedAt', path })
    return this.inner.modifiedAt(path)
  }

  removeTree(prefix: string): Promise<void> {
    this.calls.push({ member: 'removeTree', path: prefix })
    return this.inner.removeTree(prefix)
  }
}

async function readAll(root: DirectoryPort, paths: string[]): Promise<(Uint8Array | undefined)[]> {
  return Promise.all(paths.map((path) => root.readFile(path)))
}

const SEEDED_PATHS = [
  'a/vernacular.json',
  'a/.house-backups/old.json',
  'a/.house-autosave/latest.json',
  'b/vernacular.json',
  'b/.house-backups/old.json',
  ASSET_PATH,
  'c/.house-backups/x.json',
  'notes.txt',
]

describe('WorkspaceFiles', () => {
  it('lists the ids of the directories that hold a document, sorted', async () => {
    const files = new WorkspaceFiles(await seededRoot(), { durable: true })

    expect(await files.ids()).toEqual(['a', 'b'])
  })

  it('answers the list of ids without reading any file', async () => {
    const root = new ReadCountingDirectory(await seededRoot())
    const files = new WorkspaceFiles(root, { durable: true })

    await files.ids()

    expect(root.reads).toBe(0)
  })

  it('lists no id for an empty root', async () => {
    const files = new WorkspaceFiles(new InMemoryDirectory(), { durable: false })

    expect(await files.ids()).toEqual([])
  })

  it('reflects the durable option', () => {
    const root = new InMemoryDirectory()

    expect(new WorkspaceFiles(root, { durable: true }).durable).toBe(true)
    expect(new WorkspaceFiles(root, { durable: false }).durable).toBe(false)
  })

  it('keeps one project in a directory named by its id', async () => {
    const root = new InMemoryDirectory()
    const files = new WorkspaceFiles(root, { durable: true })

    await files.projectDirectory('a').writeFile('vernacular.json', DOCUMENT_A)

    expect(await root.readFile('a/vernacular.json')).toEqual(DOCUMENT_A)
    expect(await files.projectDirectory('a').readFile('vernacular.json')).toEqual(DOCUMENT_A)
  })

  it('shares one asset pool at the assets directory between every project', async () => {
    const root = new InMemoryDirectory()
    const files = new WorkspaceFiles(root, { durable: true })

    await files.assetsFor('a').put(HASH, ASSET_BYTES)

    expect(await root.readFile(ASSET_PATH)).toEqual(ASSET_BYTES)
    expect(await files.assetsFor('b').has(HASH)).toBe(true)
    expect(await files.assetsFor('b').get(HASH)).toEqual(ASSET_BYTES)
  })

  describe('after removing a project', () => {
    const KEPT_PATHS = [
      'b/vernacular.json',
      'b/.house-backups/old.json',
      ASSET_PATH,
      'c/.house-backups/x.json',
      'notes.txt',
    ]

    it('leaves nothing under the removed id in the root', async () => {
      const root = await seededRoot()
      const files = new WorkspaceFiles(root, { durable: true })

      await files.remove('a')

      // The in-memory port has no directories, so "no empty directory" is checked
      // on a real file system by a later browser test.
      expect(await root.list('')).not.toContain('a')
      expect(await root.list('a')).toEqual([])
      expect(await files.ids()).toEqual(['b'])
    })

    it('leaves every other file byte-identical', async () => {
      const root = await seededRoot()
      const before = await readAll(root, KEPT_PATHS)

      await new WorkspaceFiles(root, { durable: true }).remove('a')

      expect(await readAll(root, KEPT_PATHS)).toEqual(before)
    })

    it('removes the project as one tree and removes no single file', async () => {
      const root = new CallRecordingDirectory(await seededRoot())
      const files = new WorkspaceFiles(root, { durable: true })

      await files.remove('a')

      const removals = root.calls.filter(
        ({ member }) => member === 'removeTree' || member === 'removeFile',
      )
      expect(removals).toEqual([{ member: 'removeTree', path: 'a' }])
    })

    it('resolves without error for an id that does not exist', async () => {
      const root = await seededRoot()
      const files = new WorkspaceFiles(root, { durable: true })

      await expect(files.remove('missing')).resolves.toBeUndefined()
      expect(await files.ids()).toEqual(['a', 'b'])
    })
  })

  describe.each(['assets', '', 'a/b', '.', '..'])('for the reserved or malformed id %j', (id) => {
    it('refuses to remove it, names the id in the error, and leaves the root untouched', async () => {
      const root = await seededRoot()
      const listing = await root.list('')
      const before = await readAll(root, SEEDED_PATHS)
      const files = new WorkspaceFiles(root, { durable: true })

      await expect(files.remove(id)).rejects.toThrow(id)

      expect((await root.list('')).sort()).toEqual(listing.sort())
      expect(await readAll(root, SEEDED_PATHS)).toEqual(before)
    })

    it('refuses to give a project directory for it', async () => {
      const files = new WorkspaceFiles(await seededRoot(), { durable: true })

      expect(() => files.projectDirectory(id)).toThrow()
    })
  })
})
