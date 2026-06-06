import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../../core'
import type { Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { serializeProjectJson } from './project-json'
import type { FolderProjectStoreOptions } from './folder-project-store'
import { FolderProjectStore, ProjectFileNotFoundError } from './folder-project-store'

const PRE_MIGRATION_BACKUP = '.house-autosave/pre-migration-v1.json'

/**
 * Builds store options that also carry a `targetVersion`, the additive field
 * Cycle C3 introduces. Spread through a wider record so the test typechecks
 * before the field exists on FolderProjectStoreOptions; the RED lives in the
 * runtime backup and atomicity assertions, not in compilation.
 */
function migrationOptions(
  targetVersion: number,
  migrate: (raw: unknown) => Project,
): FolderProjectStoreOptions {
  const withTarget: Record<string, unknown> = { migrate, targetVersion }
  return withTarget as FolderProjectStoreOptions
}

function seededDirectory(): { directory: InMemoryDirectory; seedBytes: Uint8Array } {
  const directory = new InMemoryDirectory()
  const seeded = createEmptyProject({
    name: 'Seed',
    units: 'imperial',
    era: 'modern',
    appVersion: '0.0.0',
  })
  const seedBytes = serializeProjectJson(seeded)
  return { directory, seedBytes }
}

function bytesEqual(actual: Uint8Array | undefined, expected: Uint8Array): boolean {
  if (actual === undefined) {
    return false
  }
  if (actual.length !== expected.length) {
    return false
  }
  return [...actual].every((value, index) => value === expected[index])
}

function bumpSchemaVersionTo(version: number): (raw: unknown) => Project {
  return (raw) => {
    const project = raw as Project
    return { ...project, meta: { ...project.meta, schemaVersion: version } }
  }
}

function sampleProject(): Project {
  const wall = createWall({ x: 0, y: 0 }, { x: 4000, y: 0 }, { id: 'wall-1', thickness: 140 })
  const floor = createFloor('Ground floor', {
    id: 'floor-1',
    elevation: 0,
    walls: [wall],
  })
  const project = createEmptyProject({
    name: 'Sample House',
    units: 'metric',
    era: 'craftsman',
    appVersion: '0.1.0',
  })
  project.floors.push(floor)
  return project
}

describe('FolderProjectStore', () => {
  it('loads a project deep-equal to the one it saved at the current schema version', async () => {
    const store = new FolderProjectStore(new InMemoryDirectory())
    const project = sampleProject()

    await store.saveProject(project)

    expect(await store.loadProject()).toEqual(project)
  })

  it('isolates stored state from later mutation of the saved project', async () => {
    const store = new FolderProjectStore(new InMemoryDirectory())
    const project = sampleProject()
    await store.saveProject(project)

    project.meta.name = 'Mutated'
    project.floors[0]!.walls.push(
      createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'wall-extra', thickness: 100 }),
    )

    const loaded = await store.loadProject()
    expect(loaded.meta.name).toBe('Sample House')
    expect(loaded.floors[0]!.walls).toHaveLength(1)
  })

  it('isolates stored state from mutation of a loaded project', async () => {
    const store = new FolderProjectStore(new InMemoryDirectory())
    await store.saveProject(sampleProject())

    const firstLoad = await store.loadProject()
    firstLoad.meta.name = 'Mutated'
    firstLoad.floors[0]!.walls.push(
      createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'wall-extra', thickness: 100 }),
    )

    const secondLoad = await store.loadProject()
    expect(secondLoad.meta.name).toBe('Sample House')
    expect(secondLoad.floors[0]!.walls).toHaveLength(1)
  })

  it('reports existence only after a project has been saved', async () => {
    const store = new FolderProjectStore(new InMemoryDirectory())

    expect(await store.exists()).toBe(false)
    await store.saveProject(sampleProject())
    expect(await store.exists()).toBe(true)
  })

  it('throws ProjectFileNotFoundError when loading from an empty directory', async () => {
    const store = new FolderProjectStore(new InMemoryDirectory())

    await expect(store.loadProject()).rejects.toBeInstanceOf(ProjectFileNotFoundError)
  })

  it('backs up the original project file verbatim before migrating it forward', async () => {
    const { directory, seedBytes } = seededDirectory()
    await directory.writeFile('project.json', seedBytes)
    const store = new FolderProjectStore(directory, migrationOptions(2, bumpSchemaVersionTo(2)))

    const loaded = await store.loadProject()

    expect(bytesEqual(await directory.readFile(PRE_MIGRATION_BACKUP), seedBytes)).toBe(true)
    expect(loaded.meta.schemaVersion).toBe(2)
  })

  it('leaves the canonical project file intact and keeps the backup when migration throws', async () => {
    const { directory, seedBytes } = seededDirectory()
    await directory.writeFile('project.json', seedBytes)
    const store = new FolderProjectStore(
      directory,
      migrationOptions(2, () => {
        throw new Error('migration boom')
      }),
    )

    await expect(store.loadProject()).rejects.toThrow('migration boom')

    expect(bytesEqual(await directory.readFile('project.json'), seedBytes)).toBe(true)
    expect(bytesEqual(await directory.readFile(PRE_MIGRATION_BACKUP), seedBytes)).toBe(true)
  })

  it('writes no pre-migration backup when the stored project is already current', async () => {
    const { directory, seedBytes } = seededDirectory()
    await directory.writeFile('project.json', seedBytes)
    const store = new FolderProjectStore(directory)

    await store.loadProject()

    expect(await directory.readFile(PRE_MIGRATION_BACKUP)).toBeUndefined()
  })
})
