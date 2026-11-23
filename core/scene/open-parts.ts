import { openingParts, type OpeningPartId } from './opening-motion'

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
  const partsOfOpening = new Set(parts.get(ref.openingId))
  if (!partsOfOpening.delete(ref.part)) partsOfOpening.add(ref.part)
  if (partsOfOpening.size === 0) next.delete(ref.openingId)
  else next.set(ref.openingId, partsOfOpening)
  return next
}

/**
 * The map without the open parts an opening's current type lacks, such as the upper sash left
 * behind when a double-hung window becomes single-hung. An opening left with no part is dropped.
 * An entry that names no opening of the list is kept, since the list may cover one floor only.
 * The input itself is returned when nothing changes.
 */
export function keepOpenPartsOfTypes(
  parts: OpenParts,
  openings: Iterable<{ readonly id: string; readonly type: string }>,
): OpenParts {
  const typeById = new Map<string, string>()
  for (const opening of openings) typeById.set(opening.id, opening.type)
  let changed = false
  const next = new Map<string, ReadonlySet<OpeningPartId>>()
  for (const [openingId, partsHere] of parts) {
    const type = typeById.get(openingId)
    const kept =
      type === undefined
        ? partsHere
        : new Set([...partsHere].filter((part) => openingParts(type).includes(part)))
    if (kept.size !== partsHere.size) changed = true
    if (kept.size > 0) next.set(openingId, kept)
  }
  return changed ? next : parts
}

/** The ids of the openings that have any part open. */
export function openOpeningIds(parts: OpenParts): ReadonlySet<string> {
  return new Set(parts.keys())
}

/** Whether two maps hold the same openings with the same open parts, whatever their instances. */
export function sameOpenParts(a: OpenParts, b: OpenParts): boolean {
  if (a.size !== b.size) return false
  return [...a].every(([openingId, partsHere]) => {
    const partsThere = b.get(openingId)
    return (
      partsThere !== undefined &&
      partsThere.size === partsHere.size &&
      [...partsHere].every((part) => partsThere.has(part))
    )
  })
}
