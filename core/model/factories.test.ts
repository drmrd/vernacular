import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  createEmptyProject,
  createFloor,
} from './factories'

describe('createEmptyProject', () => {
  it('creates a project with no floors and the current schema version', () => {
    const project = createEmptyProject({
      name: 'Test House',
      units: 'imperial',
      era: 'victorian',
      appVersion: '0.1.0',
    })

    expect(project.floors).toEqual([])
    expect(project.meta.name).toBe('Test House')
    expect(project.meta.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(project.meta.registryVersions).toEqual({})
  })
})

describe('createFloor', () => {
  it('uses the supplied id and defaults the ceiling height and elevation', () => {
    const floor = createFloor('Ground', { id: 'floor-1' })

    expect(floor.id).toBe('floor-1')
    expect(floor.elevation).toBe(0)
    expect(floor.defaultCeilingHeight).toBe(DEFAULT_CEILING_HEIGHT_MM)
  })

  it('generates a unique id when none is supplied', () => {
    expect(createFloor('A').id).not.toBe(createFloor('B').id)
  })
})
