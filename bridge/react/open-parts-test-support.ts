import type { OpenParts, OpeningPartId } from '../../core'

/** Builds an open-parts map from opening ids to the parts open in each, for tests. */
export function openPartsWith(entries: Record<string, readonly OpeningPartId[]>): OpenParts {
  return new Map(Object.entries(entries).map(([id, parts]) => [id, new Set(parts)]))
}
