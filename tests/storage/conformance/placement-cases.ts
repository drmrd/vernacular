import { describe, expect, it } from 'vitest'
import type { DirectoryPort } from '../../../storage/fs/directory-port'
import { OTHER_PROJECT_ID, PROJECT_ID } from './conformance-run'
import type { BeginRun } from './conformance-run'
import { currentBytes, renamed, soundProject } from './conformance-documents'
import { versionFixtureBytes } from '../../fixtures/projects/versions'

const NOT_JSON = new TextEncoder().encode('{ not json')
const OLDER_VERSION = 8
const NOTES_PATH = 'notes.txt'
const DRAWING_PATH = 'drawings/plan.txt'
const NOTES = new TextEncoder().encode('kept as it is')
const DRAWING = new TextEncoder().encode('also kept as it is')

/**
 * Every file under `prefix`, keyed by its path from the root, with its bytes. An empty directory
 * is a key that ends in a slash.
 */
async function treeOf(root: DirectoryPort, prefix = ''): Promise<Map<string, number[]>> {
  const tree = new Map<string, number[]>()
  for (const name of await root.list(prefix)) {
    const path = prefix === '' ? name : `${prefix}/${name}`
    const children = await root.list(path)
    if (children.length > 0) {
      for (const [key, value] of await treeOf(root, path)) tree.set(key, value)
      continue
    }
    const bytes = await root.readFile(path)
    tree.set(bytes === undefined ? `${path}/` : path, Array.from(bytes ?? []))
  }
  return tree
}

function outside(directory: string, tree: Map<string, number[]>): [string, number[]][] {
  return [...tree].filter(([path]) => !path.startsWith(`${directory}/`))
}

/** What a store lists, whatever the bytes of one of its projects are. */
export function describeListing(begin: BeginRun, holdsMany: boolean): void {
  describe('listing the projects', () => {
    it('includes a project whose bytes are not JSON', async () => {
      const run = await begin()
      await run.place(NOT_JSON)
      if (holdsMany) await run.place(currentBytes(), OTHER_PROJECT_ID)

      const listed = (await run.open().list()).map((summary) => summary.id)

      if (holdsMany) expect(listed).toEqual([PROJECT_ID, OTHER_PROJECT_ID])
      else expect(listed).toEqual([PROJECT_ID])
    })
  })
}

/** Two projects in one store stay apart, and a delete takes one and nothing else. */
export function describeManyProjects(begin: BeginRun): void {
  describe('two projects side by side', () => {
    it('leave the bytes of one identical when the other is saved', async () => {
      const run = await begin()
      const store = run.openWorkspace()
      await store.save(PROJECT_ID, soundProject())
      await store.save(OTHER_PROJECT_ID, soundProject())
      const before = await store.storedFiles(OTHER_PROJECT_ID)

      await store.save(PROJECT_ID, renamed(soundProject(), 'Changed'))

      expect(await store.storedFiles(OTHER_PROJECT_ID)).toEqual(before)
    })

    it('lose one to a delete and nothing else, and leave no empty directory behind', async () => {
      const run = await begin()
      const store = run.openWorkspace()
      await run.place(versionFixtureBytes(OLDER_VERSION))
      await store.read(PROJECT_ID)
      await store.snapshots(PROJECT_ID).writeSnapshot(soundProject())
      await store.save(OTHER_PROJECT_ID, soundProject())
      const before = outside(PROJECT_ID, await treeOf(run.root))

      await store.delete(PROJECT_ID)

      expect((await store.list()).map((summary) => summary.id)).toEqual([OTHER_PROJECT_ID])
      expect(outside(PROJECT_ID, await treeOf(run.root))).toEqual(before)
      expect(await run.root.list('')).not.toContain(PROJECT_ID)
    })
  })
}

/** A store bound to one project writes its own files and no other file of the root. */
export function describeSingleProject(begin: BeginRun): void {
  describe('a project in a root that holds other files', () => {
    it('leaves every file the store did not write identical', async () => {
      const run = await begin()
      await run.place(currentBytes())
      await run.root.writeFile(NOTES_PATH, NOTES)
      await run.root.writeFile(DRAWING_PATH, DRAWING)
      const store = run.open()

      await store.save(PROJECT_ID, soundProject())
      await store.snapshots(PROJECT_ID).writeSnapshot(soundProject())
      await store.snapshots(PROJECT_ID).prune()
      await store.load(PROJECT_ID)

      expect(await run.root.readFile(NOTES_PATH)).toEqual(NOTES)
      expect(await run.root.readFile(DRAWING_PATH)).toEqual(DRAWING)
    })
  })
}
