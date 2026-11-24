import { describe, expect, it } from 'vitest'
import type { Catalog, CatalogPackEntry } from './catalog.ts'
import { selectReadablePacks } from './catalog-selection.ts'

const HASH_DIGITS = 64

function entry(packId: string, version: string, formatVersion: number): CatalogPackEntry {
  const hash = 'a'.repeat(HASH_DIGITS)
  return {
    packId,
    version,
    formatVersion,
    manifest: { sha256: hash, byteLength: 1836 },
    byteLength: 4096,
    itemCount: 3,
  }
}

describe('selectReadablePacks', () => {
  it('lists the newest readable version of each pack and counts the entries it skipped', () => {
    const catalog: Catalog = {
      catalogVersion: 1,
      packs: [
        entry('vernacular-starter', '1.1.0', 2),
        entry('vernacular-starter', '1.0.0', 1),
        entry('parlor-furniture', '2.0.0', 9),
        entry('parlor-furniture', '1.2.0', 2),
        entry('garden', '1.0.0', 9),
      ],
    }

    const { packs, skipped } = selectReadablePacks(catalog, [1, 2])

    expect(packs.map((pack) => `${pack.packId}@${pack.version}`).sort()).toEqual([
      'parlor-furniture@1.2.0',
      'vernacular-starter@1.1.0',
    ])
    expect(skipped).toBe(2)
  })
})
