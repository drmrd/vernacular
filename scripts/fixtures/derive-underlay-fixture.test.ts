import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createDocumentValidator } from '../../core'
import { SCHEMA_VERSION } from '../../scripts/schema/build-schema.mjs'
import {
  deriveUnderlayFixture,
  type CorpusPlanMeta,
  type UnderlayCalibration,
} from './derive-underlay-fixture.mjs'

const schemaPath = resolve('schema', String(SCHEMA_VERSION), 'vernacular.schema.json')
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const validate = createDocumentValidator(schema)

// The corpus `meta.json` uses snake_case pixel-dimension keys by design; the
// naming-convention rule is scoped off for this intentionally-shaped literal.
/* eslint-disable @typescript-eslint/naming-convention */
const meta: CorpusPlanMeta = {
  slug: '01-radford-1908-design-5054-tiny-square-cottage',
  title: 'Radford 1908 Design 5054 Tiny Square Cottage',
  image_width_px: 1024,
  image_height_px: 768,
}
/* eslint-enable @typescript-eslint/naming-convention */

const calibration: UnderlayCalibration = {
  contentHash: 'a'.repeat(64),
  millimetersPerPixel: 12.5,
  offset: { x: 320, y: -180 },
  rotation: 0.25,
  opacity: 0.6,
}

interface DerivedDocument {
  meta: { schemaVersion: number; registryVersions: Record<string, unknown>; name: string }
  floors: Array<{
    walls: unknown[]
    openings: unknown[]
    dimensions: unknown[]
    underlays: Array<{
      source: { kind: string; image: { scope: string; contentHash: string } }
      width: number
      height: number
      placement: {
        millimetersPerPixel: number
        offset: { x: number; y: number }
        rotation: number
      }
      opacity: number
      visible: boolean
    }>
  }>
  stairs: unknown[]
}

describe('deriveUnderlayFixture', () => {
  it('derives a Document that validates against the published CORE schema', () => {
    const derived = deriveUnderlayFixture(meta, calibration)
    const result = validate(derived)
    expect(
      result.valid,
      `derived underlay Document failed CORE validation: ${JSON.stringify(result.errors, null, 2)}`,
    ).toBe(true)
  })

  it('shapes a Tier-0 Document with one floor carrying exactly one underlay', () => {
    const derived = deriveUnderlayFixture(meta, calibration) as unknown as DerivedDocument

    expect(derived.meta.schemaVersion).toBe(SCHEMA_VERSION)
    expect(derived.meta.registryVersions).toEqual({})
    expect(typeof derived.meta.name).toBe('string')
    expect(derived.meta.name.length).toBeGreaterThan(0)
    expect(derived.meta.name).toContain(meta.title)

    expect(derived.floors).toHaveLength(1)
    const [floor] = derived.floors
    expect(floor.walls).toEqual([])
    expect(floor.openings).toEqual([])
    expect(floor.dimensions).toEqual([])
    expect(floor.underlays).toHaveLength(1)
    expect(derived.stairs).toEqual([])
  })

  it('binds the underlay to the calibrated content-addressed raster', () => {
    const derived = deriveUnderlayFixture(meta, calibration) as unknown as DerivedDocument
    const [underlay] = derived.floors[0].underlays

    expect(underlay.source.kind).toBe('raster')
    expect(underlay.source.image.scope).toBe('project')
    expect(underlay.source.image.contentHash).toBe(calibration.contentHash)
    expect(underlay.width).toBe(meta.image_width_px)
    expect(underlay.height).toBe(meta.image_height_px)
    expect(underlay.placement.millimetersPerPixel).toBe(calibration.millimetersPerPixel)
    expect(underlay.placement.offset).toEqual(calibration.offset)
    expect(underlay.placement.rotation).toBe(calibration.rotation)
    expect(underlay.opacity).toBe(calibration.opacity)
    expect(underlay.visible).toBe(true)
  })

  it('applies origin, zero-rotation, and opaque defaults for an unspecified calibration', () => {
    const sparseCalibration: UnderlayCalibration = {
      contentHash: 'b'.repeat(64),
      millimetersPerPixel: 10,
    }
    const derived = deriveUnderlayFixture(meta, sparseCalibration) as unknown as DerivedDocument
    const [underlay] = derived.floors[0].underlays

    expect(underlay.placement.offset).toEqual({ x: 0, y: 0 })
    expect(underlay.placement.rotation).toBe(0)
    expect(underlay.opacity).toBe(1)
  })
})
