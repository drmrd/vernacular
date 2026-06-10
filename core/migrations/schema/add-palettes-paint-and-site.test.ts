import { describe, expect, it } from 'vitest'
import type { ProjectShape } from '../../index'
import { addPalettesPaintAndSiteMigration } from './add-palettes-paint-and-site'

function priorDocument(): ProjectShape {
  return {
    meta: {
      name: 'P',
      units: 'imperial',
      period: 'victorian',
      schemaVersion: addPalettesPaintAndSiteMigration.from,
      appVersion: '0.1.0',
      registryVersions: {},
    },
    floors: [],
  } as unknown as ProjectShape
}

describe('add-palettes-paint-and-site schema migration', () => {
  it('starts from the prior current schema version', () => {
    expect(addPalettesPaintAndSiteMigration.from).toBe(7)
  })

  it('passes a document without the new fields through unchanged', () => {
    const before = priorDocument()
    const migrated = addPalettesPaintAndSiteMigration.migrate(priorDocument())
    expect(migrated).toEqual(before)
  })

  it('does not invent palettes, paint, or site', () => {
    const migrated = addPalettesPaintAndSiteMigration.migrate(priorDocument()) as Record<
      string,
      unknown
    >
    expect('palettes' in migrated).toBe(false)
    expect('paint' in migrated).toBe(false)
    expect('site' in migrated).toBe(false)
  })
})
