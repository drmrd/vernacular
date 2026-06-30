import { describe, expect, it } from 'vitest'
import { addSiteGradeElevationMigration } from './add-site-grade-elevation'

const VERSION_TWELVE = 12

describe('add-site-grade-elevation schema migration', () => {
  it('starts its forward step from schema version 12', () => {
    expect(addSiteGradeElevationMigration.from).toBe(VERSION_TWELVE)
  })

  it('leaves a version-12 document unchanged (an optional field needs no backfill)', () => {
    const project = { meta: {}, floors: [] } as never
    const migrated = addSiteGradeElevationMigration.migrate(project) as { site?: unknown }

    expect('site' in migrated).toBe(false)
  })
})
