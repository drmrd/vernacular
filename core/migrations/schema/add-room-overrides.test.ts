import { describe, expect, it } from 'vitest'
import { migrateProject } from '../../index'
import type { ProjectShape } from '../../index'
import { addRoomOverridesMigration } from './add-room-overrides'

const VERSION_ONE = 1
const VERSION_TWO = 2

/**
 * Builds a version-1 project document with one floor, one wall, and a populated
 * meta. Returned as a plain `ProjectShape` so the migration is exercised
 * structurally, exactly as a loaded-from-disk document would arrive.
 */
function makeVersionOneDocument(): ProjectShape {
  return {
    meta: {
      name: 'Test House',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: VERSION_ONE,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'floor:ground',
        name: 'Ground Floor',
        elevation: 0,
        defaultCeilingHeight: 2400,
        walls: [
          {
            id: 'wall:1',
            start: { x: 0, y: 0 },
            end: { x: 1000, y: 0 },
            thickness: 100,
          },
        ],
      },
    ],
  }
}

describe('add-room-overrides schema migration', () => {
  it('starts its forward step from schema version 1', () => {
    expect(addRoomOverridesMigration.from).toBe(VERSION_ONE)
  })

  it('preserves existing project data when migrating a version-1 document forward', () => {
    const document = makeVersionOneDocument()

    const migrated = migrateProject(document, {
      schemaMigrations: [addRoomOverridesMigration],
      targetVersion: VERSION_TWO,
    })

    const before = makeVersionOneDocument()
    expect(migrated.floors).toEqual(before.floors)
    expect(migrated.meta.name).toBe('Test House')
    expect(migrated.meta.units).toBe('imperial')
    expect(migrated.meta.era).toBe('victorian')
  })

  it('lets the orchestrator advance the schema version to 2', () => {
    const document = makeVersionOneDocument()

    const migrated = migrateProject(document, {
      schemaMigrations: [addRoomOverridesMigration],
      targetVersion: VERSION_TWO,
    })

    expect(migrated.meta.schemaVersion).toBe(VERSION_TWO)
  })

  it('does not invent a roomOverrides map (an absent map means no overrides)', () => {
    const document = makeVersionOneDocument()

    const migrated = migrateProject(document, {
      schemaMigrations: [addRoomOverridesMigration],
      targetVersion: VERSION_TWO,
    })

    expect('roomOverrides' in migrated).toBe(false)
    expect(migrated.roomOverrides).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const document = makeVersionOneDocument()

    const stepped = addRoomOverridesMigration.migrate(document) as {
      meta: { schemaVersion: number }
    }

    expect(stepped.meta.schemaVersion).toBe(VERSION_ONE)
  })
})
