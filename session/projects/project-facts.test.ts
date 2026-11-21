import { describe, it, expect } from 'vitest'
import {
  createEmptyProject,
  createFloor,
  createFurnitureInstance,
  createPlanPreview,
  createUnderlay,
  createWall,
  encodeDocument,
  readStoredFacts,
} from '../../core'
import type { AssetReference, Floor, Project } from '../../core'
import { factsOf } from './project-facts'

const FIRST_HASH = 'a'.repeat(64)
const SECOND_HASH = 'b'.repeat(64)
const THIRD_HASH = 'c'.repeat(64)
const WALL_LENGTH_MM = 4000
const FOOTPRINT = { width: 600, depth: 600 }
const UNDERLAY_SIZE = { width: 1000, height: 800 }

function emptyProject(name: string): Project {
  return createEmptyProject({ name, units: 'metric', period: 'victorian', appVersion: '0.0.0' })
}

function furnitureOf(contentHash: string) {
  const assetRef: AssetReference = { scope: 'user', contentHash }
  return createFurnitureInstance({ assetRef, position: { x: 0, y: 0 }, footprint: FOOTPRINT })
}

/** A floor with one wall, furniture of each of `hashes`, and an underlay of `underlayHash`. */
function floorWith(name: string, hashes: readonly string[], underlayHash: string): Floor {
  const wall = createWall({ x: 0, y: 0 }, { x: WALL_LENGTH_MM, y: 0 })
  const floor = createFloor(name, { walls: [wall] })
  floor.furniture = hashes.map(furnitureOf)
  const image: AssetReference = { scope: 'project', contentHash: underlayHash }
  floor.underlays = [createUnderlay({ image, ...UNDERLAY_SIZE })]
  return floor
}

/** A project of two floors whose furniture and underlays name three hashes, two of them twice. */
function furnishedProject(): Project {
  const project = emptyProject('Alder Street')
  project.floors = [
    floorWith('Ground', [THIRD_HASH, FIRST_HASH], SECOND_HASH),
    floorWith('Upper', [FIRST_HASH], THIRD_HASH),
  ]
  return project
}

/** The project with the first floor changed by `change`, past what its type allows. */
function withBrokenFirstFloor(project: Project, change: Record<string, unknown>): Project {
  const [first, ...rest] = project.floors
  return { ...project, floors: [{ ...first, ...change } as unknown as Floor, ...rest] }
}

describe('the facts of a project', () => {
  it('the facts of a project are its name, its count of floors, its asset hashes, and a preview', () => {
    const project = furnishedProject()

    expect(factsOf(project)).toEqual({
      name: 'Alder Street',
      floorCount: project.floors.length,
      preview: createPlanPreview(project),
      assetHashes: [FIRST_HASH, SECOND_HASH, THIRD_HASH],
      assetsListed: true,
    })
  })

  it('the hashes are those of the referenced assets, each once, sorted', () => {
    const project = furnishedProject()
    const storedFacts = readStoredFacts(encodeDocument(project, undefined).bytes)

    expect(factsOf(project).assetHashes).toEqual([FIRST_HASH, SECOND_HASH, THIRD_HASH])
    expect(factsOf(project).assetHashes).toEqual(storedFacts.assetHashes)
  })

  it('a project with no floor has zero floors and no preview', () => {
    expect(factsOf(emptyProject('No floor yet'))).toEqual({
      name: 'No floor yet',
      floorCount: 0,
      preview: undefined,
      assetHashes: [],
      assetsListed: true,
    })
  })
})

describe('the facts of a document that cannot give all of them', () => {
  it('a document whose drawing cannot be made gives its other facts and no preview', () => {
    const project = withBrokenFirstFloor(furnishedProject(), { walls: null })

    expect(factsOf(project)).toEqual({
      name: 'Alder Street',
      floorCount: project.floors.length,
      preview: undefined,
      assetHashes: [FIRST_HASH, SECOND_HASH, THIRD_HASH],
      assetsListed: true,
    })
  })

  it('a document whose assets cannot be listed gives an empty list that is marked as not listed', () => {
    const project = withBrokenFirstFloor(furnishedProject(), { underlays: [{ source: null }] })

    expect(factsOf(project)).toEqual({
      name: 'Alder Street',
      floorCount: project.floors.length,
      preview: createPlanPreview(project),
      assetHashes: [],
      assetsListed: false,
    })
  })
})
