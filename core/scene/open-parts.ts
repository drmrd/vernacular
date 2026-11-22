import type { OpeningPartId } from './opening-motion'

/** The open parts of every opening, keyed by opening id; a closed opening has no entry. */
export type OpenParts = ReadonlyMap<string, ReadonlySet<OpeningPartId>>

/** One part of one opening, such as the upper sash of a double-hung window. */
export interface OpeningPartRef {
  readonly openingId: string
  readonly part: OpeningPartId
}

/** The map with the referenced part flipped open or shut; the input is never mutated. */
export function toggleOpenPart(parts: OpenParts, ref: OpeningPartRef): OpenParts {
  const next = new Map(parts)
  const openParts = new Set(parts.get(ref.openingId))
  if (!openParts.delete(ref.part)) openParts.add(ref.part)
  if (openParts.size === 0) next.delete(ref.openingId)
  else next.set(ref.openingId, openParts)
  return next
}

/** The ids of the openings that have any part open. */
export function openOpeningIds(parts: OpenParts): ReadonlySet<string> {
  return new Set(parts.keys())
}

/** Whether two maps hold the same openings with the same open parts, whatever their instances. */
export function sameOpenParts(a: OpenParts, b: OpenParts): boolean {
  if (a.size !== b.size) return false
  return [...a].every(([openingId, openParts]) => {
    const otherParts = b.get(openingId)
    return (
      otherParts !== undefined &&
      otherParts.size === openParts.size &&
      [...openParts].every((part) => otherParts.has(part))
    )
  })
}
