import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addFloorOpeningsMigration } from './add-floor-openings'

const VERSION_TWO = 2

type FloorShape = Record<string, unknown>

/**
 * Builds a version-2 project document with three floors that exercise the gaps
 * the migration closes: a floor lacking `openings`, a floor that already carries
 * `openings`, and a floor lacking both `openings` and `underlays`. Returned as a
 * plain `ProjectShape` so the migration is exercised structurally, exactly as a
 * loaded-from-disk version-2 document would arrive.
 */
function makeVersionTwoDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: VERSION_TWO,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      { id: 'f1', name: 'Ground', walls: [], underlays: [] },
      { id: 'f2', name: 'Upper', walls: [], openings: [{ id: 'o1' }], underlays: [] },
      { id: 'f3', name: 'Attic', walls: [] },
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

describe('add-floor-openings schema migration', () => {
  it('starts its forward step from schema version 2', () => {
    expect(addFloorOpeningsMigration.from).toBe(VERSION_TWO)
  })

  it('backfills openings: [] on a floor that lacks it', () => {
    const migrated = addFloorOpeningsMigration.migrate(makeVersionTwoDocument())

    expect(floorAt(migrated, 0).openings).toEqual([])
  })

  it('leaves a floor that already carries openings untouched', () => {
    const migrated = addFloorOpeningsMigration.migrate(makeVersionTwoDocument())

    expect(floorAt(migrated, 1).openings).toEqual([{ id: 'o1' }])
  })

  it('backfills both openings: [] and underlays: [] on a floor that lacks both', () => {
    const migrated = addFloorOpeningsMigration.migrate(makeVersionTwoDocument())

    expect(floorAt(migrated, 2).openings).toEqual([])
    expect(floorAt(migrated, 2).underlays).toEqual([])
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const stepped = addFloorOpeningsMigration.migrate(makeVersionTwoDocument()) as {
      meta: { schemaVersion: number }
    }

    expect(stepped.meta.schemaVersion).toBe(VERSION_TWO)
  })

  it('preserves other top-level keys and existing floor fields', () => {
    const migrated = addFloorOpeningsMigration.migrate(makeVersionTwoDocument())

    expect((migrated.meta as { name: string }).name).toBe('P')
    expect(floorAt(migrated, 0).id).toBe('f1')
    expect(floorAt(migrated, 0).name).toBe('Ground')
    expect(floorAt(migrated, 0).walls).toEqual([])
  })
})
