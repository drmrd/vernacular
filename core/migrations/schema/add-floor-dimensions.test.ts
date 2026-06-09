import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addFloorDimensionsMigration } from './add-floor-dimensions'

const VERSION_THREE = 3

type FloorShape = Record<string, unknown>

/**
 * Builds a version-3 project document with three floors that exercise the gaps
 * the migration closes: a floor lacking `dimensions`, a floor that already
 * carries `dimensions`, and a third floor lacking `dimensions`. Returned as a
 * plain `ProjectShape` so the migration is exercised structurally, exactly as a
 * loaded-from-disk version-3 document would arrive.
 */
function makeVersionThreeDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: VERSION_THREE,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      { id: 'f1', name: 'Ground', walls: [], openings: [], underlays: [] },
      {
        id: 'f2',
        name: 'Upper',
        walls: [],
        openings: [],
        underlays: [],
        dimensions: [{ id: 'x' }],
      },
      { id: 'f3', name: 'Attic', walls: [], openings: [], underlays: [] },
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

describe('add-floor-dimensions schema migration', () => {
  it('starts its forward step from schema version 3', () => {
    expect(addFloorDimensionsMigration.from).toBe(VERSION_THREE)
  })

  it('backfills dimensions: [] on a floor that lacks it', () => {
    const migrated = addFloorDimensionsMigration.migrate(makeVersionThreeDocument())

    expect(floorAt(migrated, 0).dimensions).toEqual([])
  })

  it('leaves a floor that already carries dimensions untouched', () => {
    const migrated = addFloorDimensionsMigration.migrate(makeVersionThreeDocument())

    expect(floorAt(migrated, 1).dimensions).toEqual([{ id: 'x' }])
  })

  it('backfills dimensions: [] on every floor that lacks it', () => {
    const migrated = addFloorDimensionsMigration.migrate(makeVersionThreeDocument())

    expect(floorAt(migrated, 2).dimensions).toEqual([])
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const stepped = addFloorDimensionsMigration.migrate(makeVersionThreeDocument()) as {
      meta: { schemaVersion: number }
    }

    expect(stepped.meta.schemaVersion).toBe(VERSION_THREE)
  })

  it('preserves other top-level keys and existing floor fields', () => {
    const migrated = addFloorDimensionsMigration.migrate(makeVersionThreeDocument())

    expect((migrated.meta as { name: string }).name).toBe('P')
    expect(floorAt(migrated, 0).id).toBe('f1')
    expect(floorAt(migrated, 0).name).toBe('Ground')
    expect(floorAt(migrated, 0).walls).toEqual([])
  })
})
