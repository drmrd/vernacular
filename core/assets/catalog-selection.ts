// core/assets/catalog-selection.ts
//
// Which catalog entries this build can read (spec "catalog.json"): per pack id,
// the newest version whose format this build understands.

import type { Catalog, CatalogPackEntry } from './catalog.ts'
import { comparePackVersions } from './pack-version.ts'

export interface ReadablePackSelection {
  packs: CatalogPackEntry[]
  skipped: number
}

export function selectReadablePacks(
  catalog: Catalog,
  readableFormats: readonly number[],
): ReadablePackSelection {
  const newestByPackId = new Map<string, CatalogPackEntry>()
  let skipped = 0
  for (const entry of catalog.packs) {
    if (!readableFormats.includes(entry.formatVersion)) {
      skipped += 1
      continue
    }
    const current = newestByPackId.get(entry.packId)
    if (current === undefined || comparePackVersions(entry.version, current.version) > 0) {
      newestByPackId.set(entry.packId, entry)
    }
  }
  return { packs: [...newestByPackId.values()], skipped }
}
