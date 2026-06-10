import { describe, expect, it } from 'vitest'
import { addUnderlayKindMigration } from './add-underlay-kind'

const VERSION_SIX = 6

const image = { scope: 'project', contentHash: 'abc' }

type MigratedFloors = { floors: { underlays: { source: unknown }[] }[] }

describe('add-underlay-kind schema migration', () => {
  it('starts its forward step from schema version 6', () => {
    expect(addUnderlayKindMigration.from).toBe(VERSION_SIX)
  })

  it('moves a legacy raster image into a discriminated raster source', () => {
    const migrated = addUnderlayKindMigration.migrate({
      meta: {},
      floors: [{ underlays: [{ id: 'u1', image, width: 1, height: 1 }] }],
    } as never)

    expect((migrated as MigratedFloors).floors[0]?.underlays[0]?.source).toEqual({
      kind: 'raster',
      image,
    })
    expect((migrated as MigratedFloors).floors[0]?.underlays[0]).not.toHaveProperty('image')
  })

  it('does not advance meta.schemaVersion itself (the orchestrator does)', () => {
    const migrated = addUnderlayKindMigration.migrate({
      meta: { schemaVersion: VERSION_SIX },
      floors: [],
    } as never)

    expect((migrated as { meta: { schemaVersion?: number } }).meta.schemaVersion).toBe(VERSION_SIX)
  })

  it('leaves an underlay that already has a source unchanged', () => {
    const source = { kind: 'raster', image }

    const migrated = addUnderlayKindMigration.migrate({
      meta: {},
      floors: [{ underlays: [{ id: 'u1', source, width: 1, height: 1 }] }],
    } as never)

    expect((migrated as MigratedFloors).floors[0]?.underlays[0]?.source).toEqual(source)
  })
})
