import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_UNDERLAY_MM_PER_PIXEL,
  DEFAULT_WALL_THICKNESS_MM,
  createEmptyProject,
  createFloor,
  createUnderlay,
  createWall,
} from './factories'
import type { AssetReference } from './asset-reference'

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

describe('createWall', () => {
  it('builds a wall from two points with the default thickness', () => {
    const wall = createWall({ x: 0, y: 0 }, { x: 1000, y: 0 })

    expect(wall.start).toEqual({ x: 0, y: 0 })
    expect(wall.end).toEqual({ x: 1000, y: 0 })
    expect(wall.thickness).toBe(DEFAULT_WALL_THICKNESS_MM)
    expect(wall.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('mints a unique id per wall', () => {
    const first = createWall({ x: 0, y: 0 }, { x: 1, y: 1 })
    const second = createWall({ x: 0, y: 0 }, { x: 1, y: 1 })

    expect(first.id).not.toBe(second.id)
  })

  it('honors an explicit id and thickness', () => {
    const fixed = createWall({ x: 0, y: 0 }, { x: 1, y: 1 }, { id: 'w1', thickness: 200 })

    expect(fixed.id).toBe('w1')
    expect(fixed.thickness).toBe(200)
  })
})

describe('createFloor walls', () => {
  it('initializes a floor with an empty walls array', () => {
    expect(createFloor('Ground').walls).toEqual([])
  })
})

describe('createUnderlay', () => {
  const image: AssetReference = { scope: 'project', contentHash: 'deadbeef' }

  it('carries the image and source pixel dimensions through', () => {
    const underlay = createUnderlay({ image, width: 1024, height: 768 })

    expect(underlay.image).toEqual(image)
    expect(underlay.width).toBe(1024)
    expect(underlay.height).toBe(768)
  })

  it('starts from the identity, pre-calibration placement', () => {
    const underlay = createUnderlay({ image, width: 1024, height: 768 })

    expect(underlay.placement.offset).toEqual({ x: 0, y: 0 })
    expect(underlay.placement.millimetersPerPixel).toBe(DEFAULT_UNDERLAY_MM_PER_PIXEL)
    expect(underlay.placement.rotation).toBe(0)
  })

  it('starts fully opaque and visible', () => {
    const underlay = createUnderlay({ image, width: 1024, height: 768 })

    expect(underlay.opacity).toBe(1)
    expect(underlay.visible).toBe(true)
  })

  it('mints a fresh unique id per underlay', () => {
    const first = createUnderlay({ image, width: 1024, height: 768 })
    const second = createUnderlay({ image, width: 1024, height: 768 })

    expect(first.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(first.id).not.toBe(second.id)
  })
})
