import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addPeriodAndStyleMigration } from './add-period-and-style'

function legacyDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      era: 'victorian',
      schemaVersion: addPeriodAndStyleMigration.from,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [{ id: 'f1', name: 'Ground', walls: [], openings: [], underlays: [], dimensions: [] }],
  } as unknown as ProjectShape
}

describe('add-period-and-style schema migration', () => {
  it('starts its forward step from the prior current schema version', () => {
    expect(addPeriodAndStyleMigration.from).toBeGreaterThan(0)
  })

  it('renames meta.era to meta.period', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: Record<string, unknown>
    }
    expect(migrated.meta.period).toBe('victorian')
    expect('era' in migrated.meta).toBe(false)
  })

  it('does not invent a project style', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: Record<string, unknown>
    }
    expect('style' in migrated.meta).toBe(false)
  })

  it('leaves floors without period or style overrides untouched', () => {
    const migrated = addPeriodAndStyleMigration.migrate(legacyDocument())
    expect(migrated.floors).toEqual(legacyDocument().floors)
  })

  it('does not set meta.schemaVersion inside the migration step itself', () => {
    const stepped = addPeriodAndStyleMigration.migrate(legacyDocument()) as {
      meta: { schemaVersion: number }
    }
    expect(stepped.meta.schemaVersion).toBe(addPeriodAndStyleMigration.from)
  })
})
