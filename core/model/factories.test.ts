import { describe, expect, it } from 'vitest'
import {
  CURRENT_SCHEMA_VERSION,
  DEFAULT_CEILING_HEIGHT_MM,
  DEFAULT_OPENING_HEIGHT_MM,
  DEFAULT_OPENING_WIDTH_MM,
  DEFAULT_UNDERLAY_MM_PER_PIXEL,
  DEFAULT_WALL_THICKNESS_MM,
  createDimension,
  createEmptyProject,
  createFloor,
  createOpening,
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

describe('createFloor openings', () => {
  it('initializes a floor with an empty openings array', () => {
    expect(createFloor('Ground', {}).openings).toEqual([])
  })
})

describe('createFloor dimensions', () => {
  it('initializes a floor with an empty dimensions array', () => {
    expect(createFloor('Ground', {}).dimensions).toEqual([])
  })
})

describe('createDimension', () => {
  it('mints a dimension with a fresh id, the given endpoints, and a zero offset', () => {
    const dimension = createDimension({ start: { x: 0, y: 0 }, end: { x: 300, y: 400 } })

    expect(dimension.id).toEqual(expect.any(String))
    expect(dimension.id.length).toBeGreaterThan(0)
    expect(dimension.start).toEqual({ x: 0, y: 0 })
    expect(dimension.end).toEqual({ x: 300, y: 400 })
    expect(dimension.offset).toBe(0)
  })

  it('honors an explicit offset and id', () => {
    const dimension = createDimension({
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      offset: 250,
      id: 'fixed-dim',
    })

    expect(dimension.id).toBe('fixed-dim')
    expect(dimension.start).toEqual({ x: 1, y: 2 })
    expect(dimension.end).toEqual({ x: 3, y: 4 })
    expect(dimension.offset).toBe(250)
  })

  it('mints a unique id per dimension when none is supplied', () => {
    const first = createDimension({ start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })
    const second = createDimension({ start: { x: 0, y: 0 }, end: { x: 1, y: 1 } })

    expect(first.id).not.toBe(second.id)
  })
})

describe('createOpening', () => {
  it('mints a door opening with a fresh id, the registry defaults, and the default orientation', () => {
    const opening = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: 1000,
    })

    expect(opening.id).toEqual(expect.any(String))
    expect(opening.id.length).toBeGreaterThan(0)
    expect(opening.type).toBe('single-swing-door')
    expect(opening.hostWallId).toBe('w1')
    expect(opening.position).toBe(1000)
    expect(opening.width).toBe(813)
    expect(opening.height).toBe(2032)
    expect(opening.sillHeight).toBe(0)
    expect(opening.orientation).toEqual({ hinge: 'start', facing: 'positive' })
  })

  it('resolves the registry default dimensions for a window type', () => {
    const opening = createOpening({
      type: 'double-hung-window',
      hostWallId: 'w1',
      position: 500,
    })

    expect(opening.width).toBe(900)
    expect(opening.height).toBe(1200)
    expect(opening.sillHeight).toBe(900)
  })

  it('honors explicit dimensions, orientation, and id', () => {
    const opening = createOpening({
      type: 'single-swing-door',
      hostWallId: 'w1',
      position: 0,
      width: 1000,
      height: 2100,
      sillHeight: 50,
      orientation: { hinge: 'end', facing: 'negative' },
      id: 'fixed-id',
    })

    expect(opening.id).toBe('fixed-id')
    expect(opening.width).toBe(1000)
    expect(opening.height).toBe(2100)
    expect(opening.sillHeight).toBe(50)
    expect(opening.orientation).toEqual({ hinge: 'end', facing: 'negative' })
  })

  it('falls back to the module default constants for a type with no opening registry record', () => {
    const opening = createOpening({
      type: 'no-such-opening-type',
      hostWallId: 'w1',
      position: 0,
    })

    expect(opening.width).toBe(DEFAULT_OPENING_WIDTH_MM)
    expect(opening.height).toBe(DEFAULT_OPENING_HEIGHT_MM)
    expect(opening.sillHeight).toBe(0)
  })

  it('mints a unique id per opening when none is supplied', () => {
    const first = createOpening({ type: 'single-swing-door', hostWallId: 'w1', position: 0 })
    const second = createOpening({ type: 'single-swing-door', hostWallId: 'w1', position: 0 })

    expect(first.id).not.toBe(second.id)
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
