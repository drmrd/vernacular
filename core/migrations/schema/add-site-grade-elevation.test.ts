import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addSiteGradeElevationMigration } from './add-site-grade-elevation'

const VERSION_TWELVE = 12

interface SiteShape {
  northBearing?: number
  gradeElevation?: number
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  site?: SiteShape
}

/**
 * Builds a version-12 project document whose site predates the `gradeElevation`
 * field. Returned as a plain `ProjectShape` so the migration is exercised
 * structurally, exactly as a loaded-from-disk version-12 document would arrive.
 */
function makeVersionTwelveDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_TWELVE,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    site: { northBearing: 0 },
  } as ProjectShape
}

function asDocument(project: ProjectShape): DocumentShape {
  return project as unknown as DocumentShape
}

describe('add-site-grade-elevation schema migration', () => {
  it('starts its forward step from schema version 12', () => {
    expect(addSiteGradeElevationMigration.from).toBe(VERSION_TWELVE)
  })

  it('leaves an existing site unchanged (an optional field needs no backfill)', () => {
    const migrated = addSiteGradeElevationMigration.migrate(makeVersionTwelveDocument())

    expect(asDocument(migrated).site?.gradeElevation).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addSiteGradeElevationMigration.migrate(makeVersionTwelveDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_TWELVE)
  })
})
