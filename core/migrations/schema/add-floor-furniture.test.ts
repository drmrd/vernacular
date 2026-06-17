import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addFloorFurnitureMigration } from './add-floor-furniture'

const VERSION_NINE = 9

type FloorShape = Record<string, unknown>

/**
 * Builds a version-9 project document with three floors that exercise the gaps
 * the migration closes: a floor lacking `furniture`, a floor that already carries
 * `furniture`, and a floor lacking `furniture` entirely. Returned as a plain
 * `ProjectShape` so the migration is exercised structurally, exactly as a
 * loaded-from-disk version-9 document would arrive.
 */
function makeVersionNineDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: VERSION_NINE,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      { id: 'f1', name: 'Ground', walls: [], openings: [], underlays: [], dimensions: [] },
      {
        id: 'f2',
        name: 'Upper',
        walls: [],
        openings: [],
        underlays: [],
        dimensions: [],
        furniture: [{ id: 'fu1' }],
      },
      { id: 'f3', name: 'Attic', walls: [], openings: [], underlays: [], dimensions: [] },
    ],
  } as ProjectShape
}

function floorsOf(document: ProjectShape): FloorShape[] {
  return document.floors as FloorShape[]
}

function floorAt(document: ProjectShape, index: number): FloorShape {
  const floor = floorsOf(document)[index]
  if (floor === undefined) {
    throw new Error(`no floor at index ${index}`)
  }
  return floor
}

describe('add-floor-furniture schema migration', () => {
  it('starts its forward step from schema version 9', () => {
    expect(addFloorFurnitureMigration.from).toBe(VERSION_NINE)
  })

  it('backfills furniture: [] on a floor that lacks it', () => {
    const migrated = addFloorFurnitureMigration.migrate(makeVersionNineDocument())

    expect(floorAt(migrated, 0).furniture).toEqual([])
  })

  it('leaves a floor that already carries furniture untouched', () => {
    const migrated = addFloorFurnitureMigration.migrate(makeVersionNineDocument())

    expect(floorAt(migrated, 1).furniture).toEqual([{ id: 'fu1' }])
  })

  it('backfills furniture: [] on the third floor that lacks it', () => {
    const migrated = addFloorFurnitureMigration.migrate(makeVersionNineDocument())

    expect(floorAt(migrated, 2).furniture).toEqual([])
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const stepped = addFloorFurnitureMigration.migrate(makeVersionNineDocument()) as {
      meta: { schemaVersion: number }
    }

    expect(stepped.meta.schemaVersion).toBe(VERSION_NINE)
  })

  it('preserves other top-level keys and existing floor fields', () => {
    const migrated = addFloorFurnitureMigration.migrate(makeVersionNineDocument())

    expect((migrated.meta as { name: string }).name).toBe('P')
    expect(floorAt(migrated, 0).id).toBe('f1')
    expect(floorAt(migrated, 0).name).toBe('Ground')
    expect(floorAt(migrated, 0).walls).toEqual([])
  })

  it('passes through unchanged when floors is not an array', () => {
    const nonArrayFloors = {
      meta: { schemaVersion: VERSION_NINE },
      floors: 'nope',
    } as unknown as ProjectShape
    const result = addFloorFurnitureMigration.migrate(nonArrayFloors)

    expect((result as unknown as { floors: string }).floors).toBe('nope')
  })
})
