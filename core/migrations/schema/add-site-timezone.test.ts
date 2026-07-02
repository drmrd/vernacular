import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addSiteTimezoneMigration } from './add-site-timezone'

const VERSION_THIRTEEN = 13

interface SiteShape {
  northBearing?: number
  timezone?: string
}

interface DocumentShape {
  meta?: { schemaVersion?: number }
  site?: SiteShape
}

/**
 * Builds a version-13 project document whose site predates the `timezone` field.
 * Returned as a plain `ProjectShape` so the migration is exercised structurally,
 * exactly as a loaded-from-disk version-13 document would arrive.
 */
function makeVersionThirteenDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: VERSION_THIRTEEN,
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

describe('add-site-timezone schema migration', () => {
  it('starts its forward step from schema version 13', () => {
    expect(addSiteTimezoneMigration.from).toBe(VERSION_THIRTEEN)
  })

  it('leaves an existing site unchanged (an optional field needs no backfill)', () => {
    const migrated = addSiteTimezoneMigration.migrate(makeVersionThirteenDocument())

    expect(asDocument(migrated).site?.timezone).toBeUndefined()
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const migrated = addSiteTimezoneMigration.migrate(makeVersionThirteenDocument())

    expect(asDocument(migrated).meta?.schemaVersion).toBe(VERSION_THIRTEEN)
  })
})
