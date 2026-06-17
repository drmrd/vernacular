import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { DEFAULT_FURNITURE_HEIGHT_MM } from '../../model/factories'
import { addFurnitureHeightMigration } from './add-furniture-height'

const VERSION_TEN = 10
const EXPLICIT_HEIGHT_MM = 300

interface FurnitureShape {
  id: string
  height?: number
}

interface FloorShape {
  id: string
  furniture?: FurnitureShape[]
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  floors?: FloorShape[]
}

/**
 * Builds a version-10 project document whose first floor carries a single
 * furniture instance. The caller decides whether that instance predates the
 * `height` field or already carries one. The second floor lacks a `furniture`
 * array entirely. Returned as a plain `ProjectShape` so the migration is
 * exercised structurally, exactly as a loaded-from-disk version-10 document
 * would arrive.
 */
function makeVersionTenDocument(firstPiece: FurnitureShape): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: VERSION_TEN,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [
      {
        id: 'f1',
        name: 'Ground',
        walls: [],
        openings: [],
        underlays: [],
        dimensions: [],
        furniture: [firstPiece],
      },
      { id: 'f2', name: 'Attic', walls: [], openings: [], underlays: [], dimensions: [] },
    ],
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-furniture-height schema migration', () => {
  it('starts its forward step from schema version 10', () => {
    expect(addFurnitureHeightMigration.from).toBe(VERSION_TEN)
  })

  it('backfills the default height on a furniture instance that lacks one', () => {
    const migrated = addFurnitureHeightMigration.migrate(makeVersionTenDocument({ id: 'fu1' }))

    expect(asDocument(migrated).floors?.[0]?.furniture?.[0]?.height).toBe(
      DEFAULT_FURNITURE_HEIGHT_MM,
    )
  })

  it('leaves an already-present numeric height untouched', () => {
    const document = makeVersionTenDocument({ id: 'fu1', height: EXPLICIT_HEIGHT_MM })

    const migrated = addFurnitureHeightMigration.migrate(document)

    expect(asDocument(migrated).floors?.[0]?.furniture?.[0]?.height).toBe(EXPLICIT_HEIGHT_MM)
  })

  it('returns a floor with no furniture array unchanged', () => {
    const migrated = addFurnitureHeightMigration.migrate(makeVersionTenDocument({ id: 'fu1' }))

    expect(asDocument(migrated).floors?.[1]?.furniture).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addFurnitureHeightMigration.migrate(makeVersionTenDocument({ id: 'fu1' }))

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_TEN)
  })
})
