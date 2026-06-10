import { describe, expect, it } from 'vitest'
import { addStairsMigration } from './add-stairs'

describe('add-stairs schema migration', () => {
  it('backfills an empty stairs array when absent', () => {
    const migrated = addStairsMigration.migrate({ meta: {}, floors: [] } as never)

    expect((migrated as { stairs: unknown }).stairs).toEqual([])
  })

  it('preserves an existing stairs array', () => {
    const existing = [{ id: 's1' }]

    const migrated = addStairsMigration.migrate({
      meta: {},
      floors: [],
      stairs: existing,
    } as never)

    expect((migrated as { stairs: unknown }).stairs).toBe(existing)
  })
})
