import { describe, expect, it } from 'vitest'
import { createEmptyProject, createFloor, createWall } from '../../core'
import type { Project } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import { FolderProjectStore, ProjectFileNotFoundError } from './folder-project-store'

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
})
