import { describe, expect, expectTypeOf, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
} from '../../core'
import type { Project } from '../../core'
import { versionFixtureBytes } from '../../tests/fixtures/projects/versions'
import { projectOf } from '../../tests/fixtures/projects/versions/fixture-documents'
import { ASSET_DIRECTORY_PREFIX } from '../directory-asset-cache'
import type { DirectoryPort } from '../fs/directory-port'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { InMemoryAssetCache } from '../in-memory-asset-cache'
import { FolderFiles } from '../project-files/folder-files'
import { WorkspaceFiles } from '../project-files/workspace-files'
import { DocumentStore, WorkspaceDocumentStore } from './document-store'

const HASH = 'ab'.repeat(32)
const ASSET_PATH = `${ASSET_DIRECTORY_PREFIX}/${HASH}`
const ASSET_BYTES = Uint8Array.of(7, 8, 9)
const NOT_JSON = new TextEncoder().encode('{ not json')
const FIRST_WRITE = Date.UTC(2026, 0, 1)
const ONE_SECOND = 1000

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

/** A clock that moves one second on each call, so each write has its own time. */
function steppingClock(): () => Date {
  let writes = 0
  return () => {
    const time = new Date(FIRST_WRITE + writes * ONE_SECOND)
    writes += 1
    return time
  }
}

function currentBytes(): Uint8Array {
  return versionFixtureBytes(CURRENT_SCHEMA_VERSION)
}

function storeOver(root: DirectoryPort, durable = true): WorkspaceDocumentStore {
  return new WorkspaceDocumentStore(new WorkspaceFiles(root, { durable }))
}

/** Two projects, `a` with a backup and a snapshot, and one asset in the shared pool. */
async function seededRoot(): Promise<InMemoryDirectory> {
  const root = new InMemoryDirectory({ now: steppingClock() })
  await root.writeFile('a/vernacular.json', currentBytes())
  await root.writeFile('a/.house-backups/old.json', Uint8Array.of(3))
  await root.writeFile('a/.house-autosave/session-start.json', Uint8Array.of(4))
  await root.writeFile('b/vernacular.json', NOT_JSON)
  await root.writeFile('b/.house-backups/old.json', Uint8Array.of(5))
  await root.writeFile(ASSET_PATH, ASSET_BYTES)
  return root
}

async function treeOf(root: DirectoryPort, prefix = ''): Promise<Record<string, number[]>> {
  const tree: Record<string, number[]> = {}
  for (const name of await root.list(prefix)) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    const bytes = await root.readFile(path)
    if (bytes === undefined) Object.assign(tree, await treeOf(root, path))
    else tree[path] = Array.from(bytes)
  }
  return tree
}

function withoutProject(tree: Record<string, number[]>, id: string): Record<string, number[]> {
  return Object.fromEntries(Object.entries(tree).filter(([path]) => !path.startsWith(`${id}/`)))
}

function projectReferringToAsset(): Project {
  const project = createEmptyProject({
    name: 'House',
    units: 'metric',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  const floor = createFloor('Ground', { id: 'g' })
  floor.furniture = [
    createFurnitureInstance({
      assetRef: { scope: 'user', contentHash: HASH },
      position: { x: 100, y: 200 },
      footprint: { width: 600, depth: 600 },
    }),
  ]
  project.floors = [floor]
  return project
}

describe('listing the projects of a store', () => {
  it('gives each id with the time of the last change, sorted, and reads no document', async () => {
    const inner = await seededRoot()
    const root = new ReadCountingDirectory(inner)

    const summaries = await storeOver(root).list()

    expect(summaries).toEqual([
      { id: 'a', lastChangedAt: await inner.modifiedAt('a/vernacular.json') },
      { id: 'b', lastChangedAt: await inner.modifiedAt('b/vernacular.json') },
    ])
    expect(summaries[0]?.lastChangedAt).not.toBe(summaries[1]?.lastChangedAt)
    expect(root.reads).toBe(0)
  })

  it('still names a project whose time of last change cannot be read, without a time', async () => {
    const inner = await seededRoot()
    const root = new (class extends ReadCountingDirectory {
      override async modifiedAt(path: string): Promise<string | undefined> {
        if (path.startsWith('b/')) throw new Error('the time cannot be read')
        return super.modifiedAt(path)
      }
    })(inner)

    const summaries = await storeOver(root).list()

    expect(summaries).toEqual([
      { id: 'a', lastChangedAt: await inner.modifiedAt('a/vernacular.json') },
      { id: 'b', lastChangedAt: undefined },
    ])
  })
})

describe('deleting a project from a workspace store', () => {
  it('removes everything under the project and leaves the others and the shared assets alone', async () => {
    const root = await seededRoot()
    const untouched = withoutProject(await treeOf(root), 'a')
    const store = storeOver(root)

    await store.delete('a')

    expect(await root.list('a')).toEqual([])
    expect(await treeOf(root)).toEqual(untouched)
    expect(await store.read('a')).toEqual({ ok: false, failure: { kind: 'not-found' } })
  })

  it('is not available on a store over one folder', () => {
    const store = new DocumentStore(
      new FolderFiles('p', new InMemoryDirectory(), { durable: true }),
    )

    expect('delete' in store).toBe(false)
    expectTypeOf(store).not.toHaveProperty('delete')
  })
})

describe('the assets of a store', () => {
  it('serves the asset cache of its files', async () => {
    const root = new InMemoryDirectory()

    await storeOver(root).assets('a').put(HASH, ASSET_BYTES)

    expect(await root.readFile(ASSET_PATH)).toEqual(ASSET_BYTES)
  })

  it('leaves the bytes of a referenced asset in the folder when the project is saved, though only the shared pool held them', async () => {
    const folder = new InMemoryDirectory()
    const shared = new InMemoryAssetCache()
    await shared.put(HASH, ASSET_BYTES)
    const store = new DocumentStore(new FolderFiles('p', folder, { durable: true, shared }))

    await store.save('p', projectReferringToAsset())

    expect(await folder.readFile(ASSET_PATH)).toEqual(ASSET_BYTES)
  })
})

describe('the stored files of a project', () => {
  it('maps the path inside the project to the bytes, for its document, backups, and snapshots only', async () => {
    const root = await seededRoot()

    const files = await storeOver(root).storedFiles('a')

    expect([...files.keys()].sort()).toEqual([
      '.house-autosave/session-start.json',
      '.house-backups/old.json',
      'vernacular.json',
    ])
    expect(files.get('vernacular.json')).toEqual(currentBytes())
    expect(files.get('.house-backups/old.json')).toEqual(Uint8Array.of(3))
    expect(files.get('.house-autosave/session-start.json')).toEqual(Uint8Array.of(4))
  })
})

describe('the other members of a store', () => {
  it.each([true, false])('mirrors the durability of its files when durable is %s', (durable) => {
    expect(storeOver(new InMemoryDirectory(), durable).durable).toBe(durable)
  })

  it('stores a snapshot under the autosave directory of its project', async () => {
    const root = new InMemoryDirectory()

    await storeOver(root).snapshots('a').writeSnapshot(projectOf(currentBytes()))

    expect((await root.list('a/.house-autosave')).length).toBeGreaterThan(0)
  })
})
