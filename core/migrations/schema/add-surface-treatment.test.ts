import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { CURRENT_SCHEMA_VERSION } from '../../model/factories'
import { addSurfaceTreatmentMigration } from './add-surface-treatment'

// A structural color placeholder; the migration wraps whatever `color` holds, so the
// test does not need a real OKLab triple (which would carry a non-camelCase `L` key).
const SAGE = { srgbHex: '#9aa583' }
const KEY = 'wall-face:wall-1:left'

function priorDocument(paint?: Record<string, unknown>): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: addSurfaceTreatmentMigration.from,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
    ...(paint ? { paint } : {}),
  } as unknown as ProjectShape
}

describe('add-surface-treatment schema migration', () => {
  it('starts from the prior current schema version', () => {
    expect(addSurfaceTreatmentMigration.from).toBe(8)
  })

  it('advances the current schema version to 9', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(9)
  })

  it('wraps a legacy paint assignment as a solid surface treatment', () => {
    const before = priorDocument({ [KEY]: { color: SAGE, finishId: 'satin' } })
    const migrated = addSurfaceTreatmentMigration.migrate(before) as {
      paint: Record<string, unknown>
    }
    expect(migrated.paint[KEY]).toEqual({ kind: 'solid', color: SAGE, finishId: 'satin' })
  })

  it('wraps every assignment in the paint map', () => {
    const other = 'floor:floor-1'
    const before = priorDocument({
      [KEY]: { color: SAGE, finishId: 'matte' },
      [other]: { color: SAGE, finishId: 'gloss' },
    })
    const migrated = addSurfaceTreatmentMigration.migrate(before) as {
      paint: Record<string, { kind: string }>
    }
    expect(migrated.paint[KEY]?.kind).toBe('solid')
    expect(migrated.paint[other]?.kind).toBe('solid')
  })

  it('passes a document without paint through unchanged', () => {
    const before = priorDocument()
    const migrated = addSurfaceTreatmentMigration.migrate(priorDocument())
    expect(migrated).toEqual(before)
    expect('paint' in (migrated as Record<string, unknown>)).toBe(false)
  })
})
