import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addWallConstructionProfileMigration } from './add-wall-construction-profile'

const VERSION_ELEVEN = 11

interface WallShape {
  id: string
  constructionProfile?: string
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  floors?: { walls?: WallShape[] }[]
}

/**
 * Builds a version-11 project document with a single wall that predates the
 * `constructionProfile` field. Returned as a plain `ProjectShape` so the migration
 * is exercised structurally, exactly as a loaded-from-disk version-11 document
 * would arrive.
 */
function makeVersionElevenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_ELEVEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        walls: [{ id: 'w1', start: { x: 0, y: 0 }, end: { x: 1000, y: 0 }, thickness: 120 }],
        openings: [],
        underlays: [],
        dimensions: [],
        furniture: [],
      },
    ],
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-wall-construction-profile schema migration', () => {
  it('starts its forward step from schema version 11', () => {
    expect(addWallConstructionProfileMigration.from).toBe(VERSION_ELEVEN)
  })

  it('leaves an existing wall unchanged (an optional field needs no backfill)', () => {
    const migrated = addWallConstructionProfileMigration.migrate(makeVersionElevenDocument())

    expect(asDocument(migrated).floors?.[0]?.walls?.[0]?.constructionProfile).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addWallConstructionProfileMigration.migrate(makeVersionElevenDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_ELEVEN)
  })
})
