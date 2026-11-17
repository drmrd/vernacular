import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CURRENT_SCHEMA_REVISION,
  CURRENT_SCHEMA_VERSION,
  createEmptyProject,
  createFloor,
  createWall,
  encodeDocument,
} from '../../core'
import type { Project, ProjectShape } from '../../core'
import { InMemoryDirectory } from '../fs/in-memory-directory'
import {
  bytesOf,
  fixtureDocument,
  metaOf,
  UNKNOWN_FIELD,
  UNKNOWN_WALL_FIELD_PATH,
  withUnknownWallField,
} from '../../tests/fixtures/projects/versions/fixture-documents'
import type { Json } from '../../tests/fixtures/projects/versions/fixture-documents'
import { FolderProjectStore, ProjectFileNotFoundError } from './folder-project-store'

const PRE_MIGRATION_BACKUP = '.house-autosave/pre-migration-v1.json'

async function directoryHolding(document: Json): Promise<InMemoryDirectory> {
  const directory = new InMemoryDirectory()
  await directory.writeFile('vernacular.json', bytesOf(document))
  return directory
}

afterEach(() => {
  vi.restoreAllMocks()
})

function seededDirectory(version: number = CURRENT_SCHEMA_VERSION): {
  directory: InMemoryDirectory
  seedBytes: Uint8Array
} {
  const directory = new InMemoryDirectory()
  const seeded = bumpSchemaVersionTo(version)(
    createEmptyProject({
      name: 'Seed',
      units: 'imperial',
      period: 'modern',
      appVersion: '0.0.0',
    }),
  )
  const { bytes: seedBytes } = encodeDocument(seeded, undefined)
  return { directory, seedBytes }
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
    period: 'craftsman',
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

    const loaded = await store.loadProject()
    expect(loaded).toEqual({
      ...project,
      meta: { ...project.meta, schemaRevision: CURRENT_SCHEMA_REVISION },
    })
  })

  it('writes the canonical Document to vernacular.json', async () => {
    const directory = new InMemoryDirectory()
    const store = new FolderProjectStore(directory)

    await store.saveProject(sampleProject())

    expect(await directory.readFile('vernacular.json')).toBeDefined()
    expect(await directory.readFile('project.json')).toBeUndefined()
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
    const { directory, seedBytes } = seededDirectory(1)
    await directory.writeFile('vernacular.json', seedBytes)
    const store = new FolderProjectStore(directory, {
      migration: {
        schemaMigrations: [{ from: 1, migrate: (project: ProjectShape) => project }],
        targetVersion: 2,
      },
    })

    const loaded = await store.loadProject()

    expect(await directory.readFile(PRE_MIGRATION_BACKUP)).toEqual(seedBytes)
    expect(loaded.meta.schemaVersion).toBe(2)
  })

  it('leaves the canonical project file intact and keeps the backup when migration throws', async () => {
    const { directory, seedBytes } = seededDirectory(1)
    await directory.writeFile('vernacular.json', seedBytes)
    const store = new FolderProjectStore(directory, {
      migration: {
        schemaMigrations: [
          {
            from: 1,
            migrate: () => {
              throw new Error('migration boom')
            },
          },
        ],
        targetVersion: 2,
      },
    })

    await expect(store.loadProject()).rejects.toMatchObject({
      failure: { kind: 'migration-failed' },
    })

    expect(await directory.readFile('vernacular.json')).toEqual(seedBytes)
    expect(await directory.readFile(PRE_MIGRATION_BACKUP)).toEqual(seedBytes)
  })

  it('writes no pre-migration backup when the stored project is already current', async () => {
    const { directory, seedBytes } = seededDirectory()
    await directory.writeFile('vernacular.json', seedBytes)
    const store = new FolderProjectStore(directory)

    await store.loadProject()

    expect(await directory.readFile(PRE_MIGRATION_BACKUP)).toBeUndefined()
  })
})

describe('FolderProjectStore reading through the document codec', () => {
  it('loads the migrated document of a file that fails the check and warns of the fault', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const document = withUnknownWallField(fixtureDocument(CURRENT_SCHEMA_VERSION))
    const store = new FolderProjectStore(await directoryHolding(document))

    const loaded = await store.loadProject()

    expect(loaded.floors[0]!.walls[0]).toHaveProperty(UNKNOWN_FIELD, 1)
    expect(
      warn.mock.calls.some((args) => JSON.stringify(args).includes(UNKNOWN_WALL_FIELD_PATH)),
    ).toBe(true)
  })

  it('rejects a file saved at a higher schema version as a newer version', async () => {
    const document = fixtureDocument(CURRENT_SCHEMA_VERSION)
    metaOf(document).schemaVersion = CURRENT_SCHEMA_VERSION + 1
    const store = new FolderProjectStore(await directoryHolding(document))

    await expect(store.loadProject()).rejects.toMatchObject({ failure: { kind: 'newer-version' } })
  })
})

function priorDocumentBytes(): Uint8Array {
  const document = {
    meta: {
      name: 'Original',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      appVersion: '0.0.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        elevation: 0,
        defaultCeilingHeight: 2400,
        walls: [
          {
            id: 'w1',
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            thickness: 100,
            curve: { radius: 50 },
          },
        ],
        openings: [],
        dimensions: [],
        underlays: [],
        trim: { profile: 'ogee' },
      },
    ],
    stairs: [],
    annotations: { northArrow: { angle: 12 } },
  }
  return new TextEncoder().encode(JSON.stringify(document))
}

function projectKeeping(walls: ReturnType<typeof createWall>[]): Project {
  const project = createEmptyProject({
    name: 'Renamed',
    units: 'imperial',
    period: 'victorian',
    appVersion: '0.0.0',
  })
  project.floors.push(createFloor('Ground', { id: 'f1', elevation: 0, walls }))
  return project
}

describe('FolderProjectStore preservation overlay', () => {
  it('restores unknown and reserved keys the saved project dropped, from the prior document', async () => {
    const directory = new InMemoryDirectory()
    await directory.writeFile('vernacular.json', priorDocumentBytes())
    const store = new FolderProjectStore(directory)

    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 }, { id: 'w1', thickness: 100 })
    await store.saveProject(projectKeeping([wall]))

    const saved = JSON.parse(
      new TextDecoder().decode((await directory.readFile('vernacular.json'))!),
    )
    expect(saved.annotations).toEqual({ northArrow: { angle: 12 } })
    expect(saved.floors[0].trim).toEqual({ profile: 'ogee' })
    expect(saved.floors[0].walls[0].curve).toEqual({ radius: 50 })
    expect(saved.meta.name).toBe('Renamed')
  })

  it('does not resurrect a wall the saved project deleted', async () => {
    const directory = new InMemoryDirectory()
    await directory.writeFile('vernacular.json', priorDocumentBytes())
    const store = new FolderProjectStore(directory)

    await store.saveProject(projectKeeping([]))

    const saved = JSON.parse(
      new TextDecoder().decode((await directory.readFile('vernacular.json'))!),
    )
    expect(saved.floors[0].walls).toEqual([])
  })

  it('falls back to direct serialization when the prior document is unparseable', async () => {
    const directory = new InMemoryDirectory()
    await directory.writeFile('vernacular.json', new TextEncoder().encode('{ this is not json'))
    const store = new FolderProjectStore(directory)

    await store.saveProject(projectKeeping([]))

    const saved = JSON.parse(
      new TextDecoder().decode((await directory.readFile('vernacular.json'))!),
    )
    expect(saved.meta.name).toBe('Renamed')
  })
})
